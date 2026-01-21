import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface AttendanceStats {
  totalPresent: number;
  todayPresent: number;
  thisWeekPresent: number;
  thisMonthPresent: number;
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  // Helper to get today's date in YYYY-MM-DD format
  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  // Helper to get week start date
  private getWeekStartDate(): string {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day;
    return new Date(today.setDate(diff)).toISOString().split('T')[0];
  }

  // Helper to get month start date
  private getMonthStartDate(): string {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
  }

  // =====================
  // SEARCH USER BY CODE
  // =====================

  async searchUserByCode(code: string): Promise<any | null> {
    const user = await this.prisma.user.findUnique({
      where: { attendanceCode: code },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        status: true,
        attendanceCode: true,
        createdAt: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      ...user,
      joinDate: user.createdAt,
    };
  }

  // =====================
  // MARK ATTENDANCE (Check-In)
  // =====================

  async markAttendance(
    user: {
      id: number;
      name: string;
      email: string;
      attendanceCode?: string | null;
    },
    staffId: number,
  ): Promise<any> {
    const today = this.getTodayDate();

    // Check if user already checked in today and hasn't checked out
    const existingRecord = await this.prisma.attendance.findFirst({
      where: {
        userId: user.id,
        date: today,
        status: 'present',
      },
    });

    if (existingRecord) {
      throw new BadRequestException('User is already checked in today');
    }

    const attendance = await this.prisma.attendance.create({
      data: {
        userId: user.id,
        checkInTime: new Date(),
        date: today,
        markedById: staffId,
        status: 'present',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, attendanceCode: true },
        },
      },
    });

    return attendance;
  }

  // =====================
  // CHECK OUT
  // =====================

  async checkOut(
    attendanceId: number,
    staffId?: number,
  ): Promise<any> {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found');
    }

    if (attendance.status === 'checked_out') {
      throw new BadRequestException('User is already checked out');
    }

    const checkOutTime = new Date();
    const checkInTime = new Date(attendance.checkInTime).getTime();
    const duration = Math.round((checkOutTime.getTime() - checkInTime) / (1000 * 60)); // in minutes

    // Create history record
    const historyRecord = await this.prisma.attendanceHistory.create({
      data: {
        userId: attendance.userId,
        checkInTime: attendance.checkInTime,
        checkOutTime,
        date: attendance.date,
        duration,
        markedById: attendance.markedById,
        checkedOutById: staffId || attendance.markedById,
        status: 'checked_out',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, attendanceCode: true },
        },
      },
    });

    // Update attendance record status
    await this.prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        status: 'checked_out',
        checkOutTime,
      },
    });

    return historyRecord;
  }

  // =====================
  // FETCH ATTENDANCE
  // =====================

  // Get today's attendance records
  async getTodayAttendance(): Promise<any[]> {
    const today = this.getTodayDate();
    return this.prisma.attendance.findMany({
      where: { date: today },
      orderBy: { checkInTime: 'desc' },
    });
  }

  // Get attendance by specific date
  async getAttendanceByDate(date: string): Promise<any[]> {
    // Get both active and history records for the date
    const [activeRecords, historyRecords] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { date },
        orderBy: { checkInTime: 'desc' },
      }),
      this.prisma.attendanceHistory.findMany({
        where: { date },
        orderBy: { checkInTime: 'desc' },
      }),
    ]);

    // Combine and deduplicate (prefer history if checked out)
    const allRecords = [...activeRecords, ...historyRecords];
    const uniqueMap = new Map();

    for (const record of allRecords) {
      const key = `${record.userId}-${record.checkInTime.toISOString()}`;
      if (!uniqueMap.has(key) || record.status === 'checked_out') {
        uniqueMap.set(key, record);
      }
    }

    return Array.from(uniqueMap.values());
  }

  // Get attendance history for a specific user
  async getUserAttendance(userId: number, limit: number = 50): Promise<any[]> {
    const [activeRecords, historyRecords] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { userId },
        orderBy: { checkInTime: 'desc' },
        take: limit,
      }),
      this.prisma.attendanceHistory.findMany({
        where: { userId },
        orderBy: { checkInTime: 'desc' },
        take: limit,
      }),
    ]);

    // Combine, deduplicate, and sort
    const allRecords = [...activeRecords, ...historyRecords];
    const uniqueMap = new Map();

    for (const record of allRecords) {
      const key = `${record.userId}-${record.checkInTime.toISOString()}`;
      if (!uniqueMap.has(key) || record.status === 'checked_out') {
        uniqueMap.set(key, record);
      }
    }

    return Array.from(uniqueMap.values())
      .sort((a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime())
      .slice(0, limit);
  }

  // =====================
  // STATS
  // =====================

  async getAttendanceStats(): Promise<AttendanceStats> {
    const today = this.getTodayDate();
    const weekStart = this.getWeekStartDate();
    const monthStart = this.getMonthStartDate();

    const [todayCount, weekCount, monthCount, totalCount, currentlyPresent] = await Promise.all([
      this.prisma.attendanceHistory.count({ where: { date: today } }),
      this.prisma.attendanceHistory.count({ where: { date: { gte: weekStart } } }),
      this.prisma.attendanceHistory.count({ where: { date: { gte: monthStart } } }),
      this.prisma.attendanceHistory.count(),
      this.prisma.attendance.count({ where: { date: today, status: 'present' } }),
    ]);

    return {
      totalPresent: totalCount,
      todayPresent: todayCount + currentlyPresent,
      thisWeekPresent: weekCount + currentlyPresent,
      thisMonthPresent: monthCount + currentlyPresent,
    };
  }

  // Get currently present users count
  async getCurrentlyPresentCount(): Promise<number> {
    const today = this.getTodayDate();
    return this.prisma.attendance.count({
      where: { date: today, status: 'present' },
    });
  }

  // =====================
  // ADMIN OPERATIONS
  // =====================

  // Get all attendance records with pagination
  async getAllAttendance(
    page: number = 1,
    limit: number = 50,
    startDate?: string,
    endDate?: string,
  ): Promise<{ records: any[]; total: number; page: number; pages: number }> {
    const where: any = {};

    if (startDate && endDate) {
      where.date = { gte: startDate, lte: endDate };
    } else if (startDate) {
      where.date = { gte: startDate };
    } else if (endDate) {
      where.date = { lte: endDate };
    }

    const [records, total] = await Promise.all([
      this.prisma.attendanceHistory.findMany({
        where,
        orderBy: { checkInTime: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.attendanceHistory.count({ where }),
    ]);

    return {
      records,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  // Delete attendance record (admin only)
  async deleteAttendance(attendanceId: number): Promise<boolean> {
    try {
      await this.prisma.attendance.delete({ where: { id: attendanceId } });
      return true;
    } catch {
      // Try deleting from history
      try {
        await this.prisma.attendanceHistory.delete({ where: { id: attendanceId } });
        return true;
      } catch {
        return false;
      }
    }
  }
}
