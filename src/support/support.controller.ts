import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Res,
  ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { SupportService } from './support.service';
import {
  CreateTicketDto,
  UpdateTicketDto,
  AddMessageDto,
} from './dto/support.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { setPaginationHeaders } from '../common/pagination.util';
import type { AuthenticatedRequest } from '../common/types';

@ApiTags('support')
@Controller('support')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new support ticket' })
  create(@Request() req: AuthenticatedRequest, @Body() createTicketDto: CreateTicketDto) {
    // Determine user type: staff roles are 'staff', others are 'client'
    const userType = ['admin', 'manager', 'trainer'].includes(req.user.role)
      ? 'staff'
      : 'client';
    return this.supportService.create(
      req.user.userId,
      req.user.gymId!,
      req.user.name,
      req.user.email,
      userType,
      createTicketDto,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get all support tickets with optional filters and pagination',
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
    description: 'Search by subject, description, or ticket number',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    description: 'Filter by status',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    type: String,
    description: 'Filter by category',
  })
  @ApiQuery({
    name: 'priority',
    required: false,
    type: String,
    description: 'Filter by priority',
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    type: String,
    description: 'Filter by user ID',
  })
  @ApiQuery({
    name: 'assignedToId',
    required: false,
    type: String,
    description: 'Filter by assigned user ID',
  })
  @ApiQuery({
    name: 'gymId',
    required: false,
    type: String,
    description: 'Filter by gym ID (superadmin only)',
  })
  @ApiQuery({
    name: 'noPagination',
    required: false,
    type: Boolean,
    description: 'Disable pagination',
  })
  async findAll(
    @Request() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('priority') priority?: string,
    @Query('userId') filterUserId?: string,
    @Query('assignedToId') assignedToId?: string,
    @Query('gymId') gymId?: string,
    @Query('noPagination') noPagination?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.supportService.findAll(
      {
        page: page ? parseInt(page) : undefined,
        limit: limit ? parseInt(limit) : undefined,
        search,
        status,
        category,
        priority,
        userId: filterUserId ? parseInt(filterUserId) : undefined,
        assignedToId: assignedToId ? parseInt(assignedToId) : undefined,
        gymId: gymId ? parseInt(gymId) : undefined,
        noPagination: noPagination === 'true',
      },
      req.user.role,
      req.user.userId,
      req.user.gymId ?? undefined,
    );

    if (res && result.pagination) {
      setPaginationHeaders(res, result.pagination);
    }

    return result.data;
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Get support ticket statistics (admin only)' })
  getStats(@Request() req: AuthenticatedRequest) {
    /* Superadmin can see all stats, others only see their gym's stats */
    const gymId = req.user.role === 'superadmin' ? undefined : req.user.gymId ?? undefined;
    return this.supportService.getStats(gymId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single support ticket' })
  findOne(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.supportService.findOne(
      id,
      req.user.userId,
      req.user.role,
      req.user.gymId ?? undefined,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a support ticket' })
  update(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTicketDto: UpdateTicketDto,
  ) {
    return this.supportService.update(
      id,
      updateTicketDto,
      req.user.userId,
      req.user.role,
      req.user.gymId ?? undefined,
    );
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Add a message to a support ticket' })
  addMessage(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() addMessageDto: AddMessageDto,
  ) {
    return this.supportService.addMessage(
      id,
      addMessageDto,
      req.user.userId,
      req.user.name,
      req.user.role,
      req.user.gymId ?? undefined,
    );
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete a support ticket (admin only)' })
  remove(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.supportService.remove(
      id,
      req.user.userId,
      req.user.role,
      req.user.gymId ?? undefined,
    );
  }
}
