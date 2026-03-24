import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { TenantService } from '../tenant/tenant.service';
import { CreateUserDto } from '../users/dto/create-user.dto';

interface ParsedFile {
  columns: string[];
  rows: Record<string, string>[];
  uploadedAt: Date;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

interface ColumnMapping {
  [templateField: string]: string; // templateField -> uploaded column name
}

const CLIENTS_COLUMNS = ['name', 'email', 'phone', 'gender', 'dateOfBirth', 'status'];
const CLIENTS_REQUIRED = ['name', 'email', 'phone'];

const PRODUCTS_COLUMNS = [
  'name', 'price', 'costPrice', 'sku', 'barcode',
  'stockQuantity', 'lowStockThreshold', 'taxRate', 'category',
];
const PRODUCTS_REQUIRED = ['name', 'price'];

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);
  private readonly fileStore = new Map<string, ParsedFile>();

  // Auto-clean stored files older than 30 minutes
  private readonly FILE_TTL_MS = 30 * 60 * 1000;

  constructor(
    private readonly usersService: UsersService,
    private readonly tenantService: TenantService,
  ) {}

  // ============================================
  // TEMPLATE GENERATION
  // ============================================

  async generateTemplate(type: string): Promise<Buffer> {
    const workbook = new Workbook();
    workbook.creator = 'Strakly';
    workbook.created = new Date();

    if (type === 'members') {
      this.buildMembersTemplate(workbook);
    } else if (type === 'products') {
      this.buildProductsTemplate(workbook);
    } else {
      throw new BadRequestException(`Unknown template type: ${type}. Use "members" or "products".`);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private buildMembersTemplate(workbook: Workbook): void {
    const sheet = workbook.addWorksheet('Members');

    // Header row
    sheet.columns = CLIENTS_COLUMNS.map((col) => ({
      header: col,
      key: col,
      width: col === 'email' ? 30 : col === 'name' ? 25 : 18,
    }));

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' },
      };
    });

    // Sample row
    sheet.addRow({
      name: 'John Doe',
      email: 'john@example.com',
      phone: '9876543210',
      gender: 'male',
      dateOfBirth: '1990-01-15',
      status: 'active',
    });
  }

  private buildProductsTemplate(workbook: Workbook): void {
    const sheet = workbook.addWorksheet('Products');

    sheet.columns = PRODUCTS_COLUMNS.map((col) => ({
      header: col,
      key: col,
      width: col === 'name' ? 25 : col === 'category' ? 20 : 18,
    }));

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' },
      };
    });

    sheet.addRow({
      name: 'Protein Shake',
      price: '500',
      costPrice: '350',
      sku: 'PRO-001',
      barcode: '1234567890',
      stockQuantity: '100',
      lowStockThreshold: '10',
      taxRate: '5',
      category: 'Supplements',
    });
  }

  // ============================================
  // FILE PARSING
  // ============================================

  async parseFile(file: Express.Multer.File): Promise<{
    fileId: string;
    columns: string[];
    previewRows: Record<string, string>[];
    totalRows: number;
  }> {
    this.cleanExpiredFiles();

    const ext = file.originalname.split('.').pop()?.toLowerCase();
    let columns: string[] = [];
    let rows: Record<string, string>[] = [];

    if (ext === 'xlsx' || ext === 'xls') {
      ({ columns, rows } = await this.parseExcel(file.buffer));
    } else if (ext === 'csv') {
      ({ columns, rows } = await this.parseCsv(file.buffer));
    } else {
      throw new BadRequestException(
        'Unsupported file format. Please upload .xlsx, .xls, or .csv files.',
      );
    }

    if (rows.length === 0) {
      throw new BadRequestException('The uploaded file contains no data rows.');
    }

    const fileId = randomBytes(16).toString('hex');
    this.fileStore.set(fileId, {
      columns,
      rows,
      uploadedAt: new Date(),
    });

    return {
      fileId,
      columns,
      previewRows: rows.slice(0, 5),
      totalRows: rows.length,
    };
  }

  private async parseExcel(
    buffer: Buffer,
  ): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount < 2) {
      throw new BadRequestException('The spreadsheet is empty or has no data rows.');
    }

    const headerRow = sheet.getRow(1);
    const columns: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      columns[colNumber - 1] = String(cell.value || '').trim();
    });

    const rows: Record<string, string>[] = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const record: Record<string, string> = {};
      let hasData = false;

      columns.forEach((col, idx) => {
        const cell = row.getCell(idx + 1);
        const value = cell.value;
        let strValue = '';
        if (value !== null && value !== undefined) {
          // Handle exceljs rich text, date objects, etc.
          if (typeof value === 'object' && 'text' in value) {
            strValue = String((value as { text: string }).text).trim();
          } else if (value instanceof Date) {
            strValue = value.toISOString().split('T')[0];
          } else {
            strValue = String(value).trim();
          }
        }
        record[col] = strValue;
        if (strValue) hasData = true;
      });

      if (hasData) {
        rows.push(record);
      }
    }

    return { columns: columns.filter(Boolean), rows };
  }

  private async parseCsv(
    buffer: Buffer,
  ): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
    const content = buffer.toString('utf-8');
    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      throw new BadRequestException('The CSV file is empty or has no data rows.');
    }

    const columns = this.parseCsvLine(lines[0]);
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const record: Record<string, string> = {};
      let hasData = false;

      columns.forEach((col, idx) => {
        const val = (values[idx] || '').trim();
        record[col] = val;
        if (val) hasData = true;
      });

      if (hasData) {
        rows.push(record);
      }
    }

    return { columns, rows };
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }
    result.push(current.trim());
    return result;
  }

  // ============================================
  // VALIDATION
  // ============================================

  validateData(
    fileId: string,
    dataType: string,
    columnMapping: ColumnMapping,
  ): {
    totalRows: number;
    validRows: number;
    errors: ValidationError[];
  } {
    const parsed = this.getStoredFile(fileId);

    if (dataType === 'members') {
      return this.validateMembers(parsed.rows, columnMapping);
    }

    if (dataType === 'products') {
      return this.validateProducts(parsed.rows, columnMapping);
    }

    throw new BadRequestException(`Unknown data type: ${dataType}. Use "members" or "products".`);
  }

  private validateMembers(
    rows: Record<string, string>[],
    columnMapping: ColumnMapping,
  ): {
    totalRows: number;
    validRows: number;
    errors: ValidationError[];
  } {
    const errors: ValidationError[] = [];
    const seenEmails = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +2 because row 1 is header, data starts at row 2

      // Check required fields
      for (const field of CLIENTS_REQUIRED) {
        const sourceCol = columnMapping[field];
        const value = sourceCol ? row[sourceCol] : undefined;
        if (!value || value.trim() === '') {
          errors.push({
            row: rowNum,
            field,
            message: `${field} is required`,
          });
        }
      }

      // Validate email format
      const emailCol = columnMapping['email'];
      const email = emailCol ? (row[emailCol] || '').trim().toLowerCase() : '';
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          errors.push({
            row: rowNum,
            field: 'email',
            message: `Invalid email format: "${email}"`,
          });
        } else if (seenEmails.has(email)) {
          errors.push({
            row: rowNum,
            field: 'email',
            message: `Duplicate email in file: "${email}"`,
          });
        } else {
          seenEmails.add(email);
        }
      }

      // Validate phone - digits only
      const phoneCol = columnMapping['phone'];
      const phone = phoneCol ? (row[phoneCol] || '').trim() : '';
      if (phone && !/^\d+$/.test(phone)) {
        errors.push({
          row: rowNum,
          field: 'phone',
          message: `Phone must contain digits only: "${phone}"`,
        });
      }

      // Validate gender if provided
      const genderCol = columnMapping['gender'];
      const gender = genderCol ? (row[genderCol] || '').trim().toLowerCase() : '';
      if (gender && !['male', 'female', 'other'].includes(gender)) {
        errors.push({
          row: rowNum,
          field: 'gender',
          message: `Invalid gender: "${gender}". Use male, female, or other.`,
        });
      }

      // Validate status if provided
      const statusCol = columnMapping['status'];
      const status = statusCol ? (row[statusCol] || '').trim().toLowerCase() : '';
      if (status && !['active', 'inactive', 'suspended'].includes(status)) {
        errors.push({
          row: rowNum,
          field: 'status',
          message: `Invalid status: "${status}". Use active, inactive, or suspended.`,
        });
      }
    }

    const rowsWithErrors = new Set(errors.map((e) => e.row));
    return {
      totalRows: rows.length,
      validRows: rows.length - rowsWithErrors.size,
      errors,
    };
  }

  private validateProducts(
    rows: Record<string, string>[],
    columnMapping: ColumnMapping,
  ): {
    totalRows: number;
    validRows: number;
    errors: ValidationError[];
  } {
    const errors: ValidationError[] = [];
    const seenSkus = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const getValue = (field: string): string => {
        const sourceCol = columnMapping[field];
        return sourceCol ? (row[sourceCol] || '').trim() : '';
      };

      // name: required, non-empty
      const name = getValue('name');
      if (!name) {
        errors.push({ row: rowNum, field: 'name', message: 'name is required' });
      }

      // price: required, must be positive number
      const priceStr = getValue('price');
      if (!priceStr) {
        errors.push({ row: rowNum, field: 'price', message: 'price is required' });
      } else {
        const price = parseFloat(priceStr);
        if (isNaN(price) || price <= 0) {
          errors.push({
            row: rowNum,
            field: 'price',
            message: `price must be a positive number: "${priceStr}"`,
          });
        }
      }

      // costPrice: optional, must be number if provided
      const costPriceStr = getValue('costPrice');
      if (costPriceStr) {
        const costPrice = parseFloat(costPriceStr);
        if (isNaN(costPrice)) {
          errors.push({
            row: rowNum,
            field: 'costPrice',
            message: `costPrice must be a number: "${costPriceStr}"`,
          });
        }
      }

      // stockQuantity: optional, must be non-negative integer
      const stockStr = getValue('stockQuantity');
      if (stockStr) {
        const stock = parseInt(stockStr, 10);
        if (isNaN(stock) || stock < 0) {
          errors.push({
            row: rowNum,
            field: 'stockQuantity',
            message: `stockQuantity must be a non-negative integer: "${stockStr}"`,
          });
        }
      }

      // lowStockThreshold: optional, must be non-negative integer
      const lowStockStr = getValue('lowStockThreshold');
      if (lowStockStr) {
        const lowStock = parseInt(lowStockStr, 10);
        if (isNaN(lowStock) || lowStock < 0) {
          errors.push({
            row: rowNum,
            field: 'lowStockThreshold',
            message: `lowStockThreshold must be a non-negative integer: "${lowStockStr}"`,
          });
        }
      }

      // taxRate: optional, 0-100
      const taxRateStr = getValue('taxRate');
      if (taxRateStr) {
        const taxRate = parseFloat(taxRateStr);
        if (isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
          errors.push({
            row: rowNum,
            field: 'taxRate',
            message: `taxRate must be between 0 and 100: "${taxRateStr}"`,
          });
        }
      }

      // sku: check for duplicates within file
      const sku = getValue('sku');
      if (sku) {
        if (seenSkus.has(sku)) {
          errors.push({
            row: rowNum,
            field: 'sku',
            message: `Duplicate SKU in file: "${sku}"`,
          });
        } else {
          seenSkus.add(sku);
        }
      }
    }

    const rowsWithErrors = new Set(errors.map((e) => e.row));
    return {
      totalRows: rows.length,
      validRows: rows.length - rowsWithErrors.size,
      errors,
    };
  }

  // ============================================
  // IMPORT
  // ============================================

  async importData(
    fileId: string,
    dataType: string,
    columnMapping: ColumnMapping,
    gymId: number,
    actorInfo: { id: number; name: string; role: string },
  ): Promise<{
    success: number;
    failed: number;
    errors: string[];
    created?: Array<{ name: string; email: string; id: number }>;
  }> {
    if (dataType === 'members') {
      return this.importMembers(fileId, columnMapping, gymId, actorInfo);
    }

    if (dataType === 'products') {
      return this.importProducts(fileId, columnMapping, gymId);
    }

    throw new BadRequestException(`Unknown data type: ${dataType}. Use "members" or "products".`);
  }

  private async importMembers(
    fileId: string,
    columnMapping: ColumnMapping,
    gymId: number,
    actorInfo: { id: number; name: string; role: string },
  ): Promise<{
    success: number;
    failed: number;
    errors: string[];
    created: Array<{ name: string; email: string; id: number }>;
  }> {
    const parsed = this.getStoredFile(fileId);
    const rows = parsed.rows;

    // Map rows to CreateUserDto objects
    const userDtos: CreateUserDto[] = rows.map((row) => {
      const name = (row[columnMapping['name']] || '').trim();
      const email = (row[columnMapping['email']] || '').trim().toLowerCase();
      const phone = (row[columnMapping['phone']] || '').trim();
      const gender = columnMapping['gender']
        ? (row[columnMapping['gender']] || '').trim().toLowerCase()
        : undefined;
      const dateOfBirth = columnMapping['dateOfBirth']
        ? (row[columnMapping['dateOfBirth']] || '').trim()
        : undefined;
      const status = columnMapping['status']
        ? (row[columnMapping['status']] || '').trim().toLowerCase()
        : 'active';

      const dto: CreateUserDto = {
        name,
        email,
        phone,
        password: this.generateRandomPassword(),
        role: 'client' as any,
        status: (status || 'active') as any,
      };

      if (gender) dto.gender = gender as any;
      if (dateOfBirth) dto.dateOfBirth = dateOfBirth;

      return dto;
    });

    // Process in batches of 50
    const BATCH_SIZE = 50;
    const totalResults = {
      success: 0,
      failed: 0,
      errors: [] as string[],
      created: [] as Array<{ name: string; email: string; id: number }>,
    };

    for (let i = 0; i < userDtos.length; i += BATCH_SIZE) {
      const batch = userDtos.slice(i, i + BATCH_SIZE);
      this.logger.log(
        `Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(userDtos.length / BATCH_SIZE)} (${batch.length} users)`,
      );

      const result = await this.usersService.bulkCreate(
        batch,
        gymId,
        actorInfo.role,
        actorInfo,
      );

      totalResults.success += result.success;
      totalResults.failed += result.failed;
      totalResults.errors.push(...result.errors);
      totalResults.created.push(...result.created);
    }

    // Clean up stored file after import
    this.fileStore.delete(fileId);

    return totalResults;
  }

  private async importProducts(
    fileId: string,
    columnMapping: ColumnMapping,
    gymId: number,
  ): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    const parsed = this.getStoredFile(fileId);
    const rows = parsed.rows;

    const getValue = (row: Record<string, string>, field: string): string => {
      const sourceCol = columnMapping[field];
      return sourceCol ? (row[sourceCol] || '').trim() : '';
    };

    const result = await this.tenantService.executeInTenantTransaction(
      gymId,
      async (client) => {
        const txResult = { success: 0, failed: 0, errors: [] as string[] };

        // Build category cache
        const existingCategories = await client.query(
          `SELECT id, LOWER(name) as name FROM product_categories WHERE is_deleted = FALSE`,
        );
        const categoryMap = new Map<string, number>();
        for (const cat of existingCategories.rows) {
          categoryMap.set(cat.name, cat.id);
        }

        // Build existing SKU set for duplicate detection
        const existingSkus = new Set<string>();
        const skuResult = await client.query(
          `SELECT sku FROM products WHERE sku IS NOT NULL AND is_deleted = FALSE`,
        );
        for (const row of skuResult.rows) {
          existingSkus.add(row.sku);
        }

        // Track SKUs within this batch
        const batchSkus = new Set<string>();

        // Process in batches of 50
        const BATCH_SIZE = 50;
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          this.logger.log(
            `Processing product batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(rows.length / BATCH_SIZE)} (${batch.length} products)`,
          );

          for (let j = 0; j < batch.length; j++) {
            const row = batch[j];
            const rowNum = i + j + 2;

            try {
              const name = getValue(row, 'name');
              const priceStr = getValue(row, 'price');

              // Skip rows missing required fields
              if (!name || !priceStr) {
                txResult.failed++;
                txResult.errors.push(
                  `Row ${rowNum}: missing required field (name or price)`,
                );
                continue;
              }

              const price = parseFloat(priceStr);
              if (isNaN(price) || price <= 0) {
                txResult.failed++;
                txResult.errors.push(
                  `Row ${rowNum}: price must be a positive number`,
                );
                continue;
              }

              const sku = getValue(row, 'sku') || null;
              const barcode = getValue(row, 'barcode') || null;
              const costPriceStr = getValue(row, 'costPrice');
              const costPrice = costPriceStr ? parseFloat(costPriceStr) : null;
              const stockStr = getValue(row, 'stockQuantity');
              const stockQuantity = stockStr ? parseInt(stockStr, 10) : 0;
              const lowStockStr = getValue(row, 'lowStockThreshold');
              const lowStockThreshold = lowStockStr ? parseInt(lowStockStr, 10) : 5;
              const taxRateStr = getValue(row, 'taxRate');
              const taxRate = taxRateStr ? parseFloat(taxRateStr) : 0;
              const categoryName = getValue(row, 'category') || null;

              // SKU duplicate check
              if (sku) {
                if (existingSkus.has(sku) || batchSkus.has(sku)) {
                  txResult.failed++;
                  txResult.errors.push(
                    `Row ${rowNum}: duplicate SKU "${sku}" — skipped`,
                  );
                  continue;
                }
                batchSkus.add(sku);
              }

              // Resolve category (auto-create if not found)
              let categoryId: number | null = null;
              if (categoryName) {
                const categoryKey = categoryName.toLowerCase();
                if (categoryMap.has(categoryKey)) {
                  categoryId = categoryMap.get(categoryKey)!;
                } else {
                  const catResult = await client.query(
                    `INSERT INTO product_categories (name, description, display_order)
                     VALUES ($1, NULL, 0) RETURNING id`,
                    [categoryName],
                  );
                  categoryId = catResult.rows[0].id as number;
                  categoryMap.set(categoryKey, categoryId!);
                }
              }

              // Insert product
              await client.query(
                `INSERT INTO products (category_id, name, sku, barcode, description, price, cost_price, tax_rate, stock_quantity, low_stock_threshold, is_active)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                  categoryId,
                  name,
                  sku,
                  barcode,
                  null, // description not in template
                  price,
                  costPrice,
                  taxRate,
                  stockQuantity,
                  lowStockThreshold,
                  true, // is_active
                ],
              );

              txResult.success++;
            } catch (err: any) {
              txResult.failed++;
              txResult.errors.push(
                `Row ${rowNum}: ${err.message || 'Failed to insert product'}`,
              );
            }
          }
        }

        return txResult;
      },
    );

    // Clean up stored file after import
    this.fileStore.delete(fileId);

    return result;
  }

  private generateRandomPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$!';
    const bytes = randomBytes(12);
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars[bytes[i] % chars.length];
    }
    return password;
  }

  // ============================================
  // HELPERS
  // ============================================

  private getStoredFile(fileId: string): ParsedFile {
    const parsed = this.fileStore.get(fileId);
    if (!parsed) {
      throw new BadRequestException(
        'File not found or expired. Please upload the file again.',
      );
    }
    return parsed;
  }

  private cleanExpiredFiles(): void {
    const now = Date.now();
    for (const [id, file] of this.fileStore.entries()) {
      if (now - file.uploadedAt.getTime() > this.FILE_TTL_MS) {
        this.fileStore.delete(id);
      }
    }
  }
}
