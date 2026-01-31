import {
  IsOptional,
  IsNumber,
  IsString,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReportFilterDto {
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

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  branchId?: number;
}

export class IncomeExpenseReportDto {
  period: string;
  income: {
    membershipPayments: number;
    totalIncome: number;
  };
  expense: {
    salaryPayments: number;
    totalExpense: number;
  };
  netProfit: number;
  breakdown: {
    incomeByMonth: Array<{
      month: string;
      amount: number;
    }>;
    expenseByMonth: Array<{
      month: string;
      amount: number;
    }>;
    incomeByPaymentMethod: Array<{
      method: string;
      amount: number;
      count: number;
    }>;
  };
}

export class MembershipSalesReportDto {
  period: string;
  summary: {
    totalSales: number;
    totalRevenue: number;
    averageOrderValue: number;
    newMemberships: number;
    renewals: number;
  };
  salesByPlan: Array<{
    planId: number;
    planName: string;
    planCode: string;
    count: number;
    revenue: number;
    percentage: number;
  }>;
  salesByMonth: Array<{
    month: string;
    count: number;
    revenue: number;
  }>;
  topPerformingPlan: {
    planName: string;
    revenue: number;
    count: number;
  } | null;
}

export class PaymentDuesReportDto {
  summary: {
    totalDueAmount: number;
    membershipDues: number;
    salaryDues: number;
    overdueCount: number;
  };
  membershipDues: Array<{
    id: number;
    clientName: string;
    clientEmail: string;
    planName: string;
    amount: number;
    dueDate: string;
    daysOverdue: number;
  }>;
  salaryDues: Array<{
    id: number;
    staffName: string;
    staffEmail: string;
    staffRole: string;
    period: string;
    amount: number;
  }>;
}
