import { IsString, IsOptional, IsEnum } from 'class-validator';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from '../../constants';
import type { TicketCategory, TicketPriority, TicketStatus } from '../../constants';

export type { TicketCategory, TicketPriority, TicketStatus };

export class CreateSupportDto {
  @IsString()
  subject: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsEnum(TICKET_CATEGORIES)
  category?: TicketCategory;

  @IsOptional()
  @IsEnum(TICKET_PRIORITIES)
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
  @IsEnum(TICKET_CATEGORIES)
  category?: TicketCategory;

  @IsOptional()
  @IsEnum(TICKET_PRIORITIES)
  priority?: TicketPriority;

  @IsOptional()
  @IsEnum(TICKET_STATUSES)
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
