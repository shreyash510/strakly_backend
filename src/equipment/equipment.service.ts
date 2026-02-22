import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateEquipmentDto,
  UpdateEquipmentDto,
  CreateMaintenanceDto,
  UpdateMaintenanceDto,
  EquipmentFiltersDto,
  MaintenanceFiltersDto,
  MaintenanceStatus,
} from './dto/equipment.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class EquipmentService {
  constructor(private readonly tenantService: TenantService) {}

  private formatEquipment(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      name: row.name,
      brand: row.brand,
      model: row.model,
      serialNumber: row.serial_number,
      purchaseDate: row.purchase_date,
      purchaseCost: row.purchase_cost ? parseFloat(row.purchase_cost) : null,
      warrantyExpiry: row.warranty_expiry,
      status: row.status,
      location: row.location,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatMaintenance(row: Record<string, any>) {
    return {
      id: row.id,
      equipmentId: row.equipment_id,
      equipmentName: row.equipment_name,
      branchId: row.branch_id,
      type: row.type,
      description: row.description,
      scheduledDate: row.scheduled_date,
      completedDate: row.completed_date,
      performedBy: row.performed_by,
      performedByName: row.performed_by_name,
      cost: row.cost ? parseFloat(row.cost) : null,
      notes: row.notes,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ─── Equipment CRUD ───

  async findAll(
    gymId: number,
    branchId: number | null,
    filters: EquipmentFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['e.is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`e.branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      if (filters.status) {
        conditions.push(`e.status = $${paramIndex++}`);
        values.push(filters.status);
      }

      if (filters.location) {
        conditions.push(`e.location ILIKE $${paramIndex++}`);
        values.push(`%${filters.location}%`);
      }

      if (filters.search) {
        conditions.push(
          `(e.name ILIKE $${paramIndex} OR e.brand ILIKE $${paramIndex} OR e.model ILIKE $${paramIndex} OR e.serial_number ILIKE $${paramIndex})`,
        );
        values.push(`%${filters.search}%`);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM equipment e WHERE ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].total);

      const result = await client.query(
        `SELECT e.* FROM equipment e
         WHERE ${whereClause}
         ORDER BY e.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset],
      );

      return {
        data: result.rows.map((r) => this.formatEquipment(r)),
        total,
        page,
        limit,
      };
    });
  }

  async findOne(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM equipment WHERE id = $1 AND is_deleted = FALSE`,
        [id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Equipment with ID ${id} not found`);
      }

      return this.formatEquipment(result.rows[0]);
    });
  }

  async create(
    gymId: number,
    branchId: number | null,
    dto: CreateEquipmentDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO equipment (branch_id, name, brand, model, serial_number, purchase_date, purchase_cost, warranty_expiry, status, location, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          branchId,
          dto.name,
          dto.brand || null,
          dto.model || null,
          dto.serialNumber || null,
          dto.purchaseDate || null,
          dto.purchaseCost || null,
          dto.warrantyExpiry || null,
          dto.status || 'operational',
          dto.location || null,
          dto.notes || null,
        ],
      );

      return this.formatEquipment(result.rows[0]);
    });
  }

  async update(id: number, gymId: number, dto: UpdateEquipmentDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const existing = await client.query(
        `SELECT id FROM equipment WHERE id = $1 AND is_deleted = FALSE`,
        [id],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Equipment with ID ${id} not found`);
      }

      const fields: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      const fieldMap: Record<string, string> = {
        name: 'name',
        brand: 'brand',
        model: 'model',
        serialNumber: 'serial_number',
        purchaseDate: 'purchase_date',
        purchaseCost: 'purchase_cost',
        warrantyExpiry: 'warranty_expiry',
        status: 'status',
        location: 'location',
        notes: 'notes',
      };

      for (const [dtoKey, dbCol] of Object.entries(fieldMap)) {
        if ((dto as any)[dtoKey] !== undefined) {
          fields.push(`${dbCol} = $${paramIndex++}`);
          values.push((dto as any)[dtoKey]);
        }
      }

      if (fields.length === 0) {
        return this.findOne(id, gymId);
      }

      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const result = await client.query(
        `UPDATE equipment SET ${fields.join(', ')} WHERE id = $${paramIndex} AND is_deleted = FALSE RETURNING *`,
        values,
      );

      return this.formatEquipment(result.rows[0]);
    });
  }

  async softDelete(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `UPDATE equipment SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = FALSE RETURNING id`,
        [id],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Equipment with ID ${id} not found`);
      }

      return { message: 'Equipment deleted successfully' };
    });
  }

  async getStats(gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const branchFilter = branchId !== null ? `AND branch_id = $1` : '';
      const branchValues = branchId !== null ? [branchId] : [];

      const countByStatus = await client.query(
        `SELECT status, COUNT(*) as count FROM equipment WHERE is_deleted = FALSE ${branchFilter} GROUP BY status`,
        branchValues,
      );

      const totalCost = await client.query(
        `SELECT COALESCE(SUM(purchase_cost), 0) as total FROM equipment WHERE is_deleted = FALSE ${branchFilter}`,
        branchValues,
      );

      const warrantyExpiring = await client.query(
        `SELECT COUNT(*) as count FROM equipment WHERE is_deleted = FALSE AND warranty_expiry IS NOT NULL AND warranty_expiry <= CURRENT_DATE + INTERVAL '30 days' AND warranty_expiry >= CURRENT_DATE ${branchFilter}`,
        branchValues,
      );

      const maintenanceDue = await client.query(
        `SELECT COUNT(*) as count FROM equipment_maintenance WHERE is_deleted = FALSE AND status = 'scheduled' AND scheduled_date <= CURRENT_DATE + INTERVAL '7 days' ${branchFilter}`,
        branchValues,
      );

      const statusCounts = countByStatus.rows.reduce(
        (acc, row) => ({ ...acc, [row.status]: parseInt(row.count) }),
        {} as Record<string, number>,
      );

      const totalEquipment = Object.values(statusCounts).reduce((sum: number, c: number) => sum + c, 0);

      return {
        totalEquipment,
        operational: statusCounts['operational'] || 0,
        underMaintenance: statusCounts['under_maintenance'] || 0,
        outOfOrder: statusCounts['out_of_order'] || 0,
        retired: statusCounts['retired'] || 0,
        totalPurchaseCost: parseFloat(totalCost.rows[0].total),
        warrantyExpiringSoon: parseInt(warrantyExpiring.rows[0].count),
        maintenanceDueSoon: parseInt(maintenanceDue.rows[0].count),
      };
    });
  }

  // ─── Maintenance CRUD ───

  async getMaintenanceForEquipment(
    equipmentId: number,
    gymId: number,
    filters: MaintenanceFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [
        'm.is_deleted = FALSE',
        `m.equipment_id = $1`,
      ];
      const values: SqlValue[] = [equipmentId];
      let paramIndex = 2;

      if (filters.type) {
        conditions.push(`m.type = $${paramIndex++}`);
        values.push(filters.type);
      }

      if (filters.status) {
        conditions.push(`m.status = $${paramIndex++}`);
        values.push(filters.status);
      }

      if (filters.startDate) {
        conditions.push(`m.scheduled_date >= $${paramIndex++}`);
        values.push(filters.startDate);
      }

      if (filters.endDate) {
        conditions.push(`m.scheduled_date <= $${paramIndex++}`);
        values.push(filters.endDate);
      }

      const whereClause = conditions.join(' AND ');

      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM equipment_maintenance m WHERE ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].total);

      const result = await client.query(
        `SELECT m.*, e.name as equipment_name, u.name as performed_by_name
         FROM equipment_maintenance m
         LEFT JOIN equipment e ON e.id = m.equipment_id
         LEFT JOIN users u ON u.id = m.performed_by
         WHERE ${whereClause}
         ORDER BY m.scheduled_date DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset],
      );

      return {
        data: result.rows.map((r) => this.formatMaintenance(r)),
        total,
        page,
        limit,
      };
    });
  }

  async createMaintenance(
    equipmentId: number,
    gymId: number,
    branchId: number | null,
    dto: CreateMaintenanceDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const equip = await client.query(
        `SELECT id, branch_id FROM equipment WHERE id = $1 AND is_deleted = FALSE`,
        [equipmentId],
      );
      if (equip.rows.length === 0) {
        throw new NotFoundException(
          `Equipment with ID ${equipmentId} not found`,
        );
      }

      const result = await client.query(
        `INSERT INTO equipment_maintenance (equipment_id, branch_id, type, description, scheduled_date, completed_date, performed_by, cost, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          equipmentId,
          branchId || equip.rows[0].branch_id,
          dto.type,
          dto.description,
          dto.scheduledDate,
          dto.completedDate || null,
          dto.performedBy || null,
          dto.cost || null,
          dto.notes || null,
          dto.status || 'scheduled',
        ],
      );

      return this.formatMaintenance(result.rows[0]);
    });
  }

  async updateMaintenance(
    maintenanceId: number,
    gymId: number,
    dto: UpdateMaintenanceDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const existing = await client.query(
        `SELECT id, equipment_id FROM equipment_maintenance WHERE id = $1 AND is_deleted = FALSE`,
        [maintenanceId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(
          `Maintenance record with ID ${maintenanceId} not found`,
        );
      }

      const fields: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      const fieldMap: Record<string, string> = {
        type: 'type',
        description: 'description',
        scheduledDate: 'scheduled_date',
        completedDate: 'completed_date',
        performedBy: 'performed_by',
        cost: 'cost',
        notes: 'notes',
        status: 'status',
      };

      for (const [dtoKey, dbCol] of Object.entries(fieldMap)) {
        if ((dto as any)[dtoKey] !== undefined) {
          fields.push(`${dbCol} = $${paramIndex++}`);
          values.push((dto as any)[dtoKey]);
        }
      }

      // Auto-set completed_date when marking as completed
      if (
        dto.status === MaintenanceStatus.COMPLETED &&
        !dto.completedDate
      ) {
        fields.push(`completed_date = CURRENT_DATE`);
      }

      if (fields.length === 0) {
        return this.formatMaintenance(existing.rows[0]);
      }

      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(maintenanceId);

      const result = await client.query(
        `UPDATE equipment_maintenance SET ${fields.join(', ')} WHERE id = $${paramIndex} AND is_deleted = FALSE RETURNING *`,
        values,
      );

      // If repair completed, set equipment back to operational
      if (dto.status === MaintenanceStatus.COMPLETED) {
        const maint = result.rows[0];
        if (maint.type === 'repair') {
          await client.query(
            `UPDATE equipment SET status = 'operational', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [maint.equipment_id],
          );
        }
      }

      return this.formatMaintenance(result.rows[0]);
    });
  }

  async softDeleteMaintenance(maintenanceId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `UPDATE equipment_maintenance SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = FALSE RETURNING id`,
        [maintenanceId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(
          `Maintenance record with ID ${maintenanceId} not found`,
        );
      }

      return { message: 'Maintenance record deleted successfully' };
    });
  }

  async getUpcomingMaintenance(
    gymId: number,
    branchId: number | null,
    filters: MaintenanceFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [
        'm.is_deleted = FALSE',
        `m.status = 'scheduled'`,
        `m.scheduled_date >= CURRENT_DATE`,
      ];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`m.branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      const whereClause = conditions.join(' AND ');

      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM equipment_maintenance m WHERE ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].total);

      const result = await client.query(
        `SELECT m.*, e.name as equipment_name, u.name as performed_by_name
         FROM equipment_maintenance m
         LEFT JOIN equipment e ON e.id = m.equipment_id
         LEFT JOIN users u ON u.id = m.performed_by
         WHERE ${whereClause}
         ORDER BY m.scheduled_date ASC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset],
      );

      return {
        data: result.rows.map((r) => this.formatMaintenance(r)),
        total,
        page,
        limit,
      };
    });
  }
}
