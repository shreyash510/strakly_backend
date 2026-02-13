import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { WearablesService } from './wearables.service';

@Injectable()
export class WearablesScheduler {
  private readonly logger = new Logger(WearablesScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly wearablesService: WearablesService,
  ) {}

  /**
   * Every hour: for each gym, for each active wearable connection, sync last 24h of data.
   * Catches errors per connection and updates the sync_error field.
   */
  @Cron('0 * * * *')
  async handleWearableSync() {
    this.logger.log('Starting hourly wearable data sync...');

    try {
      // Get all active gyms
      const gyms = await this.prisma.gym.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });

      let totalSynced = 0;
      let totalErrors = 0;

      for (const gym of gyms) {
        try {
          // Get all active wearable connections for this gym
          const connections = await this.tenantService.executeInTenant(
            gym.id,
            async (client) => {
              const result = await client.query(
                `SELECT * FROM wearable_connections
                 WHERE is_active = TRUE
                   AND access_token IS NOT NULL
                   AND refresh_token IS NOT NULL`,
              );
              return result.rows;
            },
          );

          for (const connection of connections) {
            try {
              await this.wearablesService.syncConnectionData(
                connection,
                gym.id,
              );
              totalSynced++;
            } catch (error) {
              totalErrors++;
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              this.logger.error(
                `Failed to sync wearable data for user ${connection.user_id}, provider ${connection.provider}, gym ${gym.id}: ${errorMessage}`,
              );

              // Update sync_error on the connection
              try {
                await this.tenantService.executeInTenant(
                  gym.id,
                  async (client) => {
                    await client.query(
                      `UPDATE wearable_connections
                       SET sync_error = $1, updated_at = NOW()
                       WHERE id = $2`,
                      [errorMessage, connection.id],
                    );
                  },
                );
              } catch (updateError) {
                this.logger.error(
                  `Failed to update sync_error for connection ${connection.id}: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
                );
              }
            }
          }
        } catch (error) {
          this.logger.error(
            `Failed to process wearable connections for gym ${gym.id} (${gym.name}): ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      this.logger.log(
        `Wearable sync completed. Synced: ${totalSynced}, Errors: ${totalErrors}`,
      );
    } catch (error) {
      this.logger.error(
        `Wearable sync job failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
