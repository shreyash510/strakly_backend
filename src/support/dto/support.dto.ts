import { IsString, IsOptional, IsEnum, IsInt } from 'class-validator';

export const TICKET_CATEGORIES = [
  'general',
  'technical',
  'billing',
  'feedback',
  'complaint',
] as const;
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export const TICKET_STATUSES = [
  'open',
  'in_progress',
  'waiting_for_response',
  'resolved',
  'closed',
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export class CreateTicketDto {
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
}

export class UpdateTicketDto {
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
  @IsInt()
  assignedToId?: number;

  @IsOptional()
  @IsString()
  resolution?: string;
}

export class AddMessageDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  attachment?: string;
}

export class TicketFilterDto {
  @IsOptional()
  @IsEnum(TICKET_STATUSES)
  status?: TicketStatus;

  @IsOptional()
  @IsEnum(TICKET_CATEGORIES)
  category?: TicketCategory;

  @IsOptional()
  @IsEnum(TICKET_PRIORITIES)
  priority?: TicketPriority;

  @IsOptional()
  @IsInt()
  userId?: number;

  @IsOptional()
  @IsInt()
  assignedToId?: number;
}
