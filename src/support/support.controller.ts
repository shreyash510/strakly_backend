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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
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

@ApiTags('support')
@Controller('support')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new support ticket' })
  create(@Request() req: any, @Body() createTicketDto: CreateTicketDto) {
    return this.supportService.create(req.user.userId, createTicketDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all support tickets with optional filters and pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 10, max: 100)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by subject, description, or ticket number' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by status' })
  @ApiQuery({ name: 'category', required: false, type: String, description: 'Filter by category' })
  @ApiQuery({ name: 'priority', required: false, type: String, description: 'Filter by priority' })
  @ApiQuery({ name: 'userId', required: false, type: String, description: 'Filter by user ID' })
  @ApiQuery({ name: 'assignedToId', required: false, type: String, description: 'Filter by assigned user ID' })
  @ApiQuery({ name: 'noPagination', required: false, type: Boolean, description: 'Disable pagination' })
  async findAll(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('priority') priority?: string,
    @Query('userId') userId?: string,
    @Query('assignedToId') assignedToId?: string,
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
        userId: userId ? parseInt(userId) : undefined,
        assignedToId: assignedToId ? parseInt(assignedToId) : undefined,
        noPagination: noPagination === 'true',
      },
      req.user.role,
      req.user.userId
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
  getStats() {
    return this.supportService.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single support ticket' })
  findOne(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.supportService.findOne(id, req.user.userId, req.user.role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a support ticket' })
  update(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateTicketDto: UpdateTicketDto,
  ) {
    return this.supportService.update(
      id,
      updateTicketDto,
      req.user.userId,
      req.user.role,
    );
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Add a message to a support ticket' })
  addMessage(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() addMessageDto: AddMessageDto,
  ) {
    return this.supportService.addMessage(
      id,
      addMessageDto,
      req.user.userId,
      req.user.role,
    );
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete a support ticket (admin only)' })
  remove(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.supportService.remove(id, req.user.userId, req.user.role);
  }
}
