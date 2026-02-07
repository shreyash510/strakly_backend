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

  private makeKey(gymId: number, branchId: number | null): string {
    return `${gymId}:${branchId ?? 'all'}`;
  }

  get(gymId: number, branchId: number | null): AdminDashboardDto | null {
    const key = this.makeKey(gymId, branchId);
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.updatedAt.getTime();
    if (age > this.TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    this.logger.debug(`Cache hit for ${key} (age: ${Math.round(age / 1000)}s)`);
    return entry.stats;
  }

  set(gymId: number, branchId: number | null, stats: AdminDashboardDto): void {
    const key = this.makeKey(gymId, branchId);
    this.cache.set(key, { stats, updatedAt: new Date() });
    this.logger.debug(`Cache set for ${key}`);
  }

  invalidate(gymId: number): void {
    const prefix = `${gymId}:`;
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    if (count > 0) {
      this.logger.debug(
        `Invalidated ${count} cache entries for gym ${gymId}`,
      );
    }
  }

  getAllKeys(): Array<{ gymId: number; branchId: number | null }> {
    const keys: Array<{ gymId: number; branchId: number | null }> = [];
    for (const key of this.cache.keys()) {
      const [gymIdStr, branchIdStr] = key.split(':');
      keys.push({
        gymId: parseInt(gymIdStr, 10),
        branchId: branchIdStr === 'all' ? null : parseInt(branchIdStr, 10),
      });
    }
    return keys;
  }
}
