import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
  UnauthorizedException,
  Put,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Get all notifications for current user
  @Get()
  findAll(@Headers('x-user-id') userId: string) {
    return this.notificationsService.findAllForUser(this.getUserId(userId));
  }

  // Get unread notifications for current user
  @Get('unread')
  findUnread(@Headers('x-user-id') userId: string) {
    return this.notificationsService.findUnread(this.getUserId(userId));
  }

  // Get unread count for current user
  @Get('unread-count')
  getUnreadCount(@Headers('x-user-id') userId: string) {
    return this.notificationsService.getUnreadCount(this.getUserId(userId));
  }

  // Get single notification
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.notificationsService.findOne(id);
  }

  // Create new notification (internal use)
  @Post()
  create(@Body() createNotificationDto: CreateNotificationDto) {
    return this.notificationsService.create(createNotificationDto);
  }

  // Mark single notification as read
  @Put(':id/read')
  markAsRead(@Param('id') id: string) {
    return this.notificationsService.markAsRead(id);
  }

  // Mark all notifications as read for current user
  @Put('read-all')
  markAllAsRead(@Headers('x-user-id') userId: string) {
    return this.notificationsService.markAllAsRead(this.getUserId(userId));
  }

  // Delete single notification
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.notificationsService.remove(id);
  }

  // Delete all notifications for current user
  @Delete()
  removeAll(@Headers('x-user-id') userId: string) {
    return this.notificationsService.removeAllForUser(this.getUserId(userId));
  }
}
