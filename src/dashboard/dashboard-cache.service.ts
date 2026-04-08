import { Injectable, Logger } from '@nestjs/common';
import type { AdminDashboardDto } from './dto/dashboard.dto';

interface CacheEntry {
  stats: AdminDashboardDto;
  updatedAt: Date;
}

@Injectable()
export class DashboardCacheService {
  private readonly logger = new Logger(DashboardCacheService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 10 * 60 * 1000; // 10 minutes

  private cacheKey(gymId: number, branchId?: number | null): string {
    return `${gymId}_${branchId ?? 'all'}`;
  }

  get(gymId: number, branchId?: number | null): AdminDashboardDto | null {
    const key = this.cacheKey(gymId, branchId);
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.updatedAt.getTime();
    if (age > this.TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    this.logger.debug(`Cache hit for gym ${gymId} branch ${branchId ?? 'all'} (age: ${Math.round(age / 1000)}s)`);
    return entry.stats;
  }

  set(gymId: number, stats: AdminDashboardDto, branchId?: number | null): void {
    const key = this.cacheKey(gymId, branchId);
    this.cache.set(key, { stats, updatedAt: new Date() });
    this.logger.debug(`Cache set for gym ${gymId} branch ${branchId ?? 'all'}`);
  }

  /** Invalidate all cache entries for a given gym (all branches). */
  invalidate(gymId: number): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${gymId}_`)) {
        this.cache.delete(key);
        this.logger.debug(`Invalidated cache entry: ${key}`);
      }
    }
  }

  getAllGymIds(): number[] {
    const ids = new Set<number>();
    for (const key of this.cache.keys()) {
      ids.add(parseInt(key.split('_')[0]));
    }
    return Array.from(ids);
  }
}
