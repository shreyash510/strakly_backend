import { IsOptional, IsString, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class ClientReportFilterDto {
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

/* Progress Report DTOs */
export class MetricChangeDto {
  name: string;
  start: number | null;
  current: number | null;
  change: number | null;
}

export class ClientProgressReportDto {
  clientId: number;
  clientName: string;
  clientEmail: string;
  period: {
    start: string;
    end: string;
  };
  metrics: {
    startWeight: number | null;
    currentWeight: number | null;
    weightChange: number | null;
    weightChangePercent: number | null;
    startBMI: number | null;
    currentBMI: number | null;
    measurements: MetricChangeDto[];
  };
  history: Array<{
    id: number;
    measuredAt: string;
    weight: number | null;
    bmi: number | null;
    bodyFat: number | null;
    muscleMass: number | null;
    waist: number | null;
    chest: number | null;
    hips: number | null;
  }>;
  totalRecords: number;
}

/* Attendance Report DTOs */
export class WeeklyPatternDto {
  day: string;
  visits: number;
}

export class MonthlyTrendDto {
  month: string;
  visits: number;
}

export class ClientAttendanceReportDto {
  clientId: number;
  clientName: string;
  clientEmail: string;
  period: {
    start: string;
    end: string;
  };
  summary: {
    totalVisits: number;
    uniqueDays: number;
    avgVisitsPerWeek: number;
    longestStreak: number;
    currentStreak: number;
    missedDaysThisMonth: number;
  };
  weeklyPattern: WeeklyPatternDto[];
  monthlyTrend: MonthlyTrendDto[];
  recentVisits: Array<{
    id: number;
    checkInTime: string;
    checkOutTime: string | null;
    duration: number | null;
  }>;
}

/* Trainer Clients Summary DTO */
export class TopPerformerDto {
  clientId: number;
  clientName: string;
  metric: string;
  value: string;
}

export class TrainerClientsSummaryDto {
  totalClients: number;
  activeThisWeek: number;
  avgAttendanceRate: number;
  clientsWithProgress: number;
  topPerformers: TopPerformerDto[];
}
