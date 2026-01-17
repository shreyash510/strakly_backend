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
import { GymsService } from './gyms.service';
import { CreateGymDto, UpdateGymDto } from './dto/create-gym.dto';

@Controller('gyms')
export class GymsController {
  constructor(private readonly gymsService: GymsService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Get all gyms
  @Get()
  findAll(@Headers('x-user-id') userId: string) {
    return this.gymsService.findAll(this.getUserId(userId));
  }

  // Get single gym
  @Get(':id')
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.gymsService.findOne(this.getUserId(userId), id);
  }

  // Create new gym
  @Post()
  create(
    @Headers('x-user-id') userId: string,
    @Body() createGymDto: CreateGymDto,
  ) {
    return this.gymsService.create(this.getUserId(userId), createGymDto);
  }

  // Update gym
  @Patch(':id')
  update(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() updateGymDto: UpdateGymDto,
  ) {
    return this.gymsService.update(this.getUserId(userId), id, updateGymDto);
  }

  // Delete gym
  @Delete(':id')
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.gymsService.remove(this.getUserId(userId), id);
  }

  // Update member count
  @Patch(':id/member-count')
  updateMemberCount(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() body: { increment: number },
  ) {
    return this.gymsService.updateMemberCount(
      this.getUserId(userId),
      id,
      body.increment,
    );
  }

  // Update trainer count
  @Patch(':id/trainer-count')
  updateTrainerCount(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() body: { increment: number },
  ) {
    return this.gymsService.updateTrainerCount(
      this.getUserId(userId),
      id,
      body.increment,
    );
  }
}
