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
  Query,
} from '@nestjs/common';
import { TrainersService } from './trainers.service';
import { CreateTrainerDto, UpdateTrainerDto } from './dto/create-trainer.dto';

@Controller('trainers')
export class TrainersController {
  constructor(private readonly trainersService: TrainersService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Get all trainers with optional filters
  @Get()
  findAll(
    @Headers('x-user-id') userId: string,
    @Query('gymId') gymId?: string,
    @Query('status') status?: string,
  ) {
    return this.trainersService.findAll(this.getUserId(userId), { gymId, status });
  }

  // Get trainers by gym
  @Get('gym/:gymId')
  findByGym(
    @Headers('x-user-id') userId: string,
    @Param('gymId') gymId: string,
  ) {
    return this.trainersService.findByGym(this.getUserId(userId), gymId);
  }

  // Get single trainer
  @Get(':id')
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.trainersService.findOne(this.getUserId(userId), id);
  }

  // Create new trainer
  @Post()
  create(
    @Headers('x-user-id') userId: string,
    @Body() createTrainerDto: CreateTrainerDto,
  ) {
    return this.trainersService.create(this.getUserId(userId), createTrainerDto);
  }

  // Update trainer
  @Patch(':id')
  update(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() updateTrainerDto: UpdateTrainerDto,
  ) {
    return this.trainersService.update(this.getUserId(userId), id, updateTrainerDto);
  }

  // Delete trainer
  @Delete(':id')
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.trainersService.remove(this.getUserId(userId), id);
  }

  // Update client count
  @Patch(':id/client-count')
  updateClientCount(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() body: { increment: number },
  ) {
    return this.trainersService.updateClientCount(
      this.getUserId(userId),
      id,
      body.increment,
    );
  }

  // Update rating
  @Patch(':id/rating')
  updateRating(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() body: { rating: number },
  ) {
    return this.trainersService.updateRating(
      this.getUserId(userId),
      id,
      body.rating,
    );
  }
}
