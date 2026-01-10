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
} from '@nestjs/common';
import { HabitsService } from './habits.service';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';

@Controller('habits')
export class HabitsController {
  constructor(private readonly habitsService: HabitsService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Get all habits
  @Get()
  findAll(@Headers('x-user-id') userId: string) {
    return this.habitsService.findAll(this.getUserId(userId));
  }

  // Get all habits with their streaks
  @Get('with-streaks')
  getAllWithStreaks(@Headers('x-user-id') userId: string) {
    return this.habitsService.getAllWithStreaks(this.getUserId(userId));
  }

  // Get single habit
  @Get(':id')
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.habitsService.findOne(this.getUserId(userId), id);
  }

  // Get habit with its streak
  @Get(':id/with-streak')
  getHabitWithStreak(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.habitsService.getHabitWithStreak(this.getUserId(userId), id);
  }

  // Create new habit
  @Post()
  create(
    @Headers('x-user-id') userId: string,
    @Body() createHabitDto: CreateHabitDto,
  ) {
    return this.habitsService.create(this.getUserId(userId), createHabitDto);
  }

  // Update habit
  @Patch(':id')
  update(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() updateHabitDto: UpdateHabitDto,
  ) {
    return this.habitsService.update(
      this.getUserId(userId),
      id,
      updateHabitDto,
    );
  }

  // Complete habit for today (increment streak)
  @Patch(':id/complete-today')
  completeToday(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.habitsService.completeToday(this.getUserId(userId), id);
  }

  // Toggle habit active status
  @Patch(':id/toggle-active')
  toggleActive(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.habitsService.toggleActive(this.getUserId(userId), id);
  }

  // Delete habit
  @Delete(':id')
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.habitsService.remove(this.getUserId(userId), id);
  }
}
