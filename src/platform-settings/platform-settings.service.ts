import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpdatePaymentConfigDto } from './dto/platform-settings.dto';

/** Keys that belong to the payment configuration group */
const PAYMENT_CONFIG_KEYS = [
  'payment_bank_name',
  'payment_bank_account_name',
  'payment_bank_account_number',
  'payment_bank_ifsc',
  'payment_upi_id',
  'payment_paypal_email',
  'payment_wise_email',
  'payment_instructions',
] as const;

@Injectable()
export class PlatformSettingsService {
  private readonly logger = new Logger(PlatformSettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieve all payment-related settings as a flat object.
   */
  async getPaymentConfig(): Promise<Record<string, string>> {
    const rows = await this.prisma.platformSetting.findMany({
      where: { key: { in: [...PAYMENT_CONFIG_KEYS] } },
    });

    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  /**
   * Upsert payment-related settings. Only provided (non-undefined) keys are
   * written; to clear a value pass an empty string.
   */
  async updatePaymentConfig(dto: UpdatePaymentConfigDto): Promise<Record<string, string>> {
    const entries = Object.entries(dto).filter(
      ([key, value]) => PAYMENT_CONFIG_KEYS.includes(key as any) && value !== undefined,
    );

    // Use a transaction so all keys are written atomically.
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.platformSetting.upsert({
          where: { key },
          create: { key, value: value as string },
          update: { value: value as string },
        }),
      ),
    );

    this.logger.log(`Updated ${entries.length} payment config keys`);
    return this.getPaymentConfig();
  }
}
