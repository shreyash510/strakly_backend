import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsNotEmpty,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PipelineStage {
  NEW = 'new',
  CONTACTED = 'contacted',
  TOUR_SCHEDULED = 'tour_scheduled',
  TOUR_COMPLETED = 'tour_completed',
  PROPOSAL_SENT = 'proposal_sent',
  NEGOTIATION = 'negotiation',
  WON = 'won',
  LOST = 'lost',
}

export enum LeadScore {
  HOT = 'hot',
  WARM = 'warm',
  COLD = 'cold',
}

export enum ActivityType {
  CALL = 'call',
  EMAIL = 'email',
  TOUR = 'tour',
  FOLLOW_UP = 'follow_up',
  NOTE = 'note',
  MEETING = 'meeting',
  SMS = 'sms',
}

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  leadSource?: string;

  @IsOptional()
  @IsEnum(PipelineStage)
  pipelineStage?: PipelineStage;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  assignedTo?: number;

  @IsOptional()
  @IsEnum(LeadScore)
  score?: LeadScore;

  @IsOptional()
  @IsDateString()
  inquiryDate?: string;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  dealValue?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  leadSource?: string;

  @IsOptional()
  @IsEnum(PipelineStage)
  pipelineStage?: PipelineStage;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  assignedTo?: number;

  @IsOptional()
  @IsEnum(LeadScore)
  score?: LeadScore;

  @IsOptional()
  @IsDateString()
  inquiryDate?: string;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  dealValue?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  winLossReason?: string;
}

export class UpdateStageDto {
  @IsEnum(PipelineStage)
  @IsNotEmpty()
  stage: PipelineStage;

  @IsOptional()
  @IsString()
  winLossReason?: string;
}

export class ConvertLeadDto {}

export class CreateLeadActivityDto {
  @IsEnum(ActivityType)
  @IsNotEmpty()
  type: ActivityType;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsDateString()
  completedAt?: string;
}

export class LeadStatsFiltersDto {
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class LeadFiltersDto {
  @IsOptional()
  @IsString()
  pipelineStage?: string;

  @IsOptional()
  @IsString()
  score?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  assignedTo?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}
