import { IsString, IsOptional, IsEnum } from 'class-validator';

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketCategory = 'bug' | 'feature_request' | 'account' | 'billing' | 'other';

export class CreateSupportDto {
  @IsString()
  subject: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsEnum(['bug', 'feature_request', 'account', 'billing', 'other'])
  category?: TicketCategory;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: TicketPriority;

  @IsOptional()
  @IsString()
  gymId?: string;
}

export class UpdateSupportDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['bug', 'feature_request', 'account', 'billing', 'other'])
  category?: TicketCategory;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: TicketPriority;

  @IsOptional()
  @IsEnum(['open', 'in_progress', 'resolved', 'closed'])
  status?: TicketStatus;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @IsString()
  resolution?: string;
}

export class AddTicketResponseDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  responderId?: string;

  @IsOptional()
  @IsString()
  responderName?: string;
}
