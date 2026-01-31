import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { NotificationQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get user notifications with pagination' })
  @ApiOkResponse({ description: 'Returns paginated notifications' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationQueryDto,
  ) {
    // Superadmin notifications (no gymId)
    if (user.role === 'superadmin') {
      return this.notificationsService.findAllSystemNotifications(
        user.userId,
        query,
      );
    }

    if (!user.gymId) {
      throw new ForbiddenException('Gym context required');
    }
    return this.notificationsService.findAll(
      user.userId,
      user.gymId,
      user.branchId,
      query,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  @ApiOkResponse({ description: 'Returns unread count' })
  async getUnreadCount(@CurrentUser() user: AuthenticatedUser) {
    // Superadmin notifications
    if (user.role === 'superadmin') {
      const count = await this.notificationsService.getSystemUnreadCount(
        user.userId,
      );
      return { count };
    }

    if (!user.gymId) {
      return { count: 0 };
    }
    const count = await this.notificationsService.getUnreadCount(
      user.userId,
      user.gymId,
      user.branchId,
    );
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiOkResponse({ description: 'Returns updated notification' })
  async markAsRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    // Superadmin notifications
    if (user.role === 'superadmin') {
      const notification =
        await this.notificationsService.markSystemNotificationAsRead(
          id,
          user.userId,
        );

      if (!notification) {
        throw new NotFoundException('Notification not found');
      }

      return notification;
    }

    if (!user.gymId) {
      throw new ForbiddenException('Gym context required');
    }
    const notification = await this.notificationsService.markAsRead(
      id,
      user.userId,
      user.gymId,
    );

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return notification;
  }

  @Patch('mark-all-read')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiOkResponse({
    description: 'Returns number of notifications marked as read',
  })
  async markAllAsRead(@CurrentUser() user: AuthenticatedUser) {
    // Superadmin notifications
    if (user.role === 'superadmin') {
      const count =
        await this.notificationsService.markAllSystemNotificationsAsRead(
          user.userId,
        );
      return { count };
    }

    if (!user.gymId) {
      throw new ForbiddenException('Gym context required');
    }
    const count = await this.notificationsService.markAllAsRead(
      user.userId,
      user.gymId,
      user.branchId,
    );
    return { count };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a notification' })
  @ApiOkResponse({ description: 'Returns success status' })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    // Superadmin notifications
    if (user.role === 'superadmin') {
      const success = await this.notificationsService.deleteSystemNotification(
        id,
        user.userId,
      );

      if (!success) {
        throw new NotFoundException('Notification not found');
      }

      return { success };
    }

    if (!user.gymId) {
      throw new ForbiddenException('Gym context required');
    }
    const success = await this.notificationsService.delete(
      id,
      user.userId,
      user.gymId,
    );

    if (!success) {
      throw new NotFoundException('Notification not found');
    }

    return { success };
  }
}
