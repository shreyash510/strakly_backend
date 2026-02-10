import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  CreateConversationDto,
  UpdateConversationDto,
  SaveExchangeDto,
} from './dto/conversations.dto';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * List conversations for a user in a gym, newest first.
   */
  async listConversations(userId: number, gymId: number) {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        userId,
        gymId,
        isActive: true,
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        botConversationId: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            role: true,
            createdAt: true,
          },
        },
      },
    });

    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      botConversationId: c.botConversationId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lastMessage: c.messages[0] || null,
    }));
  }

  /**
   * Get full conversation with all messages.
   */
  async getConversation(conversationId: number, userId: number, gymId: number) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation || !conversation.isActive) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId || conversation.gymId !== gymId) {
      throw new ForbiddenException('Access denied');
    }

    return conversation;
  }

  /**
   * Create a new conversation.
   */
  async createConversation(
    userId: number,
    gymId: number,
    dto: CreateConversationDto,
  ) {
    return this.prisma.conversation.create({
      data: {
        userId,
        gymId,
        title: dto.title || 'New conversation',
        botConversationId: dto.botConversationId || null,
      },
    });
  }

  /**
   * Save a complete user+assistant exchange in one call.
   * Creates the conversation if conversationId is null.
   */
  async saveExchange(
    userId: number,
    gymId: number,
    conversationId: number | null,
    dto: SaveExchangeDto,
  ) {
    if (conversationId) {
      const existing = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (!existing || existing.userId !== userId || existing.gymId !== gymId) {
        throw new ForbiddenException('Access denied');
      }
    }

    const autoTitle =
      dto.userMessage.length > 60
        ? dto.userMessage.substring(0, 57) + '...'
        : dto.userMessage;

    return this.prisma.$transaction(async (tx) => {
      let convId = conversationId;

      if (!convId) {
        const conv = await tx.conversation.create({
          data: {
            userId,
            gymId,
            title: autoTitle,
            botConversationId: dto.botConversationId || null,
          },
        });
        convId = conv.id;
      } else if (dto.botConversationId) {
        await tx.conversation.update({
          where: { id: convId },
          data: {
            botConversationId: dto.botConversationId,
            updatedAt: new Date(),
          },
        });
      }

      await tx.conversationMessage.create({
        data: {
          conversationId: convId,
          role: 'user',
          content: dto.userMessage,
        },
      });

      await tx.conversationMessage.create({
        data: {
          conversationId: convId,
          role: 'assistant',
          content: dto.assistantMessage,
          toolsUsed: dto.toolsUsed || [],
          suggestedQuestions: dto.suggestedQuestions || [],
        },
      });

      await tx.conversation.update({
        where: { id: convId },
        data: { updatedAt: new Date() },
      });

      return { conversationId: convId };
    });
  }

  /**
   * Update conversation title.
   */
  async updateConversation(
    conversationId: number,
    userId: number,
    gymId: number,
    dto: UpdateConversationDto,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation || !conversation.isActive) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId || conversation.gymId !== gymId) {
      throw new ForbiddenException('Access denied');
    }

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { title: dto.title },
    });
  }

  /**
   * Soft-delete a conversation.
   */
  async deleteConversation(
    conversationId: number,
    userId: number,
    gymId: number,
  ) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.userId !== userId || conversation.gymId !== gymId) {
      throw new ForbiddenException('Access denied');
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { isActive: false },
    });

    return { success: true, message: 'Conversation deleted' };
  }
}
