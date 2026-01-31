import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
  IsObject,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType, NotificationPriority } from '../notification-types';

export class CreateNotificationDto {
  @ApiProperty({ description: 'User ID to receive the notification' })
  @IsNumber()
  @Type(() => Number)
  userId: number;

  @ApiPropertyOptional({ description: 'Branch ID' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  branchId?: number | null;

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ description: 'Notification title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Notification message' })
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: 'Additional data payload' })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Action URL for deep linking' })
  @IsOptional()
  @IsString()
  actionUrl?: string;

  @ApiPropertyOptional({ enum: NotificationPriority, default: 'normal' })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({
    description: 'Expiry date for time-sensitive notifications',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    description: 'ID of user who triggered this notification',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  createdBy?: number;
}

export class CreateBulkNotificationDto {
  @ApiProperty({
    description: 'User IDs to receive the notification',
    type: [Number],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  @Type(() => Number)
  userIds: number[];

  @ApiPropertyOptional({ description: 'Branch ID' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  branchId?: number | null;

  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ description: 'Notification title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Notification message' })
  @IsString()
  message: string;

  @ApiPropertyOptional({ description: 'Additional data payload' })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Action URL for deep linking' })
  @IsOptional()
  @IsString()
  actionUrl?: string;

  @ApiPropertyOptional({ enum: NotificationPriority, default: 'normal' })
  @IsOptional()
  @IsEnum(NotificationPriority)
  priority?: NotificationPriority;

  @ApiPropertyOptional({
    description: 'Expiry date for time-sensitive notifications',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({
    description: 'ID of user who triggered this notification',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  createdBy?: number;
}
