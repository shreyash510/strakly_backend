import { Injectable, Logger } from '@nestjs/common';
import type { AdminDashboardDto } from './dto/dashboard.dto';

interface CacheEntry {
  stats: AdminDashboardDto;
  updatedAt: Date;
}

@Injectable()
export class DashboardCacheService {
  private readonly logger = new Logger(DashboardCacheService.name);
  private readonly cache = new Map<number, CacheEntry>();
  private readonly TTL_MS = 10 * 60 * 1000; // 10 minutes

  get(gymId: number): AdminDashboardDto | null {
    const entry = this.cache.get(gymId);
    if (!entry) return null;

    const age = Date.now() - entry.updatedAt.getTime();
    if (age > this.TTL_MS) {
      this.cache.delete(gymId);
      return null;
    }

    this.logger.debug(`Cache hit for gym ${gymId} (age: ${Math.round(age / 1000)}s)`);
    return entry.stats;
  }

  set(gymId: number, stats: AdminDashboardDto): void {
    this.cache.set(gymId, { stats, updatedAt: new Date() });
    this.logger.debug(`Cache set for gym ${gymId}`);
  }

  /** Invalidate cache entry for a given gym. */
  invalidate(gymId: number): void {
    if (this.cache.delete(gymId)) {
      this.logger.debug(`Invalidated cache entry for gym ${gymId}`);
    }
  }

  getAllGymIds(): number[] {
    return Array.from(this.cache.keys());
  }
}
