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
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Get all goals
  @Get()
  findAll(@Headers('x-user-id') userId: string) {
    return this.goalsService.findAll(this.getUserId(userId));
  }

  // Get all goals with their streaks
  @Get('with-streaks')
  getAllWithStreaks(@Headers('x-user-id') userId: string) {
    return this.goalsService.getAllWithStreaks(this.getUserId(userId));
  }

  // Get single goal
  @Get(':id')
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.goalsService.findOne(this.getUserId(userId), id);
  }

  // Get goal with its streak
  @Get(':id/with-streak')
  getGoalWithStreak(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.goalsService.getGoalWithStreak(this.getUserId(userId), id);
  }

  // Create new goal
  @Post()
  create(
    @Headers('x-user-id') userId: string,
    @Body() createGoalDto: CreateGoalDto,
  ) {
    return this.goalsService.create(this.getUserId(userId), createGoalDto);
  }

  // Update goal
  @Patch(':id')
  update(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() updateGoalDto: UpdateGoalDto,
  ) {
    return this.goalsService.update(this.getUserId(userId), id, updateGoalDto);
  }

  // Mark progress for today (increment streak)
  @Patch(':id/mark-progress')
  markProgress(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.goalsService.markProgress(this.getUserId(userId), id);
  }

  // Add savings amount (for savings goals)
  @Patch(':id/add-savings')
  addSavings(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() body: { amount: number },
  ) {
    return this.goalsService.updateSavingsAmount(
      this.getUserId(userId),
      id,
      body.amount,
    );
  }

  // Delete goal
  @Delete(':id')
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.goalsService.remove(this.getUserId(userId), id);
  }
}
