import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateClassTypeDto,
  UpdateClassTypeDto,
  CreateClassScheduleDto,
  UpdateClassScheduleDto,
  GenerateSessionsDto,
  UpdateSessionDto,
  UpdateBookingStatusDto,
  ClassFiltersDto,
  SessionFiltersDto,
} from './dto/class.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class ClassesService {
  constructor(private readonly tenantService: TenantService) {}

  // ─── Formatters ───

  private formatClassType(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      name: row.name,
      description: row.description,
      category: row.category,
      defaultDuration: row.default_duration,
      defaultCapacity: row.default_capacity,
      color: row.color,
      icon: row.icon,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatSchedule(row: Record<string, any>) {
    return {
      id: row.id,
      classTypeId: row.class_type_id,
      classTypeName: row.class_type_name,
      color: row.color,
      icon: row.icon,
      branchId: row.branch_id,
      instructorId: row.instructor_id,
      instructorName: row.instructor_name,
      room: row.room,
      dayOfWeek: row.day_of_week,
      startTime: row.start_time,
      endTime: row.end_time,
      capacity: row.capacity,
      isRecurring: row.is_recurring,
      startDate: row.start_date,
      endDate: row.end_date,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatSession(row: Record<string, any>) {
    return {
      id: row.id,
      scheduleId: row.schedule_id,
      branchId: row.branch_id,
      date: row.date,
      instructorId: row.instructor_id,
      instructorName: row.instructor_name,
      classTypeName: row.class_type_name,
      category: row.category,
      color: row.color,
      icon: row.icon,
      room: row.room,
      startTime: row.start_time,
      endTime: row.end_time,
      status: row.status,
      capacity: row.capacity,
      actualCapacity: row.actual_capacity,
      effectiveCapacity: row.actual_capacity ?? row.capacity,
      bookedCount: row.booked_count !== undefined ? parseInt(row.booked_count) : undefined,
      notes: row.notes,
      cancelledReason: row.cancelled_reason,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatBooking(row: Record<string, any>) {
    return {
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      userName: row.user_name,
      status: row.status,
      bookedAt: row.booked_at,
      cancelledAt: row.cancelled_at,
      cancelReason: row.cancel_reason,
      createdAt: row.created_at,
    };
  }

  // ─── Class Types ───

  async findAllTypes(gymId: number, branchId: number | null, filters: ClassFiltersDto = {}) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['ct.is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`ct.branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      if (filters.category) {
        conditions.push(`ct.category = $${paramIndex++}`);
        values.push(filters.category);
      }

      if (filters.search) {
        conditions.push(`(ct.name ILIKE $${paramIndex} OR ct.description ILIKE $${paramIndex})`);
        values.push(`%${filters.search}%`);
        paramIndex++;
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const countResult = await client.query(
        `SELECT COUNT(*) FROM class_types ct ${whereClause}`,
        values,
      );

      const result = await client.query(
        `SELECT ct.*
         FROM class_types ct
         ${whereClause}
         ORDER BY ct.name ASC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, skip],
      );

      return {
        data: result.rows.map((row) => this.formatClassType(row)),
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
      };
    });
  }

  async findOneType(id: number, gymId: number) {
    const type = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM class_types WHERE id = $1 AND is_deleted = FALSE`,
        [id],
      );
      return result.rows[0];
    });

    if (!type) throw new NotFoundException(`Class type #${id} not found`);
    return this.formatClassType(type);
  }

  async createType(gymId: number, branchId: number | null, dto: CreateClassTypeDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO class_types (branch_id, name, description, category, default_duration, default_capacity, color, icon, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING *`,
        [
          branchId,
          dto.name,
          dto.description ?? null,
          dto.category ?? null,
          dto.defaultDuration ?? 60,
          dto.defaultCapacity ?? 20,
          dto.color ?? null,
          dto.icon ?? null,
        ],
      );
      return this.formatClassType(result.rows[0]);
    });
  }

  async updateType(id: number, gymId: number, dto: UpdateClassTypeDto) {
    await this.findOneType(id, gymId);

    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (dto.name !== undefined) { updates.push(`name = $${paramIndex++}`); values.push(dto.name); }
    if (dto.description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(dto.description); }
    if (dto.category !== undefined) { updates.push(`category = $${paramIndex++}`); values.push(dto.category); }
    if (dto.defaultDuration !== undefined) { updates.push(`default_duration = $${paramIndex++}`); values.push(dto.defaultDuration); }
    if (dto.defaultCapacity !== undefined) { updates.push(`default_capacity = $${paramIndex++}`); values.push(dto.defaultCapacity); }
    if (dto.color !== undefined) { updates.push(`color = $${paramIndex++}`); values.push(dto.color); }
    if (dto.icon !== undefined) { updates.push(`icon = $${paramIndex++}`); values.push(dto.icon); }
    if (dto.isActive !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(dto.isActive); }

    if (updates.length === 0) return this.findOneType(id, gymId);

    updates.push('updated_at = NOW()');
    values.push(id);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `UPDATE class_types SET ${updates.join(', ')} WHERE id = $${paramIndex} AND is_deleted = FALSE RETURNING id`,
        values,
      );
      if (result.rows.length === 0) throw new NotFoundException(`Class type #${id} not found`);
    });

    return this.findOneType(id, gymId);
  }

  async deleteType(id: number, gymId: number) {
    await this.findOneType(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE class_types SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [id],
      );
    });

    return { message: 'Class type deleted successfully' };
  }

  // ─── Schedules ───

  async findAllSchedules(gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['cs.is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`cs.branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const countResult = await client.query(
        `SELECT COUNT(*) FROM class_schedules cs ${whereClause}`,
        values,
      );

      const result = await client.query(
        `SELECT cs.*, ct.name as class_type_name, ct.color, ct.icon, u.name as instructor_name
         FROM class_schedules cs
         LEFT JOIN class_types ct ON ct.id = cs.class_type_id
         LEFT JOIN users u ON u.id = cs.instructor_id
         ${whereClause}
         ORDER BY cs.day_of_week ASC, cs.start_time ASC`,
        values,
      );

      return {
        data: result.rows.map((row) => this.formatSchedule(row)),
        total: parseInt(countResult.rows[0].count),
      };
    });
  }

  async createSchedule(gymId: number, branchId: number | null, dto: CreateClassScheduleDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO class_schedules (class_type_id, branch_id, instructor_id, room, day_of_week, start_time, end_time, capacity, is_recurring, start_date, end_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
         RETURNING *`,
        [
          dto.classTypeId,
          branchId,
          dto.instructorId ?? null,
          dto.room ?? null,
          dto.dayOfWeek,
          dto.startTime,
          dto.endTime,
          dto.capacity ?? 20,
          dto.isRecurring !== undefined ? dto.isRecurring : true,
          dto.startDate ?? null,
          dto.endDate ?? null,
        ],
      );

      // Re-fetch with joins
      const full = await client.query(
        `SELECT cs.*, ct.name as class_type_name, ct.color, ct.icon, u.name as instructor_name
         FROM class_schedules cs
         LEFT JOIN class_types ct ON ct.id = cs.class_type_id
         LEFT JOIN users u ON u.id = cs.instructor_id
         WHERE cs.id = $1`,
        [result.rows[0].id],
      );

      return this.formatSchedule(full.rows[0]);
    });
  }

  async updateSchedule(id: number, gymId: number, dto: UpdateClassScheduleDto) {
    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (dto.instructorId !== undefined) { updates.push(`instructor_id = $${paramIndex++}`); values.push(dto.instructorId); }
    if (dto.room !== undefined) { updates.push(`room = $${paramIndex++}`); values.push(dto.room); }
    if (dto.dayOfWeek !== undefined) { updates.push(`day_of_week = $${paramIndex++}`); values.push(dto.dayOfWeek); }
    if (dto.startTime !== undefined) { updates.push(`start_time = $${paramIndex++}`); values.push(dto.startTime); }
    if (dto.endTime !== undefined) { updates.push(`end_time = $${paramIndex++}`); values.push(dto.endTime); }
    if (dto.capacity !== undefined) { updates.push(`capacity = $${paramIndex++}`); values.push(dto.capacity); }
    if (dto.isRecurring !== undefined) { updates.push(`is_recurring = $${paramIndex++}`); values.push(dto.isRecurring); }
    if (dto.startDate !== undefined) { updates.push(`start_date = $${paramIndex++}`); values.push(dto.startDate); }
    if (dto.endDate !== undefined) { updates.push(`end_date = $${paramIndex++}`); values.push(dto.endDate); }
    if (dto.isActive !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(dto.isActive); }

    if (updates.length === 0) {
      return this.tenantService.executeInTenant(gymId, async (client) => {
        const result = await client.query(
          `SELECT cs.*, ct.name as class_type_name, ct.color, ct.icon, u.name as instructor_name
           FROM class_schedules cs
           LEFT JOIN class_types ct ON ct.id = cs.class_type_id
           LEFT JOIN users u ON u.id = cs.instructor_id
           WHERE cs.id = $1 AND cs.is_deleted = FALSE`,
          [id],
        );
        if (!result.rows[0]) throw new NotFoundException(`Schedule #${id} not found`);
        return this.formatSchedule(result.rows[0]);
      });
    }

    updates.push('updated_at = NOW()');
    values.push(id);

    return this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE class_schedules SET ${updates.join(', ')} WHERE id = $${paramIndex} AND is_deleted = FALSE`,
        values,
      );

      const result = await client.query(
        `SELECT cs.*, ct.name as class_type_name, ct.color, ct.icon, u.name as instructor_name
         FROM class_schedules cs
         LEFT JOIN class_types ct ON ct.id = cs.class_type_id
         LEFT JOIN users u ON u.id = cs.instructor_id
         WHERE cs.id = $1`,
        [id],
      );

      if (!result.rows[0]) throw new NotFoundException(`Schedule #${id} not found`);
      return this.formatSchedule(result.rows[0]);
    });
  }

  async deleteSchedule(id: number, gymId: number) {
    await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `UPDATE class_schedules SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND is_deleted = FALSE RETURNING id`,
        [id],
      );
      if (result.rows.length === 0) throw new NotFoundException(`Schedule #${id} not found`);
    });

    return { message: 'Schedule deleted successfully' };
  }

  // ─── Sessions ───

  async findAllSessions(gymId: number, branchId: number | null, filters: SessionFiltersDto = {}) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`s.branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      if (filters.fromDate) {
        conditions.push(`s.date >= $${paramIndex++}`);
        values.push(filters.fromDate);
      }

      if (filters.toDate) {
        conditions.push(`s.date <= $${paramIndex++}`);
        values.push(filters.toDate);
      }

      if (filters.classTypeId) {
        conditions.push(`cs.class_type_id = $${paramIndex++}`);
        values.push(filters.classTypeId);
      }

      if (filters.instructorId) {
        conditions.push(`s.instructor_id = $${paramIndex++}`);
        values.push(filters.instructorId);
      }

      if (filters.status) {
        conditions.push(`s.status = $${paramIndex++}`);
        values.push(filters.status);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await client.query(
        `SELECT COUNT(*)
         FROM class_sessions s
         JOIN class_schedules cs ON cs.id = s.schedule_id
         JOIN class_types ct ON ct.id = cs.class_type_id
         ${whereClause}`,
        values,
      );

      const result = await client.query(
        `SELECT s.*, u.name as instructor_name, ct.name as class_type_name, ct.category, ct.color, ct.icon,
                cs.room, cs.start_time, cs.end_time, cs.capacity,
                (SELECT COUNT(*) FROM class_bookings cb WHERE cb.session_id = s.id AND cb.status IN ('booked', 'attended')) as booked_count
         FROM class_sessions s
         JOIN class_schedules cs ON cs.id = s.schedule_id
         JOIN class_types ct ON ct.id = cs.class_type_id
         LEFT JOIN users u ON u.id = s.instructor_id
         ${whereClause}
         ORDER BY s.date ASC, cs.start_time ASC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, skip],
      );

      return {
        data: result.rows.map((row) => this.formatSession(row)),
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
      };
    });
  }

  async findOneSession(id: number, gymId: number) {
    const session = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT s.*, u.name as instructor_name, ct.name as class_type_name, ct.category, ct.color, ct.icon,
                cs.room, cs.start_time, cs.end_time, cs.capacity,
                (SELECT COUNT(*) FROM class_bookings cb WHERE cb.session_id = s.id AND cb.status IN ('booked', 'attended')) as booked_count
         FROM class_sessions s
         JOIN class_schedules cs ON cs.id = s.schedule_id
         JOIN class_types ct ON ct.id = cs.class_type_id
         LEFT JOIN users u ON u.id = s.instructor_id
         WHERE s.id = $1`,
        [id],
      );
      return result.rows[0];
    });

    if (!session) throw new NotFoundException(`Session #${id} not found`);
    return this.formatSession(session);
  }

  async generateSessions(gymId: number, branchId: number | null, dto: GenerateSessionsDto) {
    const fromDate = new Date(dto.fromDate);
    const toDate = new Date(dto.toDate);

    if (fromDate > toDate) {
      throw new BadRequestException('fromDate must be before toDate');
    }

    const maxDays = 90;
    const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > maxDays) {
      throw new BadRequestException(`Date range cannot exceed ${maxDays} days`);
    }

    return this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query('BEGIN');
      try {
        const conditions: string[] = ['cs.is_deleted = FALSE', 'cs.is_active = TRUE'];
        const values: SqlValue[] = [];
        let paramIndex = 1;

        if (branchId !== null) {
          conditions.push(`cs.branch_id = $${paramIndex++}`);
          values.push(branchId);
        }

        if (dto.scheduleId) {
          conditions.push(`cs.id = $${paramIndex++}`);
          values.push(dto.scheduleId);
        }

        const schedules = await client.query(
          `SELECT cs.* FROM class_schedules cs WHERE ${conditions.join(' AND ')}`,
          values,
        );

        let created = 0;

        for (const schedule of schedules.rows) {
          const current = new Date(fromDate);
          while (current <= toDate) {
            // Use UTC methods to avoid timezone-related day-of-week mismatches
            if (current.getUTCDay() === schedule.day_of_week) {
              const dateStr = current.toISOString().split('T')[0];
              const existing = await client.query(
                `SELECT 1 FROM class_sessions WHERE schedule_id = $1 AND date = $2`,
                [schedule.id, dateStr],
              );

              if (existing.rows.length === 0) {
                await client.query(
                  `INSERT INTO class_sessions (schedule_id, branch_id, date, instructor_id, status, created_at, updated_at)
                   VALUES ($1, $2, $3, $4, 'scheduled', NOW(), NOW())`,
                  [schedule.id, schedule.branch_id, dateStr, schedule.instructor_id],
                );
                created++;
              }
            }
            current.setUTCDate(current.getUTCDate() + 1);
          }
        }

        await client.query('COMMIT');
        return { message: `Generated ${created} sessions`, created };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async updateSession(id: number, gymId: number, dto: UpdateSessionDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query('BEGIN');
      try {
        // Validate session status transition
        if (dto.status !== undefined) {
          const current = await client.query(
            `SELECT status FROM class_sessions WHERE id = $1 FOR UPDATE`,
            [id],
          );
          if (current.rows.length === 0) throw new NotFoundException(`Session #${id} not found`);

          const previousStatus = current.rows[0].status;
          const allowedTransitions: Record<string, string[]> = {
            scheduled: ['cancelled', 'completed'],
            cancelled: [],
            completed: [],
          };

          if (allowedTransitions[previousStatus] && !allowedTransitions[previousStatus].includes(dto.status)) {
            throw new BadRequestException(`Cannot transition session from '${previousStatus}' to '${dto.status}'`);
          }
        }

        const updates: string[] = [];
        const values: SqlValue[] = [];
        let paramIndex = 1;

        if (dto.status !== undefined) { updates.push(`status = $${paramIndex++}`); values.push(dto.status); }
        if (dto.instructorId !== undefined) { updates.push(`instructor_id = $${paramIndex++}`); values.push(dto.instructorId); }
        if (dto.notes !== undefined) { updates.push(`notes = $${paramIndex++}`); values.push(dto.notes); }
        if (dto.cancelledReason !== undefined) { updates.push(`cancelled_reason = $${paramIndex++}`); values.push(dto.cancelledReason); }

        if (updates.length === 0) throw new BadRequestException('No fields to update');

        updates.push('updated_at = NOW()');
        values.push(id);

        const updateResult = await client.query(
          `UPDATE class_sessions SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id`,
          values,
        );

        if (updateResult.rows.length === 0) throw new NotFoundException(`Session #${id} not found`);

        // If cancelled, cancel all bookings atomically
        if (dto.status === 'cancelled') {
          await client.query(
            `UPDATE class_bookings SET status = 'cancelled', cancelled_at = NOW(), cancel_reason = 'Session cancelled' WHERE session_id = $1 AND status IN ('booked', 'waitlisted')`,
            [id],
          );
        }

        // Re-fetch with full JOINs
        const result = await client.query(
          `SELECT s.*, u.name as instructor_name, ct.name as class_type_name, ct.category, ct.color, ct.icon,
                  cs.room, cs.start_time, cs.end_time, cs.capacity,
                  (SELECT COUNT(*) FROM class_bookings cb WHERE cb.session_id = s.id AND cb.status IN ('booked', 'attended')) as booked_count
           FROM class_sessions s
           JOIN class_schedules cs ON cs.id = s.schedule_id
           JOIN class_types ct ON ct.id = cs.class_type_id
           LEFT JOIN users u ON u.id = s.instructor_id
           WHERE s.id = $1`,
          [id],
        );

        await client.query('COMMIT');
        return this.formatSession(result.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  // ─── Bookings ───

  async getSessionBookings(sessionId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const countResult = await client.query(
        `SELECT COUNT(*) FROM class_bookings WHERE session_id = $1`,
        [sessionId],
      );

      const summaryResult = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'booked') as booked,
           COUNT(*) FILTER (WHERE status = 'waitlisted') as waitlisted,
           COUNT(*) FILTER (WHERE status = 'attended') as attended,
           COUNT(*) FILTER (WHERE status = 'no_show') as no_show,
           COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled
         FROM class_bookings WHERE session_id = $1`,
        [sessionId],
      );

      const result = await client.query(
        `SELECT cb.*, u.name as user_name
         FROM class_bookings cb
         LEFT JOIN users u ON u.id = cb.user_id
         WHERE cb.session_id = $1
         ORDER BY cb.booked_at ASC`,
        [sessionId],
      );

      const summary = summaryResult.rows[0];

      return {
        data: result.rows.map((row) => this.formatBooking(row)),
        total: parseInt(countResult.rows[0].count),
        summary: {
          booked: parseInt(summary.booked),
          waitlisted: parseInt(summary.waitlisted),
          attended: parseInt(summary.attended),
          noShow: parseInt(summary.no_show),
          cancelled: parseInt(summary.cancelled),
        },
      };
    });
  }

  async bookSession(sessionId: number, userId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query('BEGIN');
      try {
        // Lock session row to prevent race conditions on concurrent bookings
        const session = await client.query(
          `SELECT s.*, cs.capacity
           FROM class_sessions s
           JOIN class_schedules cs ON cs.id = s.schedule_id
           WHERE s.id = $1 AND s.status = 'scheduled'
           FOR UPDATE OF s`,
          [sessionId],
        );

        if (session.rows.length === 0) {
          throw new NotFoundException('Session not found or not available for booking');
        }

        // Check if user already has a booking for this session
        const existingBooking = await client.query(
          `SELECT 1 FROM class_bookings WHERE session_id = $1 AND user_id = $2 AND status IN ('booked', 'waitlisted')`,
          [sessionId, userId],
        );

        if (existingBooking.rows.length > 0) {
          throw new BadRequestException('You already have a booking for this session');
        }

        // Count current bookings
        const bookingCount = await client.query(
          `SELECT COUNT(*) FROM class_bookings WHERE session_id = $1 AND status IN ('booked', 'attended')`,
          [sessionId],
        );

        const currentCount = parseInt(bookingCount.rows[0].count);
        // Use actual_capacity override if set, otherwise fall back to schedule capacity
        const capacity = session.rows[0].actual_capacity ?? session.rows[0].capacity;
        const isWaitlisted = currentCount >= capacity;
        const status = isWaitlisted ? 'waitlisted' : 'booked';

        await client.query(
          `INSERT INTO class_bookings (session_id, user_id, status, booked_at, created_at)
           VALUES ($1, $2, $3, NOW(), NOW())`,
          [sessionId, userId, status],
        );

        // Re-fetch with JOIN to include userName
        const booking = await client.query(
          `SELECT cb.*, u.name as user_name
           FROM class_bookings cb
           LEFT JOIN users u ON u.id = cb.user_id
           WHERE cb.session_id = $1 AND cb.user_id = $2 AND cb.status = $3
           ORDER BY cb.created_at DESC LIMIT 1`,
          [sessionId, userId, status],
        );

        const position = isWaitlisted
          ? parseInt((await client.query(
              `SELECT COUNT(*) FROM class_bookings WHERE session_id = $1 AND status = 'waitlisted'`,
              [sessionId],
            )).rows[0].count)
          : null;

        await client.query('COMMIT');

        return {
          booking: this.formatBooking(booking.rows[0]),
          waitlisted: isWaitlisted,
          position,
          message: isWaitlisted
            ? 'Session is full. You have been added to the waitlist.'
            : 'Successfully booked!',
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async updateBookingStatus(bookingId: number, gymId: number, dto: UpdateBookingStatusDto, userId: number, userRole: string) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query('BEGIN');
      try {
        // Lock and fetch current booking
        const current = await client.query(
          `SELECT * FROM class_bookings WHERE id = $1 FOR UPDATE`,
          [bookingId],
        );

        if (current.rows.length === 0) throw new NotFoundException(`Booking #${bookingId} not found`);

        // Ownership check: clients can only update their own bookings
        if (userRole === 'client' && current.rows[0].user_id !== userId) {
          throw new ForbiddenException('You can only update your own bookings');
        }

        // Clients can only cancel their bookings
        if (userRole === 'client' && dto.status !== 'cancelled') {
          throw new ForbiddenException('You can only cancel your bookings');
        }

        // Status transition validation
        const previousStatus = current.rows[0].status;
        const allowedTransitions: Record<string, string[]> = {
          booked: ['attended', 'no_show', 'cancelled'],
          waitlisted: ['booked', 'cancelled'],
          attended: [],
          no_show: [],
          cancelled: [],
        };

        if (allowedTransitions[previousStatus] && !allowedTransitions[previousStatus].includes(dto.status)) {
          throw new BadRequestException(`Cannot transition from '${previousStatus}' to '${dto.status}'`);
        }

        const updates: string[] = [`status = $1`];
        const values: SqlValue[] = [dto.status];
        let paramIndex = 2;

        if (dto.status === 'cancelled') {
          updates.push(`cancelled_at = NOW()`);
          if (dto.cancelReason) {
            updates.push(`cancel_reason = $${paramIndex++}`);
            values.push(dto.cancelReason);
          }
        }

        values.push(bookingId);

        const result = await client.query(
          `UPDATE class_bookings SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, session_id`,
          values,
        );

        // Promote waitlisted person if a 'booked' booking was cancelled or marked no_show (frees a spot)
        if ((dto.status === 'cancelled' || dto.status === 'no_show') && previousStatus === 'booked') {
          const sessionId = result.rows[0].session_id;
          const waitlisted = await client.query(
            `SELECT id FROM class_bookings WHERE session_id = $1 AND status = 'waitlisted' ORDER BY booked_at ASC LIMIT 1 FOR UPDATE`,
            [sessionId],
          );

          if (waitlisted.rows.length > 0) {
            await client.query(
              `UPDATE class_bookings SET status = 'booked' WHERE id = $1`,
              [waitlisted.rows[0].id],
            );
          }
        }

        // Re-fetch with JOIN for userName
        const updated = await client.query(
          `SELECT cb.*, u.name as user_name
           FROM class_bookings cb
           LEFT JOIN users u ON u.id = cb.user_id
           WHERE cb.id = $1`,
          [bookingId],
        );

        await client.query('COMMIT');
        return this.formatBooking(updated.rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  async getMyBookings(userId: number, gymId: number, page = 1, limit = 20, filters: { status?: string; fromDate?: string; toDate?: string } = {}) {
    const skip = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['cb.user_id = $1'];
      const values: SqlValue[] = [userId];
      let paramIndex = 2;

      if (filters.status) {
        conditions.push(`cb.status = $${paramIndex++}`);
        values.push(filters.status);
      }

      if (filters.fromDate) {
        conditions.push(`s.date >= $${paramIndex++}`);
        values.push(filters.fromDate);
      }

      if (filters.toDate) {
        conditions.push(`s.date <= $${paramIndex++}`);
        values.push(filters.toDate);
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const countResult = await client.query(
        `SELECT COUNT(*)
         FROM class_bookings cb
         JOIN class_sessions s ON s.id = cb.session_id
         JOIN class_schedules cs ON cs.id = s.schedule_id
         JOIN class_types ct ON ct.id = cs.class_type_id
         ${whereClause}`,
        values,
      );

      const result = await client.query(
        `SELECT cb.*, s.date, s.status as session_status,
                cs.start_time, cs.end_time, cs.room,
                ct.name as class_type_name, ct.category, ct.color, ct.icon,
                u.name as instructor_name
         FROM class_bookings cb
         JOIN class_sessions s ON s.id = cb.session_id
         JOIN class_schedules cs ON cs.id = s.schedule_id
         JOIN class_types ct ON ct.id = cs.class_type_id
         LEFT JOIN users u ON u.id = s.instructor_id
         ${whereClause}
         ORDER BY s.date DESC, cs.start_time DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, skip],
      );

      return {
        data: result.rows.map((row) => ({
          id: row.id,
          sessionId: row.session_id,
          status: row.status,
          sessionStatus: row.session_status,
          bookedAt: row.booked_at,
          cancelledAt: row.cancelled_at,
          cancelReason: row.cancel_reason,
          date: row.date,
          startTime: row.start_time,
          endTime: row.end_time,
          room: row.room,
          classTypeName: row.class_type_name,
          category: row.category,
          color: row.color,
          icon: row.icon,
          instructorName: row.instructor_name,
        })),
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
      };
    });
  }
}
