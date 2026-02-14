import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateCurrencyDto,
  UpdateCurrencyDto,
  CreateExchangeRateDto,
} from './dto/currencies.dto';

@Injectable()
export class CurrenciesService {
  constructor(private readonly tenantService: TenantService) {}

  // ─── Currencies ───

  async findAll(gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM currencies WHERE is_active = TRUE ORDER BY code ASC`,
      );
      return result.rows.map((r) => this.formatCurrency(r));
    });
  }

  async create(gymId: number, dto: CreateCurrencyDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO currencies (code, name, symbol, decimal_places)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [dto.code, dto.name, dto.symbol, dto.decimalPlaces ?? 2],
      );
      return this.formatCurrency(result.rows[0]);
    });
  }

  async update(id: number, gymId: number, dto: UpdateCurrencyDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const existing = await client.query(
        `SELECT id FROM currencies WHERE id = $1`,
        [id],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Currency with ID ${id} not found`);
      }

      if (dto.isActive === undefined) {
        return this.formatCurrency(existing.rows[0]);
      }

      const result = await client.query(
        `UPDATE currencies SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
        [dto.isActive, id],
      );
      return this.formatCurrency(result.rows[0]);
    });
  }

  // ─── Exchange Rates ───

  async getExchangeRates(gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT DISTINCT ON (from_currency, to_currency)
           *
         FROM exchange_rates
         ORDER BY from_currency, to_currency, effective_date DESC`,
      );
      return result.rows.map((r) => this.formatExchangeRate(r));
    });
  }

  async createExchangeRate(gymId: number, dto: CreateExchangeRateDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const effectiveDate = dto.effectiveDate || new Date().toISOString();

      const result = await client.query(
        `INSERT INTO exchange_rates (from_currency, to_currency, rate, source, effective_date)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (from_currency, to_currency, effective_date)
         DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source, updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [dto.fromCurrency, dto.toCurrency, dto.rate, dto.source || null, effectiveDate],
      );
      return this.formatExchangeRate(result.rows[0]);
    });
  }

  // ─── Convert ───

  async convert(gymId: number, from: string, to: string, amount: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Try direct rate first
      let rateResult = await client.query(
        `SELECT rate, effective_date FROM exchange_rates
         WHERE from_currency = $1 AND to_currency = $2
         ORDER BY effective_date DESC
         LIMIT 1`,
        [from, to],
      );

      let rate: number;
      let effectiveDate: string;

      if (rateResult.rows.length > 0) {
        rate = parseFloat(rateResult.rows[0].rate);
        effectiveDate = rateResult.rows[0].effective_date;
      } else {
        // Try inverse rate
        rateResult = await client.query(
          `SELECT rate, effective_date FROM exchange_rates
           WHERE from_currency = $1 AND to_currency = $2
           ORDER BY effective_date DESC
           LIMIT 1`,
          [to, from],
        );

        if (rateResult.rows.length === 0) {
          throw new NotFoundException(
            `Exchange rate not found for ${from} -> ${to}`,
          );
        }

        rate = 1 / parseFloat(rateResult.rows[0].rate);
        effectiveDate = rateResult.rows[0].effective_date;
      }

      const convertedAmount = amount * rate;

      return {
        from,
        to,
        amount,
        convertedAmount,
        rate,
        effectiveDate,
      };
    });
  }

  // ─── Formatters ───

  private formatCurrency(row: Record<string, any>) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      symbol: row.symbol,
      decimalPlaces: row.decimal_places,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatExchangeRate(row: Record<string, any>) {
    return {
      id: row.id,
      fromCurrency: row.from_currency,
      toCurrency: row.to_currency,
      rate: row.rate ? parseFloat(row.rate) : 0,
      source: row.source,
      effectiveDate: row.effective_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
