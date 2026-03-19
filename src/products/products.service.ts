import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../database/prisma.service';
import {
  CreateProductCategoryDto,
  UpdateProductCategoryDto,
  CreateProductDto,
  UpdateProductDto,
  AdjustStockDto,
  CreateProductSaleDto,
  CreateBatchSaleDto,
  ProductFiltersDto,
  SalesFiltersDto,
  SalesStatsFiltersDto,
  StockMovementFiltersDto,
  SalesTrendFiltersDto,
  AllStockMovementsFiltersDto,
  BatchStockAdjustDto,
  StockTakeFiltersDto,
  UpdateStockTakeItemDto,
  CompleteStockTakeDto,
  StartStockTakeDto,
} from './dto/products.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class ProductsService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly paymentsService: PaymentsService,
    private readonly prisma: PrismaService,
  ) { }

  private formatCategory(row: Record<string, any>) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      displayOrder: row.display_order,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatProduct(row: Record<string, any>) {
    return {
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      name: row.name,
      sku: row.sku,
      barcode: row.barcode,
      description: row.description,
      price: row.price ? parseFloat(row.price) : 0,
      costPrice: row.cost_price ? parseFloat(row.cost_price) : null,
      taxRate: row.tax_rate ? parseFloat(row.tax_rate) : 0,
      stockQuantity: row.stock_quantity,
      lowStockThreshold: row.low_stock_threshold,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatSale(row: Record<string, any>) {
    return {
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      userId: row.user_id,
      buyerName: row.buyer_name,
      quantity: row.quantity,
      unitPrice: row.unit_price ? parseFloat(row.unit_price) : 0,
      taxAmount: row.tax_amount ? parseFloat(row.tax_amount) : 0,
      totalAmount: row.total_amount ? parseFloat(row.total_amount) : 0,
      paymentMethod: row.payment_method,
      paymentId: row.payment_id,
      soldBy: row.sold_by,
      soldByName: row.sold_by_name,
      soldAt: row.sold_at,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ─── Categories ───

  async findAllCategories(gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['(is_deleted = FALSE OR is_deleted IS NULL)'];
      const values: SqlValue[] = [];

      const result = await client.query(
        `SELECT * FROM product_categories WHERE ${conditions.join(' AND ')} ORDER BY display_order ASC, name ASC`,
        values,
      );

      return result.rows.map((r) => this.formatCategory(r));
    });
  }

  async createCategory(
    gymId: number,
    branchId: number | null,
    dto: CreateProductCategoryDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO product_categories (branch_id, name, description, display_order)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [branchId, dto.name, dto.description || null, dto.displayOrder || 0],
      );
      return this.formatCategory(result.rows[0]);
    });
  }

  async updateCategory(
    id: number,
    gymId: number,
    dto: UpdateProductCategoryDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const existing = await client.query(
        `SELECT id FROM product_categories WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL)`,
        [id],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }

      const fields: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (dto.name !== undefined) {
        fields.push(`name = $${paramIndex++}`);
        values.push(dto.name);
      }
      if (dto.description !== undefined) {
        fields.push(`description = $${paramIndex++}`);
        values.push(dto.description);
      }
      if (dto.displayOrder !== undefined) {
        fields.push(`display_order = $${paramIndex++}`);
        values.push(dto.displayOrder);
      }

      if (fields.length === 0) {
        return this.formatCategory(existing.rows[0]);
      }

      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const result = await client.query(
        `UPDATE product_categories SET ${fields.join(', ')} WHERE id = $${paramIndex} AND is_deleted = FALSE RETURNING *`,
        values,
      );
      return this.formatCategory(result.rows[0]);
    });
  }

  async softDeleteCategory(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `UPDATE product_categories SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = FALSE RETURNING id`,
        [id],
      );
      if (result.rows.length === 0) {
        throw new NotFoundException(`Category with ID ${id} not found`);
      }
      return { message: 'Category deleted successfully' };
    });
  }

  // ─── Products ───

  async findAllProducts(
    gymId: number,
    branchId: number | null,
    filters: ProductFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['p.is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (filters.categoryId) {
        conditions.push(`p.category_id = $${paramIndex++}`);
        values.push(filters.categoryId);
      }

      if (filters.isActive !== undefined) {
        conditions.push(`p.is_active = $${paramIndex++}`);
        values.push(filters.isActive);
      }

      if (filters.search) {
        conditions.push(
          `(p.name ILIKE $${paramIndex} OR p.sku ILIKE $${paramIndex} OR p.barcode ILIKE $${paramIndex})`,
        );
        values.push(`%${filters.search}%`);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM products p WHERE ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].total);

      const result = await client.query(
        `SELECT p.*, pc.name as category_name
         FROM products p
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.is_deleted = FALSE
         WHERE ${whereClause}
         ORDER BY p.name ASC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset],
      );

      return {
        data: result.rows.map((r) => this.formatProduct(r)),
        total,
        page,
        limit,
      };
    });
  }

  async findOneProduct(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT p.*, pc.name as category_name
         FROM products p
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.is_deleted = FALSE
         WHERE p.id = $1 AND p.is_deleted = FALSE`,
        [id],
      );
      if (result.rows.length === 0) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }
      return this.formatProduct(result.rows[0]);
    });
  }

  async findLowStockProducts(gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [
        'p.is_deleted = FALSE',
        'p.is_active = TRUE',
        'p.stock_quantity <= p.low_stock_threshold',
      ];
      const values: SqlValue[] = [];

      const result = await client.query(
        `SELECT p.*, pc.name as category_name
         FROM products p
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.is_deleted = FALSE
         WHERE ${conditions.join(' AND ')}
         ORDER BY p.stock_quantity ASC`,
        values,
      );

      return result.rows.map((r) => this.formatProduct(r));
    });
  }

  async createProduct(
    gymId: number,
    branchId: number | null,
    dto: CreateProductDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO products (branch_id, category_id, name, sku, barcode, description, price, cost_price, tax_rate, stock_quantity, low_stock_threshold, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [
          branchId,
          dto.categoryId || null,
          dto.name,
          dto.sku || null,
          dto.barcode || null,
          dto.description || null,
          dto.price,
          dto.costPrice || null,
          dto.taxRate || 0,
          dto.stockQuantity ?? 0,
          dto.lowStockThreshold ?? 5,
          dto.isActive ?? true,
        ],
      );

      return this.formatProduct(result.rows[0]);
    });
  }

  async updateProduct(id: number, gymId: number, dto: UpdateProductDto) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const existing = await client.query(
        `SELECT id FROM products WHERE id = $1 AND is_deleted = FALSE`,
        [id],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }

      const fields: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      const fieldMap: Record<string, string> = {
        categoryId: 'category_id',
        name: 'name',
        sku: 'sku',
        barcode: 'barcode',
        description: 'description',
        price: 'price',
        costPrice: 'cost_price',
        taxRate: 'tax_rate',
        lowStockThreshold: 'low_stock_threshold',
        isActive: 'is_active',
      };

      for (const [dtoKey, dbCol] of Object.entries(fieldMap)) {
        if ((dto as any)[dtoKey] !== undefined) {
          fields.push(`${dbCol} = $${paramIndex++}`);
          values.push((dto as any)[dtoKey]);
        }
      }

      if (fields.length === 0) {
        return this.findOneProduct(id, gymId);
      }

      fields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);

      const result = await client.query(
        `UPDATE products SET ${fields.join(', ')} WHERE id = $${paramIndex} AND is_deleted = FALSE RETURNING *`,
        values,
      );

      return this.formatProduct(result.rows[0]);
    });
  }

  async adjustStock(id: number, gymId: number, dto: AdjustStockDto, userId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Get current stock before adjustment
      const current = await client.query(
        `SELECT stock_quantity, branch_id FROM products WHERE id = $1 AND is_deleted = FALSE`,
        [id],
      );
      if (current.rows.length === 0) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }

      const stockBefore = current.rows[0].stock_quantity;
      const stockAfter = stockBefore + dto.adjustment;

      if (stockAfter < 0) {
        throw new BadRequestException(
          `Insufficient stock. Current stock: ${stockBefore}, adjustment: ${dto.adjustment}`,
        );
      }

      const result = await client.query(
        `UPDATE products SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND is_deleted = FALSE
         RETURNING *`,
        [stockAfter, id],
      );

      // Record stock movement
      await client.query(
        `INSERT INTO product_stock_movements (product_id, branch_id, movement_type, quantity, stock_before, stock_after, reason, performed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, current.rows[0].branch_id, 'adjustment', dto.adjustment, stockBefore, stockAfter, dto.reason || null, userId],
      );

      return this.formatProduct(result.rows[0]);
    });
  }

  /* ─── Batch Stock Adjustment ─── */

  async batchStockAdjust(gymId: number, dto: BatchStockAdjustDto, userId: number) {
    return this.tenantService.executeInTenantTransaction(gymId, async (client) => {
      const results: Array<{
        productId: number;
        productName: string;
        stockBefore: number;
        stockAfter: number;
        quantity: number;
      }> = [];

      for (const item of dto.items) {
        /* Fetch current product and lock the row */
        const current = await client.query(
          `SELECT id, name, stock_quantity, branch_id
           FROM products
           WHERE id = $1 AND is_deleted = FALSE
           FOR UPDATE`,
          [item.productId],
        );

        if (current.rows.length === 0) {
          throw new NotFoundException(`Product with ID ${item.productId} not found`);
        }

        const product = current.rows[0];
        const stockBefore: number = parseInt(product.stock_quantity);
        let stockAfter: number;

        /* Determine direction based on movementType */
        if (dto.movementType === 'receive' || dto.movementType === 'return') {
          stockAfter = stockBefore + item.quantity;
        } else if (dto.movementType === 'damage') {
          if (stockBefore < item.quantity) {
            throw new BadRequestException(
              `Insufficient stock for "${product.name}" (ID: ${item.productId}). Current: ${stockBefore}, requested: ${item.quantity}`,
            );
          }
          stockAfter = stockBefore - item.quantity;
        } else {
          /* 'adjustment' — treat quantity as additive; caller controls sign via movementType choice */
          stockAfter = stockBefore + item.quantity;
        }

        /* Update stock */
        await client.query(
          `UPDATE products SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [stockAfter, item.productId],
        );

        /* Determine signed quantity for the movement record */
        const signedQuantity =
          dto.movementType === 'damage' ? -item.quantity : item.quantity;

        /* Record stock movement */
        await client.query(
          `INSERT INTO product_stock_movements
             (product_id, branch_id, movement_type, quantity, stock_before, stock_after, reason, performed_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            item.productId,
            product.branch_id,
            dto.movementType,
            signedQuantity,
            stockBefore,
            stockAfter,
            item.reason || dto.notes || null,
            userId,
          ],
        );

        results.push({
          productId: item.productId,
          productName: product.name,
          stockBefore,
          stockAfter,
          quantity: signedQuantity,
        });
      }

      return {
        adjusted: results.length,
        movementType: dto.movementType,
        items: results,
      };
    });
  }

  async softDeleteProduct(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `UPDATE products SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = $1 AND is_deleted = FALSE RETURNING id`,
        [id],
      );
      if (result.rows.length === 0) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }
      return { message: 'Product deleted successfully' };
    });
  }

  // ─── Sales ───

  async findAllSales(
    gymId: number,
    branchId: number | null,
    filters: SalesFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['(s.is_deleted = FALSE OR s.is_deleted IS NULL)'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (filters.productId) {
        conditions.push(`s.product_id = $${paramIndex++}`);
        values.push(filters.productId);
      }

      if (filters.userId) {
        conditions.push(`s.user_id = $${paramIndex++}`);
        values.push(filters.userId);
      }

      if (filters.soldBy) {
        conditions.push(`s.sold_by = $${paramIndex++}`);
        values.push(filters.soldBy);
      }

      if (filters.paymentMethod) {
        conditions.push(`s.payment_method = $${paramIndex++}`);
        values.push(filters.paymentMethod);
      }

      if (filters.startDate) {
        conditions.push(`s.sold_at >= $${paramIndex++}::DATE`);
        values.push(filters.startDate);
      }

      if (filters.endDate) {
        conditions.push(`s.sold_at < ($${paramIndex++}::DATE + INTERVAL '1 day')`);
        values.push(filters.endDate);
      }

      const whereClause = conditions.join(' AND ');

      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM product_sales s WHERE ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].total);

      const result = await client.query(
        `SELECT s.*, p.name as product_name, u.name as buyer_name, staff.name as sold_by_name
         FROM product_sales s
         LEFT JOIN products p ON p.id = s.product_id
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN users staff ON staff.id = s.sold_by
         WHERE ${whereClause}
         ORDER BY s.sold_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset],
      );

      return {
        data: result.rows.map((r) => this.formatSale(r)),
        total,
        page,
        limit,
      };
    });
  }

  /**
   * Returns sales grouped by transaction (payment_id).
   * Each transaction row includes nested items array.
   * Single sales without payment_id are treated as their own transaction.
   */
  async findSalesTransactions(
    gymId: number,
    branchId: number | null,
    filters: SalesFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['(s.is_deleted = FALSE OR s.is_deleted IS NULL)'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (filters.paymentMethod) {
        conditions.push(`s.payment_method = $${paramIndex++}`);
        values.push(filters.paymentMethod);
      }

      if (filters.startDate) {
        conditions.push(`s.sold_at >= $${paramIndex++}::DATE`);
        values.push(filters.startDate);
      }

      if (filters.endDate) {
        conditions.push(`s.sold_at < ($${paramIndex++}::DATE + INTERVAL '1 day')`);
        values.push(filters.endDate);
      }

      if (filters.search) {
        conditions.push(`(p.name ILIKE $${paramIndex} OR u.name ILIKE $${paramIndex})`);
        values.push(`%${filters.search}%`);
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      // Count distinct transactions (group key = COALESCE(payment_id, -id) to make single sales unique)
      const countResult = await client.query(
        `SELECT COUNT(DISTINCT COALESCE(s.payment_id::text, 'single_' || s.id::text)) as total
         FROM product_sales s
         LEFT JOIN products p ON p.id = s.product_id
         LEFT JOIN users u ON u.id = s.user_id
         WHERE ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].total);

      // Get paginated transaction keys
      const txKeysResult = await client.query(
        `SELECT
           COALESCE(s.payment_id::text, 'single_' || s.id::text) as tx_key,
           MAX(s.sold_at) as last_sold_at
         FROM product_sales s
         LEFT JOIN products p ON p.id = s.product_id
         LEFT JOIN users u ON u.id = s.user_id
         WHERE ${whereClause}
         GROUP BY tx_key
         ORDER BY last_sold_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset],
      );

      if (txKeysResult.rows.length === 0) {
        return { data: [], total, page, limit };
      }

      // Extract payment_ids and single sale ids from transaction keys
      const paymentIds: number[] = [];
      const singleSaleIds: number[] = [];
      for (const row of txKeysResult.rows) {
        const key = row.tx_key as string;
        if (key.startsWith('single_')) {
          singleSaleIds.push(parseInt(key.replace('single_', '')));
        } else {
          paymentIds.push(parseInt(key));
        }
      }

      // Build condition to fetch all sale rows for these transactions
      const fetchConditions: string[] = ['(s.is_deleted = FALSE OR s.is_deleted IS NULL)'];
      const fetchValues: SqlValue[] = [];
      let fetchParamIndex = 1;
      const orParts: string[] = [];

      if (paymentIds.length > 0) {
        orParts.push(`s.payment_id = ANY($${fetchParamIndex++})`);
        fetchValues.push(paymentIds);
      }
      if (singleSaleIds.length > 0) {
        orParts.push(`(s.payment_id IS NULL AND s.id = ANY($${fetchParamIndex++}))`);
        fetchValues.push(singleSaleIds);
      }
      fetchConditions.push(`(${orParts.join(' OR ')})`);

      const salesResult = await client.query(
        `SELECT s.*, p.name as product_name, u.name as buyer_name, staff.name as sold_by_name
         FROM product_sales s
         LEFT JOIN products p ON p.id = s.product_id
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN users staff ON staff.id = s.sold_by
         WHERE ${fetchConditions.join(' AND ')}
         ORDER BY s.sold_at DESC`,
        fetchValues,
      );

      // Group into transactions
      const txMap = new Map<string, any[]>();
      for (const row of salesResult.rows) {
        const key = row.payment_id ? String(row.payment_id) : `single_${row.id}`;
        if (!txMap.has(key)) txMap.set(key, []);
        txMap.get(key)!.push(this.formatSale(row));
      }

      // Build response in same order as txKeysResult
      const transactions = txKeysResult.rows.map((r) => {
        const key = r.tx_key as string;
        const items = txMap.get(key) || [];
        const first = items[0];
        return {
          transactionKey: key,
          paymentId: first?.paymentId || null,
          receiptNumber: first?.paymentId
            ? `INV-${String(first.paymentId).padStart(5, '0')}`
            : `SALE-${String(first?.id || 0).padStart(5, '0')}`,
          items,
          itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
          totalAmount: items.reduce((sum, i) => sum + i.totalAmount, 0),
          paymentMethod: first?.paymentMethod || 'cash',
          soldAt: first?.soldAt,
          buyerName: first?.buyerName || null,
          soldByName: first?.soldByName || null,
          notes: first?.notes || null,
        };
      });

      return { data: transactions, total, page, limit };
    });
  }

  async findOneSale(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT s.*, p.name as product_name, u.name as buyer_name, staff.name as sold_by_name
         FROM product_sales s
         LEFT JOIN products p ON p.id = s.product_id
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN users staff ON staff.id = s.sold_by
         WHERE s.id = $1 AND s.is_deleted = FALSE`,
        [id],
      );
      if (result.rows.length === 0) {
        throw new NotFoundException(`Sale with ID ${id} not found`);
      }
      return this.formatSale(result.rows[0]);
    });
  }

  async createSale(
    gymId: number,
    branchId: number | null,
    dto: CreateProductSaleDto,
    soldBy: number,
  ) {
    return this.tenantService.executeInTenantTransaction(gymId, async (client) => {
      // Verify product and decrement stock atomically
      const product = await client.query(
        `UPDATE products SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND is_deleted = FALSE AND is_active = TRUE AND stock_quantity >= $1
         RETURNING *`,
        [dto.quantity, dto.productId],
      );

      if (product.rows.length === 0) {
        const exists = await client.query(
          `SELECT id, is_active, stock_quantity FROM products WHERE id = $1 AND is_deleted = FALSE`,
          [dto.productId],
        );
        if (exists.rows.length === 0) {
          throw new NotFoundException(`Product with ID ${dto.productId} not found`);
        }
        if (!exists.rows[0].is_active) {
          throw new BadRequestException(`Product is not active`);
        }
        throw new BadRequestException(
          `Insufficient stock. Available: ${exists.rows[0].stock_quantity}, requested: ${dto.quantity}`,
        );
      }

      const p = product.rows[0];
      const unitPrice = parseFloat(p.price);
      const taxRate = parseFloat(p.tax_rate) || 0;
      const subtotal = unitPrice * dto.quantity;
      const taxAmount = subtotal * (taxRate / 100);
      const totalAmount = subtotal + taxAmount;

      // Create sale record
      const sale = await client.query(
        `INSERT INTO product_sales (branch_id, product_id, user_id, quantity, unit_price, tax_amount, total_amount, payment_method, sold_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          branchId,
          dto.productId,
          dto.userId || null,
          dto.quantity,
          unitPrice,
          taxAmount,
          totalAmount,
          dto.paymentMethod,
          soldBy,
          dto.notes || null,
        ],
      );

      const saleRecord = sale.rows[0];

      // Record stock movement
      const stockBefore = parseInt(p.stock_quantity) + dto.quantity; // stock before decrement
      const stockAfter = parseInt(p.stock_quantity); // RETURNING gave us the post-update value
      await client.query(
        `INSERT INTO product_stock_movements (product_id, branch_id, movement_type, quantity, stock_before, stock_after, reference_id, performed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [dto.productId, branchId, 'sale', -dto.quantity, stockBefore, stockAfter, saleRecord.id, soldBy],
      );

      // Create payment record
      const buyerName = dto.userId
        ? (
          await client.query(`SELECT name FROM users WHERE id = $1`, [
            dto.userId,
          ])
        ).rows[0]?.name || 'Unknown'
        : 'Walk-in';

      const payment = await this.paymentsService.createProductSalePaymentWithClient(
        client,
        saleRecord.id,
        branchId,
        dto.userId || null,
        buyerName,
        totalAmount,
        taxAmount,
        totalAmount,
        dto.paymentMethod,
        soldBy,
      );

      // Link payment to sale
      await client.query(
        `UPDATE product_sales SET payment_id = $1 WHERE id = $2`,
        [payment.id, saleRecord.id],
      );

      return {
        ...this.formatSale({ ...saleRecord, product_name: p.name }),
        paymentId: payment.id,
      };
    });
  }

  async createBatchSale(
    gymId: number,
    branchId: number | null,
    dto: CreateBatchSaleDto,
    soldBy: number,
  ) {
    return this.tenantService.executeInTenantTransaction(gymId, async (client) => {
      // Validate all products and stock upfront
      const productIds = dto.items.map((i) => i.productId);
      const products = await client.query(
        `SELECT id, name, price, tax_rate, stock_quantity, is_active FROM products
         WHERE id = ANY($1) AND is_deleted = FALSE`,
        [productIds],
      );

      const productMap = new Map(products.rows.map((p) => [p.id, p]));

      // Aggregate quantities per product for proper stock validation
      const aggregatedQty = new Map<number, number>();
      for (const item of dto.items) {
        aggregatedQty.set(item.productId, (aggregatedQty.get(item.productId) || 0) + item.quantity);
      }

      for (const item of dto.items) {
        const p = productMap.get(item.productId);
        if (!p) {
          throw new NotFoundException(`Product with ID ${item.productId} not found`);
        }
        if (!p.is_active) {
          throw new BadRequestException(`Product "${p.name}" is not active`);
        }
      }

      // Validate aggregated stock
      for (const [productId, totalQty] of aggregatedQty) {
        const p = productMap.get(productId)!;
        if (parseInt(p.stock_quantity) < totalQty) {
          throw new BadRequestException(
            `Insufficient stock for "${p.name}". Available: ${p.stock_quantity}, requested: ${totalQty}`,
          );
        }
      }

      // Process all items
      const sales: Record<string, any>[] = [];
      let batchTotal = 0;
      let batchTax = 0;

      for (const item of dto.items) {
        const p = productMap.get(item.productId)!;
        const unitPrice = parseFloat(p.price);
        const taxRate = parseFloat(p.tax_rate) || 0;
        const subtotal = unitPrice * item.quantity;
        const taxAmount = subtotal * (taxRate / 100);
        const totalAmount = subtotal + taxAmount;
        batchTotal += totalAmount;
        batchTax += taxAmount;

        // Decrement stock atomically (race-safe)
        const stockResult = await client.query(
          `UPDATE products SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND stock_quantity >= $1 RETURNING stock_quantity`,
          [item.quantity, item.productId],
        );
        if (stockResult.rows.length === 0) {
          throw new BadRequestException(
            `Insufficient stock for product "${p.name}" (ID: ${item.productId})`,
          );
        }

        // Record stock movement
        const batchStockAfter = parseInt(stockResult.rows[0].stock_quantity);
        const batchStockBefore = batchStockAfter + item.quantity;

        // Create sale record
        const sale = await client.query(
          `INSERT INTO product_sales (branch_id, product_id, user_id, quantity, unit_price, tax_amount, total_amount, payment_method, sold_by, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            branchId,
            item.productId,
            dto.userId || null,
            item.quantity,
            unitPrice,
            taxAmount,
            totalAmount,
            dto.paymentMethod,
            soldBy,
            dto.notes || null,
          ],
        );

        await client.query(
          `INSERT INTO product_stock_movements (product_id, branch_id, movement_type, quantity, stock_before, stock_after, reference_id, performed_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [item.productId, branchId, 'sale', -item.quantity, batchStockBefore, batchStockAfter, sale.rows[0].id, soldBy],
        );

        sales.push({ ...sale.rows[0], product_name: p.name });
      }

      // Calculate discount
      let discountAmount = 0;
      if (dto.discountType && dto.discountValue && dto.discountValue > 0) {
        if (dto.discountType === 'percentage') {
          discountAmount = batchTotal * (dto.discountValue / 100);
        } else {
          discountAmount = dto.discountValue;
        }
        discountAmount = Math.min(discountAmount, batchTotal); // Can't exceed total
      }
      const finalTotal = batchTotal - discountAmount;

      // Create single payment for the batch
      const buyerName = dto.userId
        ? (
          await client.query(`SELECT name FROM users WHERE id = $1`, [
            dto.userId,
          ])
        ).rows[0]?.name || 'Unknown'
        : 'Walk-in';

      const payment = await this.paymentsService.createProductSalePaymentWithClient(
        client,
        sales[0].id,
        branchId,
        dto.userId || null,
        buyerName,
        batchTotal,
        batchTax,
        finalTotal,
        dto.paymentMethod,
        soldBy,
      );

      // Link payment to all sales
      for (const sale of sales) {
        await client.query(
          `UPDATE product_sales SET payment_id = $1 WHERE id = $2`,
          [payment.id, sale.id],
        );
      }

      return {
        sales: sales.map((s) => this.formatSale(s)),
        payment: { id: payment.id, totalAmount: batchTotal, discountAmount, finalTotal },
      };
    });
  }

  async getSalesStats(
    gymId: number,
    branchId: number | null,
    filters: SalesStatsFiltersDto = {},
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['(s.is_deleted = FALSE OR s.is_deleted IS NULL)'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (filters.startDate) {
        conditions.push(`s.sold_at >= $${paramIndex++}::DATE`);
        values.push(filters.startDate);
      }

      if (filters.endDate) {
        conditions.push(`s.sold_at < ($${paramIndex++}::DATE + INTERVAL '1 day')`);
        values.push(filters.endDate);
      }

      const whereClause = conditions.join(' AND ');

      /* Total revenue, items, average, and profit */
      const totals = await client.query(
        `SELECT
           COALESCE(SUM(s.total_amount), 0) as total_revenue,
           COALESCE(SUM(s.tax_amount), 0) as total_tax,
           COALESCE(SUM(s.quantity), 0) as total_items,
           COUNT(*) as total_transactions,
           CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(s.total_amount), 0) / COUNT(*) ELSE 0 END as avg_sale_value,
           COALESCE(SUM((s.unit_price - COALESCE(p.cost_price, 0)) * s.quantity), 0) as total_profit
         FROM product_sales s
         LEFT JOIN products p ON p.id = s.product_id
         WHERE ${whereClause}`,
        values,
      );

      // Top 5 products by revenue
      const topProducts = await client.query(
        `SELECT p.id, p.name, SUM(s.total_amount) as revenue, SUM(s.quantity) as units_sold
         FROM product_sales s
         JOIN products p ON p.id = s.product_id
         WHERE ${whereClause}
         GROUP BY p.id, p.name
         ORDER BY revenue DESC LIMIT 5`,
        values,
      );

      // Revenue by payment method
      const byPaymentMethod = await client.query(
        `SELECT s.payment_method, SUM(s.total_amount) as revenue, COUNT(*) as count
         FROM product_sales s WHERE ${whereClause}
         GROUP BY s.payment_method ORDER BY revenue DESC`,
        values,
      );

      /* Sales breakdown by staff */
      const byStaff = await client.query(
        `SELECT s.sold_by, staff.name as staff_name,
           COUNT(*) as total_sales,
           COALESCE(SUM(s.total_amount), 0) as total_revenue
         FROM product_sales s
         LEFT JOIN users staff ON staff.id = s.sold_by
         WHERE ${whereClause}
         GROUP BY s.sold_by, staff.name
         ORDER BY total_revenue DESC`,
        values,
      );

      const stats = totals.rows[0];
      const totalRevenue = parseFloat(stats.total_revenue);
      const totalProfit = parseFloat(stats.total_profit);

      return {
        totalRevenue,
        totalTax: parseFloat(stats.total_tax),
        totalItems: parseInt(stats.total_items),
        totalSales: parseInt(stats.total_transactions),
        averageOrderValue: parseFloat(stats.avg_sale_value),
        totalProfit,
        profitMargin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
        topProducts: topProducts.rows.map((r) => ({
          productId: r.id,
          productName: r.name,
          totalRevenue: parseFloat(r.revenue),
          totalSold: parseInt(r.units_sold),
        })),
        byPaymentMethod: byPaymentMethod.rows.map((r) => ({
          method: r.payment_method,
          total: parseFloat(r.revenue),
          count: parseInt(r.count),
        })),
        byStaff: byStaff.rows.map((r) => ({
          staffId: r.sold_by,
          staffName: r.staff_name,
          totalSales: parseInt(r.total_sales),
          totalRevenue: parseFloat(r.total_revenue),
        })),
      };
    });
  }

  /* ─── Sales Trend (TASK 1) ─── */

  async getSalesStatsTrend(
    gymId: number,
    branchId: number | null,
    filters: SalesTrendFiltersDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['(s.is_deleted = FALSE OR s.is_deleted IS NULL)'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      /* Determine date grouping expression and default range */
      let dateExpr: string;
      let defaultStart: string;

      if (filters.period === 'daily') {
        dateExpr = `DATE(s.sold_at)`;
        defaultStart = `CURRENT_DATE - INTERVAL '30 days'`;
      } else if (filters.period === 'weekly') {
        dateExpr = `date_trunc('week', s.sold_at)`;
        defaultStart = `CURRENT_DATE - INTERVAL '12 weeks'`;
      } else {
        /* monthly */
        dateExpr = `date_trunc('month', s.sold_at)`;
        defaultStart = `CURRENT_DATE - INTERVAL '12 months'`;
      }

      if (filters.startDate) {
        conditions.push(`s.sold_at >= $${paramIndex++}`);
        values.push(filters.startDate);
      } else {
        conditions.push(`s.sold_at >= ${defaultStart}`);
      }

      if (filters.endDate) {
        conditions.push(`s.sold_at <= $${paramIndex++}`);
        values.push(filters.endDate);
      }

      const whereClause = conditions.join(' AND ');

      const result = await client.query(
        `SELECT
           ${dateExpr} as period_date,
           COALESCE(SUM(s.total_amount), 0) as revenue,
           COUNT(*) as sales_count,
           COALESCE(SUM((s.unit_price - COALESCE(p.cost_price, 0)) * s.quantity), 0) as profit
         FROM product_sales s
         LEFT JOIN products p ON p.id = s.product_id
         WHERE ${whereClause}
         GROUP BY period_date
         ORDER BY period_date ASC`,
        values,
      );

      return result.rows.map((r) => ({
        date: r.period_date,
        revenue: parseFloat(r.revenue),
        salesCount: parseInt(r.sales_count),
        profit: parseFloat(r.profit),
      }));
    });
  }

  /* ─── Inventory Stats ─── */

  async getInventoryStats(gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['p.is_deleted = FALSE', 'p.is_active = TRUE'];
      const values: SqlValue[] = [];

      const whereClause = conditions.join(' AND ');

      /*
       * Single query to compute aggregate inventory stats:
       * - totalCostValue: SUM(stock_quantity * cost_price)
       * - totalRetailValue: SUM(stock_quantity * price)
       * - lowStockCount: products with stock_quantity > 0 AND stock_quantity <= low_stock_threshold
       * - outOfStockCount: products with stock_quantity = 0
       * - totalProducts: total active, non-deleted products
       */
      const statsResult = await client.query(
        `SELECT
           COALESCE(SUM(p.stock_quantity * COALESCE(p.cost_price, 0)), 0) as total_cost_value,
           COALESCE(SUM(p.stock_quantity * p.price), 0) as total_retail_value,
           COUNT(*) as total_products,
           COUNT(*) FILTER (WHERE p.stock_quantity > 0 AND p.stock_quantity <= p.low_stock_threshold) as low_stock_count,
           COUNT(*) FILTER (WHERE p.stock_quantity = 0) as out_of_stock_count
         FROM products p
         WHERE ${whereClause}`,
        values,
      );

      /* Category breakdown: GROUP BY category with cost and retail totals */
      const categoryResult = await client.query(
        `SELECT
           pc.id as category_id,
           pc.name as category_name,
           COUNT(p.id) as item_count,
           COALESCE(SUM(p.stock_quantity * COALESCE(p.cost_price, 0)), 0) as cost_value,
           COALESCE(SUM(p.stock_quantity * p.price), 0) as retail_value
         FROM products p
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.is_deleted = FALSE
         WHERE ${whereClause}
         GROUP BY pc.id, pc.name
         ORDER BY pc.name ASC`,
        values,
      );

      const stats = statsResult.rows[0];
      const totalCostValue = parseFloat(stats.total_cost_value);
      const totalRetailValue = parseFloat(stats.total_retail_value);

      return {
        totalCostValue,
        totalRetailValue,
        potentialProfit: totalRetailValue - totalCostValue,
        lowStockCount: parseInt(stats.low_stock_count),
        outOfStockCount: parseInt(stats.out_of_stock_count),
        totalProducts: parseInt(stats.total_products),
        categoryBreakdown: categoryResult.rows.map((r) => ({
          categoryId: r.category_id,
          categoryName: r.category_name,
          itemCount: parseInt(r.item_count),
          costValue: parseFloat(r.cost_value),
          retailValue: parseFloat(r.retail_value),
        })),
      };
    });
  }

  /* ─── Barcode Lookup (TASK 4) ─── */

  async findByBarcode(gymId: number, branchId: number | null, barcode: string) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['p.is_deleted = FALSE', 'p.barcode = $1'];
      const values: SqlValue[] = [barcode];

      const result = await client.query(
        `SELECT p.*, pc.name as category_name
         FROM products p
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.is_deleted = FALSE
         WHERE ${conditions.join(' AND ')}
         LIMIT 1`,
        values,
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Product with barcode "${barcode}" not found`);
      }

      return this.formatProduct(result.rows[0]);
    });
  }

  /* ─── Sale Receipt (TASK 5) ─── */

  async getSaleReceipt(id: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      /* Fetch sale with product, buyer, and staff info */
      const saleResult = await client.query(
        `SELECT s.*, p.name as product_name, p.sku as product_sku, p.barcode as product_barcode,
           u.name as buyer_name, u.email as buyer_email, u.phone as buyer_phone,
           staff.name as sold_by_name
         FROM product_sales s
         LEFT JOIN products p ON p.id = s.product_id
         LEFT JOIN users u ON u.id = s.user_id
         LEFT JOIN users staff ON staff.id = s.sold_by
         WHERE s.id = $1 AND (s.is_deleted = FALSE OR s.is_deleted IS NULL)`,
        [id],
      );

      if (saleResult.rows.length === 0) {
        throw new NotFoundException(`Sale with ID ${id} not found`);
      }

      const sale = saleResult.rows[0];

      /* Fetch all items in the same batch (linked by payment_id) */
      let items: Record<string, any>[] = [sale];
      if (sale.payment_id) {
        const batchResult = await client.query(
          `SELECT s.*, p.name as product_name, p.sku as product_sku, p.barcode as product_barcode
           FROM product_sales s
           LEFT JOIN products p ON p.id = s.product_id
           WHERE s.payment_id = $1 AND (s.is_deleted = FALSE OR s.is_deleted IS NULL)
           ORDER BY s.id ASC`,
          [sale.payment_id],
        );
        items = batchResult.rows;
      }

      /* Fetch gym info from public.gyms via Prisma */
      const gym = await this.prisma.gym.findUnique({
        where: { id: gymId },
        select: { name: true, logo: true, address: true, phone: true, city: true, state: true, zipCode: true },
      });

      return {
        sale: {
          id: sale.id,
          paymentId: sale.payment_id,
          paymentMethod: sale.payment_method,
          soldBy: sale.sold_by,
          soldByName: sale.sold_by_name,
          soldAt: sale.sold_at,
          notes: sale.notes,
        },
        items: items.map((item) => ({
          id: item.id,
          productId: item.product_id,
          productName: item.product_name,
          productSku: item.product_sku,
          productBarcode: item.product_barcode,
          quantity: item.quantity,
          unitPrice: item.unit_price ? parseFloat(item.unit_price) : 0,
          taxAmount: item.tax_amount ? parseFloat(item.tax_amount) : 0,
          totalAmount: item.total_amount ? parseFloat(item.total_amount) : 0,
        })),
        member: sale.user_id
          ? {
              id: sale.user_id,
              name: sale.buyer_name,
              email: sale.buyer_email,
              phone: sale.buyer_phone,
            }
          : null,
        gym: gym
          ? {
              name: gym.name,
              logo: gym.logo,
              address: gym.address,
              city: gym.city,
              state: gym.state,
              zipCode: gym.zipCode,
              phone: gym.phone,
            }
          : null,
      };
    });
  }

  /* ─── Reorder Suggestions ─── */

  async getReorderSuggestions(gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [
        'p.is_deleted = FALSE',
        'p.is_active = TRUE',
      ];
      const values: SqlValue[] = [];

      const whereClause = conditions.join(' AND ');

      /*
       * For each active product, compute:
       *   - sales_velocity: total quantity sold in last 30 days / 30
       *   - days_of_stock_remaining: stock_quantity / velocity (999 if velocity = 0)
       *   - suggested_reorder_qty: (30 * velocity) - stock_quantity (cover 30 days)
       * Filter to products below low_stock_threshold OR with < 14 days remaining.
       * Sort by days_remaining ASC (most urgent first).
       */
      const result = await client.query(
        `SELECT
           p.id,
           p.name,
           p.sku,
           p.stock_quantity,
           p.low_stock_threshold,
           p.price,
           pc.name as category_name,
           COALESCE(SUM(s.quantity), 0)::numeric / 30 as sales_velocity,
           CASE
             WHEN COALESCE(SUM(s.quantity), 0) = 0 THEN 999
             ELSE p.stock_quantity / (COALESCE(SUM(s.quantity), 0)::numeric / 30)
           END as days_of_stock_remaining,
           CASE
             WHEN COALESCE(SUM(s.quantity), 0) = 0 THEN 0
             ELSE GREATEST(CEIL(30 * (COALESCE(SUM(s.quantity), 0)::numeric / 30) - p.stock_quantity), 0)
           END as suggested_reorder_qty
         FROM products p
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.is_deleted = FALSE
         LEFT JOIN product_sales s
           ON s.product_id = p.id
           AND (s.is_deleted = FALSE OR s.is_deleted IS NULL)
           AND s.sold_at >= CURRENT_DATE - INTERVAL '30 days'
         WHERE ${whereClause}
         GROUP BY p.id, p.name, p.sku, p.stock_quantity, p.low_stock_threshold, p.price, pc.name
         HAVING
           p.stock_quantity <= p.low_stock_threshold
           OR (
             COALESCE(SUM(s.quantity), 0) > 0
             AND p.stock_quantity / (COALESCE(SUM(s.quantity), 0)::numeric / 30) < 14
           )
         ORDER BY
           CASE
             WHEN COALESCE(SUM(s.quantity), 0) = 0 THEN 999
             ELSE p.stock_quantity / (COALESCE(SUM(s.quantity), 0)::numeric / 30)
           END ASC`,
        values,
      );

      return result.rows.map((r) => ({
        productId: r.id,
        productName: r.name,
        sku: r.sku,
        categoryName: r.category_name,
        currentStock: parseInt(r.stock_quantity),
        threshold: parseInt(r.low_stock_threshold),
        price: r.price ? parseFloat(r.price) : 0,
        dailyVelocity: parseFloat(parseFloat(r.sales_velocity).toFixed(2)),
        daysRemaining: parseFloat(parseFloat(r.days_of_stock_remaining).toFixed(1)),
        suggestedReorderQty: parseInt(r.suggested_reorder_qty),
      }));
    });
  }

  /* ─── Dead Stock ─── */

  async getDeadStock(gymId: number, branchId: number | null, days: number = 30) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [
        'p.is_deleted = FALSE',
        'p.is_active = TRUE',
        'p.stock_quantity > 0',
      ];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      values.push(days);
      const daysParam = paramIndex++;

      const whereClause = conditions.join(' AND ');

      /*
       * Products with stock > 0, active, but no sales in last N days.
       * LEFT JOIN product_sales, check MAX(sold_at).
       * Returns product name, stock qty, last sold date, days since last sale.
       */
      const result = await client.query(
        `SELECT
           p.id,
           p.name,
           p.sku,
           p.stock_quantity,
           p.price,
           pc.name as category_name,
           MAX(s.sold_at) as last_sold_at,
           CASE
             WHEN MAX(s.sold_at) IS NULL THEN NULL
             ELSE EXTRACT(DAY FROM CURRENT_TIMESTAMP - MAX(s.sold_at))::int
           END as days_since_last_sale
         FROM products p
         LEFT JOIN product_categories pc ON pc.id = p.category_id AND pc.is_deleted = FALSE
         LEFT JOIN product_sales s
           ON s.product_id = p.id
           AND (s.is_deleted = FALSE OR s.is_deleted IS NULL)
         WHERE ${whereClause}
         GROUP BY p.id, p.name, p.sku, p.stock_quantity, p.price, pc.name
         HAVING
           MAX(s.sold_at) IS NULL
           OR MAX(s.sold_at) < CURRENT_TIMESTAMP - MAKE_INTERVAL(days => $${daysParam})
         ORDER BY
           MAX(s.sold_at) ASC NULLS FIRST`,
        values,
      );

      return result.rows.map((r) => ({
        productId: r.id,
        productName: r.name,
        sku: r.sku,
        categoryName: r.category_name,
        currentStock: parseInt(r.stock_quantity),
        price: r.price ? parseFloat(r.price) : 0,
        lastSoldAt: r.last_sold_at || null,
        daysSinceLastSale: r.days_since_last_sale !== null ? parseInt(r.days_since_last_sale) : null,
      }));
    });
  }

  // ─── Stock Movements ───

  private formatStockMovement(row: Record<string, any>) {
    return {
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      branchId: row.branch_id,
      movementType: row.movement_type,
      quantity: row.quantity,
      stockBefore: row.stock_before,
      stockAfter: row.stock_after,
      referenceId: row.reference_id,
      reason: row.reason,
      performedBy: row.performed_by,
      performedByName: row.performed_by_name,
      createdAt: row.created_at,
    };
  }

  async getStockMovements(
    gymId: number,
    productId: number,
    branchId: number | null,
    filters: StockMovementFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Verify product exists
      const product = await client.query(
        `SELECT id FROM products WHERE id = $1 AND is_deleted = FALSE`,
        [productId],
      );
      if (product.rows.length === 0) {
        throw new NotFoundException(`Product with ID ${productId} not found`);
      }

      const conditions: string[] = ['sm.product_id = $1'];
      const values: SqlValue[] = [productId];
      let paramIndex = 2;

      if (filters.movementType) {
        conditions.push(`sm.movement_type = $${paramIndex++}`);
        values.push(filters.movementType);
      }

      if (filters.startDate) {
        conditions.push(`sm.created_at >= $${paramIndex++}`);
        values.push(filters.startDate);
      }

      if (filters.endDate) {
        conditions.push(`sm.created_at <= $${paramIndex++}`);
        values.push(filters.endDate);
      }

      const whereClause = conditions.join(' AND ');

      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM product_stock_movements sm WHERE ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].total);

      const result = await client.query(
        `SELECT sm.*, p.name as product_name, staff.name as performed_by_name
         FROM product_stock_movements sm
         LEFT JOIN products p ON p.id = sm.product_id
         LEFT JOIN users staff ON staff.id = sm.performed_by
         WHERE ${whereClause}
         ORDER BY sm.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset],
      );

      return {
        data: result.rows.map((r) => this.formatStockMovement(r)),
        total,
        page,
        limit,
      };
    });
  }

  /* ─── Cross-product Stock Movements ─── */

  async getAllStockMovements(
    gymId: number,
    branchId: number | null,
    filters: AllStockMovementsFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (filters.productId) {
        conditions.push(`sm.product_id = $${paramIndex++}`);
        values.push(filters.productId);
      }

      if (filters.movementType) {
        conditions.push(`sm.movement_type = $${paramIndex++}`);
        values.push(filters.movementType);
      }

      if (filters.startDate) {
        conditions.push(`sm.created_at >= $${paramIndex++}`);
        values.push(filters.startDate);
      }

      if (filters.endDate) {
        conditions.push(`sm.created_at <= $${paramIndex++}`);
        values.push(filters.endDate);
      }

      if (filters.performedBy) {
        conditions.push(`sm.performed_by = $${paramIndex++}`);
        values.push(filters.performedBy);
      }

      const whereClause = conditions.length > 0
        ? 'WHERE ' + conditions.join(' AND ')
        : '';

      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM product_stock_movements sm ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].total);

      const result = await client.query(
        `SELECT sm.*, p.name as product_name, staff.name as performed_by_name
         FROM product_stock_movements sm
         LEFT JOIN products p ON p.id = sm.product_id
         LEFT JOIN users staff ON staff.id = sm.performed_by
         ${whereClause}
         ORDER BY sm.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset],
      );

      return {
        data: result.rows.map((r) => this.formatStockMovement(r)),
        total,
        page,
        limit,
      };
    });
  }

  /* ─── Stock Take (Physical Count) ─── */

  private formatStockTake(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      status: row.status,
      startedBy: row.started_by,
      startedByName: row.started_by_name,
      completedBy: row.completed_by,
      completedByName: row.completed_by_name,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      notes: row.notes,
      totalProducts: row.total_products,
      totalDiscrepancies: row.total_discrepancies,
      createdAt: row.created_at,
    };
  }

  private formatStockTakeItem(row: Record<string, any>) {
    return {
      id: row.id,
      stockTakeId: row.stock_take_id,
      productId: row.product_id,
      productName: row.product_name,
      systemQuantity: row.system_quantity,
      countedQuantity: row.counted_quantity,
      discrepancy: row.discrepancy,
      adjustmentApplied: row.adjustment_applied,
      notes: row.notes,
      createdAt: row.created_at,
    };
  }

  /**
   * Start a new stock take session.
   * Creates a stock_takes record and populates stock_take_items with
   * current product quantities for the given branch.
   */
  async startStockTake(
    gymId: number,
    branchId: number | null,
    userId: number,
    dto: StartStockTakeDto = {},
  ) {
    return this.tenantService.executeInTenantTransaction(gymId, async (client) => {
      /* Create the stock take header */
      const stResult = await client.query(
        `INSERT INTO stock_takes (branch_id, started_by, notes)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [branchId, userId, dto.notes || null],
      );
      const stockTake = stResult.rows[0];

      /* Fetch all active, non-deleted products for this branch */
      const conditions: string[] = ['p.is_deleted = FALSE', 'p.is_active = TRUE'];
      const values: SqlValue[] = [];

      const products = await client.query(
        `SELECT p.id, p.name, p.stock_quantity
         FROM products p
         WHERE ${conditions.join(' AND ')}
         ORDER BY p.name ASC`,
        values,
      );

      /* Insert one stock_take_item per product */
      for (const p of products.rows) {
        await client.query(
          `INSERT INTO stock_take_items (stock_take_id, product_id, product_name, system_quantity)
           VALUES ($1, $2, $3, $4)`,
          [stockTake.id, p.id, p.name, p.stock_quantity],
        );
      }

      /* Update totals on the header */
      await client.query(
        `UPDATE stock_takes SET total_products = $1 WHERE id = $2`,
        [products.rows.length, stockTake.id],
      );

      return {
        ...this.formatStockTake({ ...stockTake, total_products: products.rows.length }),
        itemCount: products.rows.length,
      };
    });
  }

  /**
   * List stock takes for a branch with pagination.
   */
  async getStockTakes(
    gymId: number,
    branchId: number | null,
    filters: StockTakeFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = [];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM stock_takes st ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].total);

      const result = await client.query(
        `SELECT st.*,
                starter.name as started_by_name,
                completer.name as completed_by_name
         FROM stock_takes st
         LEFT JOIN users starter ON starter.id = st.started_by
         LEFT JOIN users completer ON completer.id = st.completed_by
         ${whereClause}
         ORDER BY st.started_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset],
      );

      return {
        data: result.rows.map((r) => this.formatStockTake(r)),
        total,
        page,
        limit,
      };
    });
  }

  /**
   * Get a single stock take with all its items.
   */
  async getStockTake(gymId: number, stockTakeId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const stResult = await client.query(
        `SELECT st.*,
                starter.name as started_by_name,
                completer.name as completed_by_name
         FROM stock_takes st
         LEFT JOIN users starter ON starter.id = st.started_by
         LEFT JOIN users completer ON completer.id = st.completed_by
         WHERE st.id = $1`,
        [stockTakeId],
      );

      if (stResult.rows.length === 0) {
        throw new NotFoundException(`Stock take with ID ${stockTakeId} not found`);
      }

      const itemsResult = await client.query(
        `SELECT * FROM stock_take_items WHERE stock_take_id = $1 ORDER BY product_name ASC`,
        [stockTakeId],
      );

      return {
        ...this.formatStockTake(stResult.rows[0]),
        items: itemsResult.rows.map((r) => this.formatStockTakeItem(r)),
      };
    });
  }

  /**
   * Record the physical count for a single stock-take item.
   * Automatically computes the discrepancy (counted - system).
   */
  async updateStockTakeItem(
    gymId: number,
    stockTakeId: number,
    itemId: number,
    dto: UpdateStockTakeItemDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      /* Verify stock take exists and is still in progress */
      const stCheck = await client.query(
        `SELECT status FROM stock_takes WHERE id = $1`,
        [stockTakeId],
      );
      if (stCheck.rows.length === 0) {
        throw new NotFoundException(`Stock take with ID ${stockTakeId} not found`);
      }
      if (stCheck.rows[0].status !== 'in_progress') {
        throw new BadRequestException('Cannot update items on a completed stock take');
      }

      /* Update the item */
      const result = await client.query(
        `UPDATE stock_take_items
         SET counted_quantity = $1,
             discrepancy = $1 - system_quantity,
             notes = COALESCE($2, notes)
         WHERE id = $3 AND stock_take_id = $4
         RETURNING *`,
        [dto.countedQuantity, dto.notes || null, itemId, stockTakeId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Stock take item with ID ${itemId} not found`);
      }

      return this.formatStockTakeItem(result.rows[0]);
    });
  }

  /**
   * Complete a stock take session.
   * Optionally applies inventory adjustments to bring system stock
   * in line with counted quantities.
   */
  async completeStockTake(
    gymId: number,
    stockTakeId: number,
    userId: number,
    dto: CompleteStockTakeDto = {},
  ) {
    return this.tenantService.executeInTenantTransaction(gymId, async (client) => {
      /* Lock the stock take row */
      const stResult = await client.query(
        `SELECT * FROM stock_takes WHERE id = $1 FOR UPDATE`,
        [stockTakeId],
      );
      if (stResult.rows.length === 0) {
        throw new NotFoundException(`Stock take with ID ${stockTakeId} not found`);
      }
      if (stResult.rows[0].status !== 'in_progress') {
        throw new BadRequestException('Stock take is already completed');
      }

      /* Fetch all items */
      const items = await client.query(
        `SELECT * FROM stock_take_items WHERE stock_take_id = $1`,
        [stockTakeId],
      );

      /* Count discrepancies (items where counted_quantity differs from system_quantity) */
      let totalDiscrepancies = 0;
      for (const item of items.rows) {
        if (item.counted_quantity !== null && item.counted_quantity !== item.system_quantity) {
          totalDiscrepancies++;
        }
      }

      /* Optionally apply adjustments */
      if (dto.applyAdjustments) {
        for (const item of items.rows) {
          if (item.counted_quantity === null) continue;
          const diff = item.counted_quantity - item.system_quantity;
          if (diff === 0) continue;

          /* Get current stock (may have changed since stock take started) */
          const productResult = await client.query(
            `SELECT stock_quantity, branch_id FROM products WHERE id = $1 AND is_deleted = FALSE`,
            [item.product_id],
          );
          if (productResult.rows.length === 0) continue;

          const stockBefore = productResult.rows[0].stock_quantity;
          /* Apply the difference between counted and the original system_quantity */
          const stockAfter = stockBefore + diff;

          if (stockAfter < 0) continue; /* skip if adjustment would go negative */

          await client.query(
            `UPDATE products SET stock_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
            [stockAfter, item.product_id],
          );

          /* Record the stock movement */
          await client.query(
            `INSERT INTO product_stock_movements (product_id, branch_id, movement_type, quantity, stock_before, stock_after, reason, performed_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              item.product_id,
              productResult.rows[0].branch_id,
              'stock_take',
              diff,
              stockBefore,
              stockAfter,
              `Stock take #${stockTakeId} adjustment`,
              userId,
            ],
          );

          /* Mark item as adjustment applied */
          await client.query(
            `UPDATE stock_take_items SET adjustment_applied = TRUE WHERE id = $1`,
            [item.id],
          );
        }
      }

      /* Append notes if provided */
      const finalNotes = dto.notes
        ? (stResult.rows[0].notes ? stResult.rows[0].notes + '\n' + dto.notes : dto.notes)
        : stResult.rows[0].notes;

      /* Finalize the stock take */
      const updated = await client.query(
        `UPDATE stock_takes
         SET status = 'completed',
             completed_by = $1,
             completed_at = CURRENT_TIMESTAMP,
             total_discrepancies = $2,
             notes = $3
         WHERE id = $4
         RETURNING *`,
        [userId, totalDiscrepancies, finalNotes, stockTakeId],
      );

      return {
        ...this.formatStockTake(updated.rows[0]),
        adjustmentsApplied: dto.applyAdjustments || false,
      };
    });
  }

  // ─── Void / Delete Sale ───

  async voidSale(saleId: number, gymId: number, deletedById: number) {
    // Verify sale exists and is not already deleted
    const sale = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT s.*, p.stock_quantity as current_stock
         FROM product_sales s
         LEFT JOIN products p ON p.id = s.product_id
         WHERE s.id = $1`,
        [saleId],
      );
      if (result.rows.length === 0) {
        throw new NotFoundException(`Sale with ID ${saleId} not found`);
      }
      if (result.rows[0].is_deleted) {
        throw new BadRequestException(`Sale with ID ${saleId} is already voided`);
      }
      return result.rows[0];
    });

    return this.tenantService.executeInTenantTransaction(gymId, async (client) => {
      // 1. Soft-delete the sale
      await client.query(
        `UPDATE product_sales SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2 WHERE id = $1`,
        [saleId, deletedById],
      );

      // 2. Restore stock
      const stockResult = await client.query(
        `UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING stock_quantity`,
        [sale.quantity, sale.product_id],
      );

      // 3. Create reversal stock movement
      const stockAfter = stockResult.rows.length > 0 ? parseInt(stockResult.rows[0].stock_quantity) : 0;
      const stockBefore = stockAfter - sale.quantity;
      await client.query(
        `INSERT INTO product_stock_movements (product_id, branch_id, movement_type, quantity, stock_before, stock_after, reference_id, performed_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [sale.product_id, sale.branch_id, 'sale_reversal', sale.quantity, stockBefore, stockAfter, saleId, deletedById],
      );

      // 4. Void the payment record
      if (sale.payment_id) {
        await client.query(
          `UPDATE payments SET status = 'voided', updated_at = NOW() WHERE id = $1`,
          [sale.payment_id],
        );
      }

      return { success: true, message: 'Sale voided successfully' };
    });
  }

  async voidBatchSale(paymentId: number, gymId: number, deletedById: number) {
    // Find all sales with this payment_id that are not already deleted
    const sales = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT s.*, p.stock_quantity as current_stock
         FROM product_sales s
         LEFT JOIN products p ON p.id = s.product_id
         WHERE s.payment_id = $1 AND (s.is_deleted = FALSE OR s.is_deleted IS NULL)`,
        [paymentId],
      );
      if (result.rows.length === 0) {
        throw new NotFoundException(`No active sales found for payment ID ${paymentId}`);
      }
      return result.rows;
    });

    return this.tenantService.executeInTenantTransaction(gymId, async (client) => {
      for (const sale of sales) {
        // 1. Soft-delete the sale
        await client.query(
          `UPDATE product_sales SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = $2 WHERE id = $1`,
          [sale.id, deletedById],
        );

        // 2. Restore stock
        const stockResult = await client.query(
          `UPDATE products SET stock_quantity = stock_quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING stock_quantity`,
          [sale.quantity, sale.product_id],
        );

        // 3. Create reversal stock movement
        const stockAfter = stockResult.rows.length > 0 ? parseInt(stockResult.rows[0].stock_quantity) : 0;
        const stockBefore = stockAfter - sale.quantity;
        await client.query(
          `INSERT INTO product_stock_movements (product_id, branch_id, movement_type, quantity, stock_before, stock_after, reference_id, performed_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [sale.product_id, sale.branch_id, 'sale_reversal', sale.quantity, stockBefore, stockAfter, sale.id, deletedById],
        );
      }

      // 4. Void the payment record
      await client.query(
        `UPDATE payments SET status = 'voided', updated_at = NOW() WHERE id = $1`,
        [paymentId],
      );

      return { success: true, voided: sales.length, message: `${sales.length} sale(s) voided successfully` };
    });
  }
}
