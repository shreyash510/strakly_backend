import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import {
  CreatePaymentDto,
  UpdatePaymentDto,
  PaymentFiltersDto,
  PaymentStatus,
  PaymentType,
} from './dto/payment.dto';

export interface PaymentRecord {
  id: number;
  branchId: number | null;
  paymentType: string;
  referenceId: number;
  referenceTable: string;
  payerType: string;
  payerId: number;
  payerName: string | null;
  payeeType: string | null;
  payeeId: number | null;
  payeeName: string | null;
  amount: number;
  currency: string;
  taxAmount: number;
  discountAmount: number;
  netAmount: number;
  paymentMethod: string;
  paymentRef: string | null;
  paymentGateway: string | null;
  paymentGatewayRef: string | null;
  status: string;
  failureReason: string | null;
  processedAt: Date | null;
  processedBy: number | null;
  notes: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  private formatPayment(p: any): PaymentRecord {
    return {
      id: p.id,
      branchId: p.branch_id,
      paymentType: p.payment_type,
      referenceId: p.reference_id,
      referenceTable: p.reference_table,
      payerType: p.payer_type,
      payerId: p.payer_id,
      payerName: p.payer_name,
      payeeType: p.payee_type,
      payeeId: p.payee_id,
      payeeName: p.payee_name,
      amount: parseFloat(p.amount),
      currency: p.currency,
      taxAmount: parseFloat(p.tax_amount || 0),
      discountAmount: parseFloat(p.discount_amount || 0),
      netAmount: parseFloat(p.net_amount),
      paymentMethod: p.payment_method,
      paymentRef: p.payment_ref,
      paymentGateway: p.payment_gateway,
      paymentGatewayRef: p.payment_gateway_ref,
      status: p.status,
      failureReason: p.failure_reason,
      processedAt: p.processed_at,
      processedBy: p.processed_by,
      notes: p.notes,
      metadata: p.metadata,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    };
  }

  /**
   * Find all payments with filters
   */
  async findAll(
    gymId: number,
    branchId: number | null = null,
    filters: PaymentFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const skip = (page - 1) * limit;

    const { payments, total } = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const conditions: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        // Branch filtering
        if (branchId !== null) {
          conditions.push(`branch_id = $${paramIndex++}`);
          values.push(branchId);
        }

        if (filters.paymentType) {
          conditions.push(`payment_type = $${paramIndex++}`);
          values.push(filters.paymentType);
        }

        if (filters.status) {
          conditions.push(`status = $${paramIndex++}`);
          values.push(filters.status);
        }

        if (filters.paymentMethod) {
          conditions.push(`payment_method = $${paramIndex++}`);
          values.push(filters.paymentMethod);
        }

        if (filters.payerId) {
          conditions.push(`payer_id = $${paramIndex++}`);
          values.push(filters.payerId);
        }

        if (filters.payerType) {
          conditions.push(`payer_type = $${paramIndex++}`);
          values.push(filters.payerType);
        }

        if (filters.startDate) {
          conditions.push(`created_at >= $${paramIndex++}`);
          values.push(new Date(filters.startDate));
        }

        if (filters.endDate) {
          conditions.push(`created_at <= $${paramIndex++}`);
          values.push(new Date(filters.endDate));
        }

        const whereClause =
          conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const [paymentsResult, countResult] = await Promise.all([
          client.query(
            `SELECT * FROM payments ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            [...values, limit, skip],
          ),
          client.query(
            `SELECT COUNT(*) as count FROM payments ${whereClause}`,
            values,
          ),
        ]);

        return {
          payments: paymentsResult.rows,
          total: parseInt(countResult.rows[0].count, 10),
        };
      },
    );

    return {
      data: payments.map((p: any) => this.formatPayment(p)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Find a payment by ID
   */
  async findOne(
    id: number,
    gymId: number,
    branchId: number | null = null,
  ): Promise<PaymentRecord> {
    const payment = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT * FROM payments WHERE id = $1`;
        const values: any[] = [id];

        if (branchId !== null) {
          query += ` AND branch_id = $2`;
          values.push(branchId);
        }

        const result = await client.query(query, values);
        return result.rows[0];
      },
    );

    if (!payment) {
      throw new NotFoundException(`Payment with ID ${id} not found`);
    }

    return this.formatPayment(payment);
  }

  /**
   * Find payments by reference (e.g., membership_id, salary_id)
   */
  async findByReference(
    referenceTable: string,
    referenceId: number,
    gymId: number,
  ): Promise<PaymentRecord[]> {
    const payments = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT * FROM payments WHERE reference_table = $1 AND reference_id = $2 ORDER BY created_at DESC`,
          [referenceTable, referenceId],
        );
        return result.rows;
      },
    );

    return payments.map((p: any) => this.formatPayment(p));
  }

  /**
   * Create a new payment record
   */
  async create(
    dto: CreatePaymentDto,
    gymId: number,
    processedBy?: number,
  ): Promise<PaymentRecord> {
    const payment = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO payments (
          branch_id, payment_type, reference_id, reference_table,
          payer_type, payer_id, payer_name,
          payee_type, payee_id, payee_name,
          amount, currency, tax_amount, discount_amount, net_amount,
          payment_method, payment_ref, payment_gateway, payment_gateway_ref,
          status, processed_at, processed_by, notes, metadata, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), $21, $22, $23, NOW(), NOW()
        ) RETURNING *`,
          [
            dto.branchId || null,
            dto.paymentType,
            dto.referenceId,
            dto.referenceTable,
            dto.payerType,
            dto.payerId,
            dto.payerName || null,
            dto.payeeType || null,
            dto.payeeId || null,
            dto.payeeName || null,
            dto.amount,
            dto.currency || 'INR',
            dto.taxAmount || 0,
            dto.discountAmount || 0,
            dto.netAmount,
            dto.paymentMethod,
            dto.paymentRef || null,
            dto.paymentGateway || null,
            dto.paymentGatewayRef || null,
            PaymentStatus.COMPLETED,
            processedBy || null,
            dto.notes || null,
            dto.metadata ? JSON.stringify(dto.metadata) : null,
          ],
        );
        return result.rows[0];
      },
    );

    return this.formatPayment(payment);
  }

  /**
   * Update a payment record
   */
  async update(
    id: number,
    gymId: number,
    dto: UpdatePaymentDto,
  ): Promise<PaymentRecord> {
    await this.findOne(id, gymId);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (dto.status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(dto.status);

      if (dto.status === PaymentStatus.COMPLETED) {
        updates.push(`processed_at = NOW()`);
      }
    }

    if (dto.paymentRef) {
      updates.push(`payment_ref = $${paramIndex++}`);
      values.push(dto.paymentRef);
    }

    if (dto.paymentGatewayRef) {
      updates.push(`payment_gateway_ref = $${paramIndex++}`);
      values.push(dto.paymentGatewayRef);
    }

    if (dto.failureReason) {
      updates.push(`failure_reason = $${paramIndex++}`);
      values.push(dto.failureReason);
    }

    if (dto.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(dto.notes);
    }

    if (dto.processedBy) {
      updates.push(`processed_by = $${paramIndex++}`);
      values.push(dto.processedBy);
    }

    if (dto.metadata) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(dto.metadata));
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    if (updates.length > 1) {
      await this.tenantService.executeInTenant(gymId, async (client) => {
        await client.query(
          `UPDATE payments SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values,
        );
      });
    }

    return this.findOne(id, gymId);
  }

  /**
   * Get payment statistics
   */
  async getStats(
    gymId: number,
    branchId: number | null = null,
    startDate?: Date,
    endDate?: Date,
  ) {
    const now = new Date();
    const start = startDate || new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate || now;

    const stats = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const branchFilter =
          branchId !== null ? ` AND branch_id = ${branchId}` : '';

        const [totalResult, byTypeResult, byMethodResult, byStatusResult] =
          await Promise.all([
            client.query(
              `SELECT
            COUNT(*) as total_count,
            COALESCE(SUM(net_amount), 0) as total_amount,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN net_amount ELSE 0 END), 0) as completed_amount
          FROM payments
          WHERE created_at >= $1 AND created_at <= $2${branchFilter}`,
              [start, end],
            ),
            client.query(
              `SELECT payment_type, COUNT(*) as count, COALESCE(SUM(net_amount), 0) as amount
           FROM payments
           WHERE created_at >= $1 AND created_at <= $2 AND status = 'completed'${branchFilter}
           GROUP BY payment_type`,
              [start, end],
            ),
            client.query(
              `SELECT payment_method, COUNT(*) as count, COALESCE(SUM(net_amount), 0) as amount
           FROM payments
           WHERE created_at >= $1 AND created_at <= $2 AND status = 'completed'${branchFilter}
           GROUP BY payment_method`,
              [start, end],
            ),
            client.query(
              `SELECT status, COUNT(*) as count
           FROM payments
           WHERE created_at >= $1 AND created_at <= $2${branchFilter}
           GROUP BY status`,
              [start, end],
            ),
          ]);

        return {
          totalCount: parseInt(totalResult.rows[0].total_count, 10),
          totalAmount: parseFloat(totalResult.rows[0].total_amount),
          completedAmount: parseFloat(totalResult.rows[0].completed_amount),
          byType: byTypeResult.rows.map((r: any) => ({
            type: r.payment_type,
            count: parseInt(r.count, 10),
            amount: parseFloat(r.amount),
          })),
          byMethod: byMethodResult.rows.map((r: any) => ({
            method: r.payment_method,
            count: parseInt(r.count, 10),
            amount: parseFloat(r.amount),
          })),
          byStatus: byStatusResult.rows.map((r: any) => ({
            status: r.status,
            count: parseInt(r.count, 10),
          })),
        };
      },
    );

    return stats;
  }

  /**
   * Create payment for membership
   */
  async createMembershipPayment(
    membershipId: number,
    gymId: number,
    branchId: number | null,
    payerId: number,
    payerName: string,
    amount: number,
    discountAmount: number,
    netAmount: number,
    paymentMethod: string,
    paymentRef?: string,
    processedBy?: number,
  ): Promise<PaymentRecord> {
    return this.create(
      {
        branchId: branchId || undefined,
        paymentType: PaymentType.MEMBERSHIP,
        referenceId: membershipId,
        referenceTable: 'memberships',
        payerType: 'client',
        payerId,
        payerName,
        amount,
        discountAmount,
        netAmount,
        paymentMethod,
        paymentRef,
      },
      gymId,
      processedBy,
    );
  }

  /**
   * Create payment for salary
   */
  async createSalaryPayment(
    salaryId: number,
    gymId: number,
    branchId: number | null,
    staffId: number,
    staffName: string,
    amount: number,
    paymentMethod: string,
    paymentRef?: string,
    processedBy?: number,
  ): Promise<PaymentRecord> {
    return this.create(
      {
        branchId: branchId || undefined,
        paymentType: PaymentType.SALARY,
        referenceId: salaryId,
        referenceTable: 'staff_salaries',
        payerType: 'gym',
        payerId: gymId,
        payeeType: 'staff',
        payeeId: staffId,
        payeeName: staffName,
        amount,
        netAmount: amount,
        paymentMethod,
        paymentRef,
      },
      gymId,
      processedBy,
    );
  }
}
