import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { CreateOfferDto, UpdateOfferDto } from './dto/offer.dto';

@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  private formatOffer(o: any) {
    return {
      id: o.id,
      code: o.code,
      name: o.name,
      description: o.description,
      discountType: o.discount_type,
      discountValue: o.discount_value,
      startDate: o.start_date,
      endDate: o.end_date,
      maxUsage: o.max_usage,
      currentUsage: o.current_usage,
      isActive: o.is_active,
      createdAt: o.created_at,
      updatedAt: o.updated_at,
    };
  }

  async findAll(gymId: number, includeInactive = false) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const whereClause = includeInactive ? '' : 'WHERE is_active = true';
      const result = await client.query(
        `SELECT * FROM offers ${whereClause} ORDER BY created_at DESC`
      );
      return result.rows.map((o: any) => this.formatOffer(o));
    });
  }

  async findActive(gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM offers WHERE is_active = true AND start_date <= NOW() AND end_date >= NOW() ORDER BY end_date ASC`
      );
      return result.rows.map((o: any) => this.formatOffer(o));
    });
  }

  async findOne(id: number, gymId: number) {
    const offer = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(`SELECT * FROM offers WHERE id = $1`, [id]);
      return result.rows[0];
    });

    if (!offer) {
      throw new NotFoundException(`Offer with ID ${id} not found`);
    }

    return this.formatOffer(offer);
  }

  async findByCode(code: string, gymId: number) {
    const offer = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(`SELECT * FROM offers WHERE code = $1`, [code]);
      return result.rows[0];
    });

    if (!offer) {
      throw new NotFoundException(`Offer with code ${code} not found`);
    }

    return this.formatOffer(offer);
  }

  async validateOfferCode(code: string, gymId: number) {
    const offer = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(`SELECT * FROM offers WHERE code = $1`, [code]);
      return result.rows[0];
    });

    if (!offer) {
      return { valid: false, message: 'Offer code not found' };
    }

    if (!offer.is_active) {
      return { valid: false, message: 'Offer is not active' };
    }

    const now = new Date();
    if (new Date(offer.start_date) > now) {
      return { valid: false, message: 'Offer is not yet valid' };
    }

    if (new Date(offer.end_date) < now) {
      return { valid: false, message: 'Offer has expired' };
    }

    if (offer.max_usage && offer.current_usage >= offer.max_usage) {
      return { valid: false, message: 'Offer usage limit reached' };
    }

    return { valid: true, offer: this.formatOffer(offer) };
  }

  async create(dto: CreateOfferDto, gymId: number) {
    const existing = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(`SELECT id FROM offers WHERE code = $1`, [dto.code]);
      return result.rows[0];
    });

    if (existing) {
      throw new ConflictException(`Offer with code ${dto.code} already exists`);
    }

    const startDate = new Date(dto.validFrom);
    const endDate = new Date(dto.validTo);

    if (endDate <= startDate) {
      throw new BadRequestException('validTo must be after validFrom');
    }

    const offer = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO offers (code, name, description, discount_type, discount_value, start_date, end_date, max_usage, current_usage, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, true, NOW(), NOW())
         RETURNING *`,
        [
          dto.code,
          dto.name,
          dto.description || null,
          dto.discountType,
          dto.discountValue,
          startDate,
          endDate,
          dto.maxUsageCount || null,
        ]
      );
      return result.rows[0];
    });

    return this.formatOffer(offer);
  }

  async update(id: number, gymId: number, dto: UpdateOfferDto) {
    await this.findOne(id, gymId);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (dto.name) { updates.push(`name = $${paramIndex++}`); values.push(dto.name); }
    if (dto.description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(dto.description); }
    if (dto.discountType) { updates.push(`discount_type = $${paramIndex++}`); values.push(dto.discountType); }
    if (dto.discountValue !== undefined) { updates.push(`discount_value = $${paramIndex++}`); values.push(dto.discountValue); }
    if (dto.validFrom) { updates.push(`start_date = $${paramIndex++}`); values.push(new Date(dto.validFrom)); }
    if (dto.validTo) { updates.push(`end_date = $${paramIndex++}`); values.push(new Date(dto.validTo)); }
    if (dto.maxUsageCount !== undefined) { updates.push(`max_usage = $${paramIndex++}`); values.push(dto.maxUsageCount); }
    if (dto.isActive !== undefined) { updates.push(`is_active = $${paramIndex++}`); values.push(dto.isActive); }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const offer = await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE offers SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
      const result = await client.query(`SELECT * FROM offers WHERE id = $1`, [id]);
      return result.rows[0];
    });

    return this.formatOffer(offer);
  }

  async delete(id: number, gymId: number) {
    await this.findOne(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(`UPDATE offers SET is_active = false, updated_at = NOW() WHERE id = $1`, [id]);
    });

    return { id, deleted: true };
  }

  async incrementUsage(offerId: number, gymId: number) {
    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(`UPDATE offers SET current_usage = current_usage + 1, updated_at = NOW() WHERE id = $1`, [offerId]);
    });
  }
}
