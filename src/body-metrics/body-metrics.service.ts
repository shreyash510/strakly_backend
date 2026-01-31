import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { UpdateBodyMetricsDto, RecordMetricsDto } from './dto/body-metrics.dto';

@Injectable()
export class BodyMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  private calculateBMI(weight?: number, height?: number): number | null {
    if (!weight || !height) return null;
    const heightInMeters = height / 100;
    return Math.round((weight / (heightInMeters * heightInMeters)) * 100) / 100;
  }

  private formatMetrics(m: any) {
    return {
      id: m.id,
      userId: m.user_id,
      branchId: m.branch_id,
      height: m.height,
      weight: m.weight,
      bmi: m.bmi,
      bodyFat: m.body_fat,
      muscleMass: m.muscle_mass,
      boneMass: m.bone_mass,
      waterPercentage: m.water_percentage,
      chest: m.chest,
      waist: m.waist,
      hips: m.hips,
      biceps: m.biceps,
      thighs: m.thighs,
      calves: m.calves,
      shoulders: m.shoulders,
      neck: m.neck,
      restingHeartRate: m.resting_heart_rate,
      bloodPressureSys: m.blood_pressure_sys,
      bloodPressureDia: m.blood_pressure_dia,
      lastMeasuredAt: m.last_measured_at,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    };
  }

  async getMetrics(userId: number, gymId: number, branchId?: number | null) {
    const metrics = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT * FROM body_metrics WHERE user_id = $1`;
        const values: any[] = [userId];

        // Branch filtering
        if (branchId !== null && branchId !== undefined) {
          query += ` AND branch_id = $2`;
          values.push(branchId);
        }

        const result = await client.query(query, values);
        return result.rows[0];
      },
    );

    if (!metrics) {
      return null;
    }

    return this.formatMetrics(metrics);
  }

  async getOrCreateMetrics(
    userId: number,
    gymId: number,
    branchId?: number | null,
  ) {
    let metrics = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT * FROM body_metrics WHERE user_id = $1`;
        const values: any[] = [userId];

        // Branch filtering
        if (branchId !== null && branchId !== undefined) {
          query += ` AND branch_id = $2`;
          values.push(branchId);
        }

        const result = await client.query(query, values);
        return result.rows[0];
      },
    );

    if (!metrics) {
      metrics = await this.tenantService.executeInTenant(
        gymId,
        async (client) => {
          const result = await client.query(
            `INSERT INTO body_metrics (user_id, branch_id, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING *`,
            [userId, branchId ?? null],
          );
          return result.rows[0];
        },
      );
    }

    return this.formatMetrics(metrics);
  }

  async updateMetrics(
    userId: number,
    gymId: number,
    dto: UpdateBodyMetricsDto,
    branchId?: number | null,
  ) {
    // Verify user exists
    const user = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM users WHERE id = $1`,
          [userId],
        );
        return result.rows[0];
      },
    );

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const bmi = this.calculateBMI(dto.weight, dto.height);

    // Check if metrics exist
    const existing = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT id FROM body_metrics WHERE user_id = $1`;
        const values: any[] = [userId];

        // Branch filtering
        if (branchId !== null && branchId !== undefined) {
          query += ` AND branch_id = $2`;
          values.push(branchId);
        }

        const result = await client.query(query, values);
        return result.rows[0];
      },
    );

    const metrics = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        if (existing) {
          const updates: string[] = [];
          const values: any[] = [];
          let paramIndex = 1;

          if (dto.height !== undefined) {
            updates.push(`height = $${paramIndex++}`);
            values.push(dto.height);
          }
          if (dto.weight !== undefined) {
            updates.push(`weight = $${paramIndex++}`);
            values.push(dto.weight);
          }
          if (bmi !== null) {
            updates.push(`bmi = $${paramIndex++}`);
            values.push(bmi);
          }
          if (dto.bodyFat !== undefined) {
            updates.push(`body_fat = $${paramIndex++}`);
            values.push(dto.bodyFat);
          }
          if (dto.muscleMass !== undefined) {
            updates.push(`muscle_mass = $${paramIndex++}`);
            values.push(dto.muscleMass);
          }
          if (dto.boneMass !== undefined) {
            updates.push(`bone_mass = $${paramIndex++}`);
            values.push(dto.boneMass);
          }
          if (dto.waterPercentage !== undefined) {
            updates.push(`water_percentage = $${paramIndex++}`);
            values.push(dto.waterPercentage);
          }
          if (dto.chest !== undefined) {
            updates.push(`chest = $${paramIndex++}`);
            values.push(dto.chest);
          }
          if (dto.waist !== undefined) {
            updates.push(`waist = $${paramIndex++}`);
            values.push(dto.waist);
          }
          if (dto.hips !== undefined) {
            updates.push(`hips = $${paramIndex++}`);
            values.push(dto.hips);
          }
          if (dto.biceps !== undefined) {
            updates.push(`biceps = $${paramIndex++}`);
            values.push(dto.biceps);
          }
          if (dto.thighs !== undefined) {
            updates.push(`thighs = $${paramIndex++}`);
            values.push(dto.thighs);
          }
          if (dto.calves !== undefined) {
            updates.push(`calves = $${paramIndex++}`);
            values.push(dto.calves);
          }
          if (dto.shoulders !== undefined) {
            updates.push(`shoulders = $${paramIndex++}`);
            values.push(dto.shoulders);
          }
          if (dto.neck !== undefined) {
            updates.push(`neck = $${paramIndex++}`);
            values.push(dto.neck);
          }

          updates.push(`last_measured_at = NOW()`);
          updates.push(`updated_at = NOW()`);
          values.push(userId);

          await client.query(
            `UPDATE body_metrics SET ${updates.join(', ')} WHERE user_id = $${paramIndex}`,
            values,
          );
        } else {
          await client.query(
            `INSERT INTO body_metrics (user_id, branch_id, height, weight, bmi, body_fat, muscle_mass, last_measured_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())`,
            [
              userId,
              branchId ?? null,
              dto.height,
              dto.weight,
              bmi,
              dto.bodyFat,
              dto.muscleMass,
            ],
          );
        }

        const result = await client.query(
          `SELECT * FROM body_metrics WHERE user_id = $1`,
          [userId],
        );
        return result.rows[0];
      },
    );

    return this.formatMetrics(metrics);
  }

  async recordMetrics(
    userId: number,
    gymId: number,
    dto: RecordMetricsDto,
    branchId?: number | null,
  ) {
    // Update current metrics
    await this.updateMetrics(userId, gymId, dto, branchId);

    const currentMetrics = await this.getMetrics(userId, gymId);
    const height = dto.height || currentMetrics?.height;
    const bmi = this.calculateBMI(dto.weight, height);
    const measuredAt = dto.measuredAt ? new Date(dto.measuredAt) : new Date();

    // Insert into history and return the new record
    const historyRecord = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO body_metrics_history (user_id, branch_id, measured_at, height, weight, bmi, body_fat, muscle_mass, waist, chest, hips, notes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
         RETURNING *`,
          [
            userId,
            branchId ?? null,
            measuredAt,
            dto.height || null,
            dto.weight || null,
            bmi,
            dto.bodyFat || null,
            dto.muscleMass || null,
            dto.waist || null,
            dto.chest || null,
            dto.hips || null,
            dto.notes || null,
          ],
        );
        return result.rows[0];
      },
    );

    // Return the history record in the expected format
    return {
      id: historyRecord.id,
      userId: historyRecord.user_id,
      branchId: historyRecord.branch_id,
      measuredAt: historyRecord.measured_at,
      height: historyRecord.height,
      weight: historyRecord.weight,
      bmi: historyRecord.bmi,
      bodyFat: historyRecord.body_fat,
      muscleMass: historyRecord.muscle_mass,
      boneMass: historyRecord.bone_mass,
      waterPercentage: historyRecord.water_percentage,
      chest: historyRecord.chest,
      waist: historyRecord.waist,
      hips: historyRecord.hips,
      biceps: historyRecord.biceps,
      thighs: historyRecord.thighs,
      calves: historyRecord.calves,
      shoulders: historyRecord.shoulders,
      neck: historyRecord.neck,
      restingHeartRate: historyRecord.resting_heart_rate,
      bloodPressureSys: historyRecord.blood_pressure_sys,
      bloodPressureDia: historyRecord.blood_pressure_dia,
      targetWeight: historyRecord.target_weight,
      targetBodyFat: historyRecord.target_body_fat,
      measuredBy: historyRecord.measured_by,
      notes: historyRecord.notes,
      createdAt: historyRecord.created_at,
    };
  }

  async getHistory(
    userId: number,
    gymId: number,
    options?: {
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
      branchId?: number | null;
    },
  ) {
    const page = options?.page || 1;
    const limit = options?.limit || 10;
    const skip = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      let whereClause = 'user_id = $1';
      const values: any[] = [userId];
      let paramIndex = 2;

      // Branch filtering
      if (options?.branchId !== null && options?.branchId !== undefined) {
        whereClause += ` AND branch_id = $${paramIndex++}`;
        values.push(options.branchId);
      }

      if (options?.startDate) {
        whereClause += ` AND measured_at >= $${paramIndex++}`;
        values.push(options.startDate);
      }
      if (options?.endDate) {
        whereClause += ` AND measured_at <= $${paramIndex++}`;
        values.push(options.endDate);
      }

      // Get total count
      const countResult = await client.query(
        `SELECT COUNT(*) as count FROM body_metrics_history WHERE ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // Get paginated data
      const dataValues = [...values, limit, skip];
      const result = await client.query(
        `SELECT * FROM body_metrics_history WHERE ${whereClause} ORDER BY measured_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        dataValues,
      );

      const data = result.rows.map((h: any) => ({
        id: h.id,
        userId: h.user_id,
        branchId: h.branch_id,
        measuredAt: h.measured_at,
        height: h.height,
        weight: h.weight,
        bmi: h.bmi,
        bodyFat: h.body_fat,
        muscleMass: h.muscle_mass,
        boneMass: h.bone_mass,
        waterPercentage: h.water_percentage,
        waist: h.waist,
        chest: h.chest,
        hips: h.hips,
        biceps: h.biceps,
        thighs: h.thighs,
        calves: h.calves,
        shoulders: h.shoulders,
        neck: h.neck,
        restingHeartRate: h.resting_heart_rate,
        bloodPressureSys: h.blood_pressure_sys,
        bloodPressureDia: h.blood_pressure_dia,
        measuredBy: h.measured_by,
        notes: h.notes,
        createdAt: h.created_at,
      }));

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      };
    });
  }

  async getProgress(userId: number, gymId: number, branchId?: number | null) {
    const current = await this.getMetrics(userId, gymId, branchId);

    if (!current) {
      return null;
    }

    const { firstRecord, latestRecord, totalRecords } =
      await this.tenantService.executeInTenant(gymId, async (client) => {
        let whereClause = 'user_id = $1';
        const values: any[] = [userId];

        // Branch filtering
        if (branchId !== null && branchId !== undefined) {
          whereClause += ` AND branch_id = $2`;
          values.push(branchId);
        }

        const [firstResult, latestResult, countResult] = await Promise.all([
          client.query(
            `SELECT * FROM body_metrics_history WHERE ${whereClause} ORDER BY measured_at ASC LIMIT 1`,
            values,
          ),
          client.query(
            `SELECT * FROM body_metrics_history WHERE ${whereClause} ORDER BY measured_at DESC LIMIT 1`,
            values,
          ),
          client.query(
            `SELECT COUNT(*) as count FROM body_metrics_history WHERE ${whereClause}`,
            values,
          ),
        ]);

        return {
          firstRecord: firstResult.rows[0],
          latestRecord: latestResult.rows[0],
          totalRecords: parseInt(countResult.rows[0].count, 10),
        };
      });

    if (!firstRecord) {
      return { current, progress: null, firstRecord: null, totalRecords: 0 };
    }

    const progress: any = {};

    if (firstRecord.weight && current.weight) {
      progress.weight = {
        initial: Number(firstRecord.weight),
        current: Number(current.weight),
        change: Number(current.weight) - Number(firstRecord.weight),
        changePercent:
          ((Number(current.weight) - Number(firstRecord.weight)) /
            Number(firstRecord.weight)) *
          100,
      };
    }

    return {
      current,
      firstRecord,
      latestRecord,
      progress,
      totalRecords,
      startDate: firstRecord.measured_at,
      daysSinceStart: Math.floor(
        (Date.now() - new Date(firstRecord.measured_at).getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    };
  }

  async deleteHistoryRecord(id: number, userId: number, gymId: number) {
    const record = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT * FROM body_metrics_history WHERE id = $1`,
          [id],
        );
        return result.rows[0];
      },
    );

    if (!record || record.user_id !== userId) {
      throw new NotFoundException(`History record with ID ${id} not found`);
    }

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(`DELETE FROM body_metrics_history WHERE id = $1`, [
        id,
      ]);
    });

    return { success: true };
  }
}
