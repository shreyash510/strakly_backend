import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { JwtAuthGuard, RolesGuard, PermissionsGuard } from '../auth/guards';
import { Roles, Permissions, CurrentUser } from '../auth/decorators';
import { GymRoles } from '../common/constants';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Post()
  @Roles(GymRoles.ADMIN)
  @Permissions('SUBSCRIPTION_MANAGE')
  create(@Body() dto: CreateSubscriptionDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.userId);
  }

  @Get('gym/:gymId')
  @Roles(GymRoles.ADMIN)
  @Permissions('SUBSCRIPTION_MANAGE')
  findAll(@Param('gymId') gymId: string) {
    return this.service.findAll(gymId);
  }

  @Get('user/:userId')
  @Permissions('SUBSCRIPTION_READ')
  findByUser(@Param('userId') userId: string) {
    return this.service.findByUser(userId);
  }

  @Get('my-subscriptions')
  @Permissions('SUBSCRIPTION_READ')
  findMySubscriptions(@CurrentUser() user: any) {
    return this.service.findByUser(user.userId);
  }

  @Get(':id')
  @Permissions('SUBSCRIPTION_READ')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(GymRoles.ADMIN)
  @Permissions('SUBSCRIPTION_MANAGE')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateSubscriptionDto>,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user.userId);
  }

  @Patch(':id/status')
  @Roles(GymRoles.ADMIN)
  @Permissions('SUBSCRIPTION_MANAGE')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser() user: any,
  ) {
    return this.service.updateStatus(id, status, user.userId);
  }

  @Delete(':id')
  @Roles(GymRoles.ADMIN)
  @Permissions('SUBSCRIPTION_MANAGE')
  archive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.archive(id, user.userId);
  }
}
