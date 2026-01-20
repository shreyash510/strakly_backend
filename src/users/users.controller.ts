import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Query,
  Headers,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get all users with optional filters' })
  findAll(
    @Query('role') role?: string,
    @Query('status') status?: string,
  ) {
    return this.usersService.findAll({ role, status });
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @ApiOperation({ summary: 'Create a new user (superadmin only)' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get('role/:role')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get users by role' })
  findByRole(@Query('role') role: string) {
    return this.usersService.findByRole(role);
  }

  // ============ CURRENT USER ENDPOINTS ============

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@Request() req: any) {
    return this.usersService.findOne(req.user.userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(@Request() req: any, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(req.user.userId, updateUserDto);
  }

  // ============ ADMIN ENDPOINTS (userId from header) ============

  @Get('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get single user by ID' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  findOne(@Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.usersService.findOne(parseInt(userId));
  }

  @Patch('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Update user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  update(@Headers('x-user-id') userId: string, @Body() updateUserDto: UpdateUserDto) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.usersService.update(parseInt(userId), updateUserDto);
  }

  @Delete('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  remove(@Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.usersService.remove(parseInt(userId));
  }

  @Patch('user/status')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Update user status' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  updateStatus(@Headers('x-user-id') userId: string, @Body() body: { status: string }) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.usersService.updateStatus(parseInt(userId), body.status);
  }
}
