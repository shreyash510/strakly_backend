import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  CreateTicketDto,
  UpdateTicketDto,
  AddMessageDto,
  TicketFilterDto,
} from './dto/support.dto';

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  // Generate unique ticket number
  private generateTicketNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TKT-${timestamp}-${random}`;
  }

  // Create a new support ticket
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

    // Add initial message
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

  // Get all tickets (admin) or user's tickets
  async findAll(filters: TicketFilterDto, userRole: string, userId?: number) {
    const isAdmin = ['superadmin', 'admin'].includes(userRole);

    const where: any = {};

    // Non-admin users can only see their own tickets
    if (!isAdmin) {
      where.userId = userId;
    } else if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.priority) {
      where.priority = filters.priority;
    }

    if (filters.assignedToId) {
      where.assignedToId = filters.assignedToId;
    }

    const tickets = await this.prisma.supportTicket.findMany({
      where,
      orderBy: [
        { status: 'asc' }, // Open tickets first
        { priority: 'desc' }, // High priority first
        { createdAt: 'desc' },
      ],
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Get user info for each ticket
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

    return ticketsWithUserInfo;
  }

  // Get single ticket by ID
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

    // Check permission - non-admin can only view their own tickets
    const isAdmin = userRole && ['superadmin', 'admin'].includes(userRole);
    if (!isAdmin && userId && ticket.userId !== userId) {
      throw new ForbiddenException('You can only view your own tickets');
    }

    // Get user info
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

    // Get sender info for each message
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

  // Update ticket (admin only for most fields)
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

    // Non-admin can only update their own tickets and only certain fields
    if (!isAdmin) {
      if (ticket.userId !== userId) {
        throw new ForbiddenException('You can only update your own tickets');
      }
      // Non-admin can only update subject, description, category
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

    // Admin can update all fields
    const updateData: any = { ...updateTicketDto };

    // Handle status changes
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

  // Add message to ticket
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

    // Non-admin can only add messages to their own tickets
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

    // If admin responds to an open ticket, change status to in_progress
    if (isAdmin && ticket.status === 'open') {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'in_progress' },
      });
    }

    return this.findOne(ticketId, senderId, userRole);
  }

  // Delete ticket (admin only)
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

  // Get ticket statistics (admin only)
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
