import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';

export interface AttendanceStats {
  totalPresent: number;
  todayPresent: number;
  thisWeekPresent: number;
  thisMonthPresent: number;
}

export interface AttendanceRecord {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
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

  async searchUserByCode(code: string, gymId: number): Promise<SearchUserResult | null> {
    const userData = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id, name, email, phone, avatar, status, attendance_code, role, created_at
         FROM users
         WHERE attendance_code = $1`,
        [code]
      );
      return result.rows[0];
    });

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
    user: { id: number; name: string; email: string; attendanceCode?: string | null },
    staffId: number,
    gymId: number,
    checkInMethod: string = 'code',
  ): Promise<AttendanceRecord> {
    const today = this.getTodayDate();

    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    if (!gym) {
      throw new NotFoundException('Gym not found');
    }

    const { existingRecord, activeMembership, staffName } = await this.tenantService.executeInTenant(gymId, async (client) => {
      const [existingResult, membershipResult, staffResult] = await Promise.all([
        client.query(
          `SELECT id FROM attendance WHERE user_id = $1 AND date = $2 AND status = 'present'`,
          [user.id, today]
        ),
        client.query(
          `SELECT id FROM memberships WHERE user_id = $1 AND status = 'active'
           AND start_date <= $2 AND end_date >= $2`,
          [user.id, new Date()]
        ),
        client.query(`SELECT name FROM users WHERE id = $1`, [staffId]),
      ]);

      return {
        existingRecord: existingResult.rows[0],
        activeMembership: membershipResult.rows[0],
        staffName: staffResult.rows[0]?.name,
      };
    });

    if (existingRecord) {
      throw new BadRequestException('User is already checked in at this gym today');
    }

    if (!activeMembership) {
      throw new ForbiddenException('User does not have an active membership at this gym');
    }

    const attendance = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO attendance (user_id, membership_id, check_in_time, date, marked_by_id, check_in_method, status, created_at, updated_at)
         VALUES ($1, $2, NOW(), $3, $4, $5, 'present', NOW(), NOW())
         RETURNING *`,
        [user.id, activeMembership.id, today, staffId, checkInMethod]
      );
      return result.rows[0];
    });

    return {
      id: attendance.id,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      attendanceCode: user.attendanceCode || null,
      gymId: gymId,
      gymName: gym.name,
      membershipId: attendance.membership_id,
      checkInTime: attendance.check_in_time,
      checkOutTime: attendance.check_out_time,
      date: attendance.date,
      markedById: attendance.marked_by_id,
      markedByName: staffName,
      checkInMethod: attendance.check_in_method,
      status: attendance.status,
    };
  }

  async checkOut(attendanceId: number, gymId: number, staffId?: number): Promise<AttendanceRecord> {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });
    if (!gym) {
      throw new NotFoundException('Gym not found');
    }

    const { attendance, user } = await this.tenantService.executeInTenant(gymId, async (client) => {
      const attResult = await client.query(
        `SELECT a.*, u.name as user_name, u.email as user_email, u.attendance_code
         FROM attendance a
         JOIN users u ON u.id = a.user_id
         WHERE a.id = $1`,
        [attendanceId]
      );
      return {
        attendance: attResult.rows[0],
        user: attResult.rows[0] ? {
          name: attResult.rows[0].user_name,
          email: attResult.rows[0].user_email,
          attendanceCode: attResult.rows[0].attendance_code,
        } : null,
      };
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }

    if (attendance.status === 'checked_out') {
      throw new BadRequestException('User is already checked out');
    }

    const checkOutTime = new Date();
    const checkInTime = new Date(attendance.check_in_time).getTime();
    const duration = Math.round((checkOutTime.getTime() - checkInTime) / (1000 * 60));
    const checkedOutById = staffId || attendance.marked_by_id;

    const staffName = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(`SELECT name FROM users WHERE id = $1`, [checkedOutById]);
      return result.rows[0]?.name;
    });

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `INSERT INTO attendance_history (user_id, membership_id, check_in_time, check_out_time, date, duration, marked_by_id, checked_out_by_id, check_in_method, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'checked_out', NOW())`,
        [attendance.user_id, attendance.membership_id, attendance.check_in_time, checkOutTime, attendance.date, duration, attendance.marked_by_id, checkedOutById, attendance.check_in_method]
      );

      await client.query(
        `UPDATE attendance SET status = 'checked_out', check_out_time = $1, updated_at = NOW() WHERE id = $2`,
        [checkOutTime, attendanceId]
      );
    });

    return {
      id: attendance.id,
      userId: attendance.user_id,
      userName: user?.name || '',
      userEmail: user?.email || '',
      attendanceCode: user?.attendanceCode || null,
      gymId: gymId,
      gymName: gym.name,
      membershipId: attendance.membership_id,
      checkInTime: attendance.check_in_time,
      checkOutTime: checkOutTime,
      date: attendance.date,
      markedById: attendance.marked_by_id,
      markedByName: staffName,
      checkInMethod: attendance.check_in_method,
      status: 'checked_out',
    };
  }

  private formatAttendanceRecord(record: any, gym: any): AttendanceRecord {
    return {
      id: record.id,
      userId: record.user_id,
      userName: record.user_name || '',
      userEmail: record.user_email || '',
      attendanceCode: record.attendance_code || null,
      gymId: gym?.id || record.gym_id,
      gymName: gym?.name || '',
      membershipId: record.membership_id,
      checkInTime: record.check_in_time,
      checkOutTime: record.check_out_time,
      date: record.date,
      markedById: record.marked_by_id,
      checkInMethod: record.check_in_method || 'code',
      status: record.status,
    };
  }

  async getTodayAttendance(gymId: number): Promise<AttendanceRecord[]> {
    const today = this.getTodayDate();
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    const records = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT a.*, u.name as user_name, u.email as user_email, u.attendance_code
         FROM attendance a
         JOIN users u ON u.id = a.user_id
         WHERE a.date = $1
         ORDER BY a.check_in_time DESC`,
        [today]
      );
      return result.rows;
    });

    return records.map((r: any) => this.formatAttendanceRecord(r, gym));
  }

  async getAttendanceByDate(date: string, gymId: number): Promise<AttendanceRecord[]> {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    const { activeRecords, historyRecords } = await this.tenantService.executeInTenant(gymId, async (client) => {
      const [activeResult, historyResult] = await Promise.all([
        client.query(
          `SELECT a.*, u.name as user_name, u.email as user_email, u.attendance_code
           FROM attendance a
           JOIN users u ON u.id = a.user_id
           WHERE a.date = $1
           ORDER BY a.check_in_time DESC`,
          [date]
        ),
        client.query(
          `SELECT ah.*, u.name as user_name, u.email as user_email, u.attendance_code
           FROM attendance_history ah
           JOIN users u ON u.id = ah.user_id
           WHERE ah.date = $1
           ORDER BY ah.check_in_time DESC`,
          [date]
        ),
      ]);
      return { activeRecords: activeResult.rows, historyRecords: historyResult.rows };
    });

    const allRecords = [...activeRecords, ...historyRecords];
    const uniqueMap = new Map();

    for (const record of allRecords) {
      const key = `${record.user_id}-${new Date(record.check_in_time).toISOString()}`;
      if (!uniqueMap.has(key) || record.status === 'checked_out') {
        uniqueMap.set(key, record);
      }
    }

    return Array.from(uniqueMap.values()).map((r: any) => this.formatAttendanceRecord(r, gym));
  }

  async getUserAttendance(userId: number, gymId: number, limit: number = 50): Promise<AttendanceRecord[]> {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    const { activeRecords, historyRecords } = await this.tenantService.executeInTenant(gymId, async (client) => {
      const [activeResult, historyResult] = await Promise.all([
        client.query(
          `SELECT a.*, u.name as user_name, u.email as user_email, u.attendance_code
           FROM attendance a
           JOIN users u ON u.id = a.user_id
           WHERE a.user_id = $1
           ORDER BY a.check_in_time DESC
           LIMIT $2`,
          [userId, limit]
        ),
        client.query(
          `SELECT ah.*, u.name as user_name, u.email as user_email, u.attendance_code
           FROM attendance_history ah
           JOIN users u ON u.id = ah.user_id
           WHERE ah.user_id = $1
           ORDER BY ah.check_in_time DESC
           LIMIT $2`,
          [userId, limit]
        ),
      ]);
      return { activeRecords: activeResult.rows, historyRecords: historyResult.rows };
    });

    const allRecords = [...activeRecords, ...historyRecords];
    const uniqueMap = new Map();

    for (const record of allRecords) {
      const key = `${record.user_id}-${new Date(record.check_in_time).toISOString()}`;
      if (!uniqueMap.has(key) || record.status === 'checked_out') {
        uniqueMap.set(key, record);
      }
    }

    return Array.from(uniqueMap.values())
      .sort((a, b) => new Date(b.check_in_time).getTime() - new Date(a.check_in_time).getTime())
      .slice(0, limit)
      .map((r: any) => this.formatAttendanceRecord(r, gym));
  }

  async getAttendanceStats(gymId: number): Promise<AttendanceStats> {
    const today = this.getTodayDate();
    const weekStart = this.getWeekStartDate();
    const monthStart = this.getMonthStartDate();

    const stats = await this.tenantService.executeInTenant(gymId, async (client) => {
      const [todayResult, weekResult, monthResult, totalResult, presentResult] = await Promise.all([
        client.query(`SELECT COUNT(*) as count FROM attendance_history WHERE date = $1`, [today]),
        client.query(`SELECT COUNT(*) as count FROM attendance_history WHERE date >= $1`, [weekStart]),
        client.query(`SELECT COUNT(*) as count FROM attendance_history WHERE date >= $1`, [monthStart]),
        client.query(`SELECT COUNT(*) as count FROM attendance_history`),
        client.query(`SELECT COUNT(*) as count FROM attendance WHERE date = $1 AND status = 'present'`, [today]),
      ]);

      return {
        todayCount: parseInt(todayResult.rows[0].count, 10),
        weekCount: parseInt(weekResult.rows[0].count, 10),
        monthCount: parseInt(monthResult.rows[0].count, 10),
        totalCount: parseInt(totalResult.rows[0].count, 10),
        currentlyPresent: parseInt(presentResult.rows[0].count, 10),
      };
    });

    return {
      totalPresent: stats.totalCount,
      todayPresent: stats.todayCount + stats.currentlyPresent,
      thisWeekPresent: stats.weekCount + stats.currentlyPresent,
      thisMonthPresent: stats.monthCount + stats.currentlyPresent,
    };
  }

  async getCurrentlyPresentCount(gymId: number): Promise<number> {
    const today = this.getTodayDate();

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT COUNT(*) as count FROM attendance WHERE date = $1 AND status = 'present'`,
        [today]
      );
      return parseInt(result.rows[0].count, 10);
    });
  }

  async getAllAttendance(
    gymId: number,
    page: number = 1,
    limit: number = 50,
    startDate?: string,
    endDate?: string,
  ): Promise<{ records: AttendanceRecord[]; total: number; page: number; pages: number }> {
    const gym = await this.prisma.gym.findUnique({ where: { id: gymId } });

    const { records, total } = await this.tenantService.executeInTenant(gymId, async (client) => {
      let whereClause = '1=1';
      const values: any[] = [];
      let paramIndex = 1;

      if (startDate && endDate) {
        whereClause += ` AND ah.date >= $${paramIndex++} AND ah.date <= $${paramIndex++}`;
        values.push(startDate, endDate);
      } else if (startDate) {
        whereClause += ` AND ah.date >= $${paramIndex++}`;
        values.push(startDate);
      } else if (endDate) {
        whereClause += ` AND ah.date <= $${paramIndex++}`;
        values.push(endDate);
      }

      const offset = (page - 1) * limit;

      const [recordsResult, countResult] = await Promise.all([
        client.query(
          `SELECT ah.*, u.name as user_name, u.email as user_email, u.attendance_code
           FROM attendance_history ah
           JOIN users u ON u.id = ah.user_id
           WHERE ${whereClause}
           ORDER BY ah.check_in_time DESC
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
          [...values, limit, offset]
        ),
        client.query(
          `SELECT COUNT(*) as count FROM attendance_history ah WHERE ${whereClause}`,
          values
        ),
      ]);

      return {
        records: recordsResult.rows,
        total: parseInt(countResult.rows[0].count, 10),
      };
    });

    return {
      records: records.map((r: any) => this.formatAttendanceRecord(r, gym)),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async deleteAttendance(attendanceId: number, gymId: number): Promise<boolean> {
    try {
      await this.tenantService.executeInTenant(gymId, async (client) => {
        await client.query(`DELETE FROM attendance WHERE id = $1`, [attendanceId]);
      });
      return true;
    } catch {
      try {
        await this.tenantService.executeInTenant(gymId, async (client) => {
          await client.query(`DELETE FROM attendance_history WHERE id = $1`, [attendanceId]);
        });
        return true;
      } catch {
        return false;
      }
    }
  }
}
