import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateSupportDto, UpdateSupportDto, AddTicketResponseDto, TicketPriority, TicketStatus, TicketCategory } from './dto/create-support.dto';

export interface TicketResponse {
  id: string;
  message: string;
  responderId?: string;
  responderName?: string;
  isStaff: boolean;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  userId: string;
  userName?: string;
  userEmail?: string;
  gymId?: string;
  assignedTo?: string;
  assignedToName?: string;
  resolution?: string;
  responses: TicketResponse[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

@Injectable()
export class SupportService {
  private readonly collectionName = 'support_tickets';

  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(userId: string, filters?: { status?: string; priority?: string; category?: string }): Promise<SupportTicket[]> {
    const tickets = await this.databaseService.getCollection<SupportTicket>(
      this.collectionName,
      userId,
    );

    let filteredTickets = tickets;
    if (filters?.status) {
      filteredTickets = filteredTickets.filter(t => t.status === filters.status);
    }
    if (filters?.priority) {
      filteredTickets = filteredTickets.filter(t => t.priority === filters.priority);
    }
    if (filters?.category) {
      filteredTickets = filteredTickets.filter(t => t.category === filters.category);
    }

    return filteredTickets;
  }

  async findOne(userId: string, id: string): Promise<SupportTicket> {
    const ticket = await this.databaseService.getDocument<SupportTicket>(
      this.collectionName,
      userId,
      id,
    );

    if (!ticket) {
      throw new NotFoundException(`Support ticket with ID ${id} not found`);
    }

    return ticket;
  }

  async create(userId: string, createSupportDto: CreateSupportDto, userInfo?: { name?: string; email?: string }): Promise<SupportTicket> {
    const ticketData = {
      ...createSupportDto,
      userId,
      userName: userInfo?.name,
      userEmail: userInfo?.email,
      category: createSupportDto.category || 'other',
      priority: createSupportDto.priority || 'medium',
      status: 'open' as TicketStatus,
      responses: [],
    };

    return this.databaseService.createDocument<SupportTicket>(
      this.collectionName,
      userId,
      ticketData,
    );
  }

  async update(
    userId: string,
    id: string,
    updateSupportDto: UpdateSupportDto,
  ): Promise<SupportTicket> {
    await this.findOne(userId, id);

    const updateData: any = { ...updateSupportDto };

    // Set resolvedAt if status changed to resolved
    if (updateSupportDto.status === 'resolved' || updateSupportDto.status === 'closed') {
      updateData.resolvedAt = new Date().toISOString();
    }

    const ticket = await this.databaseService.updateDocument<SupportTicket>(
      this.collectionName,
      userId,
      id,
      updateData,
    );

    if (!ticket) {
      throw new NotFoundException(`Support ticket with ID ${id} not found`);
    }

    return ticket;
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    await this.findOne(userId, id);
    await this.databaseService.deleteDocument(this.collectionName, userId, id);
    return { success: true };
  }

  async addResponse(
    userId: string,
    ticketId: string,
    responseDto: AddTicketResponseDto,
    isStaff: boolean = false,
  ): Promise<SupportTicket> {
    const ticket = await this.findOne(userId, ticketId);

    const newResponse: TicketResponse = {
      id: `resp_${Date.now()}`,
      message: responseDto.message,
      responderId: responseDto.responderId,
      responderName: responseDto.responderName,
      isStaff,
      createdAt: new Date().toISOString(),
    };

    const responses = [...ticket.responses, newResponse];

    return this.databaseService.updateDocument<SupportTicket>(
      this.collectionName,
      userId,
      ticketId,
      { responses },
    );
  }

  async assignTicket(userId: string, ticketId: string, assignedTo: string, assignedToName?: string): Promise<SupportTicket> {
    return this.update(userId, ticketId, {
      assignedTo,
      status: 'in_progress'
    });
  }

  async resolveTicket(userId: string, ticketId: string, resolution: string): Promise<SupportTicket> {
    return this.update(userId, ticketId, {
      resolution,
      status: 'resolved'
    });
  }
}
