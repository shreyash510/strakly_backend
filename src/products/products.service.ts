import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { PaymentsService } from '../payments/payments.service';
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
} from './dto/products.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class ProductsService {
  constructor(
    private readonly tenantService: TenantService,
    private readonly paymentsService: PaymentsService,
  ) { }

  private formatCategory(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
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
      branchId: row.branch_id,
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
      branchId: row.branch_id,
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

      if (branchId !== null) {
        conditions.push(`(branch_id = $1 OR branch_id IS NULL)`);
        values.push(branchId);
      }

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

      if (branchId !== null) {
        conditions.push(`(p.branch_id = $${paramIndex} OR p.branch_id IS NULL)`);
        values.push(branchId);
        paramIndex++;
      }

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

      if (branchId !== null) {
        conditions.push(`(p.branch_id = $1 OR p.branch_id IS NULL)`);
        values.push(branchId);
      }

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

      if (branchId !== null) {
        conditions.push(`(s.branch_id = $${paramIndex++} OR s.branch_id IS NULL)`);
        values.push(branchId);
      }

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
        conditions.push(`s.sold_at >= $${paramIndex++}`);
        values.push(filters.startDate);
      }

      if (filters.endDate) {
        conditions.push(`s.sold_at <= $${paramIndex++}`);
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
    return this.tenantService.executeInTenant(gymId, async (client) => {
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

      const payment = await this.paymentsService.createProductSalePayment(
        saleRecord.id,
        gymId,
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
    return this.tenantService.executeInTenant(gymId, async (client) => {
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

      // Create single payment for the batch
      const buyerName = dto.userId
        ? (
          await client.query(`SELECT name FROM users WHERE id = $1`, [
            dto.userId,
          ])
        ).rows[0]?.name || 'Unknown'
        : 'Walk-in';

      const payment = await this.paymentsService.createProductSalePayment(
        sales[0].id,
        gymId,
        branchId,
        dto.userId || null,
        buyerName,
        batchTotal,
        batchTax,
        batchTotal,
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
        payment: { id: payment.id, totalAmount: batchTotal },
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

      if (branchId !== null) {
        conditions.push(`(s.branch_id = $${paramIndex++} OR s.branch_id IS NULL)`);
        values.push(branchId);
      }

      if (filters.startDate) {
        conditions.push(`s.sold_at >= $${paramIndex++}`);
        values.push(filters.startDate);
      }

      if (filters.endDate) {
        conditions.push(`s.sold_at <= $${paramIndex++}`);
        values.push(filters.endDate);
      }

      const whereClause = conditions.join(' AND ');

      // Total revenue, items, average
      const totals = await client.query(
        `SELECT
           COALESCE(SUM(s.total_amount), 0) as total_revenue,
           COALESCE(SUM(s.tax_amount), 0) as total_tax,
           COALESCE(SUM(s.quantity), 0) as total_items,
           COUNT(*) as total_transactions,
           CASE WHEN COUNT(*) > 0 THEN COALESCE(SUM(s.total_amount), 0) / COUNT(*) ELSE 0 END as avg_sale_value
         FROM product_sales s WHERE ${whereClause}`,
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

      const stats = totals.rows[0];
      return {
        totalRevenue: parseFloat(stats.total_revenue),
        totalTax: parseFloat(stats.total_tax),
        totalItems: parseInt(stats.total_items),
        totalSales: parseInt(stats.total_transactions),
        averageOrderValue: parseFloat(stats.avg_sale_value),
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
      };
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

      if (branchId !== null) {
        conditions.push(`sm.branch_id = $${paramIndex++}`);
        values.push(branchId);
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
}
