import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto/create-announcement.dto';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'general' | 'update' | 'event' | 'maintenance' | 'promotion';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'draft' | 'published' | 'archived';
  targetAudience: string[];
  publishedAt?: string;
  expiresAt?: string;
  authorId: string;
  authorName: string;
  gymId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class AnnouncementsService {
  private readonly collectionName = 'announcements';

  constructor(private readonly databaseService: DatabaseService) {}

  async findAll(userId: string): Promise<Announcement[]> {
    return this.databaseService.getCollection<Announcement>(
      this.collectionName,
      userId,
    );
  }

  async findPublished(): Promise<Announcement[]> {
    const baseMongoService = this.databaseService['baseMongoService'];
    const model = baseMongoService.getModel(this.collectionName);
    const now = new Date();
    const docs = await model.find({
      status: 'published',
      isActive: true,
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gte: now } },
      ],
    }).sort({ priority: -1, createdAt: -1 }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));
  }

  async findByRole(role: string): Promise<Announcement[]> {
    const baseMongoService = this.databaseService['baseMongoService'];
    const model = baseMongoService.getModel(this.collectionName);
    const now = new Date();
    const docs = await model.find({
      status: 'published',
      isActive: true,
      targetAudience: { $in: [role, 'all'] },
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: null },
        { expiresAt: { $gte: now } },
      ],
    }).sort({ priority: -1, createdAt: -1 }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));
  }

  async findOne(userId: string, id: string): Promise<Announcement> {
    const announcement = await this.databaseService.getDocument<Announcement>(
      this.collectionName,
      userId,
      id,
    );

    if (!announcement) {
      throw new NotFoundException(`Announcement with ID ${id} not found`);
    }

    return announcement;
  }

  async create(userId: string, createAnnouncementDto: CreateAnnouncementDto): Promise<Announcement> {
    const announcementData = {
      ...createAnnouncementDto,
      authorId: userId,
      type: createAnnouncementDto.type || 'general',
      priority: createAnnouncementDto.priority || 'medium',
      status: createAnnouncementDto.status || 'draft',
      targetAudience: createAnnouncementDto.targetAudience || ['user'],
      isActive: createAnnouncementDto.isActive ?? true,
    };

    return this.databaseService.createDocument<Announcement>(
      this.collectionName,
      userId,
      announcementData,
    );
  }

  async update(
    userId: string,
    id: string,
    updateAnnouncementDto: UpdateAnnouncementDto,
  ): Promise<Announcement> {
    await this.findOne(userId, id);

    const updateData = { ...updateAnnouncementDto };

    // Set publishedAt when status changes to published
    if (updateAnnouncementDto.status === 'published' && !updateAnnouncementDto.publishedAt) {
      updateData.publishedAt = new Date().toISOString();
    }

    const announcement = await this.databaseService.updateDocument<Announcement>(
      this.collectionName,
      userId,
      id,
      updateData,
    );

    if (!announcement) {
      throw new NotFoundException(`Announcement with ID ${id} not found`);
    }

    return announcement;
  }

  async remove(userId: string, id: string): Promise<{ success: boolean }> {
    await this.findOne(userId, id);
    await this.databaseService.deleteDocument(this.collectionName, userId, id);
    return { success: true };
  }

  async publish(userId: string, id: string): Promise<Announcement> {
    return this.update(userId, id, {
      status: 'published' as any,
      publishedAt: new Date().toISOString(),
    });
  }

  async archive(userId: string, id: string): Promise<Announcement> {
    return this.update(userId, id, { status: 'archived' as any });
  }
}
