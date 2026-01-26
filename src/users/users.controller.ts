import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UseGuards,
  Res,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './dto/create-user.dto';
import { AssignClientDto } from './dto/trainer-client.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, GymId, UserId, CurrentUser } from '../auth/decorators';
import { setPaginationHeaders, resolveGymId, resolveOptionalGymId } from '../common';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get all users with optional filters and pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10, max: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by name, email, or phone' })
  @ApiQuery({ name: 'role', required: false, type: String, description: 'Filter by role' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by status' })
  @ApiQuery({ name: 'noPagination', required: false, type: Boolean, description: 'Disable pagination' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (optional for superadmin - omit to see all gyms)' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('noPagination') noPagination?: string,
    @Query('gymId') queryGymId?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const isSuperAdmin = user.role === 'superadmin';
    // For superadmin, gymId is optional (can view all gyms)
    // For others, use their assigned gymId or query param
    const gymId = isSuperAdmin
      ? (queryGymId ? parseInt(queryGymId) : undefined)
      : resolveGymId(user.gymId, queryGymId, false);

    const result = await this.usersService.findAll({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
      role,
      status,
      gymId,
      isSuperAdmin,
      noPagination: noPagination === 'true',
    });

    if (res && result.pagination) {
      setPaginationHeaders(res, result.pagination);
    }

    return result.data;
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Create a new user' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createUserDto: CreateUserDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = resolveGymId(user.gymId, queryGymId, user.role === 'superadmin');
    return this.usersService.create(createUserDto, gymId);
  }

  // ============ CURRENT USER ENDPOINTS ============

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@UserId() userId: number, @GymId() gymId: number) {
    return this.usersService.findOne(userId, gymId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(
    @UserId() userId: number,
    @GymId() gymId: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(userId, gymId, updateUserDto);
  }

  // ============ ADMIN ENDPOINTS (userId from header) ============

  @Get('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get single user by ID (header)' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  findOneByHeader(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-user-id') userId: string,
    @Query('gymId') queryGymId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const gymId = resolveGymId(user.gymId, queryGymId, user.role === 'superadmin');
    return this.usersService.findOne(parseInt(userId), gymId);
  }

  @Patch('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Update user (header)' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  updateByHeader(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-user-id') userId: string,
    @Body() updateUserDto: UpdateUserDto,
    @Query('gymId') queryGymId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const gymId = resolveGymId(user.gymId, queryGymId, user.role === 'superadmin');
    return this.usersService.update(parseInt(userId), gymId, updateUserDto);
  }

  @Delete('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete user (header)' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  removeByHeader(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-user-id') userId: string,
    @Query('gymId') queryGymId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const gymId = resolveGymId(user.gymId, queryGymId, user.role === 'superadmin');
    return this.usersService.remove(parseInt(userId), gymId);
  }

  @Patch('user/status')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Update user status (header)' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  updateStatusByHeader(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-user-id') userId: string,
    @Body() body: { status: string },
    @Query('gymId') queryGymId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const gymId = resolveGymId(user.gymId, queryGymId, user.role === 'superadmin');
    return this.usersService.updateStatus(parseInt(userId), gymId, body.status);
  }

  @Post('user/reset-password')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Reset user password (admin)' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  resetPasswordByHeader(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-user-id') userId: string,
    @Body() dto: ResetPasswordDto,
    @Query('gymId') queryGymId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const gymId = resolveGymId(user.gymId, queryGymId, user.role === 'superadmin');
    return this.usersService.resetPassword(parseInt(userId), gymId, dto.newPassword);
  }

  @Post('user/regenerate-attendance-code')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Regenerate attendance code for user' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  regenerateAttendanceCode(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-user-id') userId: string,
    @Query('gymId') queryGymId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const gymId = resolveGymId(user.gymId, queryGymId, user.role === 'superadmin');
    return this.usersService.regenerateAttendanceCode(parseInt(userId), gymId);
  }

  @Get('role/:role')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get users by role' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  async findByRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('role') role: string,
    @Query('gymId') queryGymId?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const gymId = resolveGymId(user.gymId, queryGymId, user.role === 'superadmin');
    const result = await this.usersService.findByRole(role, gymId);

    if (res && result.pagination) {
      setPaginationHeaders(res, result.pagination);
    }

    return result.data;
  }

  // ============ REQUEST APPROVAL ENDPOINTS ============

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Approve a pending registration request' })
  approveRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    if (!user.gymId) {
      throw new BadRequestException('Gym ID is required for this operation');
    }
    return this.usersService.approveRequest(id, user.gymId);
  }

  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Reject a pending registration request' })
  rejectRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    if (!user.gymId) {
      throw new BadRequestException('Gym ID is required for this operation');
    }
    return this.usersService.rejectRequest(id, user.gymId);
  }

  // ============ TRAINER-CLIENT ASSIGNMENT ENDPOINTS ============

  @Get('trainer-clients/all')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Get all trainer-client assignments' })
  getAllTrainerClientAssignments(@CurrentUser() user: AuthenticatedUser) {
    if (!user.gymId) {
      throw new BadRequestException('Gym ID is required for this operation');
    }
    return this.usersService.getAllTrainerClientAssignments(user.gymId);
  }

  @Get('trainers/:trainerId/clients')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get clients assigned to a trainer' })
  getTrainerClients(
    @CurrentUser() user: AuthenticatedUser,
    @Param('trainerId', ParseIntPipe) trainerId: number,
  ) {
    if (!user.gymId) {
      throw new BadRequestException('Gym ID is required for this operation');
    }
    return this.usersService.getTrainerClients(trainerId, user.gymId);
  }

  @Post('trainers/:trainerId/clients')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Assign a client to a trainer' })
  assignClientToTrainer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('trainerId', ParseIntPipe) trainerId: number,
    @Body() dto: AssignClientDto,
  ) {
    if (!user.gymId) {
      throw new BadRequestException('Gym ID is required for this operation');
    }
    return this.usersService.assignClientToTrainer(trainerId, dto, user.gymId);
  }

  @Delete('trainers/:trainerId/clients/:clientId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Remove a client from a trainer' })
  removeClientFromTrainer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('trainerId', ParseIntPipe) trainerId: number,
    @Param('clientId', ParseIntPipe) clientId: number,
  ) {
    if (!user.gymId) {
      throw new BadRequestException('Gym ID is required for this operation');
    }
    return this.usersService.removeClientFromTrainer(trainerId, clientId, user.gymId);
  }

  @Get('clients/:clientId/trainer')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Get trainer assigned to a client' })
  getClientTrainer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clientId', ParseIntPipe) clientId: number,
  ) {
    if (!user.gymId) {
      throw new BadRequestException('Gym ID is required for this operation');
    }
    return this.usersService.getClientTrainer(clientId, user.gymId);
  }

  // ============ ID-BASED ENDPOINTS (must be last due to :id wildcard) ============

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (optional for superadmin)' })
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('gymId') queryGymId?: string,
  ) {
    // Superadmin can view any user without specifying gymId
    const gymId = user.role === 'superadmin'
      ? resolveOptionalGymId(user.gymId, queryGymId)
      : resolveGymId(user.gymId, queryGymId, false);
    return this.usersService.findOne(id, gymId as number);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Update user by ID' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  updateById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = resolveGymId(user.gymId, queryGymId, user.role === 'superadmin');
    return this.usersService.update(id, gymId, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete user by ID' })
  @ApiQuery({ name: 'gymId', required: false, type: Number, description: 'Gym ID (required for superadmin)' })
  removeById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = resolveGymId(user.gymId, queryGymId, user.role === 'superadmin');
    return this.usersService.remove(id, gymId);
  }
}
