import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from '../email/email.service';
import { CreateContactRequestDto, UpdateContactRequestDto } from './dto/contact-request.dto';
import {
  PaginationParams,
  PaginatedResponse,
  getPaginationParams,
  createPaginationMeta,
} from '../common/pagination.util';

export interface ContactRequestFilters extends PaginationParams {
  status?: string;
  search?: string;
}

@Injectable()
export class ContactRequestsService {
  private readonly logger = new Logger(ContactRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  private generateRequestNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `REQ-${timestamp}-${random}`;
  }

  async findAll(filters: ContactRequestFilters = {}): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } = getPaginationParams(filters);

    const where: any = {};

    // Filter by status
    if (filters.status && filters.status !== 'all') {
      where.status = filters.status;
    }

    // Apply search filter
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { subject: { contains: filters.search, mode: 'insensitive' } },
        { requestNumber: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await this.prisma.contactRequest.count({ where });

    // Get paginated data
    const requests = await this.prisma.contactRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    return {
      data: requests,
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  async findOne(id: number) {
    const request = await this.prisma.contactRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException(`Contact request with ID ${id} not found`);
    }

    return request;
  }

  async create(dto: CreateContactRequestDto) {
    const requestNumber = this.generateRequestNumber();

    const contactRequest = await this.prisma.contactRequest.create({
      data: {
        requestNumber,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        subject: dto.subject,
        message: dto.message,
        status: 'new',
      },
    });

    // Send email notification to support
    try {
      await this.emailService.sendContactRequestNotification(
        dto.name,
        dto.email,
        dto.phone || null,
        dto.subject || null,
        dto.message,
        requestNumber,
      );
      this.logger.log(`Contact request notification sent for ${requestNumber}`);
    } catch (error) {
      // Log error but don't fail the request - contact was still saved
      this.logger.error(`Failed to send contact request notification: ${error.message}`);
    }

    return contactRequest;
  }

  async update(id: number, dto: UpdateContactRequestDto, userId?: number) {
    await this.findOne(id);

    const data: any = { ...dto };

    // If status is changing to 'replied', set repliedAt and repliedBy
    if (dto.status === 'replied') {
      data.repliedAt = new Date();
      if (userId) {
        data.repliedBy = userId;
      }
    }

    return this.prisma.contactRequest.update({
      where: { id },
      data,
    });
  }

  async remove(id: number) {
    await this.findOne(id);

    await this.prisma.contactRequest.delete({
      where: { id },
    });

    return { success: true, message: 'Contact request deleted successfully' };
  }

  async markAsRead(id: number) {
    const request = await this.findOne(id);

    // Only update if status is 'new'
    if (request.status === 'new') {
      return this.prisma.contactRequest.update({
        where: { id },
        data: { status: 'read' },
      });
    }

    return request;
  }

  async getStats() {
    const [total, newCount, readCount, repliedCount, closedCount] = await Promise.all([
      this.prisma.contactRequest.count(),
      this.prisma.contactRequest.count({ where: { status: 'new' } }),
      this.prisma.contactRequest.count({ where: { status: 'read' } }),
      this.prisma.contactRequest.count({ where: { status: 'replied' } }),
      this.prisma.contactRequest.count({ where: { status: 'closed' } }),
    ]);

    return {
      total,
      new: newCount,
      read: readCount,
      replied: repliedCount,
      closed: closedCount,
    };
  }
}
