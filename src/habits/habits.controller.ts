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
import { HabitsService } from './habits.service';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';

@Controller('habits')
@UseGuards(JwtAuthGuard)
export class HabitsController {
  constructor(private readonly habitsService: HabitsService) {}

  // Get all habits
  @Get()
  findAll(@CurrentUser() user: any) {
    return this.habitsService.findAll(user.userId);
  }

  // Get all habits with their streaks
  @Get('with-streaks')
  getAllWithStreaks(@CurrentUser() user: any) {
    return this.habitsService.getAllWithStreaks(user.userId);
  }

  // Get single habit
  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.habitsService.findOne(user.userId, id);
  }

  // Get habit with its streak
  @Get(':id/with-streak')
  getHabitWithStreak(@CurrentUser() user: any, @Param('id') id: string) {
    return this.habitsService.getHabitWithStreak(user.userId, id);
  }

  // Create new habit
  @Post()
  create(@CurrentUser() user: any, @Body() createHabitDto: CreateHabitDto) {
    return this.habitsService.create(user.userId, createHabitDto);
  }

  // Update habit
  @Patch(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateHabitDto: UpdateHabitDto,
  ) {
    return this.habitsService.update(user.userId, id, updateHabitDto);
  }

  // Complete habit for today (increment streak)
  @Patch(':id/complete-today')
  completeToday(@CurrentUser() user: any, @Param('id') id: string) {
    return this.habitsService.completeToday(user.userId, id);
  }

  // Toggle habit active status
  @Patch(':id/toggle-active')
  toggleActive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.habitsService.toggleActive(user.userId, id);
  }

  // Delete habit
  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.habitsService.remove(user.userId, id);
  }
}
