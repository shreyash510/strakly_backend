import { ApiProperty } from '@nestjs/swagger';

export class DashboardStatsDto {
  @ApiProperty({ description: 'Total number of gyms' })
  totalGyms: number;

  @ApiProperty({ description: 'Number of active gyms' })
  activeGyms: number;

  @ApiProperty({ description: 'Total number of users' })
  totalUsers: number;

  @ApiProperty({ description: 'Number of active users' })
  activeUsers: number;

  @ApiProperty({ description: 'Total number of trainers' })
  totalTrainers: number;

  @ApiProperty({ description: 'Total number of members' })
  totalMembers: number;

  @ApiProperty({ description: 'Total number of active memberships' })
  activeMemberships: number;

  @ApiProperty({ description: 'Total revenue from paid memberships' })
  totalRevenue: number;

  @ApiProperty({ description: 'Revenue this month' })
  monthlyRevenue: number;

  @ApiProperty({ description: 'Monthly revenue growth percentage' })
  monthlyGrowth: number;

  @ApiProperty({ description: 'Users present today' })
  presentToday: number;

  @ApiProperty({ description: 'Total support tickets' })
  totalTickets: number;

  @ApiProperty({ description: 'Open support tickets' })
  openTickets: number;
}

export class RecentGymDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  city?: string;

  @ApiProperty({ required: false })
  state?: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class RecentUserDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ required: false })
  avatar?: string;

  @ApiProperty()
  role: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  createdAt: Date;
}

export class RecentTicketDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  ticketNumber: string;

  @ApiProperty()
  subject: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  priority: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  createdAt: Date;
}

export class SuperadminDashboardDto {
  @ApiProperty({ type: DashboardStatsDto })
  stats: DashboardStatsDto;

  @ApiProperty({ type: [RecentGymDto] })
  recentGyms: RecentGymDto[];

  @ApiProperty({ type: [RecentUserDto] })
  recentUsers: RecentUserDto[];

  @ApiProperty({ type: [RecentTicketDto] })
  recentTickets: RecentTicketDto[];
}

export class AdminDashboardStatsDto {
  @ApiProperty({ description: 'Total number of members in gym' })
  totalMembers: number;

  @ApiProperty({ description: 'Number of active members' })
  activeMembers: number;

  @ApiProperty({ description: 'Total number of trainers in gym' })
  totalTrainers: number;

  @ApiProperty({ description: 'Total number of active memberships' })
  activeMemberships: number;

  @ApiProperty({ description: 'Total revenue from paid memberships' })
  totalRevenue: number;

  @ApiProperty({ description: 'Total cash revenue from paid memberships' })
  totalCashRevenue: number;

  @ApiProperty({ description: 'Revenue this month' })
  monthlyRevenue: number;

  @ApiProperty({ description: 'Revenue last month' })
  lastMonthRevenue: number;

  @ApiProperty({ description: 'Monthly revenue growth percentage' })
  monthlyGrowth: number;

  @ApiProperty({ description: 'Members present today' })
  presentToday: number;

  @ApiProperty({ description: 'Open support tickets' })
  openTickets: number;

  @ApiProperty({ description: 'Memberships expiring this week' })
  expiringThisWeek: number;
}

export class RecentMemberDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ required: false })
  avatar?: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  createdAt: Date;
}

export class RecentAttendanceDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  userName: string;

  @ApiProperty()
  date: string;

  @ApiProperty()
  checkIn: string;

  @ApiProperty({ required: false })
  checkOut?: string;

  @ApiProperty()
  status: string;
}

export class AdminDashboardDto {
  @ApiProperty({ type: AdminDashboardStatsDto })
  stats: AdminDashboardStatsDto;

  @ApiProperty({ type: [RecentMemberDto] })
  recentMembers: RecentMemberDto[];

  @ApiProperty({ type: [RecentAttendanceDto] })
  recentAttendance: RecentAttendanceDto[];

  @ApiProperty({ type: [RecentTicketDto] })
  recentTickets: RecentTicketDto[];
}

// Member Dashboard DTOs

export class MemberSubscriptionDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  planName: string;

  @ApiProperty()
  status: string;

  @ApiProperty()
  startDate: string;

  @ApiProperty()
  endDate: string;

  @ApiProperty()
  daysRemaining: number;

  @ApiProperty()
  progress: number;

  @ApiProperty()
  isEndingSoon: boolean;
}

export class MemberAttendanceStatsDto {
  @ApiProperty({ description: 'Total attendance this month' })
  thisMonth: number;

  @ApiProperty({ description: 'Total attendance this week' })
  thisWeek: number;

  @ApiProperty({ description: 'Total attendance all time' })
  total: number;

  @ApiProperty({ description: 'Current streak in days' })
  currentStreak: number;
}

export class MemberRecentAttendanceDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  date: string;

  @ApiProperty()
  checkIn: string;

  @ApiProperty({ required: false })
  checkOut?: string;

  @ApiProperty()
  status: string;
}

export class ActiveOfferDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  title: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty()
  discountPercentage: number;

  @ApiProperty({ required: false })
  code?: string;

  @ApiProperty()
  endDate: string;
}

export class MemberGymDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  logo?: string;

  @ApiProperty({ required: false })
  phone?: string;

  @ApiProperty({ required: false })
  email?: string;

  @ApiProperty({ required: false })
  address?: string;

  @ApiProperty({ required: false })
  city?: string;

  @ApiProperty({ required: false })
  state?: string;
}

export class MemberDashboardDto {
  @ApiProperty()
  attendanceCode: string;

  @ApiProperty({ type: MemberGymDto, required: false })
  gym?: MemberGymDto;

  @ApiProperty({ type: MemberSubscriptionDto, required: false })
  subscription?: MemberSubscriptionDto;

  @ApiProperty({ type: MemberAttendanceStatsDto })
  attendanceStats: MemberAttendanceStatsDto;

  @ApiProperty({ type: [MemberRecentAttendanceDto] })
  recentAttendance: MemberRecentAttendanceDto[];

  @ApiProperty({ type: [ActiveOfferDto] })
  activeOffers: ActiveOfferDto[];
}
