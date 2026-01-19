import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpdateBodyMetricsDto, RecordMetricsDto } from './dto/body-metrics.dto';

@Injectable()
export class BodyMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  // Calculate BMI
  private calculateBMI(weight?: number, height?: number): number | null {
    if (!weight || !height) return null;
    const heightInMeters = height / 100;
    return Math.round((weight / (heightInMeters * heightInMeters)) * 100) / 100;
  }

  // Get current metrics for a user
  async getMetrics(userId: number) {
    const metrics = await this.prisma.bodyMetrics.findUnique({
      where: { userId },
    });

    if (!metrics) {
      return null;
    }

    return metrics;
  }

  // Get or create metrics for a user
  async getOrCreateMetrics(userId: number) {
    let metrics = await this.prisma.bodyMetrics.findUnique({
      where: { userId },
    });

    if (!metrics) {
      metrics = await this.prisma.bodyMetrics.create({
        data: { userId },
      });
    }

    return metrics;
  }

  // Update current metrics
  async updateMetrics(userId: number, dto: UpdateBodyMetricsDto) {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Calculate BMI if weight and height provided
    const bmi = this.calculateBMI(dto.weight, dto.height);

    const data: any = {
      ...dto,
      lastMeasuredAt: new Date(),
    };

    if (bmi !== null) {
      data.bmi = bmi;
    }

    // Upsert metrics
    const metrics = await this.prisma.bodyMetrics.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
      },
      update: data,
    });

    return metrics;
  }

  // Record metrics and save to history
  async recordMetrics(userId: number, dto: RecordMetricsDto) {
    // Update current metrics
    const metrics = await this.updateMetrics(userId, dto);

    // Get current metrics to include height if not provided
    const currentMetrics = await this.prisma.bodyMetrics.findUnique({
      where: { userId },
    });

    // Calculate BMI for history
    const height = dto.height || (currentMetrics?.height ? Number(currentMetrics.height) : undefined);
    const bmi = this.calculateBMI(dto.weight, height);

    // Save to history
    const historyData: any = {
      userId,
      measuredAt: dto.measuredAt ? new Date(dto.measuredAt) : new Date(),
      height: dto.height,
      weight: dto.weight,
      bmi,
      bodyFat: dto.bodyFat,
      muscleMass: dto.muscleMass,
      boneMass: dto.boneMass,
      waterPercentage: dto.waterPercentage,
      chest: dto.chest,
      waist: dto.waist,
      hips: dto.hips,
      biceps: dto.biceps,
      thighs: dto.thighs,
      calves: dto.calves,
      shoulders: dto.shoulders,
      neck: dto.neck,
      restingHeartRate: dto.restingHeartRate,
      bloodPressureSys: dto.bloodPressureSys,
      bloodPressureDia: dto.bloodPressureDia,
      measuredBy: dto.measuredBy,
      notes: dto.notes,
    };

    // Remove undefined values
    Object.keys(historyData).forEach(key => {
      if (historyData[key] === undefined) {
        delete historyData[key];
      }
    });

    await this.prisma.bodyMetricsHistory.create({
      data: historyData,
    });

    return metrics;
  }

  // Get metrics history
  async getHistory(
    userId: number,
    options?: { startDate?: Date; endDate?: Date; limit?: number },
  ) {
    const where: any = { userId };

    if (options?.startDate || options?.endDate) {
      where.measuredAt = {};
      if (options.startDate) {
        where.measuredAt.gte = options.startDate;
      }
      if (options.endDate) {
        where.measuredAt.lte = options.endDate;
      }
    }

    return this.prisma.bodyMetricsHistory.findMany({
      where,
      orderBy: { measuredAt: 'desc' },
      take: options?.limit || 50,
    });
  }

  // Get progress (compare current with first record)
  async getProgress(userId: number) {
    const current = await this.getMetrics(userId);

    if (!current) {
      return null;
    }

    const firstRecord = await this.prisma.bodyMetricsHistory.findFirst({
      where: { userId },
      orderBy: { measuredAt: 'asc' },
    });

    const latestRecord = await this.prisma.bodyMetricsHistory.findFirst({
      where: { userId },
      orderBy: { measuredAt: 'desc' },
    });

    if (!firstRecord) {
      return {
        current,
        progress: null,
        firstRecord: null,
        totalRecords: 0,
      };
    }

    const totalRecords = await this.prisma.bodyMetricsHistory.count({
      where: { userId },
    });

    // Calculate progress
    const progress: any = {};

    if (firstRecord.weight && current.weight) {
      progress.weight = {
        initial: Number(firstRecord.weight),
        current: Number(current.weight),
        change: Number(current.weight) - Number(firstRecord.weight),
        changePercent: ((Number(current.weight) - Number(firstRecord.weight)) / Number(firstRecord.weight)) * 100,
      };
    }

    if (firstRecord.bodyFat && current.bodyFat) {
      progress.bodyFat = {
        initial: Number(firstRecord.bodyFat),
        current: Number(current.bodyFat),
        change: Number(current.bodyFat) - Number(firstRecord.bodyFat),
      };
    }

    if (firstRecord.muscleMass && current.muscleMass) {
      progress.muscleMass = {
        initial: Number(firstRecord.muscleMass),
        current: Number(current.muscleMass),
        change: Number(current.muscleMass) - Number(firstRecord.muscleMass),
        changePercent: ((Number(current.muscleMass) - Number(firstRecord.muscleMass)) / Number(firstRecord.muscleMass)) * 100,
      };
    }

    if (firstRecord.waist && current.waist) {
      progress.waist = {
        initial: Number(firstRecord.waist),
        current: Number(current.waist),
        change: Number(current.waist) - Number(firstRecord.waist),
      };
    }

    return {
      current,
      firstRecord,
      latestRecord,
      progress,
      totalRecords,
      startDate: firstRecord.measuredAt,
      daysSinceStart: Math.floor(
        (Date.now() - firstRecord.measuredAt.getTime()) / (1000 * 60 * 60 * 24),
      ),
    };
  }

  // Get metrics for a specific date range (for charts)
  async getMetricsChart(
    userId: number,
    field: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const where: any = { userId };

    if (startDate || endDate) {
      where.measuredAt = {};
      if (startDate) where.measuredAt.gte = startDate;
      if (endDate) where.measuredAt.lte = endDate;
    }

    const records = await this.prisma.bodyMetricsHistory.findMany({
      where,
      orderBy: { measuredAt: 'asc' },
      select: {
        measuredAt: true,
        [field]: true,
      },
    });

    return records.map(r => ({
      date: r.measuredAt,
      value: r[field] ? Number(r[field]) : null,
    })).filter(r => r.value !== null);
  }

  // Delete a history record
  async deleteHistoryRecord(id: string, userId: number) {
    const record = await this.prisma.bodyMetricsHistory.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`History record with ID ${id} not found`);
    }

    if (record.userId !== userId) {
      throw new NotFoundException(`History record with ID ${id} not found`);
    }

    await this.prisma.bodyMetricsHistory.delete({
      where: { id },
    });

    return { success: true };
  }
}
