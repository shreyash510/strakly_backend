import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { TrainerAssignmentsService } from './trainer-assignments.service';
import { CreateTrainerAssignmentDto } from './dto/create-trainer-assignment.dto';
import { JwtAuthGuard, RolesGuard, PermissionsGuard } from '../auth/guards';
import { Roles, Permissions, CurrentUser } from '../auth/decorators';
import { GymRoles } from '../common/constants';

@Controller('trainer-assignments')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class TrainerAssignmentsController {
  constructor(private readonly service: TrainerAssignmentsService) {}

  @Post()
  @Roles(GymRoles.ADMIN)
  @Permissions('TRAINER_ASSIGN')
  create(@Body() dto: CreateTrainerAssignmentDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.userId);
  }

  @Get('gym/:gymId')
  @Roles(GymRoles.ADMIN)
  findByGym(@Param('gymId') gymId: string) {
    return this.service.findByGym(gymId);
  }

  @Get('trainer/:trainerId')
  @Roles(GymRoles.ADMIN, GymRoles.TRAINER)
  findByTrainer(@Param('trainerId') trainerId: string) {
    return this.service.findByTrainer(trainerId);
  }

  @Get('user/:userId')
  findByUser(@Param('userId') userId: string) {
    return this.service.findByUser(userId);
  }

  @Get('my-users')
  @Roles(GymRoles.TRAINER)
  findMyUsers(@CurrentUser() user: any) {
    return this.service.findByTrainer(user.userId);
  }

  @Delete(':id')
  @Roles(GymRoles.ADMIN)
  @Permissions('TRAINER_ASSIGN')
  archive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.archive(id, user.userId);
  }
}
