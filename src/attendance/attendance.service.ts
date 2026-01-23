import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  // Helper to get today's date in YYYY-MM-DD format (local timezone)
  private getTodayDate(): string {
    // Using toLocaleDateString with 'en-CA' locale to get YYYY-MM-DD format in local timezone
    return new Date().toLocaleDateString('en-CA');
  }

  // Helper to get week start date (local timezone)
  private getWeekStartDate(): string {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day;
    const weekStart = new Date(today.getFullYear(), today.getMonth(), diff);
    return weekStart.toLocaleDateString('en-CA');
  }

  // Helper to get month start date (local timezone)
  private getMonthStartDate(): string {
    const date = new Date();
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    return monthStart.toLocaleDateString('en-CA');
  }

  // =====================
  // SEARCH USER BY CODE
  // =====================

  async searchUserByCode(code: string): Promise<SearchUserResult | null> {
    const user = await this.prisma.user.findUnique({
      where: { attendanceCode: code },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: { select: { name: true } },
        status: true,
        attendanceCode: true,
        createdAt: true,
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      role: user.role?.name || 'client',
      status: user.status || 'active',
      attendanceCode: user.attendanceCode,
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
    gymId: number,
    checkInMethod: string = 'code',
  ): Promise<AttendanceRecord> {
    const today = this.getTodayDate();

    // Validate gym exists
    const gym = await this.prisma.gym.findUnique({
      where: { id: gymId },
    });

    if (!gym) {
      throw new NotFoundException('Gym not found');
    }

    // Check if user already checked in today at this gym and hasn't checked out
    const existingRecord = await this.prisma.attendance.findFirst({
      where: {
        userId: user.id,
        gymId: gymId,
        date: today,
        status: 'present',
      },
    });

    if (existingRecord) {
      throw new BadRequestException('User is already checked in at this gym today');
    }

    // Validate user has active membership at this gym
    const activeMembership = await this.prisma.membership.findFirst({
      where: {
        userId: user.id,
        gymId: gymId,
        status: 'active',
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
    });

    if (!activeMembership) {
      throw new ForbiddenException('User does not have an active membership at this gym');
    }

    // Get staff details for response
    const staff = await this.prisma.user.findUnique({
      where: { id: staffId },
      select: { name: true },
    });

    const attendance = await this.prisma.attendance.create({
      data: {
        userId: user.id,
        gymId: gymId,
        membershipId: activeMembership.id,
        checkInTime: new Date(),
        date: today,
        markedById: staffId,
        checkInMethod: checkInMethod,
        status: 'present',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, attendanceCode: true },
        },
        gym: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      id: attendance.id,
      userId: attendance.user.id,
      userName: attendance.user.name,
      userEmail: attendance.user.email,
      attendanceCode: attendance.user.attendanceCode,
      gymId: attendance.gym.id,
      gymName: attendance.gym.name,
      membershipId: attendance.membershipId,
      checkInTime: attendance.checkInTime,
      checkOutTime: attendance.checkOutTime,
      date: attendance.date,
      markedById: attendance.markedById,
      markedByName: staff?.name,
      checkInMethod: attendance.checkInMethod,
      status: attendance.status,
    };
  }

  // =====================
  // CHECK OUT
  // =====================

  async checkOut(
    attendanceId: number,
    staffId?: number,
  ): Promise<AttendanceRecord> {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
      include: {
        user: {
          select: { id: true, name: true, email: true, attendanceCode: true },
        },
        gym: {
          select: { id: true, name: true },
        },
      },
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

    const checkedOutById = staffId || attendance.markedById;

    // Get staff details
    const staff = await this.prisma.user.findUnique({
      where: { id: checkedOutById },
      select: { name: true },
    });

    // Create history record
    await this.prisma.attendanceHistory.create({
      data: {
        userId: attendance.userId,
        gymId: attendance.gymId,
        membershipId: attendance.membershipId,
        checkInTime: attendance.checkInTime,
        checkOutTime,
        date: attendance.date,
        duration,
        markedById: attendance.markedById,
        checkedOutById: checkedOutById,
        checkInMethod: attendance.checkInMethod,
        status: 'checked_out',
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

    return {
      id: attendance.id,
      userId: attendance.user.id,
      userName: attendance.user.name,
      userEmail: attendance.user.email,
      attendanceCode: attendance.user.attendanceCode,
      gymId: attendance.gym.id,
      gymName: attendance.gym.name,
      membershipId: attendance.membershipId,
      checkInTime: attendance.checkInTime,
      checkOutTime: checkOutTime,
      date: attendance.date,
      markedById: attendance.markedById,
      markedByName: staff?.name,
      checkInMethod: attendance.checkInMethod,
      status: 'checked_out',
    };
  }

  // =====================
  // FETCH ATTENDANCE
  // =====================

  // Helper to format attendance record
  private formatAttendanceRecord(record: any): AttendanceRecord {
    return {
      id: record.id,
      userId: record.user?.id || record.userId,
      userName: record.user?.name || '',
      userEmail: record.user?.email || '',
      attendanceCode: record.user?.attendanceCode || null,
      gymId: record.gym?.id || record.gymId,
      gymName: record.gym?.name || '',
      membershipId: record.membershipId,
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime,
      date: record.date,
      markedById: record.markedById,
      checkInMethod: record.checkInMethod || 'code',
      status: record.status,
    };
  }

  // Get today's attendance records (optionally filtered by gym)
  async getTodayAttendance(gymId?: number): Promise<AttendanceRecord[]> {
    const today = this.getTodayDate();
    const where: any = { date: today };
    if (gymId) {
      where.gymId = gymId;
    }

    const records = await this.prisma.attendance.findMany({
      where,
      orderBy: { checkInTime: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true, attendanceCode: true },
        },
        gym: {
          select: { id: true, name: true },
        },
      },
    });

    return records.map(this.formatAttendanceRecord);
  }

  // Get attendance by specific date (optionally filtered by gym)
  async getAttendanceByDate(date: string, gymId?: number): Promise<AttendanceRecord[]> {
    const where: any = { date };
    if (gymId) {
      where.gymId = gymId;
    }

    // Get both active and history records for the date
    const [activeRecords, historyRecords] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        orderBy: { checkInTime: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, attendanceCode: true },
          },
          gym: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.attendanceHistory.findMany({
        where,
        orderBy: { checkInTime: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, attendanceCode: true },
          },
          gym: {
            select: { id: true, name: true },
          },
        },
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

    return Array.from(uniqueMap.values()).map(this.formatAttendanceRecord);
  }

  // Get attendance history for a specific user (optionally filtered by gym)
  async getUserAttendance(userId: number, limit: number = 50, gymId?: number): Promise<AttendanceRecord[]> {
    const where: any = { userId };
    if (gymId) {
      where.gymId = gymId;
    }

    const [activeRecords, historyRecords] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        orderBy: { checkInTime: 'desc' },
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, email: true, attendanceCode: true },
          },
          gym: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.attendanceHistory.findMany({
        where,
        orderBy: { checkInTime: 'desc' },
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, email: true, attendanceCode: true },
          },
          gym: {
            select: { id: true, name: true },
          },
        },
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
      .slice(0, limit)
      .map(this.formatAttendanceRecord);
  }

  // =====================
  // STATS
  // =====================

  async getAttendanceStats(gymId?: number): Promise<AttendanceStats> {
    const today = this.getTodayDate();
    const weekStart = this.getWeekStartDate();
    const monthStart = this.getMonthStartDate();

    const historyWhere: any = gymId ? { gymId } : {};
    const attendanceWhere: any = { date: today, status: 'present' };
    if (gymId) {
      attendanceWhere.gymId = gymId;
    }

    const [todayCount, weekCount, monthCount, totalCount, currentlyPresent] = await Promise.all([
      this.prisma.attendanceHistory.count({ where: { ...historyWhere, date: today } }),
      this.prisma.attendanceHistory.count({ where: { ...historyWhere, date: { gte: weekStart } } }),
      this.prisma.attendanceHistory.count({ where: { ...historyWhere, date: { gte: monthStart } } }),
      this.prisma.attendanceHistory.count({ where: historyWhere }),
      this.prisma.attendance.count({ where: attendanceWhere }),
    ]);

    return {
      totalPresent: totalCount,
      todayPresent: todayCount + currentlyPresent,
      thisWeekPresent: weekCount + currentlyPresent,
      thisMonthPresent: monthCount + currentlyPresent,
    };
  }

  // Get currently present users count (optionally filtered by gym)
  async getCurrentlyPresentCount(gymId?: number): Promise<number> {
    const today = this.getTodayDate();
    const where: any = { date: today, status: 'present' };
    if (gymId) {
      where.gymId = gymId;
    }
    return this.prisma.attendance.count({ where });
  }

  // =====================
  // ADMIN OPERATIONS
  // =====================

  // Get all attendance records with pagination (optionally filtered by gym)
  async getAllAttendance(
    page: number = 1,
    limit: number = 50,
    startDate?: string,
    endDate?: string,
    gymId?: number,
  ): Promise<{ records: AttendanceRecord[]; total: number; page: number; pages: number }> {
    const where: any = {};

    if (gymId) {
      where.gymId = gymId;
    }

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
        include: {
          user: {
            select: { id: true, name: true, email: true, attendanceCode: true },
          },
          gym: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.attendanceHistory.count({ where }),
    ]);

    return {
      records: records.map(this.formatAttendanceRecord),
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

  // =====================
  // HELPER: Get user's gym (for managers)
  // =====================

  async getUserGymId(userId: number): Promise<number | null> {
    const userGym = await this.prisma.userGymXref.findFirst({
      where: {
        userId,
        isActive: true,
      },
      select: { gymId: true },
    });
    return userGym?.gymId || null;
  }
}
