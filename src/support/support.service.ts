import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  CreateTicketDto,
  UpdateTicketDto,
  AddMessageDto,
  TicketFilterDto,
} from './dto/support.dto';
import {
  PaginationParams,
  PaginatedResponse,
  getPaginationParams,
  createPaginationMeta,
} from '../common/pagination.util';

export interface SupportFilters extends PaginationParams {
  status?: string;
  category?: string;
  priority?: string;
  userId?: number;
  assignedToId?: number;
}

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  private generateTicketNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TKT-${timestamp}-${random}`;
  }

  async create(userId: number, createTicketDto: CreateTicketDto) {
    const ticketNumber = this.generateTicketNumber();

    const ticket = await this.prisma.supportTicket.create({
      data: {
        ticketNumber,
        subject: createTicketDto.subject,
        description: createTicketDto.description,
        category: createTicketDto.category || 'general',
        priority: createTicketDto.priority || 'medium',
        userId,
        status: 'open',
      },
    });

    await this.prisma.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        message: createTicketDto.description,
        senderId: userId,
        senderType: 'user',
      },
    });

    return this.findOne(ticket.id, userId);
  }

  async findAll(
    filters: SupportFilters,
    userRole: string,
    userId?: number
  ): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } = getPaginationParams(filters);
    const isAdmin = ['superadmin', 'admin'].includes(userRole);

    const where: any = {};

    if (!isAdmin) {
      where.userId = userId;
    } else if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.status && filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.category && filters.category !== 'all') {
      where.category = filters.category;
    }

    if (filters.priority && filters.priority !== 'all') {
      where.priority = filters.priority;
    }

    if (filters.assignedToId) {
      where.assignedToId = filters.assignedToId;
    }

    // Apply search filter
    if (filters.search) {
      where.OR = [
        { subject: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { ticketNumber: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await this.prisma.supportTicket.count({ where });

    // Get paginated data
    const tickets = await this.prisma.supportTicket.findMany({
      where,
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      skip,
      take,
    });

    const ticketsWithUserInfo = await Promise.all(
      tickets.map(async (ticket) => {
        const user = await this.prisma.user.findUnique({
          where: { id: ticket.userId },
          select: { id: true, name: true, email: true },
        });

        let assignedTo: { id: number; name: string; email: string } | null = null;
        if (ticket.assignedToId) {
          assignedTo = await this.prisma.user.findUnique({
            where: { id: ticket.assignedToId },
            select: { id: true, name: true, email: true },
          });
        }

        return {
          ...ticket,
          user,
          assignedTo,
          lastMessage: ticket.messages[0] || null,
          messages: undefined,
        };
      }),
    );

    return {
      data: ticketsWithUserInfo,
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  async findOne(ticketId: number, userId?: number, userRole?: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const isAdmin = userRole && ['superadmin', 'admin'].includes(userRole);
    if (!isAdmin && userId && ticket.userId !== userId) {
      throw new ForbiddenException('You can only view your own tickets');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: ticket.userId },
      select: { id: true, name: true, email: true },
    });

    let assignedTo: { id: number; name: string; email: string } | null = null;
    if (ticket.assignedToId) {
      assignedTo = await this.prisma.user.findUnique({
        where: { id: ticket.assignedToId },
        select: { id: true, name: true, email: true },
      });
    }

    const messagesWithSenderInfo = await Promise.all(
      ticket.messages.map(async (message) => {
        const sender = await this.prisma.user.findUnique({
          where: { id: message.senderId },
          select: { id: true, name: true, email: true },
        });
        return {
          ...message,
          sender,
        };
      }),
    );

    return {
      ...ticket,
      user,
      assignedTo,
      messages: messagesWithSenderInfo,
    };
  }

  async update(
    ticketId: number,
    updateTicketDto: UpdateTicketDto,
    userId: number,
    userRole: string,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const isAdmin = ['superadmin', 'admin'].includes(userRole);

    if (!isAdmin) {
      if (ticket.userId !== userId) {
        throw new ForbiddenException('You can only update your own tickets');
      }
      const allowedFields = ['subject', 'description', 'category'];
      const updateData: any = {};
      for (const field of allowedFields) {
        if (updateTicketDto[field] !== undefined) {
          updateData[field] = updateTicketDto[field];
        }
      }
      return this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: updateData,
      });
    }

    const updateData: any = { ...updateTicketDto };

    if (updateTicketDto.status === 'resolved' && !ticket.resolvedAt) {
      updateData.resolvedAt = new Date();
    }

    if (updateTicketDto.status === 'closed' && !ticket.closedAt) {
      updateData.closedAt = new Date();
    }

    const updatedTicket = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: updateData,
    });

    return this.findOne(updatedTicket.id, userId, userRole);
  }

  async addMessage(
    ticketId: number,
    addMessageDto: AddMessageDto,
    senderId: number,
    userRole: string,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const isAdmin = ['superadmin', 'admin'].includes(userRole);

    if (!isAdmin && ticket.userId !== senderId) {
      throw new ForbiddenException('You can only add messages to your own tickets');
    }

    const senderType = isAdmin ? 'admin' : 'user';

    await this.prisma.supportTicketMessage.create({
      data: {
        ticketId,
        message: addMessageDto.message,
        senderId,
        senderType,
        attachment: addMessageDto.attachment,
      },
    });

    if (isAdmin && ticket.status === 'open') {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'in_progress' },
      });
    }

    return this.findOne(ticketId, senderId, userRole);
  }

  async remove(ticketId: number, userId: number, userRole: string) {
    const isAdmin = ['superadmin', 'admin'].includes(userRole);

    if (!isAdmin) {
      throw new ForbiddenException('Only admins can delete tickets');
    }

    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    await this.prisma.supportTicket.delete({
      where: { id: ticketId },
    });

    return { success: true, message: 'Ticket deleted successfully' };
  }

  async getStats() {
    const [total, open, inProgress, resolved, closed] = await Promise.all([
      this.prisma.supportTicket.count(),
      this.prisma.supportTicket.count({ where: { status: 'open' } }),
      this.prisma.supportTicket.count({ where: { status: 'in_progress' } }),
      this.prisma.supportTicket.count({ where: { status: 'resolved' } }),
      this.prisma.supportTicket.count({ where: { status: 'closed' } }),
    ]);

    const byCategory = await this.prisma.supportTicket.groupBy({
      by: ['category'],
      _count: { id: true },
    });

    const byPriority = await this.prisma.supportTicket.groupBy({
      by: ['priority'],
      _count: { id: true },
    });

    return {
      total,
      byStatus: { open, inProgress, resolved, closed },
      byCategory: byCategory.reduce(
        (acc, item) => {
          acc[item.category] = item._count.id;
          return acc;
        },
        {} as Record<string, number>,
      ),
      byPriority: byPriority.reduce(
        (acc, item) => {
          acc[item.priority] = item._count.id;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }
}
