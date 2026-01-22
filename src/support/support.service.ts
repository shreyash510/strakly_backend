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
  gymId?: number;
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

    // Get user's gymId for multi-tenancy
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { gymId: true },
    });

    const ticket = await this.prisma.supportTicket.create({
      data: {
        ticketNumber,
        subject: createTicketDto.subject,
        description: createTicketDto.description,
        category: createTicketDto.category || 'general',
        priority: createTicketDto.priority || 'medium',
        userId,
        gymId: user?.gymId || null,
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
    userId?: number,
    userGymId?: number
  ): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } = getPaginationParams(filters);
    const isSuperadmin = userRole === 'superadmin';
    const isAdmin = ['superadmin', 'admin'].includes(userRole);

    const where: any = {};

    // Multi-tenancy: Filter by gym
    if (isSuperadmin) {
      // Superadmin can see all tickets, optionally filter by gymId
      if (filters.gymId) {
        where.gymId = filters.gymId;
      }
    } else if (isAdmin) {
      // Admin can only see tickets from their gym
      if (userGymId) {
        where.gymId = userGymId;
      }
    } else {
      // Regular users can only see their own tickets
      where.userId = userId;
    }

    if (filters.userId) {
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

    /* Get paginated data with user and gym relations included to avoid N+1 queries */
    const tickets = await this.prisma.supportTicket.findMany({
      where,
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        description: true,
        category: true,
        priority: true,
        status: true,
        userId: true,
        gymId: true,
        assignedToId: true,
        resolution: true,
        resolvedAt: true,
        closedAt: true,
        createdAt: true,
        updatedAt: true,
        gym: {
          select: {
            id: true,
            name: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            message: true,
            senderId: true,
            senderType: true,
            createdAt: true,
          },
        },
      },
      skip,
      take,
    });

    /* Batch fetch all users in one query instead of N+1 */
    const userIds = new Set<number>();
    tickets.forEach(ticket => {
      userIds.add(ticket.userId);
      if (ticket.assignedToId) userIds.add(ticket.assignedToId);
    });

    const users = await this.prisma.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, name: true, email: true },
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    const ticketsWithUserInfo = tickets.map(ticket => ({
      ...ticket,
      user: userMap.get(ticket.userId) || null,
      assignedTo: ticket.assignedToId ? userMap.get(ticket.assignedToId) || null : null,
      lastMessage: ticket.messages[0] || null,
      messages: undefined,
    }));

    return {
      data: ticketsWithUserInfo,
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  async findOne(ticketId: number, userId?: number, userRole?: string, userGymId?: number) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
        gym: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const isSuperadmin = userRole === 'superadmin';
    const isAdmin = userRole && ['superadmin', 'admin'].includes(userRole);

    // Multi-tenancy access control
    if (!isSuperadmin && isAdmin && userGymId && ticket.gymId !== userGymId) {
      throw new ForbiddenException('You can only view tickets from your gym');
    }

    if (!isAdmin && userId && ticket.userId !== userId) {
      throw new ForbiddenException('You can only view your own tickets');
    }

    /* Batch fetch all users (ticket owner, assignee, message senders) in one query */
    const userIds = new Set<number>();
    userIds.add(ticket.userId);
    if (ticket.assignedToId) userIds.add(ticket.assignedToId);
    ticket.messages.forEach(m => userIds.add(m.senderId));

    const users = await this.prisma.user.findMany({
      where: { id: { in: Array.from(userIds) } },
      select: { id: true, name: true, email: true },
    });

    const userMap = new Map(users.map(u => [u.id, u]));

    const messagesWithSenderInfo = ticket.messages.map(message => ({
      ...message,
      sender: userMap.get(message.senderId) || null,
    }));

    return {
      ...ticket,
      user: userMap.get(ticket.userId) || null,
      assignedTo: ticket.assignedToId ? userMap.get(ticket.assignedToId) || null : null,
      messages: messagesWithSenderInfo,
    };
  }

  async update(
    ticketId: number,
    updateTicketDto: UpdateTicketDto,
    userId: number,
    userRole: string,
    userGymId?: number,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const isSuperadmin = userRole === 'superadmin';
    const isAdmin = ['superadmin', 'admin'].includes(userRole);

    // Multi-tenancy access control
    if (!isSuperadmin && isAdmin && userGymId && ticket.gymId !== userGymId) {
      throw new ForbiddenException('You can only update tickets from your gym');
    }

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

    return this.findOne(updatedTicket.id, userId, userRole, userGymId);
  }

  async addMessage(
    ticketId: number,
    addMessageDto: AddMessageDto,
    senderId: number,
    userRole: string,
    userGymId?: number,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const isSuperadmin = userRole === 'superadmin';
    const isAdmin = ['superadmin', 'admin'].includes(userRole);

    // Multi-tenancy access control
    if (!isSuperadmin && isAdmin && userGymId && ticket.gymId !== userGymId) {
      throw new ForbiddenException('You can only add messages to tickets from your gym');
    }

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

    return this.findOne(ticketId, senderId, userRole, userGymId);
  }

  async remove(ticketId: number, userId: number, userRole: string, userGymId?: number) {
    const isSuperadmin = userRole === 'superadmin';
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

    // Multi-tenancy access control
    if (!isSuperadmin && userGymId && ticket.gymId !== userGymId) {
      throw new ForbiddenException('You can only delete tickets from your gym');
    }

    await this.prisma.supportTicket.delete({
      where: { id: ticketId },
    });

    return { success: true, message: 'Ticket deleted successfully' };
  }

  async getStats(gymId?: number) {
    /* For gym-specific stats, first get user IDs belonging to the gym */
    let userFilter: { userId?: { in: number[] } } = {};

    if (gymId) {
      const gymUsers = await this.prisma.user.findMany({
        where: { gymId },
        select: { id: true },
      });
      const userIds = gymUsers.map(u => u.id);
      userFilter = { userId: { in: userIds } };
    }

    const [total, open, inProgress, resolved, closed] = await Promise.all([
      this.prisma.supportTicket.count({ where: userFilter }),
      this.prisma.supportTicket.count({ where: { ...userFilter, status: 'open' } }),
      this.prisma.supportTicket.count({ where: { ...userFilter, status: 'in_progress' } }),
      this.prisma.supportTicket.count({ where: { ...userFilter, status: 'resolved' } }),
      this.prisma.supportTicket.count({ where: { ...userFilter, status: 'closed' } }),
    ]);

    const byCategory = await this.prisma.supportTicket.groupBy({
      by: ['category'],
      where: userFilter,
      _count: { _all: true },
    });

    const byPriority = await this.prisma.supportTicket.groupBy({
      by: ['priority'],
      where: userFilter,
      _count: { _all: true },
    });

    return {
      total,
      byStatus: { open, inProgress, resolved, closed },
      byCategory: byCategory.reduce(
        (acc, item) => {
          acc[item.category] = item._count._all;
          return acc;
        },
        {} as Record<string, number>,
      ),
      byPriority: byPriority.reduce(
        (acc, item) => {
          acc[item.priority] = item._count._all;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }
}
