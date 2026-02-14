import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateServiceDto,
  UpdateServiceDto,
  SetAvailabilityDto,
  CreateAppointmentDto,
  UpdateAppointmentDto,
  UpdateAppointmentStatusDto,
  CreateSessionPackageDto,
  AppointmentFiltersDto,
  AvailableSlotsDto,
} from './dto/appointment.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class AppointmentsService {
  constructor(private readonly tenantService: TenantService) {}

  // ─── Formatters ───

  private formatService(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      name: row.name,
      description: row.description,
      durationMinutes: row.duration_minutes,
      price: row.price,
      currency: row.currency,
      maxParticipants: row.max_participants,
      category: row.category,
      bufferMinutes: row.buffer_minutes,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatAvailability(row: Record<string, any>) {
    return {
      id: row.id,
      trainerId: row.trainer_id,
      trainerName: row.trainer_name,
      branchId: row.branch_id,
      dayOfWeek: row.day_of_week,
      startTime: row.start_time,
      endTime: row.end_time,
      isAvailable: row.is_available,
    };
  }

  private formatAppointment(row: Record<string, any>) {
    return {
      id: row.id,
      serviceId: row.service_id,
      serviceName: row.service_name,
      serviceDuration: row.service_duration,
      servicePrice: row.service_price !== undefined ? parseFloat(row.service_price) : undefined,
      serviceCategory: row.service_category,
      trainerId: row.trainer_id,
      trainerName: row.trainer_name,
      userId: row.user_id,
      userName: row.user_name,
      branchId: row.branch_id,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      notes: row.notes,
      cancelledReason: row.cancelled_reason,
      cancelledAt: row.cancelled_at,
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatPackage(row: Record<string, any>) {
    return {
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      serviceId: row.service_id,
      serviceName: row.service_name,
      branchId: row.branch_id,
      totalSessions: row.total_sessions,
      usedSessions: row.used_sessions,
      remainingSessions: row.remaining_sessions,
      purchasedAt: row.purchased_at,
      expiresAt: row.expires_at,
      status: row.status,
      paymentId: row.payment_id,
      createdAt: row.created_at,
    };
  }

  // ─── Services (PT service types) ───

  async findAllServices(gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['s.is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`s.branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const countResult = await client.query(
        `SELECT COUNT(*) FROM services s ${whereClause}`,
        values,
      );

      const result = await client.query(
        `SELECT s.* FROM services s ${whereClause} ORDER BY s.name ASC`,
        values,
      );

      return {
        data: result.rows.map((row) => this.formatService(row)),
        total: parseInt(countResult.rows[0].count),
      };
    });
  }

  async createService(gymId: number, branchId: number | null, dto: CreateServiceDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO services (branch_id, name, description, duration_minutes, price, currency, max_participants, category, buffer_minutes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING *`,
        [
          branchId,
          dto.name,
          dto.description ?? null,
          dto.durationMinutes,
          dto.price,
          dto.currency ?? null,
          dto.maxParticipants ?? 1,
          dto.category ?? null,
          dto.bufferMinutes ?? 0,
        ],
      );
      return this.formatService(result.rows[0]);
    });
  }

  async updateService(id: number, gymId: number, dto: UpdateServiceDto) {
    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (dto.name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(dto.name); }
    if (dto.description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(dto.description); }
    if (dto.durationMinutes !== undefined) { updates.push(`duration_minutes = $${paramIndex++}`); values.push(dto.durationMinutes); }
    if (dto.price !== undefined) { updates.push(`price = $${paramIndex++}`); values.push(dto.price); }
    if (dto.currency !== undefined) { updates.push(`currency = $${paramIndex++}`); values.push(dto.currency); }
    if (dto.maxParticipants !== undefined) { updates.push(`max_participants = $${paramIndex++}`); values.push(dto.maxParticipants); }
    if (dto.category !== undefined) { updates.push(`category = $${paramIndex++}`); values.push(dto.category); }
    if (dto.isActive !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(dto.isActive); }
    if (dto.bufferMinutes !== undefined) { updates.push(`buffer_minutes = $${paramIndex++}`); values.push(dto.bufferMinutes); }

    if (updates.length === 0) {
      return this.tenantService.executeInTenant(gymId, async (client) => {
        const result = await client.query(`SELECT * FROM services WHERE id = $1 AND is_deleted = FALSE`, [id]);
        if (!result.rows[0]) throw new NotFoundException(`Service #${id} not found`);
        return this.formatService(result.rows[0]);
      });
    }

    updates.push('updated_at = NOW()');
    values.push(id);

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `UPDATE services SET ${updates.join(', ')} WHERE id = $${paramIndex} AND is_deleted = FALSE RETURNING *`,
        values,
      );
      if (result.rows.length === 0) throw new NotFoundException(`Service #${id} not found`);
      return this.formatService(result.rows[0]);
    });
  }

  async deleteService(id: number, gymId: number) {
    await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `UPDATE services SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND is_deleted = FALSE RETURNING id`,
        [id],
      );
      if (result.rows.length === 0) throw new NotFoundException(`Service #${id} not found`);
    });

    return { message: 'Service deleted successfully' };
  }

  // ─── Trainer Availability ───

  async getAvailability(trainerId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT ta.*, u.name as trainer_name
         FROM trainer_availability ta
         LEFT JOIN users u ON u.id = ta.trainer_id
         WHERE ta.trainer_id = $1 AND ta.is_available = TRUE
         ORDER BY ta.day_of_week ASC, ta.start_time ASC`,
        [trainerId],
      );

      return {
        data: result.rows.map((row) => this.formatAvailability(row)),
        total: result.rows.length,
      };
    });
  }

  async setAvailability(gymId: number, branchId: number | null, dto: SetAvailabilityDto, userId: number, userRole: string) {
    // Trainers can only set their own availability
    if (userRole === 'trainer' && dto.trainerId !== userId) {
      throw new ForbiddenException('You can only set your own availability');
    }

    return this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query('BEGIN');
      try {
        // Upsert: delete existing for this trainer + day, then insert
        await client.query(
          `DELETE FROM trainer_availability WHERE trainer_id = $1 AND day_of_week = $2`,
          [dto.trainerId, dto.dayOfWeek],
        );

        const result = await client.query(
          `INSERT INTO trainer_availability (trainer_id, branch_id, day_of_week, start_time, end_time, is_available, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           RETURNING *`,
          [
            dto.trainerId,
            branchId,
            dto.dayOfWeek,
            dto.startTime,
            dto.endTime,
            dto.isAvailable !== undefined ? dto.isAvailable : true,
          ],
        );

        // Re-fetch with JOIN for trainerName
        const full = await client.query(
          `SELECT ta.*, u.name as trainer_name
           FROM trainer_availability ta
           LEFT JOIN users u ON u.id = ta.trainer_id
           WHERE ta.id = $1`,
          [result.rows[0].id],
        );

        await client.query('COMMIT');
        return this.formatAvailability(full.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  // ─── Appointments ───

  async findOneAppointment(id: number, gymId: number, userId: number, userRole: string) {
    const appointment = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT a.*, s.name as service_name, s.duration_minutes as service_duration, s.price as service_price, s.category as service_category,
                t.name as trainer_name, u.name as user_name, cb.name as created_by_name
         FROM appointments a
         LEFT JOIN services s ON s.id = a.service_id
         LEFT JOIN users t ON t.id = a.trainer_id
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN users cb ON cb.id = a.created_by
         WHERE a.id = $1`,
        [id],
      );
      return result.rows[0];
    });

    if (!appointment) throw new NotFoundException(`Appointment #${id} not found`);

    // Clients can only view their own appointments
    if (userRole === 'client' && appointment.user_id !== userId) {
      throw new ForbiddenException('You can only view your own appointments');
    }

    // Trainers can only view their own or their clients' appointments
    if (userRole === 'trainer' && appointment.trainer_id !== userId && appointment.user_id !== userId) {
      throw new ForbiddenException('You can only view your own appointments');
    }

    return this.formatAppointment(appointment);
  }

  async findAllAppointments(gymId: number, branchId: number | null, filters: AppointmentFiltersDto = {}, userId?: number, userRole?: string) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`a.branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      // Trainers can only see their own appointments (as trainer or client)
      if (userRole === 'trainer' && userId) {
        conditions.push(`(a.trainer_id = $${paramIndex} OR a.user_id = $${paramIndex})`);
        values.push(userId);
        paramIndex++;
      }

      if (filters.trainerId) {
        conditions.push(`a.trainer_id = $${paramIndex++}`);
        values.push(filters.trainerId);
      }

      if (filters.userId) {
        conditions.push(`a.user_id = $${paramIndex++}`);
        values.push(filters.userId);
      }

      if (filters.fromDate) {
        conditions.push(`a.start_time >= $${paramIndex++}`);
        values.push(filters.fromDate);
      }

      if (filters.toDate) {
        conditions.push(`a.end_time <= $${paramIndex++}`);
        values.push(filters.toDate);
      }

      if (filters.status) {
        conditions.push(`a.status = $${paramIndex++}`);
        values.push(filters.status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await client.query(
        `SELECT COUNT(*) FROM appointments a ${whereClause}`,
        values,
      );

      const result = await client.query(
        `SELECT a.*, s.name as service_name, s.duration_minutes as service_duration, s.price as service_price, s.category as service_category,
                t.name as trainer_name, u.name as user_name, cb.name as created_by_name
         FROM appointments a
         LEFT JOIN services s ON s.id = a.service_id
         LEFT JOIN users t ON t.id = a.trainer_id
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN users cb ON cb.id = a.created_by
         ${whereClause}
         ORDER BY a.start_time DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, skip],
      );

      return {
        data: result.rows.map((row) => this.formatAppointment(row)),
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
      };
    });
  }

  async createAppointment(gymId: number, branchId: number | null, dto: CreateAppointmentDto, createdBy: number, userRole: string) {
    // Security: clients can only book for themselves
    if (userRole === 'client' && dto.userId !== createdBy) {
      throw new ForbiddenException('You can only book appointments for yourself');
    }

    return this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query('BEGIN');
      try {
        // Lock trainer's appointments to prevent race conditions on concurrent bookings
        const conflict = await client.query(
          `SELECT 1 FROM appointments
           WHERE trainer_id = $1
           AND status IN ('booked', 'confirmed')
           AND start_time < $3
           AND end_time > $2
           FOR UPDATE`,
          [dto.trainerId, dto.startTime, dto.endTime],
        );

        if (conflict.rows.length > 0) {
          throw new BadRequestException('Trainer has a conflicting appointment at this time');
        }

        const result = await client.query(
          `INSERT INTO appointments (service_id, trainer_id, user_id, branch_id, start_time, end_time, status, notes, created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'booked', $7, $8, NOW(), NOW())
           RETURNING *`,
          [
            dto.serviceId ?? null,
            dto.trainerId,
            dto.userId,
            branchId,
            dto.startTime,
            dto.endTime,
            dto.notes ?? null,
            createdBy,
          ],
        );

        // Re-fetch with joins
        const full = await client.query(
          `SELECT a.*, s.name as service_name, s.duration_minutes as service_duration, s.price as service_price, s.category as service_category,
                  t.name as trainer_name, u.name as user_name
           FROM appointments a
           LEFT JOIN services s ON s.id = a.service_id
           LEFT JOIN users t ON t.id = a.trainer_id
           LEFT JOIN users u ON u.id = a.user_id
           WHERE a.id = $1`,
          [result.rows[0].id],
        );

        await client.query('COMMIT');
        return this.formatAppointment(full.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async updateAppointment(id: number, gymId: number, dto: UpdateAppointmentDto, userId: number, userRole: string) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query('BEGIN');
      try {
        // Lock and fetch current appointment
        const current = await client.query(
          `SELECT * FROM appointments WHERE id = $1 FOR UPDATE`,
          [id],
        );
        if (current.rows.length === 0) throw new NotFoundException(`Appointment #${id} not found`);

        // Trainers can only update their own appointments
        if (userRole === 'trainer' && current.rows[0].trainer_id !== userId) {
          throw new ForbiddenException('You can only update your own appointments');
        }

        // Prevent modifying completed/cancelled/no_show appointments
        const terminalStatuses = ['completed', 'cancelled', 'no_show'];
        if (terminalStatuses.includes(current.rows[0].status)) {
          throw new BadRequestException(`Cannot modify appointment with status '${current.rows[0].status}'`);
        }

        const updates: string[] = [];
        const values: SqlValue[] = [];
        let paramIndex = 1;

        if (dto.startTime !== undefined) { updates.push(`start_time = $${paramIndex++}`); values.push(dto.startTime); }
        if (dto.endTime !== undefined) { updates.push(`end_time = $${paramIndex++}`); values.push(dto.endTime); }
        if (dto.notes !== undefined) { updates.push(`notes = $${paramIndex++}`); values.push(dto.notes); }

        if (updates.length === 0) throw new BadRequestException('No fields to update');

        // If rescheduling (start/end time changed), check for trainer conflicts
        if (dto.startTime !== undefined || dto.endTime !== undefined) {
          const newStart = dto.startTime ?? current.rows[0].start_time;
          const newEnd = dto.endTime ?? current.rows[0].end_time;
          const trainerId = current.rows[0].trainer_id;

          const conflict = await client.query(
            `SELECT 1 FROM appointments
             WHERE trainer_id = $1
             AND id != $2
             AND status IN ('booked', 'confirmed')
             AND start_time < $4
             AND end_time > $3
             FOR UPDATE`,
            [trainerId, id, newStart, newEnd],
          );

          if (conflict.rows.length > 0) {
            throw new BadRequestException('Trainer has a conflicting appointment at the new time');
          }
        }

        updates.push('updated_at = NOW()');
        values.push(id);

        await client.query(
          `UPDATE appointments SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values,
        );

        const full = await client.query(
          `SELECT a.*, s.name as service_name, s.duration_minutes as service_duration, s.price as service_price, s.category as service_category,
                  t.name as trainer_name, u.name as user_name
           FROM appointments a
           LEFT JOIN services s ON s.id = a.service_id
           LEFT JOIN users t ON t.id = a.trainer_id
           LEFT JOIN users u ON u.id = a.user_id
           WHERE a.id = $1`,
          [id],
        );

        await client.query('COMMIT');
        return this.formatAppointment(full.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async updateAppointmentStatus(id: number, gymId: number, dto: UpdateAppointmentStatusDto, userId: number, userRole: string) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query('BEGIN');
      try {
        // Lock and fetch current appointment
        const current = await client.query(
          `SELECT * FROM appointments WHERE id = $1 FOR UPDATE`,
          [id],
        );

        if (current.rows.length === 0) throw new NotFoundException(`Appointment #${id} not found`);

        // Ownership check: clients can only update their own appointments
        if (userRole === 'client' && current.rows[0].user_id !== userId) {
          throw new ForbiddenException('You can only update your own appointments');
        }

        // Clients can only cancel their appointments
        if (userRole === 'client' && dto.status !== 'cancelled') {
          throw new ForbiddenException('You can only cancel your appointments');
        }

        // Status transition validation
        const previousStatus = current.rows[0].status;
        const allowedTransitions: Record<string, string[]> = {
          booked: ['confirmed', 'completed', 'cancelled', 'no_show'],
          confirmed: ['completed', 'cancelled', 'no_show'],
          completed: [],
          cancelled: [],
          no_show: [],
        };

        if (allowedTransitions[previousStatus] && !allowedTransitions[previousStatus].includes(dto.status)) {
          throw new BadRequestException(`Cannot transition from '${previousStatus}' to '${dto.status}'`);
        }

        const updates: string[] = [`status = $1`];
        const values: SqlValue[] = [dto.status];
        let paramIndex = 2;

        if (dto.status === 'cancelled') {
          updates.push(`cancelled_at = NOW()`);
          if (dto.cancelledReason) {
            updates.push(`cancelled_reason = $${paramIndex++}`);
            values.push(dto.cancelledReason);
          }
        }

        updates.push('updated_at = NOW()');
        values.push(id);

        await client.query(
          `UPDATE appointments SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values,
        );

        // If completed, auto-deduct from session package
        let sessionDeduction: { packageId: number; remainingSessions: number } | null = null;
        if (dto.status === 'completed') {
          const apt = current.rows[0];
          if (apt.service_id) {
            const deductResult = await client.query(
              `UPDATE session_packages
               SET used_sessions = used_sessions + 1,
                   remaining_sessions = remaining_sessions - 1,
                   status = CASE WHEN remaining_sessions - 1 <= 0 THEN 'exhausted' ELSE status END,
                   updated_at = NOW()
               WHERE id = (
                 SELECT id FROM session_packages
                 WHERE user_id = $1 AND service_id = $2 AND status = 'active' AND remaining_sessions > 0
                   AND (expires_at IS NULL OR expires_at > NOW())
                 ORDER BY purchased_at ASC
                 LIMIT 1
                 FOR UPDATE
               )
               RETURNING id, remaining_sessions`,
              [apt.user_id, apt.service_id],
            );

            if (deductResult.rows.length > 0) {
              sessionDeduction = {
                packageId: deductResult.rows[0].id,
                remainingSessions: deductResult.rows[0].remaining_sessions,
              };
            }
          }
        }

        const full = await client.query(
          `SELECT a.*, s.name as service_name, s.duration_minutes as service_duration, s.price as service_price, s.category as service_category,
                  t.name as trainer_name, u.name as user_name
           FROM appointments a
           LEFT JOIN services s ON s.id = a.service_id
           LEFT JOIN users t ON t.id = a.trainer_id
           LEFT JOIN users u ON u.id = a.user_id
           WHERE a.id = $1`,
          [id],
        );

        await client.query('COMMIT');

        const response: Record<string, any> = this.formatAppointment(full.rows[0]);
        if (sessionDeduction) {
          response.sessionDeduction = sessionDeduction;
        }
        return response;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async getMyAppointments(userId: number, gymId: number, page = 1, limit = 20, filters: { status?: string; fromDate?: string; toDate?: string } = {}) {
    const skip = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['a.user_id = $1'];
      const values: SqlValue[] = [userId];
      let paramIndex = 2;

      if (filters.status) {
        conditions.push(`a.status = $${paramIndex++}`);
        values.push(filters.status);
      }

      if (filters.fromDate) {
        conditions.push(`a.start_time >= $${paramIndex++}`);
        values.push(filters.fromDate);
      }

      if (filters.toDate) {
        conditions.push(`a.end_time <= $${paramIndex++}`);
        values.push(filters.toDate);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const countResult = await client.query(
        `SELECT COUNT(*) FROM appointments a ${whereClause}`,
        values,
      );

      const result = await client.query(
        `SELECT a.*, s.name as service_name, s.duration_minutes as service_duration, s.price as service_price, s.category as service_category,
                t.name as trainer_name, u.name as user_name, cb.name as created_by_name
         FROM appointments a
         LEFT JOIN services s ON s.id = a.service_id
         LEFT JOIN users t ON t.id = a.trainer_id
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN users cb ON cb.id = a.created_by
         ${whereClause}
         ORDER BY a.start_time DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, skip],
      );

      return {
        data: result.rows.map((row) => this.formatAppointment(row)),
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
      };
    });
  }

  // ─── Session Packages ───

  async findAllPackages(gymId: number, branchId: number | null, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`sp.branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await client.query(
        `SELECT COUNT(*) FROM session_packages sp ${whereClause}`,
        values,
      );

      const result = await client.query(
        `SELECT sp.*, u.name as user_name, s.name as service_name
         FROM session_packages sp
         LEFT JOIN users u ON u.id = sp.user_id
         LEFT JOIN services s ON s.id = sp.service_id
         ${whereClause}
         ORDER BY sp.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, skip],
      );

      return {
        data: result.rows.map((row) => this.formatPackage(row)),
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
      };
    });
  }

  async createPackage(gymId: number, branchId: number | null, dto: CreateSessionPackageDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO session_packages (user_id, service_id, branch_id, total_sessions, used_sessions, remaining_sessions, purchased_at, expires_at, status, payment_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 0, $4, NOW(), $5, 'active', $6, NOW(), NOW())
         RETURNING *`,
        [
          dto.userId,
          dto.serviceId ?? null,
          branchId,
          dto.totalSessions,
          dto.expiresAt ?? null,
          dto.paymentId ?? null,
        ],
      );

      const full = await client.query(
        `SELECT sp.*, u.name as user_name, s.name as service_name
         FROM session_packages sp
         LEFT JOIN users u ON u.id = sp.user_id
         LEFT JOIN services s ON s.id = sp.service_id
         WHERE sp.id = $1`,
        [result.rows[0].id],
      );

      return this.formatPackage(full.rows[0]);
    });
  }

  async getUserPackages(userId: number, gymId: number, authUserId: number, userRole: string) {
    // Clients can only view their own packages
    if (userRole === 'client' && userId !== authUserId) {
      throw new ForbiddenException('You can only view your own packages');
    }

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const countResult = await client.query(
        `SELECT COUNT(*) FROM session_packages WHERE user_id = $1`,
        [userId],
      );

      const result = await client.query(
        `SELECT sp.*, u.name as user_name, s.name as service_name
         FROM session_packages sp
         LEFT JOIN users u ON u.id = sp.user_id
         LEFT JOIN services s ON s.id = sp.service_id
         WHERE sp.user_id = $1
         ORDER BY sp.created_at DESC`,
        [userId],
      );

      return {
        data: result.rows.map((row) => this.formatPackage(row)),
        total: parseInt(countResult.rows[0].count),
      };
    });
  }

  // ─── Available Slots ───

  async getAvailableSlots(gymId: number, dto: AvailableSlotsDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const date = new Date(dto.date);
      const dayOfWeek = date.getUTCDay();

      // Get trainer name
      const trainerResult = await client.query(
        `SELECT name FROM users WHERE id = $1`,
        [dto.trainerId],
      );
      const trainerName = trainerResult.rows[0]?.name || null;

      // Get trainer availability for this day of week
      const availability = await client.query(
        `SELECT start_time, end_time
         FROM trainer_availability
         WHERE trainer_id = $1 AND day_of_week = $2 AND is_available = TRUE`,
        [dto.trainerId, dayOfWeek],
      );

      if (availability.rows.length === 0) {
        return { slots: [], trainerId: dto.trainerId, trainerName, date: dto.date, duration: dto.durationMinutes || 60, message: 'Trainer is not available on this day' };
      }

      // Determine slot duration and buffer
      let slotDuration = dto.durationMinutes || 60;
      let bufferMinutes = 0;
      if (dto.serviceId) {
        const service = await client.query(
          `SELECT duration_minutes, buffer_minutes FROM services WHERE id = $1 AND is_deleted = FALSE`,
          [dto.serviceId],
        );
        if (service.rows.length > 0) {
          slotDuration = service.rows[0].duration_minutes;
          bufferMinutes = service.rows[0].buffer_minutes || 0;
        }
      }

      // Get existing appointments for this trainer on this date
      const dateStr = dto.date;
      const existingAppointments = await client.query(
        `SELECT start_time, end_time
         FROM appointments
         WHERE trainer_id = $1
         AND DATE(start_time) = $2
         AND status IN ('booked', 'confirmed')
         ORDER BY start_time ASC`,
        [dto.trainerId, dateStr],
      );

      const booked = existingAppointments.rows.map((row) => ({
        start: row.start_time,
        end: new Date(new Date(row.end_time).getTime() + bufferMinutes * 60000),
      }));

      // Generate available slots from each availability window
      const slots: { startTime: string; endTime: string }[] = [];

      for (const window of availability.rows) {
        const windowStart = new Date(`${dateStr}T${window.start_time}`);
        const windowEnd = new Date(`${dateStr}T${window.end_time}`);

        let slotStart = new Date(windowStart);

        while (slotStart.getTime() + slotDuration * 60000 <= windowEnd.getTime()) {
          const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

          // Check if this slot conflicts with any existing appointment
          const hasConflict = booked.some((apt) => {
            const aptStart = new Date(apt.start).getTime();
            const aptEnd = new Date(apt.end).getTime();
            return slotStart.getTime() < aptEnd && slotEnd.getTime() > aptStart;
          });

          if (!hasConflict) {
            slots.push({
              startTime: slotStart.toISOString(),
              endTime: slotEnd.toISOString(),
            });
          }

          // Move to next slot (use slot duration or 30 min, whichever is smaller for finer granularity)
          const increment = Math.min(slotDuration, 30);
          slotStart = new Date(slotStart.getTime() + increment * 60000);
        }
      }

      return { slots, trainerId: dto.trainerId, trainerName, date: dto.date, duration: slotDuration };
    });
  }
}
