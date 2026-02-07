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
  Request,
  BadRequestException,
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
import {
  CreateUserDto,
  UpdateUserDto,
  AdminResetPasswordDto,
  ApproveRequestDto,
  BulkUpdateUserDto,
  BulkDeleteUserDto,
  BulkCreateUserDto,
} from './dto/create-user.dto';
import { AssignClientDto } from './dto/trainer-client.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, GymId, UserId, CurrentUser } from '../auth/decorators';
import {
  setPaginationHeaders,
  resolveGymId,
  resolveOptionalGymId,
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
  ) {}

  /**
   * Resolve branchId for filtering:
   * - If user has a specific branch assigned, they can only see their branch
   * - If user is admin with access to all branches, use query param if provided
   * - Otherwise return null (all branches)
   */
  private resolveBranchId(req: any, queryBranchId?: string): number | null {
    // If user has a specific branch assigned, they can only see their branch
    if (req.user.branchId !== null && req.user.branchId !== undefined) {
      return req.user.branchId;
    }
    // User is admin with access to all branches - use query param if provided
    if (queryBranchId && queryBranchId !== 'all' && queryBranchId !== '') {
      return parseInt(queryBranchId);
    }
    return null; // all branches
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
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
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description:
      'Branch ID for filtering (admin only, pass "all" for all branches)',
  })
  async findAll(
    @Request() req: any,
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('noPagination') noPagination?: string,
    @Query('gymId') queryGymId?: string,
    @Query('branchId') queryBranchId?: string,
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

    // Resolve branchId for filtering (non-superadmin only)
    const branchId = isSuperAdmin
      ? null
      : this.resolveBranchId(req, queryBranchId);

    const result = await this.usersService.findAll({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
      role,
      status,
      gymId,
      branchId,
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
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
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
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
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
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
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
    return result;
  }

  @Patch('user/status')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
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
    return result;
  }

  @Post('user/reset-password')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
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
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
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

  @Get('role/:role')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get users by role' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async findByRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('role') role: string,
    @Query('gymId') queryGymId?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const gymId = resolveGymId(
      user.gymId,
      queryGymId,
      user.role === 'superadmin',
    );
    const result = await this.usersService.findByRole(role, gymId);

    if (res && result.pagination) {
      setPaginationHeaders(res, result.pagination);
    }

    return result.data;
  }

  // ============ REQUEST APPROVAL ENDPOINTS ============

  @Patch(':id/approve')
  @UseGuards(RolesGuard)
  @Roles('admin', 'branch_admin', 'manager')
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
    const result = await this.usersService.approveRequest(id, user.gymId, dto);
    this.notificationsGateway.emitUserChanged(user.gymId, { action: 'status_changed' });
    return result;
  }

  @Patch(':id/reject')
  @UseGuards(RolesGuard)
  @Roles('admin', 'branch_admin', 'manager')
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
    return result;
  }

  // ============ TRAINER-CLIENT ASSIGNMENT ENDPOINTS ============

  @Get('trainer-clients/all')
  @UseGuards(RolesGuard)
  @Roles('admin', 'branch_admin', 'manager')
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
  @Roles('admin', 'branch_admin', 'manager')
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
  @Roles('admin', 'branch_admin', 'manager')
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

  @Post('bulk/create')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Bulk create users (max 50)' })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async bulkCreate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BulkCreateUserDto,
    @Query('gymId') queryGymId?: string,
  ) {
    const gymId = resolveGymId(
      user.gymId,
      queryGymId,
      user.role === 'superadmin',
    );

    // Propagate top-level branchId to each user that doesn't already have one
    if (dto.branchId) {
      for (const u of dto.users) {
        if (!u.branchId) {
          u.branchId = dto.branchId;
        }
      }
    }

    const result = await this.usersService.bulkCreate(dto.users, gymId, user.role, {
      id: user.userId,
      name: user.name || user.email,
      role: user.role,
    });
    this.notificationsGateway.emitUserChanged(gymId, { action: 'bulk_created' });
    return result;
  }

  @Get('status-counts')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get user counts grouped by status' })
  @ApiQuery({
    name: 'role',
    required: true,
    type: String,
    description: 'Filter by role (e.g., client, trainer)',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: Number,
    description: 'Branch ID for filtering',
  })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: Number,
    description: 'Gym ID (required for superadmin)',
  })
  async getStatusCounts(
    @Request() req: any,
    @CurrentUser() user: AuthenticatedUser,
    @Query('role') role: string,
    @Query('branchId') queryBranchId?: string,
    @Query('gymId') queryGymId?: string,
  ) {
    const isSuperAdmin = user.role === 'superadmin';
    const gymId = isSuperAdmin
      ? queryGymId
        ? parseInt(queryGymId)
        : undefined
      : resolveGymId(user.gymId, queryGymId, false);
    const branchId = isSuperAdmin
      ? null
      : this.resolveBranchId(req, queryBranchId);
    return this.usersService.getStatusCounts(role, gymId, branchId);
  }

  @Patch('bulk/update')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
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
      { branchIds: dto.branchIds, status: dto.status },
      gymId,
      user.role,
    );
    this.notificationsGateway.emitUserChanged(gymId, { action: 'bulk_updated' });
    return result;
  }

  @Delete('bulk/delete')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
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
    return result;
  }

  // ============ ID-BASED ENDPOINTS (must be last due to :id wildcard) ============

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
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
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
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
    return result;
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
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
    return result;
  }
}
