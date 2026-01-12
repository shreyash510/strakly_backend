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
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';

@Controller('goals')
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  // Get all goals
  @Get()
  findAll(@CurrentUser() user: any) {
    return this.goalsService.findAll(user.userId);
  }

  // Get all goals with their streaks
  @Get('with-streaks')
  getAllWithStreaks(@CurrentUser() user: any) {
    return this.goalsService.getAllWithStreaks(user.userId);
  }

  // Get single goal
  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.goalsService.findOne(user.userId, id);
  }

  // Get goal with its streak
  @Get(':id/with-streak')
  getGoalWithStreak(@CurrentUser() user: any, @Param('id') id: string) {
    return this.goalsService.getGoalWithStreak(user.userId, id);
  }

  // Create new goal
  @Post()
  create(@CurrentUser() user: any, @Body() createGoalDto: CreateGoalDto) {
    return this.goalsService.create(user.userId, createGoalDto);
  }

  // Update goal
  @Patch(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateGoalDto: UpdateGoalDto,
  ) {
    return this.goalsService.update(user.userId, id, updateGoalDto);
  }

  // Mark progress for today (increment streak)
  @Patch(':id/mark-progress')
  markProgress(@CurrentUser() user: any, @Param('id') id: string) {
    return this.goalsService.markProgress(user.userId, id);
  }

  // Add savings amount (for savings goals)
  @Patch(':id/add-savings')
  addSavings(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { amount: number },
  ) {
    return this.goalsService.updateSavingsAmount(user.userId, id, body.amount);
  }

  // Delete goal
  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.goalsService.remove(user.userId, id);
  }
}
