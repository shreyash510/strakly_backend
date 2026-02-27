import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { BaseWearableProvider } from './providers/base.provider';
import { FitbitProvider } from './providers/fitbit.provider';
import { GoogleFitProvider } from './providers/google-fit.provider';
import { WearableDataFiltersDto } from './dto/wearables.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class WearablesService {
  private readonly logger = new Logger(WearablesService.name);
  private readonly providers: Map<string, BaseWearableProvider> = new Map();

  constructor(private readonly tenantService: TenantService) {
    // Register available providers
    const fitbit = new FitbitProvider();
    const googleFit = new GoogleFitProvider();

    this.providers.set(fitbit.providerName, fitbit);
    this.providers.set(googleFit.providerName, googleFit);
  }

  private getProvider(providerName: string): BaseWearableProvider {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new BadRequestException(
        `Unsupported wearable provider: ${providerName}. Supported: ${Array.from(this.providers.keys()).join(', ')}`,
      );
    }
    return provider;
  }

  /**
   * Return list of supported providers with basic info
   */
  getProviders() {
    const providerList = Array.from(this.providers.entries()).map(
      ([key, provider]) => ({
        id: key,
        name: provider.providerName,
        displayName: this.getDisplayName(key),
      }),
    );
    return { providers: providerList };
  }

  private getDisplayName(providerKey: string): string {
    const names: Record<string, string> = {
      fitbit: 'Fitbit',
      google_fit: 'Google Fit',
    };
    return names[providerKey] || providerKey;
  }

  /**
   * Get current user's wearable connections
   */
  async getMyConnections(userId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id, user_id, provider, provider_user_id, is_active,
                last_synced_at, sync_error, connected_at, disconnected_at,
                token_expires_at, created_at, updated_at
         FROM wearable_connections
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId],
      );

      return {
        connections: result.rows.map((row: Record<string, any>) => ({
          id: row.id,
          userId: row.user_id,
          provider: row.provider,
          displayName: this.getDisplayName(row.provider),
          providerUserId: row.provider_user_id,
          isActive: row.is_active,
          lastSyncedAt: row.last_synced_at,
          syncError: row.sync_error,
          connectedAt: row.connected_at,
          disconnectedAt: row.disconnected_at,
          tokenExpiresAt: row.token_expires_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })),
      };
    });
  }

  /**
   * Get OAuth authorization URL for a provider
   */
  initiateConnection(
    providerName: string,
    gymId: number,
    userId: number,
  ) {
    const provider = this.getProvider(providerName);
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/wearables/callback/${providerName}`;
    const authUrl = provider.getAuthUrl(redirectUri);

    // Append state param with gymId and userId for the callback
    const stateData = Buffer.from(
      JSON.stringify({ gymId, userId }),
    ).toString('base64');
    const separator = authUrl.includes('?') ? '&' : '?';

    return {
      authUrl: `${authUrl}${separator}state=${encodeURIComponent(stateData)}`,
      provider: providerName,
    };
  }

  /**
   * Handle OAuth callback, exchange code for tokens, store connection
   */
  async handleOAuthCallback(
    providerName: string,
    code: string,
    gymId: number,
    userId: number,
    redirectUri: string,
  ) {
    const provider = this.getProvider(providerName);
    const tokenResult = await provider.handleCallback(code, redirectUri);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `INSERT INTO wearable_connections
          (user_id, provider, access_token, refresh_token, token_expires_at,
           provider_user_id, is_active, connected_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), NOW(), NOW())
         ON CONFLICT (user_id, provider)
         DO UPDATE SET
           access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           token_expires_at = EXCLUDED.token_expires_at,
           provider_user_id = EXCLUDED.provider_user_id,
           is_active = TRUE,
           connected_at = NOW(),
           disconnected_at = NULL,
           sync_error = NULL,
           updated_at = NOW()`,
        [
          userId,
          providerName,
          tokenResult.accessToken,
          tokenResult.refreshToken,
          tokenResult.expiresAt,
          tokenResult.providerUserId,
        ],
      );
    });

    return {
      success: true,
      provider: providerName,
      providerUserId: tokenResult.providerUserId,
    };
  }

  /**
   * Disconnect a wearable provider (soft delete)
   */
  async disconnectProvider(
    providerName: string,
    userId: number,
    gymId: number,
  ) {
    const result = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const res = await client.query(
          `UPDATE wearable_connections
           SET is_active = FALSE,
               disconnected_at = NOW(),
               access_token = NULL,
               refresh_token = NULL,
               updated_at = NOW()
           WHERE user_id = $1 AND provider = $2
           RETURNING id`,
          [userId, providerName],
        );
        return res.rows[0];
      },
    );

    if (!result) {
      throw new NotFoundException(
        `No connection found for provider: ${providerName}`,
      );
    }

    return { success: true, provider: providerName };
  }

  /**
   * Sync data from a wearable provider for a user
   */
  async syncData(providerName: string, userId: number, gymId: number) {
    const provider = this.getProvider(providerName);

    // Get the connection
    const connection = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT * FROM wearable_connections
           WHERE user_id = $1 AND provider = $2 AND is_active = TRUE`,
          [userId, providerName],
        );
        return result.rows[0];
      },
    );

    if (!connection) {
      throw new NotFoundException(
        `No active connection found for provider: ${providerName}`,
      );
    }

    let accessToken = connection.access_token;

    // Refresh token if expired or about to expire (within 5 minutes)
    const tokenExpiresAt = connection.token_expires_at
      ? new Date(connection.token_expires_at)
      : null;
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (!tokenExpiresAt || tokenExpiresAt <= fiveMinutesFromNow) {
      try {
        const refreshResult = await provider.refreshAccessToken(
          connection.refresh_token,
        );
        accessToken = refreshResult.accessToken;

        // Update tokens in database
        await this.tenantService.executeInTenant(gymId, async (client) => {
          await client.query(
            `UPDATE wearable_connections
             SET access_token = $1,
                 refresh_token = $2,
                 token_expires_at = $3,
                 updated_at = NOW()
             WHERE user_id = $4 AND provider = $5`,
            [
              refreshResult.accessToken,
              refreshResult.refreshToken,
              refreshResult.expiresAt,
              userId,
              providerName,
            ],
          );
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        // Store the sync error
        await this.tenantService.executeInTenant(gymId, async (client) => {
          await client.query(
            `UPDATE wearable_connections
             SET sync_error = $1, updated_at = NOW()
             WHERE user_id = $2 AND provider = $3`,
            [`Token refresh failed: ${errorMessage}`, userId, providerName],
          );
        });
        throw new BadRequestException(
          `Failed to refresh token for ${providerName}: ${errorMessage}`,
        );
      }
    }

    // Fetch data for last 24 hours
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);

    try {
      const dataPoints = await provider.fetchData(
        accessToken,
        startDate,
        endDate,
      );

      // Insert data points with ON CONFLICT
      let insertedCount = 0;
      await this.tenantService.executeInTenant(gymId, async (client) => {
        for (const point of dataPoints) {
          const res = await client.query(
            `INSERT INTO wearable_data
              (user_id, provider, data_type, value, unit, recorded_at, recorded_date, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
             ON CONFLICT (user_id, provider, data_type, recorded_date)
             DO UPDATE SET
               value = EXCLUDED.value,
               unit = EXCLUDED.unit,
               recorded_at = EXCLUDED.recorded_at,
               metadata = EXCLUDED.metadata
             RETURNING id`,
            [
              userId,
              providerName,
              point.dataType,
              point.value,
              point.unit,
              point.recordedAt,
              point.recordedDate,
              point.metadata ? JSON.stringify(point.metadata) : null,
            ],
          );
          if (res.rows.length > 0) insertedCount++;
        }

        // Update last synced timestamp and clear any error
        await client.query(
          `UPDATE wearable_connections
           SET last_synced_at = NOW(), sync_error = NULL, updated_at = NOW()
           WHERE user_id = $1 AND provider = $2`,
          [userId, providerName],
        );
      });

      return {
        success: true,
        provider: providerName,
        dataPointsSynced: insertedCount,
        syncedAt: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Store sync error
      await this.tenantService.executeInTenant(gymId, async (client) => {
        await client.query(
          `UPDATE wearable_connections
           SET sync_error = $1, updated_at = NOW()
           WHERE user_id = $2 AND provider = $3`,
          [`Data fetch failed: ${errorMessage}`, userId, providerName],
        );
      });

      throw new BadRequestException(
        `Failed to sync data from ${providerName}: ${errorMessage}`,
      );
    }
  }

  /**
   * Get wearable data for the current user with filters and pagination
   */
  async getMyData(
    userId: number,
    gymId: number,
    filters: WearableDataFiltersDto,
  ) {
    return this.queryWearableData(userId, gymId, filters);
  }

  /**
   * Get wearable data for a specific user (admin view)
   */
  async getUserData(
    userId: number,
    gymId: number,
    filters: WearableDataFiltersDto,
  ) {
    return this.queryWearableData(userId, gymId, filters);
  }

  private async queryWearableData(
    userId: number,
    gymId: number,
    filters: WearableDataFiltersDto,
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      let whereClause = 'user_id = $1';
      const values: SqlValue[] = [userId];
      let paramIndex = 2;

      if (filters.dataType) {
        whereClause += ` AND data_type = $${paramIndex++}`;
        values.push(filters.dataType);
      }
      if (filters.provider) {
        whereClause += ` AND provider = $${paramIndex++}`;
        values.push(filters.provider);
      }
      if (filters.startDate) {
        whereClause += ` AND recorded_date >= $${paramIndex++}`;
        values.push(filters.startDate);
      }
      if (filters.endDate) {
        whereClause += ` AND recorded_date <= $${paramIndex++}`;
        values.push(filters.endDate);
      }

      // Get total count
      const countResult = await client.query(
        `SELECT COUNT(*) as count FROM wearable_data WHERE ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      // Get paginated data
      const dataValues = [...values, limit, offset];
      const result = await client.query(
        `SELECT * FROM wearable_data
         WHERE ${whereClause}
         ORDER BY recorded_date DESC, data_type ASC
         LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        dataValues,
      );

      const data = result.rows.map((row: Record<string, any>) => ({
        id: row.id,
        userId: row.user_id,
        provider: row.provider,
        dataType: row.data_type,
        value: parseFloat(row.value),
        unit: row.unit,
        recordedAt: row.recorded_at,
        recordedDate: row.recorded_date,
        metadata: row.metadata,
        createdAt: row.created_at,
      }));

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1,
        },
      };
    });
  }

  /**
   * Get today's summary: latest value for each data_type
   */
  async getMySummary(userId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const today = new Date().toISOString().split('T')[0];

      const result = await client.query(
        `SELECT DISTINCT ON (data_type)
           id, user_id, provider, data_type, value, unit,
           recorded_at, recorded_date, metadata, created_at
         FROM wearable_data
         WHERE user_id = $1 AND recorded_date = $2
         ORDER BY data_type, created_at DESC`,
        [userId, today],
      );

      const summary: Record<string, any> = {};
      for (const row of result.rows) {
        summary[row.data_type] = {
          value: parseFloat(row.value),
          unit: row.unit,
          provider: row.provider,
          recordedAt: row.recorded_at,
          metadata: row.metadata,
        };
      }

      return {
        date: today,
        summary,
      };
    });
  }

  /**
   * Get chart data: time series for a specific data_type over last N days
   */
  async getChartData(
    userId: number,
    gymId: number,
    dataType: string,
    days: number = 30,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const endDate = new Date();
      const startDate = new Date(
        endDate.getTime() - days * 24 * 60 * 60 * 1000,
      );
      const startDateStr = startDate.toISOString().split('T')[0];

      const result = await client.query(
        `SELECT recorded_date, value, unit, provider, metadata
         FROM wearable_data
         WHERE user_id = $1 AND data_type = $2 AND recorded_date >= $3
         ORDER BY recorded_date ASC`,
        [userId, dataType, startDateStr],
      );

      const chartData = result.rows.map((row: Record<string, any>) => ({
        date: row.recorded_date,
        value: parseFloat(row.value),
        unit: row.unit,
        provider: row.provider,
        metadata: row.metadata,
      }));

      return {
        dataType,
        days,
        startDate: startDateStr,
        endDate: endDate.toISOString().split('T')[0],
        data: chartData,
      };
    });
  }

  /**
   * Sync data for a specific connection (used by scheduler).
   * Returns void; errors are caught by the scheduler.
   */
  async syncConnectionData(
    connection: Record<string, any>,
    gymId: number,
  ): Promise<void> {
    const providerName = connection.provider;
    const userId = connection.user_id;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new Error(`Unknown provider: ${providerName}`);
    }

    let accessToken = connection.access_token;

    // Refresh token if expired
    const tokenExpiresAt = connection.token_expires_at
      ? new Date(connection.token_expires_at)
      : null;
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (!tokenExpiresAt || tokenExpiresAt <= fiveMinutesFromNow) {
      const refreshResult = await provider.refreshAccessToken(
        connection.refresh_token,
      );
      accessToken = refreshResult.accessToken;

      await this.tenantService.executeInTenant(gymId, async (client) => {
        await client.query(
          `UPDATE wearable_connections
           SET access_token = $1,
               refresh_token = $2,
               token_expires_at = $3,
               updated_at = NOW()
           WHERE id = $4`,
          [
            refreshResult.accessToken,
            refreshResult.refreshToken,
            refreshResult.expiresAt,
            connection.id,
          ],
        );
      });
    }

    // Fetch last 24h of data
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    const dataPoints = await provider.fetchData(accessToken, startDate, endDate);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      // Batch insert data points in chunks of 50
      const BATCH_SIZE = 50;
      for (let i = 0; i < dataPoints.length; i += BATCH_SIZE) {
        const batch = dataPoints.slice(i, i + BATCH_SIZE);
        const values: any[] = [];
        const placeholders: string[] = [];

        batch.forEach((point, idx) => {
          const offset = idx * 8;
          placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, NOW())`,
          );
          values.push(
            userId,
            providerName,
            point.dataType,
            point.value,
            point.unit,
            point.recordedAt,
            point.recordedDate,
            point.metadata ? JSON.stringify(point.metadata) : null,
          );
        });

        if (placeholders.length > 0) {
          await client.query(
            `INSERT INTO wearable_data
              (user_id, provider, data_type, value, unit, recorded_at, recorded_date, metadata, created_at)
             VALUES ${placeholders.join(', ')}
             ON CONFLICT (user_id, provider, data_type, recorded_date)
             DO UPDATE SET
               value = EXCLUDED.value,
               unit = EXCLUDED.unit,
               recorded_at = EXCLUDED.recorded_at,
               metadata = EXCLUDED.metadata`,
            values,
          );
        }
      }

      await client.query(
        `UPDATE wearable_connections
         SET last_synced_at = NOW(), sync_error = NULL, updated_at = NOW()
         WHERE id = $1`,
        [connection.id],
      );
    });
  }
}
