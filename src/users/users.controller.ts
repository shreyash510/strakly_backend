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
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, UserStatus } from './dto/create-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Get all users with optional filters
  @Get()
  findAll(
    @Headers('x-user-id') userId: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('gymId') gymId?: string,
  ) {
    return this.usersService.findAll(this.getUserId(userId), { role, status, gymId });
  }

  // Get users by role
  @Get('role/:role')
  findByRole(
    @Headers('x-user-id') userId: string,
    @Param('role') role: 'superadmin' | 'admin' | 'trainer' | 'user',
  ) {
    return this.usersService.findByRole(this.getUserId(userId), role);
  }

  // Get single user
  @Get(':id')
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.usersService.findOne(this.getUserId(userId), id);
  }

  // Create new user
  @Post()
  create(
    @Headers('x-user-id') userId: string,
    @Body() createUserDto: CreateUserDto,
  ) {
    return this.usersService.create(this.getUserId(userId), createUserDto);
  }

  // Update user
  @Patch(':id')
  update(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(this.getUserId(userId), id, updateUserDto);
  }

  // Delete user
  @Delete(':id')
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.usersService.remove(this.getUserId(userId), id);
  }

  // Assign user to gym
  @Patch(':id/assign-gym')
  assignToGym(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() body: { gymId: string },
  ) {
    return this.usersService.assignToGym(this.getUserId(userId), id, body.gymId);
  }

  // Assign user to trainer
  @Patch(':id/assign-trainer')
  assignToTrainer(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() body: { trainerId: string },
  ) {
    return this.usersService.assignToTrainer(this.getUserId(userId), id, body.trainerId);
  }

  // Update user status
  @Patch(':id/status')
  updateStatus(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() body: { status: UserStatus },
  ) {
    return this.usersService.updateStatus(this.getUserId(userId), id, body.status);
  }
}
