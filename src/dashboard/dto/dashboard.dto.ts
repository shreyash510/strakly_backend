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
