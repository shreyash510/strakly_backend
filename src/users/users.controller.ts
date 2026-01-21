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
  Request,
  Res,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { setPaginationHeaders } from '../common/pagination.util';

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
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('noPagination') noPagination?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.usersService.findAll({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
      role,
      status,
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
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
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
  @ApiOperation({ summary: 'Get single user by ID (header)' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  findOneByHeader(@Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.usersService.findOne(parseInt(userId));
  }

  @Patch('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Update user (header)' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  updateByHeader(@Headers('x-user-id') userId: string, @Body() updateUserDto: UpdateUserDto) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.usersService.update(parseInt(userId), updateUserDto);
  }

  @Delete('user')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete user (header)' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  removeByHeader(@Headers('x-user-id') userId: string) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.usersService.remove(parseInt(userId));
  }

  @Patch('user/status')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Update user status (header)' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  updateStatusByHeader(@Headers('x-user-id') userId: string, @Body() body: { status: string }) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.usersService.updateStatus(parseInt(userId), body.status);
  }

  @Post('user/reset-password')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Reset user password (admin)' })
  @ApiHeader({ name: 'x-user-id', required: true, description: 'Target user ID' })
  resetPasswordByHeader(
    @Headers('x-user-id') userId: string,
    @Body() dto: ResetPasswordDto,
  ) {
    if (!userId) throw new BadRequestException('x-user-id header is required');
    return this.usersService.resetPassword(parseInt(userId), dto.newPassword);
  }

  @Get('role/:role')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get users by role' })
  async findByRole(
    @Param('role') role: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.usersService.findByRole(role);

    if (res && result.pagination) {
      setPaginationHeaders(res, result.pagination);
    }

    return result.data;
  }

  // ============ ID-BASED ENDPOINTS (must be last due to :id wildcard) ============

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get user by ID' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Update user by ID' })
  updateById(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete user by ID' })
  removeById(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }
}
