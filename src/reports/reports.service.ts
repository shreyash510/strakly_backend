import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { CreateReportDto, UpdateReportDto } from './dto/create-report.dto';
import { ReportSchema, UserSchema } from '../database/schemas';

@Injectable()
export class ReportsService {
  private reportModel: Model<any>;
  private userModel: Model<any>;

  constructor(@InjectConnection() private connection: Connection) {
    this.reportModel = this.connection.model('Report', ReportSchema);
    this.userModel = this.connection.model('User', UserSchema);
  }

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    status?: string;
    period?: string;
  }) {
    const { page = 1, limit = 15, search, type, status, period } = params;
    const filter: any = {};

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    if (type && type !== 'all') {
      filter.type = type;
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (period && period !== 'all') {
      filter.period = period;
    }

    const skip = (page - 1) * limit;
    const [reports, total] = await Promise.all([
      this.reportModel.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }).lean(),
      this.reportModel.countDocuments(filter),
    ]);

    return {
      data: reports.map((report: any) => ({
        id: report._id.toString(),
        ...report,
        _id: undefined,
        generatedBy: report.generatedBy?.toString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const report = await this.reportModel.findById(id).lean();
    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }
    return {
      id: (report as any)._id.toString(),
      ...report,
      _id: undefined,
      generatedBy: (report as any).generatedBy?.toString(),
    };
  }

  async create(createReportDto: CreateReportDto, userId: string) {
    const report = await this.reportModel.create({
      ...createReportDto,
      generatedBy: userId,
      status: createReportDto.status || 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const obj = report.toObject();
    return {
      id: obj._id.toString(),
      ...obj,
      _id: undefined,
      generatedBy: obj.generatedBy?.toString(),
    };
  }

  async update(id: string, updateReportDto: UpdateReportDto) {
    const report = await this.reportModel
      .findByIdAndUpdate(
        id,
        { ...updateReportDto, updatedAt: new Date() },
        { new: true },
      )
      .lean();

    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }

    return {
      id: (report as any)._id.toString(),
      ...report,
      _id: undefined,
      generatedBy: (report as any).generatedBy?.toString(),
    };
  }

  async remove(id: string) {
    const result = await this.reportModel.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }
    return { success: true, id };
  }

  async generate(id: string) {
    // Simulate report generation by updating status and generatedAt
    const report = await this.reportModel
      .findByIdAndUpdate(
        id,
        {
          status: 'generated',
          generatedAt: new Date(),
          updatedAt: new Date(),
          // Add mock metrics for demo
          metrics: {
            totalRevenue: Math.floor(Math.random() * 100000),
            totalMembers: Math.floor(Math.random() * 500),
            newMembers: Math.floor(Math.random() * 50),
            activeMembers: Math.floor(Math.random() * 400),
            avgAttendance: Math.floor(Math.random() * 100),
          },
        },
        { new: true },
      )
      .lean();

    if (!report) {
      throw new NotFoundException(`Report with ID ${id} not found`);
    }

    return {
      id: (report as any)._id.toString(),
      ...report,
      _id: undefined,
      generatedBy: (report as any).generatedBy?.toString(),
    };
  }
}
