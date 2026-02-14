import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { CreateGuestVisitDto, UpdateGuestVisitDto, GuestVisitFiltersDto } from './dto/guest-visit.dto';
import { SqlValue } from '../common/types';

const MAX_GUEST_VISITS_PER_MEMBER_PER_MONTH = 5;

@Injectable()
export class GuestVisitsService {
  constructor(private readonly tenantService: TenantService) {}

  private formatVisit(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      guestName: row.guest_name,
      guestPhone: row.guest_phone,
      guestEmail: row.guest_email,
      broughtBy: row.brought_by,
      broughtByName: row.brought_by_name,
      visitDate: row.visit_date,
      dayPassAmount: row.day_pass_amount,
      paymentMethod: row.payment_method,
      convertedToMember: row.converted_to_member,
      notes: row.notes,
      checkedInBy: row.checked_in_by,
      checkedInByName: row.checked_in_by_name,
      createdAt: row.created_at,
    };
  }

  async findAll(gymId: number, branchId: number | null, filters: GuestVisitFiltersDto = {}) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`gv.branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      if (filters.fromDate) {
        conditions.push(`gv.visit_date >= $${paramIndex++}`);
        values.push(filters.fromDate);
      }

      if (filters.toDate) {
        conditions.push(`gv.visit_date <= $${paramIndex++}`);
        values.push(filters.toDate);
      }

      if (filters.broughtBy) {
        conditions.push(`gv.brought_by = $${paramIndex++}`);
        values.push(filters.broughtBy);
      }

      if (filters.convertedToMember !== undefined) {
        conditions.push(`gv.converted_to_member = $${paramIndex++}`);
        values.push(filters.convertedToMember);
      }

      if (filters.search) {
        conditions.push(`(gv.guest_name ILIKE $${paramIndex} OR gv.guest_phone ILIKE $${paramIndex} OR gv.guest_email ILIKE $${paramIndex})`);
        values.push(`%${filters.search}%`);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Sorting
      const allowedSortColumns = ['visit_date', 'guest_name', 'day_pass_amount', 'created_at'];
      const sortBy = filters.sortBy && allowedSortColumns.includes(filters.sortBy) ? `gv.${filters.sortBy}` : 'gv.visit_date';
      const sortOrder = filters.sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const countResult = await client.query(
        `SELECT COUNT(*) FROM guest_visits gv ${whereClause}`,
        values,
      );

      const result = await client.query(
        `SELECT gv.*, u.name as brought_by_name, staff.name as checked_in_by_name
         FROM guest_visits gv
         LEFT JOIN users u ON u.id = gv.brought_by
         LEFT JOIN users staff ON staff.id = gv.checked_in_by
         ${whereClause}
         ORDER BY ${sortBy} ${sortOrder}, gv.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, skip],
      );

      return {
        data: result.rows.map((row) => this.formatVisit(row)),
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
      };
    });
  }

  async findOne(id: number, gymId: number, branchId: number | null = null) {
    const visit = await this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['gv.id = $1'];
      const values: SqlValue[] = [id];

      if (branchId !== null) {
        conditions.push('gv.branch_id = $2');
        values.push(branchId);
      }

      const result = await client.query(
        `SELECT gv.*, u.name as brought_by_name, staff.name as checked_in_by_name
         FROM guest_visits gv
         LEFT JOIN users u ON u.id = gv.brought_by
         LEFT JOIN users staff ON staff.id = gv.checked_in_by
         WHERE ${conditions.join(' AND ')}`,
        values,
      );
      return result.rows[0];
    });

    if (!visit) throw new NotFoundException(`Guest visit #${id} not found`);
    return this.formatVisit(visit);
  }

  async create(gymId: number, branchId: number | null, dto: CreateGuestVisitDto, checkedInBy: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Enforce guest visit limit per member per month
      if (dto.broughtBy) {
        const monthCount = await client.query(
          `SELECT COUNT(*) FROM guest_visits
           WHERE brought_by = $1 AND visit_date >= date_trunc('month', CURRENT_DATE)`,
          [dto.broughtBy],
        );
        if (parseInt(monthCount.rows[0].count) >= MAX_GUEST_VISITS_PER_MEMBER_PER_MONTH) {
          throw new BadRequestException(
            `Member has reached the maximum of ${MAX_GUEST_VISITS_PER_MEMBER_PER_MONTH} guest visits this month`,
          );
        }
      }

      const result = await client.query(
        `INSERT INTO guest_visits (branch_id, guest_name, guest_phone, guest_email, brought_by, visit_date, day_pass_amount, payment_method, notes, checked_in_by, created_at)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_DATE), $7, $8, $9, $10, NOW())
         RETURNING *`,
        [
          branchId,
          dto.guestName,
          dto.guestPhone ?? null,
          dto.guestEmail ?? null,
          dto.broughtBy ?? null,
          dto.visitDate ?? null,
          dto.dayPassAmount ?? 0,
          dto.paymentMethod ?? null,
          dto.notes ?? null,
          checkedInBy,
        ],
      );

      // Re-fetch with joins
      const full = await client.query(
        `SELECT gv.*, u.name as brought_by_name, staff.name as checked_in_by_name
         FROM guest_visits gv
         LEFT JOIN users u ON u.id = gv.brought_by
         LEFT JOIN users staff ON staff.id = gv.checked_in_by
         WHERE gv.id = $1`,
        [result.rows[0].id],
      );

      return this.formatVisit(full.rows[0]);
    });
  }

  async update(id: number, gymId: number, branchId: number | null, dto: UpdateGuestVisitDto) {
    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (dto.guestName !== undefined) { updates.push(`guest_name = $${paramIndex++}`); values.push(dto.guestName); }
    if (dto.guestPhone !== undefined) { updates.push(`guest_phone = $${paramIndex++}`); values.push(dto.guestPhone); }
    if (dto.guestEmail !== undefined) { updates.push(`guest_email = $${paramIndex++}`); values.push(dto.guestEmail); }
    if (dto.broughtBy !== undefined) { updates.push(`brought_by = $${paramIndex++}`); values.push(dto.broughtBy); }
    if (dto.visitDate !== undefined) { updates.push(`visit_date = $${paramIndex++}`); values.push(dto.visitDate); }
    if (dto.dayPassAmount !== undefined) { updates.push(`day_pass_amount = $${paramIndex++}`); values.push(dto.dayPassAmount); }
    if (dto.paymentMethod !== undefined) { updates.push(`payment_method = $${paramIndex++}`); values.push(dto.paymentMethod); }
    if (dto.notes !== undefined) { updates.push(`notes = $${paramIndex++}`); values.push(dto.notes); }

    if (updates.length === 0) return this.findOne(id, gymId, branchId);

    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Build WHERE with branch scoping
      const conditions: string[] = [`id = $${paramIndex++}`];
      values.push(id);

      if (branchId !== null) {
        conditions.push(`branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      const result = await client.query(
        `UPDATE guest_visits SET ${updates.join(', ')} WHERE ${conditions.join(' AND ')} RETURNING id`,
        values,
      );

      if (result.rows.length === 0) throw new NotFoundException(`Guest visit #${id} not found`);

      // Re-fetch with JOINs
      const full = await client.query(
        `SELECT gv.*, u.name as brought_by_name, staff.name as checked_in_by_name
         FROM guest_visits gv
         LEFT JOIN users u ON u.id = gv.brought_by
         LEFT JOIN users staff ON staff.id = gv.checked_in_by
         WHERE gv.id = $1`,
        [id],
      );

      return this.formatVisit(full.rows[0]);
    });
  }

  async markConverted(id: number, gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['id = $1'];
      const values: SqlValue[] = [id];

      if (branchId !== null) {
        conditions.push('branch_id = $2');
        values.push(branchId);
      }

      const result = await client.query(
        `UPDATE guest_visits SET converted_to_member = TRUE WHERE ${conditions.join(' AND ')} RETURNING id`,
        values,
      );

      if (result.rows.length === 0) throw new NotFoundException(`Guest visit #${id} not found`);

      // Re-fetch with JOINs
      const full = await client.query(
        `SELECT gv.*, u.name as brought_by_name, staff.name as checked_in_by_name
         FROM guest_visits gv
         LEFT JOIN users u ON u.id = gv.brought_by
         LEFT JOIN users staff ON staff.id = gv.checked_in_by
         WHERE gv.id = $1`,
        [id],
      );

      return this.formatVisit(full.rows[0]);
    });
  }

  async remove(id: number, gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['id = $1'];
      const values: SqlValue[] = [id];

      if (branchId !== null) {
        conditions.push('branch_id = $2');
        values.push(branchId);
      }

      const result = await client.query(
        `DELETE FROM guest_visits WHERE ${conditions.join(' AND ')} RETURNING id`,
        values,
      );

      if (result.rows.length === 0) throw new NotFoundException(`Guest visit #${id} not found`);
      return { message: 'Guest visit deleted successfully' };
    });
  }

  async getStats(gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const branchCondition = branchId !== null ? ' AND branch_id = $1' : '';
      const branchValues: SqlValue[] = branchId !== null ? [branchId] : [];

      const totalResult = await client.query(
        `SELECT COUNT(*) FROM guest_visits WHERE 1=1${branchCondition}`,
        branchValues,
      );
      const total = parseInt(totalResult.rows[0].count);

      const convertedResult = await client.query(
        `SELECT COUNT(*) FROM guest_visits WHERE converted_to_member = TRUE${branchCondition}`,
        branchValues,
      );
      const converted = parseInt(convertedResult.rows[0].count);

      const revenueResult = await client.query(
        `SELECT COALESCE(SUM(day_pass_amount), 0) as total_revenue FROM guest_visits WHERE 1=1${branchCondition}`,
        branchValues,
      );

      const thisMonthResult = await client.query(
        `SELECT COUNT(*) FROM guest_visits WHERE visit_date >= date_trunc('month', CURRENT_DATE)${branchCondition}`,
        branchValues,
      );

      const todayResult = await client.query(
        `SELECT COUNT(*) FROM guest_visits WHERE visit_date = CURRENT_DATE${branchCondition}`,
        branchValues,
      );

      return {
        totalVisits: total,
        convertedToMember: converted,
        conversionRate: total > 0 ? Math.round((converted / total) * 10000) / 100 : 0,
        totalRevenue: parseFloat(revenueResult.rows[0].total_revenue),
        thisMonth: parseInt(thisMonthResult.rows[0].count),
        today: parseInt(todayResult.rows[0].count),
      };
    });
  }
}
