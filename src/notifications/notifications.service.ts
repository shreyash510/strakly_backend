import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateNotificationDto, UpdateNotificationDto } from './dto/create-notification.dto';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error' | 'system' | 'reminder' | 'challenge' | 'friend_request' | 'achievement';
  isRead: boolean;
  link?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class NotificationsService {
  private readonly collectionName = 'notifications';

  constructor(private readonly databaseService: DatabaseService) {}

  async findAllForUser(userId: string): Promise<Notification[]> {
    const baseMongoService = this.databaseService['baseMongoService'];
    const model = baseMongoService.getModel(this.collectionName);
    const docs = await model.find({ userId }).sort({ createdAt: -1 }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));
  }

  async findUnread(userId: string): Promise<Notification[]> {
    const baseMongoService = this.databaseService['baseMongoService'];
    const model = baseMongoService.getModel(this.collectionName);
    const docs = await model.find({ userId, isRead: false }).sort({ createdAt: -1 }).lean();
    return docs.map((doc: any) => ({
      id: doc._id.toString(),
      ...doc,
      _id: undefined,
    }));
  }

  async getUnreadCount(userId: string): Promise<number> {
    const baseMongoService = this.databaseService['baseMongoService'];
    const model = baseMongoService.getModel(this.collectionName);
    return model.countDocuments({ userId, isRead: false });
  }

  async findOne(id: string): Promise<Notification> {
    const baseMongoService = this.databaseService['baseMongoService'];
    const model = baseMongoService.getModel(this.collectionName);
    const doc = await model.findById(id).lean();

    if (!doc) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    return {
      id: (doc as any)._id.toString(),
      ...doc as any,
      _id: undefined,
    };
  }

  async create(createNotificationDto: CreateNotificationDto): Promise<Notification> {
    const baseMongoService = this.databaseService['baseMongoService'];
    const model = baseMongoService.getModel(this.collectionName);

    const notificationData = {
      ...createNotificationDto,
      type: createNotificationDto.type || 'info',
      isRead: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const doc = await model.create(notificationData);
    const obj = doc.toObject();
    return {
      id: obj._id.toString(),
      ...obj,
      _id: undefined,
    };
  }

  async markAsRead(id: string): Promise<Notification> {
    const baseMongoService = this.databaseService['baseMongoService'];
    const model = baseMongoService.getModel(this.collectionName);

    const doc = await model.findByIdAndUpdate(
      id,
      { isRead: true, updatedAt: new Date().toISOString() },
      { new: true },
    ).lean();

    if (!doc) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    return {
      id: (doc as any)._id.toString(),
      ...doc as any,
      _id: undefined,
    };
  }

  async markAllAsRead(userId: string): Promise<{ success: boolean; count: number }> {
    const baseMongoService = this.databaseService['baseMongoService'];
    const model = baseMongoService.getModel(this.collectionName);

    const result = await model.updateMany(
      { userId, isRead: false },
      { isRead: true, updatedAt: new Date().toISOString() },
    );

    return { success: true, count: result.modifiedCount };
  }

  async remove(id: string): Promise<{ success: boolean }> {
    const baseMongoService = this.databaseService['baseMongoService'];
    const model = baseMongoService.getModel(this.collectionName);

    await model.findByIdAndDelete(id);
    return { success: true };
  }

  async removeAllForUser(userId: string): Promise<{ success: boolean; count: number }> {
    const baseMongoService = this.databaseService['baseMongoService'];
    const model = baseMongoService.getModel(this.collectionName);

    const result = await model.deleteMany({ userId });
    return { success: true, count: result.deletedCount };
  }

  // Helper method to create notifications from other services
  async notify(
    userId: string,
    title: string,
    message: string,
    type: string = 'info',
    link?: string,
    metadata?: Record<string, any>,
  ): Promise<Notification> {
    return this.create({
      userId,
      title,
      message,
      type: type as any,
      link,
      metadata,
    });
  }
}
