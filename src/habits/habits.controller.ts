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
import { ToggleHabitCompletionDto } from './dto/toggle-habit.dto';

@Controller('habits')
export class HabitsController {
  constructor(private readonly habitsService: HabitsService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  @Get()
  findAll(@Headers('x-user-id') userId: string) {
    return this.habitsService.findAll(this.getUserId(userId));
  }

  @Get(':id')
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.habitsService.findOne(this.getUserId(userId), id);
  }

  @Post()
  create(
    @Headers('x-user-id') userId: string,
    @Body() createHabitDto: CreateHabitDto,
  ) {
    return this.habitsService.create(this.getUserId(userId), createHabitDto);
  }

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

  @Patch(':id/toggle-completion')
  toggleCompletion(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() toggleDto: ToggleHabitCompletionDto,
  ) {
    return this.habitsService.toggleCompletion(
      this.getUserId(userId),
      id,
      toggleDto.date,
    );
  }

  @Patch(':id/toggle-active')
  toggleActive(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.habitsService.toggleActive(this.getUserId(userId), id);
  }

  @Delete(':id')
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.habitsService.remove(this.getUserId(userId), id);
  }
}
