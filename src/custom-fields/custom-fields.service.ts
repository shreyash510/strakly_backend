import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
  CustomFieldFiltersDto,
  UpsertCustomFieldValueDto,
} from './dto/custom-fields.dto';

@Injectable()
export class CustomFieldsService {
  constructor(private readonly tenantService: TenantService) {}

  private formatField(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      entityType: row.entity_type,
      name: row.name,
      label: row.label,
      fieldType: row.field_type,
      options: row.options,
      defaultValue: row.default_value,
      isRequired: row.is_required,
      isActive: row.is_active,
      isDeleted: row.is_deleted,
      visibility: row.visibility,
      displayOrder: row.display_order,
      validationRules: row.validation_rules,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get all custom field definitions for a gym, with optional filters and pagination.
   */
  async findAll(
    gymId: number,
    branchId: number | null,
    filters: CustomFieldFiltersDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['is_deleted = FALSE'];
      const values: any[] = [];
      let paramIndex = 1;

      if (filters.entityType) {
        conditions.push(`entity_type = $${paramIndex++}`);
        values.push(filters.entityType);
      }

      if (filters.isActive !== undefined) {
        conditions.push(`is_active = $${paramIndex++}`);
        values.push(filters.isActive === 'true');
      }

      if (branchId !== null) {
        conditions.push(`(branch_id = $${paramIndex++} OR branch_id IS NULL)`);
        values.push(branchId);
      }

      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      // Pagination
      const page = filters.page && filters.page > 0 ? filters.page : 1;
      const limit = filters.limit && filters.limit > 0 ? filters.limit : 50;
      const offset = (page - 1) * limit;

      const countResult = await client.query(
        `SELECT COUNT(*) FROM custom_fields ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      const result = await client.query(
        `SELECT * FROM custom_fields ${whereClause}
         ORDER BY display_order ASC, created_at ASC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset],
      );

      return {
        data: result.rows.map((r: Record<string, any>) => this.formatField(r)),
        total,
        page,
        limit,
      };
    });
  }

  /**
   * Get a single custom field definition by ID.
   */
  async findOne(id: number, gymId: number) {
    const field = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT * FROM custom_fields WHERE id = $1 AND is_deleted = FALSE`,
          [id],
        );
        return result.rows[0];
      },
    );

    if (!field) {
      throw new NotFoundException(`Custom field with ID ${id} not found`);
    }

    return this.formatField(field);
  }

  /**
   * Create a new custom field definition.
   */
  async create(
    dto: CreateCustomFieldDto,
    gymId: number,
    branchId: number | null,
    userId: number,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO custom_fields
          (branch_id, entity_type, name, label, field_type, options, default_value,
           is_required, visibility, display_order, validation_rules, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
         RETURNING *`,
        [
          branchId,
          dto.entityType,
          dto.name,
          dto.label,
          dto.fieldType,
          dto.options ? JSON.stringify(dto.options) : null,
          dto.defaultValue || null,
          dto.isRequired ?? false,
          dto.visibility || 'all',
          dto.displayOrder ?? 0,
          dto.validationRules ? JSON.stringify(dto.validationRules) : null,
          userId,
        ],
      );

      return this.formatField(result.rows[0]);
    });
  }

  /**
   * Update a custom field definition with dynamic parameterized queries.
   */
  async update(id: number, gymId: number, dto: UpdateCustomFieldDto) {
    await this.findOne(id, gymId);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (dto.label !== undefined) {
      updates.push(`label = $${paramIndex++}`);
      values.push(dto.label);
    }
    if (dto.fieldType !== undefined) {
      updates.push(`field_type = $${paramIndex++}`);
      values.push(dto.fieldType);
    }
    if (dto.options !== undefined) {
      updates.push(`options = $${paramIndex++}`);
      values.push(JSON.stringify(dto.options));
    }
    if (dto.defaultValue !== undefined) {
      updates.push(`default_value = $${paramIndex++}`);
      values.push(dto.defaultValue);
    }
    if (dto.isRequired !== undefined) {
      updates.push(`is_required = $${paramIndex++}`);
      values.push(dto.isRequired);
    }
    if (dto.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(dto.isActive);
    }
    if (dto.visibility !== undefined) {
      updates.push(`visibility = $${paramIndex++}`);
      values.push(dto.visibility);
    }
    if (dto.displayOrder !== undefined) {
      updates.push(`display_order = $${paramIndex++}`);
      values.push(dto.displayOrder);
    }
    if (dto.validationRules !== undefined) {
      updates.push(`validation_rules = $${paramIndex++}`);
      values.push(JSON.stringify(dto.validationRules));
    }

    if (updates.length === 0) {
      return this.findOne(id, gymId);
    }

    updates.push('updated_at = NOW()');
    values.push(id);

    return this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE custom_fields SET ${updates.join(', ')} WHERE id = $${paramIndex} AND is_deleted = FALSE`,
        values,
      );

      const result = await client.query(
        `SELECT * FROM custom_fields WHERE id = $1`,
        [id],
      );

      return this.formatField(result.rows[0]);
    });
  }

  /**
   * Soft-delete a custom field definition.
   */
  async softDelete(id: number, gymId: number) {
    await this.findOne(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE custom_fields SET is_deleted = TRUE, updated_at = NOW() WHERE id = $1`,
        [id],
      );
    });

    return { id, deleted: true };
  }

  /**
   * Bulk-update display_order for reordering custom fields.
   */
  async reorder(gymId: number, items: { id: number; displayOrder: number }[]) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      for (const item of items) {
        await client.query(
          `UPDATE custom_fields SET display_order = $1, updated_at = NOW() WHERE id = $2 AND is_deleted = FALSE`,
          [item.displayOrder, item.id],
        );
      }

      return { updated: items.length };
    });
  }

  /**
   * Get all custom field values for a specific entity, joined with field definitions.
   */
  async getEntityValues(
    gymId: number,
    entityType: string,
    entityId: number,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT
           cf.id AS field_id,
           cf.name,
           cf.label,
           cf.field_type,
           cf.options,
           cf.default_value,
           cf.is_required,
           cf.visibility,
           cf.display_order,
           cf.validation_rules,
           cfv.id AS value_id,
           cfv.value,
           cfv.file_url
         FROM custom_fields cf
         LEFT JOIN custom_field_values cfv
           ON cfv.custom_field_id = cf.id
           AND cfv.entity_id = $2
         WHERE cf.entity_type = $1
           AND cf.is_deleted = FALSE
           AND cf.is_active = TRUE
         ORDER BY cf.display_order ASC, cf.created_at ASC`,
        [entityType, entityId],
      );

      return result.rows.map((r: Record<string, any>) => ({
        fieldId: r.field_id,
        name: r.name,
        label: r.label,
        fieldType: r.field_type,
        options: r.options,
        defaultValue: r.default_value,
        isRequired: r.is_required,
        visibility: r.visibility,
        displayOrder: r.display_order,
        validationRules: r.validation_rules,
        valueId: r.value_id,
        value: r.value,
        fileUrl: r.file_url,
      }));
    });
  }

  /**
   * Upsert custom field values for a specific entity (INSERT ON CONFLICT DO UPDATE).
   */
  async upsertEntityValues(
    gymId: number,
    entityType: string,
    entityId: number,
    values: UpsertCustomFieldValueDto[],
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const results: any[] = [];

      for (const val of values) {
        const result = await client.query(
          `INSERT INTO custom_field_values (custom_field_id, entity_id, value, file_url, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (custom_field_id, entity_id)
           DO UPDATE SET value = $3, file_url = $4, updated_at = NOW()
           RETURNING *`,
          [
            val.fieldId,
            entityId,
            val.value || null,
            val.fileUrl || null,
          ],
        );

        results.push({
          id: result.rows[0].id,
          fieldId: result.rows[0].custom_field_id,
          entityId: result.rows[0].entity_id,
          value: result.rows[0].value,
          fileUrl: result.rows[0].file_url,
          updatedAt: result.rows[0].updated_at,
        });
      }

      return results;
    });
  }
}
