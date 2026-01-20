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
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SupportService } from './support.service';
import {
  CreateTicketDto,
  UpdateTicketDto,
  AddMessageDto,
  TicketFilterDto,
} from './dto/support.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

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
  @ApiOperation({ summary: 'Get all support tickets' })
  findAll(
    @Request() req: any,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('priority') priority?: string,
    @Query('userId') userId?: string,
    @Query('assignedToId') assignedToId?: string,
  ) {
    const filters: TicketFilterDto = {};
    if (status) filters.status = status as any;
    if (category) filters.category = category as any;
    if (priority) filters.priority = priority as any;
    if (userId) filters.userId = parseInt(userId);
    if (assignedToId) filters.assignedToId = parseInt(assignedToId);

    return this.supportService.findAll(filters, req.user.role, req.user.userId);
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
