import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import {
  CreateConversationDto,
  UpdateConversationDto,
  SaveExchangeDto,
} from './dto/conversations.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { PLAN_FEATURES } from '../common/constants/features';
import type { AuthenticatedRequest } from '../common/types';

@ApiTags('conversations')
@Controller('conversations')
@UseGuards(JwtAuthGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.AI_CHAT)
@ApiBearerAuth()
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all conversations for the current user' })
  listConversations(@Request() req: AuthenticatedRequest) {
    return this.conversationsService.listConversations(
      req.user.userId,
      req.user.gymId!,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation with all messages' })
  getConversation(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.conversationsService.getConversation(
      id,
      req.user.userId,
      req.user.gymId!,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Create a new conversation' })
  createConversation(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateConversationDto,
  ) {
    return this.conversationsService.createConversation(
      req.user.userId,
      req.user.gymId!,
      dto,
    );
  }

  @Post('exchange')
  @ApiOperation({ summary: 'Save exchange to a new conversation' })
  saveExchangeNew(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SaveExchangeDto,
  ) {
    return this.conversationsService.saveExchange(
      req.user.userId,
      req.user.gymId!,
      null,
      dto,
    );
  }

  @Post(':id/exchange')
  @ApiOperation({ summary: 'Save a user+assistant message exchange' })
  saveExchange(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveExchangeDto,
  ) {
    return this.conversationsService.saveExchange(
      req.user.userId,
      req.user.gymId!,
      id,
      dto,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update conversation title' })
  updateConversation(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.updateConversation(
      id,
      req.user.userId,
      req.user.gymId!,
      dto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a conversation' })
  deleteConversation(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.conversationsService.deleteConversation(
      id,
      req.user.userId,
      req.user.gymId!,
    );
  }
}
