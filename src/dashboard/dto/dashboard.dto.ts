import { ApiProperty } from '@nestjs/swagger';

export class DashboardStatsDto {
  @ApiProperty({ description: 'Total number of gyms' })
  totalGyms: number;

  @ApiProperty({ description: 'Number of active gyms' })
  activeGyms: number;

  @ApiProperty({ description: 'Total number of admin users' })
  totalUsers: number;

  @ApiProperty({ description: 'Number of active admin users' })
  activeUsers: number;

  @ApiProperty({ description: 'Total support tickets' })
  totalTickets: number;

  @ApiProperty({ description: 'Open support tickets' })
  openTickets: number;

  @ApiProperty({ description: 'Total contact requests' })
  totalContactRequests: number;

  @ApiProperty({ description: 'Unread contact requests' })
  unreadContactRequests: number;

  @ApiProperty({ description: 'Total SaaS subscriptions' })
  totalSubscriptions: number;

  @ApiProperty({ description: 'Active SaaS subscriptions' })
  activeSubscriptions: number;

  @ApiProperty({ description: 'Trial SaaS subscriptions' })
  trialSubscriptions: number;

  @ApiProperty({ description: 'Expired SaaS subscriptions' })
  expiredSubscriptions: number;
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

  @ApiProperty({ description: 'Expired memberships count' })
  expiredMemberships: number;

  @ApiProperty({ description: 'Pending onboarding requests' })
  pendingOnboardingCount: number;

  @ApiProperty({ description: 'Male client count' })
  maleClients: number;

  @ApiProperty({ description: 'Female client count' })
  femaleClients: number;

  @ApiProperty({ description: 'New clients this month' })
  newClientsThisMonth: number;

  @ApiProperty({ description: 'New enquiries this month' })
  newEnquiriesThisMonth: number;

  @ApiProperty({ description: 'Memberships expiring within 7 days' })
  expiringSoon: number;

  @ApiProperty({ description: 'Monthly revenue for last 5 months', type: [Object] })
  monthlyRevenueHistory: { month: string; revenue: number }[];
}

export class RecentClientDto {
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

export class PaginationMetaDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  hasNext: boolean;

  @ApiProperty()
  hasPrev: boolean;
}

export class PaginatedClientsDto {
  @ApiProperty({ type: [RecentClientDto] })
  data: RecentClientDto[];

  @ApiProperty({ type: PaginationMetaDto })
  pagination: PaginationMetaDto;
}

export class ExpiringMembershipDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  userId: number;

  @ApiProperty()
  userName: string;

  @ApiProperty({ required: false })
  avatar?: string;

  @ApiProperty()
  planName: string;

  @ApiProperty()
  endDate: string;

  @ApiProperty()
  daysRemaining: number;
}

export class AdminDashboardDto {
  @ApiProperty({ type: AdminDashboardStatsDto })
  stats: AdminDashboardStatsDto;

  @ApiProperty({ type: PaginatedClientsDto })
  newClients: PaginatedClientsDto;

  @ApiProperty({ type: PaginatedClientsDto })
  newInquiries: PaginatedClientsDto;

  @ApiProperty({ type: [RecentTicketDto] })
  recentTickets: RecentTicketDto[];

  @ApiProperty({ type: [RecentAttendanceDto] })
  recentAttendance: RecentAttendanceDto[];

  @ApiProperty({ type: [ExpiringMembershipDto] })
  expiringMemberships: ExpiringMembershipDto[];
}

// Client Dashboard DTOs

export class ClientSubscriptionDto {
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

export class ClientAttendanceStatsDto {
  @ApiProperty({ description: 'Total attendance this month' })
  thisMonth: number;

  @ApiProperty({ description: 'Total attendance this week' })
  thisWeek: number;

  @ApiProperty({ description: 'Total attendance all time' })
  total: number;

  @ApiProperty({ description: 'Current streak in days' })
  currentStreak: number;
}

export class ClientRecentAttendanceDto {
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

export class ClientGymDto {
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

export class ClientFacilityDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  code: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false })
  icon?: string;
}

export class ClientAmenityDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  code: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false })
  icon?: string;
}

export class ClientDashboardDto {
  @ApiProperty()
  attendanceCode: string;

  @ApiProperty({ type: ClientGymDto, required: false })
  gym?: ClientGymDto;

  @ApiProperty({ type: ClientSubscriptionDto, required: false })
  subscription?: ClientSubscriptionDto;

  @ApiProperty({ type: ClientAttendanceStatsDto })
  attendanceStats: ClientAttendanceStatsDto;

  @ApiProperty({ type: [ClientRecentAttendanceDto] })
  recentAttendance: ClientRecentAttendanceDto[];

  @ApiProperty({ type: [ActiveOfferDto] })
  activeOffers: ActiveOfferDto[];

  @ApiProperty({ type: [ClientFacilityDto], required: false })
  facilities?: ClientFacilityDto[];

  @ApiProperty({ type: [ClientAmenityDto], required: false })
  amenities?: ClientAmenityDto[];
}
