import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { ROLES } from '../common/constants';
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
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private prisma: PrismaService,
    private tenantService: TenantService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
  ) {}

  private generateTicketNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TKT-${timestamp}-${random}`;
  }

  async create(
    userId: number,
    gymId: number,
    userName: string,
    userEmail: string,
    userType: string,
    createTicketDto: CreateTicketDto,
  ) {
    const ticketNumber = this.generateTicketNumber();

    const ticket = await this.prisma.supportTicket.create({
      data: {
        ticketNumber,
        subject: createTicketDto.subject,
        description: createTicketDto.description,
        category: createTicketDto.category || 'general',
        priority: createTicketDto.priority || 'medium',
        userId: userId,
        userEmail: userEmail,
        userName: userName,
        userType: userType || ROLES.CLIENT,
        gymId: gymId,
        status: 'open',
      },
    });

    await this.prisma.supportTicketMessage.create({
      data: {
        ticketId: ticket.id,
        message: createTicketDto.description,
        senderId: userId,
        senderName: userName,
        senderType: 'user',
      },
    });

    // Notify superadmins about new support ticket (non-blocking)
    this.notificationsService
      .notifySupportTicketCreated({
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        priority: ticket.priority,
      })
      .catch((error) => {
        this.logger.error('Failed to send support ticket notification', error);
      });

    return this.findOne(ticket.id, userId, undefined, gymId);
  }

  async findAll(
    filters: SupportFilters,
    userRole: string,
    userId?: number,
    userGymId?: number,
  ): Promise<PaginatedResponse<Record<string, any>>> {
    const { page, limit, skip, take, noPagination } =
      getPaginationParams(filters);
    const isSuperadmin = userRole === ROLES.SUPERADMIN;
    const isAdmin = ([ROLES.SUPERADMIN, ROLES.ADMIN] as string[]).includes(userRole);

    const where: Record<string, any> = { isActive: true };

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
      where.gymId = userGymId;
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
        { userName: { contains: filters.search, mode: 'insensitive' } },
        { userEmail: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await this.prisma.supportTicket.count({ where });

    /* Get paginated data with gym relation included */
    const tickets = await this.prisma.supportTicket.findMany({
      where,
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
      include: {
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
            senderName: true,
            senderType: true,
            createdAt: true,
          },
        },
      },
      skip,
      take,
    });

    const ticketsWithUserInfo = tickets.map((ticket) => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      gymId: ticket.gymId,
      assignedToId: ticket.assignedToId,
      resolution: ticket.resolution,
      resolvedAt: ticket.resolvedAt,
      closedAt: ticket.closedAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      gym: ticket.gym,
      user: {
        id: ticket.userId,
        name: ticket.userName,
        email: ticket.userEmail,
      },
      lastMessage: ticket.messages[0] || null,
    }));

    return {
      data: ticketsWithUserInfo,
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  async findOne(
    ticketId: number,
    userId?: number,
    userRole?: string,
    userGymId?: number,
  ) {
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

    const isSuperadmin = userRole === ROLES.SUPERADMIN;
    const isAdmin = userRole && ([ROLES.SUPERADMIN, ROLES.ADMIN] as string[]).includes(userRole);

    // Multi-tenancy access control
    if (!isSuperadmin && isAdmin && userGymId && ticket.gymId !== userGymId) {
      throw new ForbiddenException('You can only view tickets from your gym');
    }

    if (!isAdmin && userId && ticket.userId !== userId) {
      throw new ForbiddenException('You can only view your own tickets');
    }

    const messagesWithSenderInfo = ticket.messages.map((message) => ({
      id: message.id,
      message: message.message,
      senderId: message.senderId,
      senderName: message.senderName,
      senderType: message.senderType,
      attachment: message.attachment,
      createdAt: message.createdAt,
    }));

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      gymId: ticket.gymId,
      assignedToId: ticket.assignedToId,
      resolution: ticket.resolution,
      resolvedAt: ticket.resolvedAt,
      closedAt: ticket.closedAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      gym: ticket.gym,
      user: {
        id: ticket.userId,
        name: ticket.userName,
        email: ticket.userEmail,
      },
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

    const isSuperadmin = userRole === ROLES.SUPERADMIN;
    const isAdmin = ([ROLES.SUPERADMIN, ROLES.ADMIN] as string[]).includes(userRole);

    // Multi-tenancy access control
    if (!isSuperadmin && isAdmin && userGymId && ticket.gymId !== userGymId) {
      throw new ForbiddenException('You can only update tickets from your gym');
    }

    if (!isAdmin) {
      if (ticket.userId !== userId) {
        throw new ForbiddenException('You can only update your own tickets');
      }
      const allowedFields = ['subject', 'description', 'category'];
      const updateData: Record<string, any> = {};
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

    const updateData: Record<string, any> = { ...updateTicketDto };

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

    // Send notification and email when ticket is resolved
    if (updateTicketDto.status === 'resolved' && ticket.status !== 'resolved') {
      // Send in-app notification (non-blocking)
      this.notificationsService
        .notifySupportTicketResolved(ticket.userId, ticket.gymId, {
          ticketId: ticket.id,
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
        })
        .catch((error: unknown) => {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to send ticket resolved notification: ${msg}`,
          );
        });

      // Send email notification (non-blocking)
      this.emailService
        .sendTicketResolvedEmail(
          ticket.userEmail,
          ticket.userName,
          ticket.ticketNumber,
          ticket.subject,
          updateTicketDto.resolution,
        )
        .catch((error: unknown) => {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to send ticket resolved email: ${msg}`,
          );
        });
    }

    return this.findOne(updatedTicket.id, userId, userRole, userGymId);
  }

  async addMessage(
    ticketId: number,
    addMessageDto: AddMessageDto,
    senderId: number,
    senderName: string,
    userRole: string,
    userGymId?: number,
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const isSuperadmin = userRole === ROLES.SUPERADMIN;
    const isAdmin = ([ROLES.SUPERADMIN, ROLES.ADMIN] as string[]).includes(userRole);

    // Multi-tenancy access control
    if (!isSuperadmin && isAdmin && userGymId && ticket.gymId !== userGymId) {
      throw new ForbiddenException(
        'You can only add messages to tickets from your gym',
      );
    }

    if (!isAdmin && ticket.userId !== senderId) {
      throw new ForbiddenException(
        'You can only add messages to your own tickets',
      );
    }

    const senderType = isAdmin ? 'admin' : 'user';

    await this.prisma.supportTicketMessage.create({
      data: {
        ticketId,
        message: addMessageDto.message,
        senderId,
        senderName,
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

  async remove(
    ticketId: number,
    userId: number,
    userRole: string,
    userGymId?: number,
  ) {
    const isSuperadmin = userRole === ROLES.SUPERADMIN;
    const isAdmin = ([ROLES.SUPERADMIN, ROLES.ADMIN] as string[]).includes(userRole);

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

    // Soft delete
    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { isActive: false },
    });

    return { success: true, message: 'Ticket deleted successfully' };
  }

  async getStats(gymId?: number) {
    const where: Record<string, any> = { isActive: true };

    if (gymId) {
      where.gymId = gymId;
    }

    const [total, open, inProgress, resolved, closed] = await Promise.all([
      this.prisma.supportTicket.count({ where }),
      this.prisma.supportTicket.count({ where: { ...where, status: 'open' } }),
      this.prisma.supportTicket.count({
        where: { ...where, status: 'in_progress' },
      }),
      this.prisma.supportTicket.count({
        where: { ...where, status: 'resolved' },
      }),
      this.prisma.supportTicket.count({
        where: { ...where, status: 'closed' },
      }),
    ]);

    const byCategory = await this.prisma.supportTicket.groupBy({
      by: ['category'],
      where,
      _count: true,
    });

    const byPriority = await this.prisma.supportTicket.groupBy({
      by: ['priority'],
      where,
      _count: true,
    });

    return {
      total,
      byStatus: { open, inProgress, resolved, closed },
      byCategory: byCategory.reduce(
        (acc, item) => {
          acc[item.category] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      byPriority: byPriority.reduce(
        (acc, item) => {
          acc[item.priority] = item._count;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }
}
