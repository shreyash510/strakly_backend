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
import { DietPlansService } from './diet-plans.service';
import { CreateDietPlanDto } from './dto/create-diet-plan.dto';
import { JwtAuthGuard, RolesGuard, PermissionsGuard } from '../auth/guards';
import { Roles, Permissions, CurrentUser } from '../auth/decorators';
import { GymRoles } from '../common/constants';

@Controller('diet-plans')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class DietPlansController {
  constructor(private readonly service: DietPlansService) {}

  @Post()
  @Roles(GymRoles.ADMIN, GymRoles.TRAINER)
  @Permissions('DIET_PLAN_CREATE')
  create(@Body() dto: CreateDietPlanDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.userId);
  }

  @Get('gym/:gymId')
  @Roles(GymRoles.ADMIN, GymRoles.TRAINER)
  @Permissions('DIET_PLAN_READ')
  findAll(@Param('gymId') gymId: string) {
    return this.service.findAll(gymId);
  }

  @Get('user/:userId')
  @Permissions('DIET_PLAN_READ')
  findByUser(@Param('userId') userId: string) {
    return this.service.findByUser(userId);
  }

  @Get('my-plans')
  @Permissions('DIET_PLAN_READ')
  findMyPlans(@CurrentUser() user: any) {
    return this.service.findByUser(user.userId);
  }

  @Get(':id')
  @Permissions('DIET_PLAN_READ')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(GymRoles.ADMIN, GymRoles.TRAINER)
  @Permissions('DIET_PLAN_UPDATE')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateDietPlanDto>,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user.userId);
  }

  @Delete(':id')
  @Roles(GymRoles.ADMIN, GymRoles.TRAINER)
  @Permissions('DIET_PLAN_DELETE')
  archive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.archive(id, user.userId);
  }
}
