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
  Res,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ContactRequestsService } from './contact-requests.service';
import { CreateContactRequestDto, UpdateContactRequestDto } from './dto/contact-request.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { setPaginationHeaders } from '../common/pagination.util';

@ApiTags('contact-requests')
@Controller('contact-requests')
export class ContactRequestsController {
  constructor(private readonly contactRequestsService: ContactRequestsService) {}

  // Public endpoint - no auth required
  @Post()
  @ApiOperation({ summary: 'Submit a contact request (public)' })
  create(@Body() dto: CreateContactRequestDto) {
    return this.contactRequestsService.create(dto);
  }

  // Protected endpoints - superadmin only
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all contact requests (superadmin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by status (new/read/replied/closed)' })
  @ApiQuery({ name: 'noPagination', required: false, type: Boolean })
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('noPagination') noPagination?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.contactRequestsService.findAll({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      search,
      status,
      noPagination: noPagination === 'true',
    });

    if (res && result.pagination) {
      setPaginationHeaders(res, result.pagination);
    }

    return result.data;
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get contact request statistics (superadmin only)' })
  getStats() {
    return this.contactRequestsService.getStats();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get contact request by ID (superadmin only)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contactRequestsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update contact request (superadmin only)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContactRequestDto,
    @Request() req: any,
  ) {
    return this.contactRequestsService.update(id, dto, req.user?.id);
  }

  @Post(':id/mark-read')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark contact request as read (superadmin only)' })
  markAsRead(@Param('id', ParseIntPipe) id: number) {
    return this.contactRequestsService.markAsRead(id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete contact request (superadmin only)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.contactRequestsService.remove(id);
  }
}
