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
  ForbiddenException,
  ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { RabbitMqService } from '../rabbitmq/rabbitmq.service';
import {
  CreateUserDto,
  UpdateUserDto,
  AdminResetPasswordDto,
  ApproveRequestDto,
  BulkUpdateUserDto,
  BulkDeleteUserDto,
  UpdateManagerPermissionsDto,
} from './dto/create-user.dto';
import { AssignClientDto } from './dto/trainer-client.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, GymId, UserId, CurrentUser } from '../auth/decorators';
import { ManagerPermissionsGuard } from '../auth/guards/manager-permissions.guard';
import { ManagerPermission } from '../auth/decorators/manager-permission.decorator';
import {
  setPaginationHeaders,
  resolveGymId,
  resolveOptionalGymId,
  resolveEffectiveBranchId,
} from '../common';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly rabbitMqService: RabbitMqService,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({
    summary: 'Get all users with optional filters and pagination',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10, max: 100)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by name, email, or phone',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    type: String,
    description: 'Filter by role',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'noPagination',
    required: false,
    type: Boolean,
    description: 'Disable pagination',
  })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (optional for superadmin - omit to see all gyms)',
  })
  @ApiQuery({ name: 'name', required: false, type: String, description: 'Filter by name (partial match)' })
  @ApiQuery({ name: 'phone', required: false, type: String, description: 'Filter by phone (partial match)' })
  @ApiQuery({ name: 'city', required: false, type: String, description: 'Filter by city (partial match)' })
  @ApiQuery({ name: 'gender', required: false, type: String, description: 'Filter by gender (male/female/other)' })
  @ApiQuery({ name: 'joinDateFrom', required: false, type: String, description: 'Filter join date from (YYYY-MM-DD)' })
  @ApiQuery({ name: 'joinDateTo', required: false, type: String, description: 'Filter join date to (YYYY-MM-DD)' })
  @ApiQuery({ name: 'branchId', required: false, type: Number, description: 'Filter by branch ID' })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('noPagination') noPagination?: string,
    @Query('gymId') queryGymId?: string,
    @Query('name') filterName?: string,
    @Query('phone') filterPhone?: string,
    @Query('city') filterCity?: string,
    @Query('gender') filterGender?: string,
    @Query('joinDateFrom') joinDateFrom?: string,
    @Query('joinDateTo') joinDateTo?: string,
    @Query('branchId') branchId?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const isSuperAdmin = user.role === 'superadmin';
    // For superadmin, gymId is optional (can view all gyms)
    // For others, use their assigned gymId or query param
    const gymId = isSuperAdmin
      ? queryGymId
        ? parseInt(queryGymId)
        : undefined
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
      name: filterName,
      phone: filterPhone,
      city: filterCity,
      gender: filterGender,
      joinDateFrom,
      joinDateTo,
      branchId: resolveEffectiveBranchId(user, branchId),
    });

    if (res && result.pagination) {
      setPaginationHeaders(res, result.pagination);
    }

    return result.data;
  }

  @Post()
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('clients', 'create')
  @ApiOperation({ summary: 'Create a new user' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createUserDto: CreateUserDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = resolveGymId(
      user.gymId,
      queryGymId,
      user.role === 'superadmin',
    );
    const result = await this.usersService.create(createUserDto, gymId, user.role, {
      id: user.userId,
      name: user.name || user.email,
      role: user.role,
    });
    this.notificationsGateway.emitUserChanged(gymId, { action: 'created' });
    this.rabbitMqService.publish('dashboard.recalculate', { gymId });
    return result;
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
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'Target user ID',
  })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  findOneByHeader(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-user-id') userId: string,
    @Query('gymId') queryGymId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const gymId = resolveGymId(
      user.gymId,
      queryGymId,
      user.role === 'superadmin',
    );
    return this.usersService.findOne(parseInt(userId), gymId);
  }

  @Patch('user')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('clients', 'update')
  @ApiOperation({ summary: 'Update user (header)' })
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'Target user ID',
  })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async updateByHeader(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-user-id') userId: string,
    @Body() updateUserDto: UpdateUserDto,
    @Query('gymId') queryGymId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const gymId = resolveGymId(
      user.gymId,
      queryGymId,
      user.role === 'superadmin',
    );
    const result = await this.usersService.update(parseInt(userId), gymId, updateUserDto);
    this.notificationsGateway.emitUserChanged(gymId, { action: 'updated' });
    this.rabbitMqService.publish('dashboard.recalculate', { gymId });
    return result;
  }

  @Delete('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete user (header)' })
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'Target user ID',
  })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async removeByHeader(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-user-id') userId: string,
    @Query('gymId') queryGymId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const gymId = resolveGymId(
      user.gymId,
      queryGymId,
      user.role === 'superadmin',
    );
    const result = await this.usersService.remove(parseInt(userId), gymId);
    this.notificationsGateway.emitUserChanged(gymId, { action: 'deleted' });
    this.rabbitMqService.publish('dashboard.recalculate', { gymId });
    return result;
  }

  @Patch('user/status')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('clients', 'update')
  @ApiOperation({ summary: 'Update user status (header)' })
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'Target user ID',
  })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async updateStatusByHeader(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-user-id') userId: string,
    @Body() body: { status: string },
    @Query('gymId') queryGymId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const gymId = resolveGymId(
      user.gymId,
      queryGymId,
      user.role === 'superadmin',
    );
    const result = await this.usersService.updateStatus(parseInt(userId), gymId, body.status);
    this.notificationsGateway.emitUserChanged(gymId, { action: 'status_changed' });
    this.rabbitMqService.publish('dashboard.recalculate', { gymId });
    return result;
  }

  @Post('user/reset-password')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('clients', 'update')
  @ApiOperation({ summary: 'Reset user password (admin)' })
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'Target user ID',
  })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  resetPasswordByHeader(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-user-id') userId: string,
    @Body() dto: AdminResetPasswordDto,
    @Query('gymId') queryGymId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const gymId = resolveGymId(
      user.gymId,
      queryGymId,
      user.role === 'superadmin',
    );
    return this.usersService.resetPassword(
      parseInt(userId),
      gymId,
      dto.newPassword,
    );
  }

  @Post('user/regenerate-attendance-code')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('clients', 'update')
  @ApiOperation({ summary: 'Regenerate attendance code for user' })
  @ApiHeader({
    name: 'x-user-id',
    required: true,
    description: 'Target user ID',
  })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  regenerateAttendanceCode(
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-user-id') userId: string,
    @Query('gymId') queryGymId?: string,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    const gymId = resolveGymId(
      user.gymId,
      queryGymId,
      user.role === 'superadmin',
    );
    return this.usersService.regenerateAttendanceCode(parseInt(userId), gymId);
  }

  // ============ MANAGER PERMISSIONS ENDPOINTS ============

  @Patch(':id/permissions')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Update manager permissions for a user' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async updatePermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateManagerPermissionsDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = resolveGymId(
      user.gymId,
      queryGymId,
      user.role === 'superadmin',
    );
    const result = await this.usersService.updateManagerPermissions(
      id,
      gymId,
      dto.permissions,
    );
    this.notificationsGateway.emitUserChanged(gymId, { action: 'updated' });
    return result;
  }

  // ============ REQUEST APPROVAL ENDPOINTS ============

  @Patch(':id/approve')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('admin', 'manager')
  @ManagerPermission('requests', 'update')
  @ApiOperation({
    summary: 'Approve a pending registration request with optional membership',
  })
  async approveRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveRequestDto,
  ) {
    if (!user.gymId) {
      throw new BadRequestException('Gym ID is required for this operation');
    }
    const branchId = resolveEffectiveBranchId(user, undefined);
    const result = await this.usersService.approveRequest(id, user.gymId, dto, branchId);
    this.notificationsGateway.emitUserChanged(user.gymId, { action: 'status_changed' });
    this.rabbitMqService.publish('dashboard.recalculate', { gymId: user.gymId });
    return result;
  }

  @Patch(':id/reject')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('admin', 'manager')
  @ManagerPermission('requests', 'update')
  @ApiOperation({ summary: 'Reject a pending registration request' })
  async rejectRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    if (!user.gymId) {
      throw new BadRequestException('Gym ID is required for this operation');
    }
    const result = await this.usersService.rejectRequest(id, user.gymId);
    this.notificationsGateway.emitUserChanged(user.gymId, { action: 'status_changed' });
    this.rabbitMqService.publish('dashboard.recalculate', { gymId: user.gymId });
    return result;
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
    // Trainers can only view their own client list
    if (user.role === 'trainer' && trainerId !== user.userId) {
      throw new ForbiddenException('Trainers can only view their own clients');
    }
    return this.usersService.getTrainerClients(trainerId, user.gymId);
  }

  @Post('trainers/:trainerId/clients')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('admin', 'manager')
  @ManagerPermission('trainers', 'update')
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
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('admin', 'manager')
  @ManagerPermission('trainers', 'delete')
  @ApiOperation({ summary: 'Remove a client from a trainer' })
  removeClientFromTrainer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('trainerId', ParseIntPipe) trainerId: number,
    @Param('clientId', ParseIntPipe) clientId: number,
  ) {
    if (!user.gymId) {
      throw new BadRequestException('Gym ID is required for this operation');
    }
    return this.usersService.removeClientFromTrainer(
      trainerId,
      clientId,
      user.gymId,
    );
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

  // ============ BULK OPERATIONS ============

  @Get('status-counts')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get user counts grouped by status' })
  @ApiQuery({
    name: 'role',
    required: true,
    type: String,
    description: 'Filter by role (e.g., client, trainer)',
  })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async getStatusCounts(
    @CurrentUser() user: AuthenticatedUser,
    @Query('role') role: string,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') branchId?: string,
  ) {
    const isSuperAdmin = user.role === 'superadmin';
    const gymId = isSuperAdmin
      ? queryGymId
        ? parseInt(queryGymId)
        : undefined
      : resolveGymId(user.gymId, queryGymId, false);
    return this.usersService.getStatusCounts(role, gymId, resolveEffectiveBranchId(user, branchId));
  }

  @Patch('bulk/update')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('clients', 'update')
  @ApiOperation({ summary: 'Bulk update users (move to branch, update status)' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async bulkUpdate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkUpdateUserDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = resolveGymId(
      user.gymId,
      queryGymId,
      user.role === 'superadmin',
    );
    const result = await this.usersService.bulkUpdate(
      dto.userIds,
      { status: dto.status },
      gymId,
      user.role,
    );
    this.notificationsGateway.emitUserChanged(gymId, { action: 'bulk_updated' });
    this.rabbitMqService.publish('dashboard.recalculate', { gymId });
    return result;
  }

  @Delete('bulk/delete')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('clients', 'delete')
  @ApiOperation({ summary: 'Bulk delete users' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async bulkDelete(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkDeleteUserDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = resolveGymId(
      user.gymId,
      queryGymId,
      user.role === 'superadmin',
    );
    const result = await this.usersService.bulkDelete(
      dto.userIds,
      gymId,
      user.role,
      user.userId,
    );
    this.notificationsGateway.emitUserChanged(gymId, { action: 'bulk_deleted' });
    this.rabbitMqService.publish('dashboard.recalculate', { gymId });
    return result;
  }

  // ============ ID-BASED ENDPOINTS (must be last due to :id wildcard) ============

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (optional for superadmin)',
  })
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('gymId') queryGymId?: string,
  ) {
    // Superadmin can view any user without specifying gymId
    const gymId =
      user.role === 'superadmin'
        ? resolveOptionalGymId(user.gymId, queryGymId)
        : resolveGymId(user.gymId, queryGymId, false);
    return this.usersService.findOne(id, gymId as number);
  }

  @Patch(':id')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('clients', 'update')
  @ApiOperation({ summary: 'Update user by ID' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async updateById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = resolveGymId(
      user.gymId,
      queryGymId,
      user.role === 'superadmin',
    );
    const result = await this.usersService.update(
      id,
      gymId,
      updateUserDto,
      undefined,
      user.role,
    );
    this.notificationsGateway.emitUserChanged(gymId, { action: 'updated' });
    this.rabbitMqService.publish('dashboard.recalculate', { gymId });
    return result;
  }

  @Delete(':id')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('clients', 'delete')
  @ApiOperation({ summary: 'Delete user by ID' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async removeById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = resolveGymId(
      user.gymId,
      queryGymId,
      user.role === 'superadmin',
    );
    const result = await this.usersService.remove(id, gymId, undefined, user.role);
    this.notificationsGateway.emitUserChanged(gymId, { action: 'deleted' });
    this.rabbitMqService.publish('dashboard.recalculate', { gymId });
    return result;
  }
}
