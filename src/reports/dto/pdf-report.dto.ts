import { IsOptional, IsNumber, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { IncomeExpenseReportDto, MembershipSalesReportDto, PaymentDuesReportDto } from './reports.dto';
import { AttendanceReportData } from '../../attendance/attendance.service';

export class PdfReportFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(2000)
  year?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export interface DashboardSummary {
  activeMembers: number;
  newMembersThisMonth: number;
  expiredMemberships: number;
  monthlyRevenue: number;
  pendingDues: number;
  attendanceToday: number;
}

export interface TrainerStaffReportItem {
  id: number;
  name: string;
  email: string;
  role: string;
  clientCount: number;
  totalSalaryPaid: number;
}

export interface GymInfo {
  id: number;
  name: string;
  logo: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}

export interface FullReportData {
  gymInfo: GymInfo;
  branchName: string | null;
  period: { year: number; month?: number };
  dashboardSummary: DashboardSummary;
  incomeExpense: IncomeExpenseReportDto;
  membershipSales: MembershipSalesReportDto;
  paymentDues: PaymentDuesReportDto;
  attendanceReport: AttendanceReportData;
  trainerStaffReport: TrainerStaffReportItem[];
  generatedAt: string;
}
