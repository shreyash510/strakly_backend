import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { CreateSubscriptionDto, UpdateSubscriptionDto } from './dto/create-subscription.dto';
import { SubscriptionSchema, UserSchema } from '../database/schemas';

@Injectable()
export class SubscriptionsService {
  private subscriptionModel: Model<any>;
  private userModel: Model<any>;

  constructor(@InjectConnection() private connection: Connection) {
    this.subscriptionModel = this.connection.model('Subscription', SubscriptionSchema);
    this.userModel = this.connection.model('User', UserSchema);
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    plan?: string;
    status?: string;
    gymId?: string;
  }) {
    const { page = 1, limit = 15, search, plan, status, gymId } = params;
    const filter: any = {};

    if (plan && plan !== 'all') {
      filter.plan = plan;
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (gymId && gymId !== 'all') {
      filter.gymId = gymId;
    }

    const skip = (page - 1) * limit;
    const [subscriptions, total] = await Promise.all([
      this.subscriptionModel.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }).lean(),
      this.subscriptionModel.countDocuments(filter),
    ]);

    // Get user names
    const userIds = subscriptions.map((s: any) => s.userId);
    const users = await this.userModel.find({ _id: { $in: userIds } }).select('name email').lean();
    const userMap = new Map(users.map((u: any) => [u._id.toString(), u]));

    let result = subscriptions.map((sub: any) => {
      const user = userMap.get(sub.userId?.toString()) || {};
      return {
        id: sub._id.toString(),
        ...sub,
        _id: undefined,
        userId: sub.userId?.toString(),
        userName: (user as any).name || 'Unknown',
        userEmail: (user as any).email || '',
      };
    });

    // Apply search filter on user name/email
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter((s: any) =>
        s.userName.toLowerCase().includes(searchLower) ||
        s.userEmail.toLowerCase().includes(searchLower)
      );
    }

    return {
      data: result,
      pagination: {
        page,
        limit,
        total: search ? result.length : total,
        totalPages: Math.ceil((search ? result.length : total) / limit),
      },
    };
  }

  async findOne(id: string) {
    const subscription = await this.subscriptionModel.findById(id).lean();
    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }

    const user = await this.userModel
      .findById((subscription as any).userId)
      .select('name email')
      .lean();

    return {
      id: (subscription as any)._id.toString(),
      ...subscription,
      _id: undefined,
      userId: (subscription as any).userId?.toString(),
      userName: (user as any)?.name || 'Unknown',
      userEmail: (user as any)?.email || '',
    };
  }

  async findByUserId(userId: string) {
    const subscription = await this.subscriptionModel
      .findOne({ userId })
      .sort({ createdAt: -1 })
      .lean();

    if (!subscription) {
      return null;
    }

    return {
      id: (subscription as any)._id.toString(),
      ...subscription,
      _id: undefined,
      userId: (subscription as any).userId?.toString(),
    };
  }

  async create(createSubscriptionDto: CreateSubscriptionDto) {
    const subscription = await this.subscriptionModel.create({
      ...createSubscriptionDto,
      status: createSubscriptionDto.status || 'active',
      plan: createSubscriptionDto.plan || 'free',
      billingCycle: createSubscriptionDto.billingCycle || 'monthly',
      currency: createSubscriptionDto.currency || 'USD',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const obj = subscription.toObject();
    return {
      id: obj._id.toString(),
      ...obj,
      _id: undefined,
      userId: obj.userId?.toString(),
    };
  }

  async update(id: string, updateSubscriptionDto: UpdateSubscriptionDto) {
    const subscription = await this.subscriptionModel
      .findByIdAndUpdate(
        id,
        { ...updateSubscriptionDto, updatedAt: new Date() },
        { new: true },
      )
      .lean();

    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }

    return this.findOne(id);
  }

  async cancel(id: string) {
    const subscription = await this.subscriptionModel
      .findByIdAndUpdate(
        id,
        {
          status: 'cancelled',
          cancelledAt: new Date(),
          updatedAt: new Date(),
        },
        { new: true },
      )
      .lean();

    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    const result = await this.subscriptionModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }
    return { success: true, id };
  }
}
