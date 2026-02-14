import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { SqlValue } from '../common/types';

export interface AttendanceStats {
  totalPresent: number;
  todayPresent: number;
  thisWeekPresent: number;
  thisMonthPresent: number;
}

export interface AttendanceReportData {
  summary: {
    totalCheckIns: number;
    avgDailyCheckIns: number;
    uniqueMembers: number;
    avgDuration: number; // in minutes
  };
  dailyTrend: Array<{ date: string; count: number }>;
  weeklyPattern: Array<{ day: string; count: number }>;
  genderDistribution: { male: number; female: number; other: number };
  topMembers: Array<{ userId: number; name: string; visits: number }>;
}

export interface AttendanceRecord {
  id: number;
  branchId: number | null;
  userId: number;
  userName: string;
  userEmail: string;
  userAvatar: string | null;
  attendanceCode: string | null;
  gymId: number;
  gymName: string;
  membershipId: number | null;
  checkInTime: Date;
  checkOutTime: Date | null;
  date: string;
  markedById: number;
  markedByName?: string;
  checkInMethod: string;
  status: string;
}

export interface SearchUserResult {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  role: string;
  status: string;
  attendanceCode: string | null;
  joinDate: Date;
}

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly activityLogsService: ActivityLogsService,
    private readonly loyaltyService: LoyaltyService,
  ) {}

  private getTodayDate(): string {
    return new Date().toLocaleDateString('en-CA');
  }

  private getWeekStartDate(): string {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day;
    const weekStart = new Date(today.getFullYear(), today.getMonth(), diff);
    return weekStart.toLocaleDateString('en-CA');
  }

  private getMonthStartDate(): string {
    const date = new Date();
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    return monthStart.toLocaleDateString('en-CA');
  }

  async searchUserByCode(
    code: string,
    gymId: number,
    branchId: number | null = null,
  ): Promise<SearchUserResult | null> {
    const userData = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        // If branchId is specified, check both users.branch_id and user_branch_xref
        if (branchId !== null) {
          const query = `
            SELECT DISTINCT u.id, u.name, u.email, u.phone, u.avatar, u.status,
                   u.attendance_code, u.role, u.branch_id, u.created_at
            FROM users u
            LEFT JOIN user_branch_xref ubx ON ubx.user_id = u.id AND ubx.is_active = TRUE
            WHERE u.attendance_code = $1
              AND (u.branch_id = $2 OR ubx.branch_id = $2)
          `;
          const result = await client.query(query, [code, branchId]);
          return result.rows[0];
        }

        // No branch filter - search all users
        const query = `
          SELECT id, name, email, phone, avatar, status, attendance_code, role, branch_id, created_at
          FROM users
          WHERE attendance_code = $1
        `;
        const result = await client.query(query, [code]);
        return result.rows[0];
      },
    );

    if (!userData) {
      return null;
    }

    return {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      avatar: userData.avatar,
      role: userData.role || 'client',
      status: userData.status || 'active',
      attendanceCode: userData.attendance_code,
      joinDate: userData.created_at,
    };
  }

  async markAttendance(
    user: {
      id: number;
      name: string;
      email: string;
      avatar?: string | null;
      attendanceCode?: string | null;
    },
    staffId: number,
    gymId: number,
    branchId: number | null = null,
    checkInMethod: string = 'code',
  ): Promise<AttendanceRecord> {
    const today = this.getTodayDate();

    // Combine gym lookup and staff lookup into parallel calls
    const [gym, staffUser] = await Promise.all([
      this.prisma.gym.findUnique({ where: { id: gymId } }),
      this.prisma.user.findUnique({
        where: { id: staffId },
        select: { name: true },
      }),
    ]);

    if (!gym) {
      throw new NotFoundException('Gym not found');
    }

    const staffName = staffUser?.name;

    // Single tenant query that checks existing record, membership, user branch, and inserts if valid
    const result = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        // First, check all conditions in parallel
        const [existingResult, membershipResult, userResult] =
          await Promise.all([
            client.query(
              `SELECT id FROM attendance WHERE user_id = $1 AND attendance_date = $2::DATE AND status = 'present'`,
              [user.id, today],
            ),
            client.query(
              `SELECT id FROM memberships WHERE user_id = $1 AND LOWER(status) = 'active'
               AND start_date::date <= CURRENT_DATE AND end_date::date >= CURRENT_DATE`,
              [user.id],
            ),
            client.query(`SELECT branch_id FROM users WHERE id = $1`, [
              user.id,
            ]),
          ]);

        const existingRecord = existingResult.rows[0];
        const activeMembership = membershipResult.rows[0];
        const userBranchId = userResult.rows[0]?.branch_id;

        if (existingRecord) {
          return { error: 'already_checked_in' };
        }

        if (!activeMembership) {
          return { error: 'no_active_membership' };
        }

        // Use user's branch if branchId not provided
        const attendanceBranchId = branchId ?? userBranchId;

        // Insert attendance record
        const insertResult = await client.query(
          `INSERT INTO attendance (branch_id, user_id, membership_id, check_in_time, date, attendance_date, marked_by, check_in_method, status, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), $4::DATE, $4::DATE, $5, $6, 'present', NOW(), NOW())
           RETURNING *`,
          [
            attendanceBranchId,
            user.id,
            activeMembership.id,
            today,
            staffId,
            checkInMethod,
          ],
        );

        return {
          attendance: insertResult.rows[0],
          attendanceBranchId,
        };
      },
    );

    // Handle errors
    if (result.error === 'already_checked_in') {
      throw new BadRequestException(
        'User is already checked in at this gym today',
      );
    }

    if (result.error === 'no_active_membership') {
      throw new ForbiddenException(
        'User does not have an active membership at this gym',
      );
    }

    const { attendance, attendanceBranchId } = result;

    // Log activity asynchronously (don't wait for it)
    this.activityLogsService
      .logAttendanceMarked(
        gymId,
        attendanceBranchId,
        staffId,
        'staff',
        staffName || 'Staff',
        user.id,
        user.name,
      )
      .catch((err) => this.logger.error('Failed to log attendance activity', err));

    // Award loyalty points for attendance (fire-and-forget)
    this.loyaltyService
      .awardPoints(gymId, user.id, 'visit', 'attendance', attendance.id, 'Points for gym visit')
      .catch((err) => this.logger.error('Failed to award loyalty points for attendance', err));

    return {
      id: attendance.id,
      branchId: attendance.branch_id,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userAvatar: user.avatar || null,
      attendanceCode: user.attendanceCode || null,
      gymId: gymId,
      gymName: gym.name,
      membershipId: attendance.membership_id,
      checkInTime: attendance.check_in_time,
      checkOutTime: attendance.check_out_time,
      date: attendance.attendance_date ? new Date(attendance.attendance_date).toISOString().split('T')[0] : attendance.date,
      markedById: attendance.marked_by,
      markedByName: staffName,
      checkInMethod: attendance.check_in_method,
      status: attendance.status,
    };
  }

  async checkOut(
    attendanceId: number,
    gymId: number,
    staffId?: number,
  ): Promise<AttendanceRecord> {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    if (!gym) {
      throw new NotFoundException('Gym not found');
    }

    const { attendance, user } = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const attResult = await client.query(
          `SELECT a.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar, u.attendance_code
         FROM attendance a
         JOIN users u ON u.id = a.user_id
         WHERE a.id = $1`,
          [attendanceId],
        );
        return {
          attendance: attResult.rows[0],
          user: attResult.rows[0]
            ? {
                name: attResult.rows[0].user_name,
                email: attResult.rows[0].user_email,
                avatar: attResult.rows[0].user_avatar,
                attendanceCode: attResult.rows[0].attendance_code,
              }
            : null,
        };
      },
    );

    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }

    if (attendance.status === 'checked_out') {
      throw new BadRequestException('User is already checked out');
    }

    const checkOutTime = new Date();
    const checkInTime = new Date(attendance.check_in_time).getTime();
    const duration = Math.round(
      (checkOutTime.getTime() - checkInTime) / (1000 * 60),
    );
    const checkedOutById = staffId || attendance.marked_by;

    // Get staff name from public.users
    const staffUserForCheckout = await this.prisma.user.findUnique({
      where: { id: checkedOutById },
    });
    const staffName = staffUserForCheckout?.name;

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `INSERT INTO attendance_history (user_id, membership_id, check_in_time, check_out_time, date, attendance_date, duration, marked_by, checked_out_by, check_in_method, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $5::DATE, $6, $7, $8, $9, 'checked_out', NOW())`,
        [
          attendance.user_id,
          attendance.membership_id,
          attendance.check_in_time,
          checkOutTime,
          attendance.date,
          duration,
          attendance.marked_by,
          checkedOutById,
          attendance.check_in_method,
        ],
      );

      await client.query(
        `UPDATE attendance SET status = 'checked_out', check_out_time = $1, updated_at = NOW() WHERE id = $2`,
        [checkOutTime, attendanceId],
      );
    });

    return {
      id: attendance.id,
      branchId: attendance.branch_id,
      userId: attendance.user_id,
      userName: user?.name || '',
      userEmail: user?.email || '',
      userAvatar: user?.avatar || null,
      attendanceCode: user?.attendanceCode || null,
      gymId: gymId,
      gymName: gym.name,
      membershipId: attendance.membership_id,
      checkInTime: attendance.check_in_time,
      checkOutTime: checkOutTime,
      date: attendance.attendance_date ? new Date(attendance.attendance_date).toISOString().split('T')[0] : attendance.date,
      markedById: attendance.marked_by,
      markedByName: staffName,
      checkInMethod: attendance.check_in_method,
      status: 'checked_out',
    };
  }

  private formatAttendanceRecord(record: Record<string, any>, gym: Record<string, any> | null): AttendanceRecord {
    return {
      id: record.id,
      branchId: record.branch_id,
      userId: record.user_id,
      userName: record.user_name || '',
      userEmail: record.user_email || '',
      userAvatar: record.user_avatar || null,
      attendanceCode: record.attendance_code || null,
      gymId: gym?.id || record.gym_id,
      gymName: gym?.name || '',
      membershipId: record.membership_id,
      checkInTime: record.check_in_time,
      checkOutTime: record.check_out_time,
      date: record.attendance_date ? new Date(record.attendance_date).toISOString().split('T')[0] : record.date,
      markedById: record.marked_by,
      markedByName: record.marked_by_name || '',
      checkInMethod: record.check_in_method || 'code',
      status: record.status,
    };
  }

  async getTodayAttendance(
    gymId: number,
    branchId: number | null = null,
  ): Promise<AttendanceRecord[]> {
    const today = this.getTodayDate();
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    const records = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT a.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar, u.attendance_code, mb.name as marked_by_name
         FROM attendance a
         JOIN users u ON u.id = a.user_id
         LEFT JOIN users mb ON mb.id = a.marked_by
         WHERE a.attendance_date = $1::DATE AND (a.is_deleted = FALSE OR a.is_deleted IS NULL)`;
        const values: SqlValue[] = [today];

        // Branch filtering for non-admin users
        if (branchId !== null) {
          query += ` AND a.branch_id = $2`;
          values.push(branchId);
        }

        query += ` ORDER BY a.check_in_time DESC`;

        const result = await client.query(query, values);
        return result.rows;
      },
    );

    return records.map((r: Record<string, any>) => this.formatAttendanceRecord(r, gym));
  }

  async getAttendanceByDate(
    date: string,
    gymId: number,
    branchId: number | null = null,
  ): Promise<AttendanceRecord[]> {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    const { activeRecords, historyRecords } =
      await this.tenantService.executeInTenant(gymId, async (client) => {
        // Build filters with table aliases
        const attendanceBranchFilter =
          branchId !== null ? ` AND a.branch_id = ${branchId}` : '';
        const historyBranchFilter =
          branchId !== null ? ` AND ah.branch_id = ${branchId}` : '';
        const attendanceSoftDeleteFilter = ` AND (a.is_deleted = FALSE OR a.is_deleted IS NULL)`;
        const historySoftDeleteFilter = ` AND (ah.is_deleted = FALSE OR ah.is_deleted IS NULL)`;

        const [activeResult, historyResult] = await Promise.all([
          client.query(
            `SELECT a.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar, u.attendance_code, mb.name as marked_by_name
           FROM attendance a
           JOIN users u ON u.id = a.user_id
           LEFT JOIN users mb ON mb.id = a.marked_by
           WHERE a.attendance_date = $1::DATE${attendanceBranchFilter}${attendanceSoftDeleteFilter}
           ORDER BY a.check_in_time DESC`,
            [date],
          ),
          client.query(
            `SELECT ah.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar, u.attendance_code, mb.name as marked_by_name
           FROM attendance_history ah
           JOIN users u ON u.id = ah.user_id
           LEFT JOIN users mb ON mb.id = ah.marked_by
           WHERE ah.attendance_date = $1::DATE${historyBranchFilter}${historySoftDeleteFilter}
           ORDER BY ah.check_in_time DESC`,
            [date],
          ),
        ]);
        return {
          activeRecords: activeResult.rows,
          historyRecords: historyResult.rows,
        };
      });

    const allRecords = [...activeRecords, ...historyRecords];
    const uniqueMap = new Map();

    for (const record of allRecords) {
      const key = `${record.user_id}-${new Date(record.check_in_time).toISOString()}`;
      if (!uniqueMap.has(key) || record.status === 'checked_out') {
        uniqueMap.set(key, record);
      }
    }

    return Array.from(uniqueMap.values()).map((r: Record<string, any>) =>
      this.formatAttendanceRecord(r, gym),
    );
  }

  async getUserAttendance(
    userId: number,
    gymId: number,
    options: { page?: number; limit?: number } = {},
  ): Promise<{
    data: AttendanceRecord[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const page = options.page || 1;
    const limit = options.limit || 10;
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    const { activeRecords, historyRecords, totalCount } =
      await this.tenantService.executeInTenant(gymId, async (client) => {
        const [activeResult, historyResult, countResult] = await Promise.all([
          client.query(
            `SELECT a.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar, u.attendance_code, mb.name as marked_by_name
           FROM attendance a
           JOIN users u ON u.id = a.user_id
           LEFT JOIN users mb ON mb.id = a.marked_by
           WHERE a.user_id = $1
           ORDER BY a.check_in_time DESC`,
            [userId],
          ),
          client.query(
            `SELECT ah.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar, u.attendance_code, mb.name as marked_by_name
           FROM attendance_history ah
           JOIN users u ON u.id = ah.user_id
           LEFT JOIN users mb ON mb.id = ah.marked_by
           WHERE ah.user_id = $1
           ORDER BY ah.check_in_time DESC`,
            [userId],
          ),
          client.query(
            `SELECT
            (SELECT COUNT(*) FROM attendance WHERE user_id = $1) +
            (SELECT COUNT(*) FROM attendance_history WHERE user_id = $1) as total`,
            [userId],
          ),
        ]);
        return {
          activeRecords: activeResult.rows,
          historyRecords: historyResult.rows,
          totalCount: parseInt(countResult.rows[0]?.total || '0', 10),
        };
      });

    const allRecords = [...activeRecords, ...historyRecords];
    const uniqueMap = new Map();

    for (const record of allRecords) {
      const key = `${record.user_id}-${new Date(record.check_in_time).toISOString()}`;
      if (!uniqueMap.has(key) || record.status === 'checked_out') {
        uniqueMap.set(key, record);
      }
    }

    const sortedRecords = Array.from(uniqueMap.values()).sort(
      (a, b) =>
        new Date(b.check_in_time).getTime() -
        new Date(a.check_in_time).getTime(),
    );

    const total = sortedRecords.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedRecords = sortedRecords.slice(offset, offset + limit);

    return {
      data: paginatedRecords.map((r: Record<string, any>) =>
        this.formatAttendanceRecord(r, gym),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  async getAttendanceStats(
    gymId: number,
    branchId: number | null = null,
  ): Promise<AttendanceStats> {
    const today = this.getTodayDate();
    const weekStart = this.getWeekStartDate();
    const monthStart = this.getMonthStartDate();

    const stats = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        // Build branch filter clause
        const branchFilter =
          branchId !== null ? ` AND branch_id = ${branchId}` : '';

        const [
          todayResult,
          weekResult,
          monthResult,
          totalResult,
          presentResult,
        ] = await Promise.all([
          client.query(
            `SELECT COUNT(*) as count FROM attendance_history WHERE attendance_date = $1::DATE${branchFilter}`,
            [today],
          ),
          client.query(
            `SELECT COUNT(*) as count FROM attendance_history WHERE attendance_date >= $1::DATE${branchFilter}`,
            [weekStart],
          ),
          client.query(
            `SELECT COUNT(*) as count FROM attendance_history WHERE attendance_date >= $1::DATE${branchFilter}`,
            [monthStart],
          ),
          client.query(
            `SELECT COUNT(*) as count FROM attendance_history WHERE 1=1${branchFilter}`,
          ),
          client.query(
            `SELECT COUNT(*) as count FROM attendance WHERE attendance_date = $1::DATE AND status = 'present'${branchFilter}`,
            [today],
          ),
        ]);

        return {
          todayCount: parseInt(todayResult.rows[0].count, 10),
          weekCount: parseInt(weekResult.rows[0].count, 10),
          monthCount: parseInt(monthResult.rows[0].count, 10),
          totalCount: parseInt(totalResult.rows[0].count, 10),
          currentlyPresent: parseInt(presentResult.rows[0].count, 10),
        };
      },
    );

    return {
      totalPresent: stats.totalCount,
      todayPresent: stats.todayCount + stats.currentlyPresent,
      thisWeekPresent: stats.weekCount + stats.currentlyPresent,
      thisMonthPresent: stats.monthCount + stats.currentlyPresent,
    };
  }

  async getCurrentlyPresentCount(
    gymId: number,
    branchId: number | null = null,
  ): Promise<number> {
    const today = this.getTodayDate();

    return this.tenantService.executeInTenant(gymId, async (client) => {
      let query = `SELECT COUNT(*) as count FROM attendance WHERE attendance_date = $1::DATE AND status = 'present'`;
      const values: SqlValue[] = [today];

      // Branch filtering for non-admin users
      if (branchId !== null) {
        query += ` AND branch_id = $2`;
        values.push(branchId);
      }

      const result = await client.query(query, values);
      return parseInt(result.rows[0].count, 10);
    });
  }

  async getAllAttendance(
    gymId: number,
    branchId: number | null = null,
    page: number = 1,
    limit: number = 50,
    startDate?: string,
    endDate?: string,
  ): Promise<{
    records: AttendanceRecord[];
    total: number;
    page: number;
    pages: number;
  }> {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    const { records, total } = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = '1=1';
        const values: SqlValue[] = [];
        let paramIndex = 1;

        // Branch filtering for non-admin users
        if (branchId !== null) {
          whereClause += ` AND ah.branch_id = $${paramIndex++}`;
          values.push(branchId);
        }

        if (startDate && endDate) {
          whereClause += ` AND ah.attendance_date >= $${paramIndex++}::DATE AND ah.attendance_date <= $${paramIndex++}::DATE`;
          values.push(startDate, endDate);
        } else if (startDate) {
          whereClause += ` AND ah.attendance_date >= $${paramIndex++}::DATE`;
          values.push(startDate);
        } else if (endDate) {
          whereClause += ` AND ah.attendance_date <= $${paramIndex++}::DATE`;
          values.push(endDate);
        }

        const offset = (page - 1) * limit;

        const [recordsResult, countResult] = await Promise.all([
          client.query(
            `SELECT ah.*, u.name as user_name, u.email as user_email, u.avatar as user_avatar, u.attendance_code, mb.name as marked_by_name
           FROM attendance_history ah
           JOIN users u ON u.id = ah.user_id
           LEFT JOIN users mb ON mb.id = ah.marked_by
           WHERE ${whereClause}
           ORDER BY ah.check_in_time DESC
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            [...values, limit, offset],
          ),
          client.query(
            `SELECT COUNT(*) as count FROM attendance_history ah WHERE ${whereClause}`,
            values,
          ),
        ]);

        return {
          records: recordsResult.rows,
          total: parseInt(countResult.rows[0].count, 10),
        };
      },
    );

    return {
      records: records.map((r: Record<string, any>) => this.formatAttendanceRecord(r, gym)),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async deleteAttendance(
    attendanceId: number,
    gymId: number,
    deletedById?: number,
  ): Promise<boolean> {
    try {
      // Try soft delete from attendance table first
      const result = await this.tenantService.executeInTenant(
        gymId,
        async (client) => {
          const res = await client.query(
            `UPDATE attendance SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE id = $1 RETURNING id`,
            [attendanceId, deletedById || null],
          );
          return (res.rowCount ?? 0) > 0;
        },
      );
      if (result) return true;

      // If not found in attendance, try attendance_history
      const historyResult = await this.tenantService.executeInTenant(
        gymId,
        async (client) => {
          const res = await client.query(
            `UPDATE attendance_history SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2 WHERE id = $1 RETURNING id`,
            [attendanceId, deletedById || null],
          );
          return (res.rowCount ?? 0) > 0;
        },
      );
      return historyResult;
    } catch {
      return false;
    }
  }

  async getReports(
    gymId: number,
    branchId: number | null = null,
    startDate?: string,
    endDate?: string,
  ): Promise<AttendanceReportData> {
    // Default to last 30 days if no dates provided
    const end = endDate || this.getTodayDate();
    const start =
      startDate ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toLocaleDateString('en-CA');
      })();

    const branchFilter =
      branchId !== null ? ` AND branch_id = ${branchId}` : '';
    const softDeleteFilter = ` AND (is_deleted = FALSE OR is_deleted IS NULL)`;

    const reportData = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        // Combine attendance (only active/present check-ins) and attendance_history (completed)
        // Only include status='present' from attendance to avoid double-counting checked-out visits

        // 1. Summary stats - combine both tables
        const summaryResult = await client.query(
          `
        SELECT
          COUNT(*) as total_checkins,
          COUNT(DISTINCT user_id) as unique_members,
          COALESCE(AVG(duration), 0) as avg_duration
        FROM (
          SELECT user_id, NULL as duration FROM attendance WHERE attendance_date >= $1::DATE AND attendance_date <= $2::DATE AND status = 'present'${branchFilter}${softDeleteFilter}
          UNION ALL
          SELECT user_id, duration FROM attendance_history WHERE attendance_date >= $1::DATE AND attendance_date <= $2::DATE${branchFilter}${softDeleteFilter}
        ) combined
      `,
          [start, end],
        );

        // Calculate days in range
        const startDateObj = new Date(start);
        const endDateObj = new Date(end);
        const daysInRange = Math.max(
          1,
          Math.ceil(
            (endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24),
          ) + 1,
        );

        const summary = {
          totalCheckIns: parseInt(
            summaryResult.rows[0]?.total_checkins || '0',
            10,
          ),
          uniqueMembers: parseInt(
            summaryResult.rows[0]?.unique_members || '0',
            10,
          ),
          avgDuration: Math.round(
            parseFloat(summaryResult.rows[0]?.avg_duration || '0'),
          ),
          avgDailyCheckIns: 0,
        };
        summary.avgDailyCheckIns = Math.round(
          summary.totalCheckIns / daysInRange,
        );

        // 2. Daily trend - combine both tables
        const dailyTrendResult = await client.query(
          `
        SELECT date, COUNT(*) as count
        FROM (
          SELECT attendance_date as date FROM attendance WHERE attendance_date >= $1::DATE AND attendance_date <= $2::DATE AND status = 'present'${branchFilter}${softDeleteFilter}
          UNION ALL
          SELECT attendance_date as date FROM attendance_history WHERE attendance_date >= $1::DATE AND attendance_date <= $2::DATE${branchFilter}${softDeleteFilter}
        ) combined
        GROUP BY date
        ORDER BY date ASC
      `,
          [start, end],
        );

        const dailyTrend = dailyTrendResult.rows.map((row: Record<string, any>) => ({
          date: row.date instanceof Date
            ? row.date.toISOString().split('T')[0]
            : String(row.date),
          count: parseInt(row.count, 10),
        }));

        // 3. Weekly pattern (day of week distribution) - combine both tables
        const weeklyPatternResult = await client.query(
          `
        SELECT
          EXTRACT(DOW FROM check_in_time) as day_num,
          COUNT(*) as count
        FROM (
          SELECT check_in_time FROM attendance WHERE attendance_date >= $1::DATE AND attendance_date <= $2::DATE AND status = 'present'${branchFilter}${softDeleteFilter}
          UNION ALL
          SELECT check_in_time FROM attendance_history WHERE attendance_date >= $1::DATE AND attendance_date <= $2::DATE${branchFilter}${softDeleteFilter}
        ) combined
        GROUP BY EXTRACT(DOW FROM check_in_time)
        ORDER BY day_num
      `,
          [start, end],
        );

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weeklyPattern = dayNames.map((day, index) => {
          const found = weeklyPatternResult.rows.find(
            (r: Record<string, any>) => parseInt(r.day_num) === index,
          );
          return {
            day,
            count: found ? parseInt(found.count, 10) : 0,
          };
        });

        // 4. Gender distribution - combine both tables and join with users
        const genderResult = await client.query(
          `
        SELECT
          COALESCE(LOWER(u.gender), 'other') as gender,
          COUNT(*) as count
        FROM (
          SELECT user_id FROM attendance WHERE attendance_date >= $1::DATE AND attendance_date <= $2::DATE AND status = 'present'${branchFilter}${softDeleteFilter}
          UNION ALL
          SELECT user_id FROM attendance_history WHERE attendance_date >= $1::DATE AND attendance_date <= $2::DATE${branchFilter}${softDeleteFilter}
        ) combined
        JOIN users u ON u.id = combined.user_id
        GROUP BY COALESCE(LOWER(u.gender), 'other')
      `,
          [start, end],
        );

        const genderDistribution = { male: 0, female: 0, other: 0 };
        genderResult.rows.forEach((row: Record<string, any>) => {
          const gender = row.gender?.toLowerCase();
          const count = parseInt(row.count, 10);
          if (gender === 'male') {
            genderDistribution.male = count;
          } else if (gender === 'female') {
            genderDistribution.female = count;
          } else {
            genderDistribution.other += count;
          }
        });

        // 5. Top members - combine both tables
        const topMembersBranchFilter =
          branchId !== null ? ` AND a.branch_id = ${branchId}` : '';
        const topMembersHistoryBranchFilter =
          branchId !== null ? ` AND ah.branch_id = ${branchId}` : '';
        const topMembersResult = await client.query(
          `
        SELECT
          user_id,
          name,
          SUM(visits) as visits
        FROM (
          SELECT a.user_id, u.name, COUNT(*) as visits
          FROM attendance a
          JOIN users u ON u.id = a.user_id
          WHERE a.attendance_date >= $1::DATE AND a.attendance_date <= $2::DATE AND a.status = 'present'${topMembersBranchFilter} AND (a.is_deleted = FALSE OR a.is_deleted IS NULL)
          GROUP BY a.user_id, u.name
          UNION ALL
          SELECT ah.user_id, u.name, COUNT(*) as visits
          FROM attendance_history ah
          JOIN users u ON u.id = ah.user_id
          WHERE ah.attendance_date >= $1::DATE AND ah.attendance_date <= $2::DATE${topMembersHistoryBranchFilter} AND (ah.is_deleted = FALSE OR ah.is_deleted IS NULL)
          GROUP BY ah.user_id, u.name
        ) combined
        GROUP BY user_id, name
        ORDER BY visits DESC
        LIMIT 10
      `,
          [start, end],
        );

        const topMembers = topMembersResult.rows.map((row: Record<string, any>) => ({
          userId: row.user_id,
          name: row.name,
          visits: parseInt(row.visits, 10),
        }));

        return {
          summary,
          dailyTrend,
          weeklyPattern,
          genderDistribution,
          topMembers,
        };
      },
    );

    return reportData;
  }
}
