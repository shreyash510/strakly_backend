import { Injectable, BadRequestException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import * as ExcelJS from 'exceljs';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import type {
  DataType,
  FieldDef,
  ParseResult,
  ValidationResult,
  ValidationError,
  ImportResult,
} from './dto/migration.dto';

interface StoredFile {
  rows: Record<string, string>[];
  columns: string[];
  createdAt: number;
}

const FIELD_DEFS: Record<DataType, FieldDef[]> = {
  members: [
    { key: 'name', label: 'Name', required: true },
    { key: 'email', label: 'Email', required: true, type: 'email' },
    { key: 'phone', label: 'Phone', required: false },
    {
      key: 'gender',
      label: 'Gender',
      required: false,
      type: 'enum',
      enumValues: ['male', 'female', 'other'],
    },
    {
      key: 'status',
      label: 'Status',
      required: false,
      type: 'enum',
      enumValues: ['active', 'inactive'],
    },
    { key: 'joinDate', label: 'Join Date', required: false, type: 'date' },
  ],
  staff: [
    { key: 'name', label: 'Name', required: true },
    { key: 'email', label: 'Email', required: true, type: 'email' },
    { key: 'phone', label: 'Phone', required: false },
    {
      key: 'role',
      label: 'Role',
      required: true,
      type: 'enum',
      enumValues: ['trainer', 'manager'],
    },
    {
      key: 'gender',
      label: 'Gender',
      required: false,
      type: 'enum',
      enumValues: ['male', 'female', 'other'],
    },
    {
      key: 'status',
      label: 'Status',
      required: false,
      type: 'enum',
      enumValues: ['active', 'inactive'],
    },
    { key: 'salary', label: 'Salary', required: false, type: 'number' },
    { key: 'joinDate', label: 'Join Date', required: false, type: 'date' },
  ],
  memberships: [
    { key: 'memberEmail', label: 'Member Email', required: true, type: 'email' },
    { key: 'planName', label: 'Plan Name', required: true },
    { key: 'startDate', label: 'Start Date', required: true, type: 'date' },
    { key: 'endDate', label: 'End Date', required: true, type: 'date' },
    { key: 'amount', label: 'Amount', required: false, type: 'number' },
    {
      key: 'paymentStatus',
      label: 'Payment Status',
      required: false,
      type: 'enum',
      enumValues: ['paid', 'pending', 'failed', 'refunded'],
    },
    {
      key: 'paymentMethod',
      label: 'Payment Method',
      required: false,
      type: 'enum',
      enumValues: ['cash', 'card', 'upi', 'bank_transfer', 'other'],
    },
  ],
  payments: [
    { key: 'memberEmail', label: 'Member Email', required: true, type: 'email' },
    { key: 'amount', label: 'Amount', required: true, type: 'number' },
    { key: 'paymentDate', label: 'Payment Date', required: true, type: 'date' },
    {
      key: 'paymentMethod',
      label: 'Payment Method',
      required: false,
      type: 'enum',
      enumValues: ['cash', 'card', 'upi', 'bank_transfer', 'other'],
    },
    {
      key: 'status',
      label: 'Status',
      required: false,
      type: 'enum',
      enumValues: ['paid', 'pending', 'failed', 'refunded'],
    },
    { key: 'reference', label: 'Reference', required: false },
  ],
};

@Injectable()
export class MigrationService {
  /* in-memory storage for parsed files (TTL: 30 min) */
  private fileStore = new Map<string, StoredFile>();
  private readonly TTL = 30 * 60 * 1000;

  constructor(private readonly tenantService: TenantService) {
    /* cleanup expired entries every 10 min */
    setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  /* ========== public API ========== */

  getFieldDefinitions(dataType: DataType): FieldDef[] {
    return FIELD_DEFS[dataType] ?? [];
  }

  async parseFile(file: Express.Multer.File): Promise<ParseResult> {
    const workbook = new ExcelJS.Workbook();
    const ext = file.originalname.toLowerCase();

    if (ext.endsWith('.csv')) {
      await workbook.csv.read(this.bufferToStream(file.buffer) as any);
    } else {
      await workbook.xlsx.load(file.buffer as any);
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      throw new BadRequestException(
        'File is empty or has no data rows. First row must be column headers.',
      );
    }

    /* extract headers from first row */
    const headerRow = worksheet.getRow(1);
    const columns: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      columns.push(String(cell.value ?? `Column ${colNumber}`).trim());
    });

    if (columns.length === 0) {
      throw new BadRequestException('No column headers found in the file.');
    }

    /* extract all data rows */
    const rows: Record<string, string>[] = [];
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const record: Record<string, string> = {};
      let hasValue = false;

      columns.forEach((col, idx) => {
        const cell = row.getCell(idx + 1);
        const val = cell.value;
        if (val !== null && val !== undefined && String(val).trim() !== '') {
          record[col] = String(val).trim();
          hasValue = true;
        } else {
          record[col] = '';
        }
      });

      if (hasValue) rows.push(record);
    }

    if (rows.length === 0) {
      throw new BadRequestException('File has headers but no data rows.');
    }

    const fileId = uuidv4();
    this.fileStore.set(fileId, {
      rows,
      columns,
      createdAt: Date.now(),
    });

    return {
      columns,
      previewRows: rows.slice(0, 5),
      totalRows: rows.length,
      fileId,
    };
  }

  validateRows(
    fileId: string,
    dataType: DataType,
    columnMapping: Record<string, string | null>,
    valueMapping: Record<string, Record<string, string>> = {},
  ): ValidationResult {
    const stored = this.fileStore.get(fileId);
    if (!stored) throw new BadRequestException('File not found or expired. Please re-upload.');

    const fields = FIELD_DEFS[dataType];
    const errors: ValidationError[] = [];

    stored.rows.forEach((row, idx) => {
      const rowNum = idx + 2; // 1-indexed, skip header
      const mapped = this.applyMappings(row, columnMapping, valueMapping);

      for (const field of fields) {
        const val = mapped[field.key];

        /* required check */
        if (field.required && (!val || val.trim() === '')) {
          errors.push({ row: rowNum, field: field.key, message: `${field.label} is required` });
          continue;
        }
        if (!val || val.trim() === '') continue;

        /* type checks */
        if (field.type === 'email' && !this.isValidEmail(val)) {
          errors.push({ row: rowNum, field: field.key, message: `Invalid email: ${val}` });
        }
        if (field.type === 'date' && !this.isValidDate(val)) {
          errors.push({
            row: rowNum,
            field: field.key,
            message: `Invalid date: ${val}. Use YYYY-MM-DD format.`,
          });
        }
        if (field.type === 'number' && isNaN(Number(val))) {
          errors.push({ row: rowNum, field: field.key, message: `Invalid number: ${val}` });
        }
        if (field.type === 'enum' && field.enumValues && !field.enumValues.includes(val.toLowerCase())) {
          errors.push({
            row: rowNum,
            field: field.key,
            message: `Invalid value: "${val}". Allowed: ${field.enumValues.join(', ')}`,
          });
        }
      }
    });

    return {
      totalRows: stored.rows.length,
      validRows: stored.rows.length - new Set(errors.map((e) => e.row)).size,
      errors,
    };
  }

  async importData(
    gymId: number,
    fileId: string,
    dataType: DataType,
    columnMapping: Record<string, string | null>,
    valueMapping: Record<string, Record<string, string>> = {},
    branchId?: number,
  ): Promise<ImportResult> {
    const stored = this.fileStore.get(fileId);
    if (!stored) throw new BadRequestException('File not found or expired. Please re-upload.');

    /* first validate */
    const validation = this.validateRows(fileId, dataType, columnMapping, valueMapping);

    /* collect error rows for skipping */
    const errorRowSet = new Set(validation.errors.map((e) => e.row));

    /* map valid rows */
    const mappedRows = stored.rows
      .map((row, idx) => ({
        data: this.applyMappings(row, columnMapping, valueMapping),
        rowNum: idx + 2,
      }))
      .filter((r) => !errorRowSet.has(r.rowNum));

    if (mappedRows.length === 0) {
      return {
        totalRows: stored.rows.length,
        imported: 0,
        skipped: stored.rows.length,
        errors: validation.errors,
      };
    }

    switch (dataType) {
      case 'members':
        return this.importMembers(gymId, mappedRows, stored.rows.length, validation.errors, branchId);
      case 'staff':
        return this.importStaff(gymId, mappedRows, stored.rows.length, validation.errors, branchId);
      case 'memberships':
        return this.importMemberships(gymId, mappedRows, stored.rows.length, validation.errors, branchId);
      case 'payments':
        return this.importPayments(gymId, mappedRows, stored.rows.length, validation.errors);
      default:
        throw new BadRequestException(`Unknown data type: ${dataType}`);
    }
  }

  async generateTemplate(dataType: DataType): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Strakly';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Template');
    const fields = FIELD_DEFS[dataType];

    /* headers */
    const headerRow = worksheet.addRow(fields.map((f) => f.label + (f.required ? ' *' : '')));
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F46E5' },
      };
      cell.alignment = { horizontal: 'center' };
    });

    /* example row */
    const exampleData: Record<DataType, string[]> = {
      members: ['John Doe', 'john@example.com', '+919876543210', 'male', 'active', '2024-01-15'],
      staff: [
        'Jane Smith',
        'jane@example.com',
        '+919876543211',
        'trainer',
        'female',
        'active',
        '25000',
        '2024-02-01',
      ],
      memberships: [
        'john@example.com',
        'Monthly Plan',
        '2024-01-15',
        '2024-02-15',
        '2000',
        'paid',
        'cash',
      ],
      payments: ['john@example.com', '2000', '2024-01-15', 'cash', 'paid', 'MEM-001'],
    };
    worksheet.addRow(exampleData[dataType]);

    /* notes sheet */
    const notesSheet = workbook.addWorksheet('Notes');
    notesSheet.addRow(['Field', 'Required', 'Format / Allowed Values']);
    const notesHeaderRow = notesSheet.getRow(1);
    notesHeaderRow.eachCell((cell) => {
      cell.font = { bold: true };
    });

    for (const field of fields) {
      let format = 'Text';
      if (field.type === 'email') format = 'Valid email address';
      if (field.type === 'date') format = 'YYYY-MM-DD';
      if (field.type === 'number') format = 'Number';
      if (field.type === 'enum') format = `Allowed: ${field.enumValues?.join(', ')}`;
      notesSheet.addRow([field.label, field.required ? 'Yes' : 'No', format]);
    }

    /* auto-fit column widths */
    worksheet.columns.forEach((col) => {
      col.width = 22;
    });
    notesSheet.columns.forEach((col) => {
      col.width = 30;
    });

    return workbook;
  }

  /* ========== import helpers ========== */

  private async importMembers(
    gymId: number,
    rows: { data: Record<string, string>; rowNum: number }[],
    totalRows: number,
    existingErrors: ValidationError[],
    branchId?: number,
  ): Promise<ImportResult> {
    const errors = [...existingErrors];
    let imported = 0;
    let skipped = 0;

    const defaultPasswordHash = await bcrypt.hash('Strakly@123', 10);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      for (const { data, rowNum } of rows) {
        try {
          /* check for duplicate email */
          const dup = await client.query('SELECT id FROM users WHERE email = $1', [
            data.email.toLowerCase(),
          ]);
          if (dup.rows.length > 0) {
            skipped++;
            errors.push({
              row: rowNum,
              field: 'email',
              message: `Duplicate email: ${data.email} (skipped)`,
            });
            continue;
          }

          /* generate unique attendance code */
          const attendanceCode = await this.generateAttendanceCode(client);

          await client.query(
            `INSERT INTO users (
              name, email, password_hash, phone, role, gender, status,
              join_date, attendance_code, branch_id, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, 'client', $5, $6, $7, $8, $9, NOW(), NOW())`,
            [
              data.name,
              data.email.toLowerCase(),
              defaultPasswordHash,
              data.phone || null,
              data.gender?.toLowerCase() || null,
              data.status?.toLowerCase() || 'active',
              data.joinDate ? this.parseDate(data.joinDate) : new Date(),
              attendanceCode,
              branchId || null,
            ],
          );
          imported++;
        } catch (err: any) {
          errors.push({ row: rowNum, field: 'general', message: err.message });
        }
      }
    });

    return { totalRows, imported, skipped: totalRows - imported, errors };
  }

  private async importStaff(
    gymId: number,
    rows: { data: Record<string, string>; rowNum: number }[],
    totalRows: number,
    existingErrors: ValidationError[],
    branchId?: number,
  ): Promise<ImportResult> {
    const errors = [...existingErrors];
    let imported = 0;
    let skipped = 0;

    const defaultPasswordHash = await bcrypt.hash('Strakly@123', 10);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      for (const { data, rowNum } of rows) {
        try {
          const dup = await client.query('SELECT id FROM users WHERE email = $1', [
            data.email.toLowerCase(),
          ]);
          if (dup.rows.length > 0) {
            skipped++;
            errors.push({
              row: rowNum,
              field: 'email',
              message: `Duplicate email: ${data.email} (skipped)`,
            });
            continue;
          }

          const attendanceCode = await this.generateAttendanceCode(client);

          await client.query(
            `INSERT INTO users (
              name, email, password_hash, phone, role, gender, status,
              join_date, attendance_code, branch_id, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
            [
              data.name,
              data.email.toLowerCase(),
              defaultPasswordHash,
              data.phone || null,
              data.role?.toLowerCase() || 'trainer',
              data.gender?.toLowerCase() || null,
              data.status?.toLowerCase() || 'active',
              data.joinDate ? this.parseDate(data.joinDate) : new Date(),
              attendanceCode,
              branchId || null,
            ],
          );
          imported++;
        } catch (err: any) {
          errors.push({ row: rowNum, field: 'general', message: err.message });
        }
      }
    });

    return { totalRows, imported, skipped: totalRows - imported, errors };
  }

  private async importMemberships(
    gymId: number,
    rows: { data: Record<string, string>; rowNum: number }[],
    totalRows: number,
    existingErrors: ValidationError[],
    branchId?: number,
  ): Promise<ImportResult> {
    const errors = [...existingErrors];
    let imported = 0;

    await this.tenantService.executeInTenant(gymId, async (client) => {
      for (const { data, rowNum } of rows) {
        try {
          /* resolve user by email */
          const userRes = await client.query(
            'SELECT id FROM users WHERE email = $1',
            [data.memberEmail.toLowerCase()],
          );
          if (userRes.rows.length === 0) {
            errors.push({
              row: rowNum,
              field: 'memberEmail',
              message: `Member not found: ${data.memberEmail}`,
            });
            continue;
          }
          const userId = userRes.rows[0].id;

          /* resolve plan by name */
          let planQuery = 'SELECT id, price FROM plans WHERE LOWER(name) = LOWER($1)';
          const planParams: any[] = [data.planName];
          if (branchId) {
            planQuery += ' AND branch_id = $2';
            planParams.push(branchId);
          }
          const planRes = await client.query(planQuery, planParams);
          if (planRes.rows.length === 0) {
            errors.push({
              row: rowNum,
              field: 'planName',
              message: `Plan not found: ${data.planName}`,
            });
            continue;
          }
          const plan = planRes.rows[0];

          const amount = data.amount ? parseFloat(data.amount) : parseFloat(plan.price);
          const paymentStatus = data.paymentStatus?.toLowerCase() || 'paid';
          const paymentMethod = data.paymentMethod?.toLowerCase() || null;

          await client.query(
            `INSERT INTO memberships (
              user_id, plan_id, start_date, end_date,
              original_amount, discount_amount, final_amount,
              payment_status, payment_method, paid_at,
              status, branch_id, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, 0, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
            [
              userId,
              plan.id,
              this.parseDate(data.startDate),
              this.parseDate(data.endDate),
              amount,
              paymentStatus,
              paymentMethod,
              paymentStatus === 'paid' ? (data.startDate ? this.parseDate(data.startDate) : new Date()) : null,
              this.deriveMembershipStatus(data.endDate),
              branchId || null,
            ],
          );
          imported++;
        } catch (err: any) {
          errors.push({ row: rowNum, field: 'general', message: err.message });
        }
      }
    });

    return { totalRows, imported, skipped: totalRows - imported, errors };
  }

  private async importPayments(
    gymId: number,
    rows: { data: Record<string, string>; rowNum: number }[],
    totalRows: number,
    existingErrors: ValidationError[],
  ): Promise<ImportResult> {
    const errors = [...existingErrors];
    let imported = 0;

    await this.tenantService.executeInTenant(gymId, async (client) => {
      for (const { data, rowNum } of rows) {
        try {
          /* resolve user by email */
          const userRes = await client.query(
            'SELECT id FROM users WHERE email = $1',
            [data.memberEmail.toLowerCase()],
          );
          if (userRes.rows.length === 0) {
            errors.push({
              row: rowNum,
              field: 'memberEmail',
              message: `Member not found: ${data.memberEmail}`,
            });
            continue;
          }
          const payerId = userRes.rows[0].id;

          await client.query(
            `INSERT INTO payments (
              payment_type, payer_id, amount, payment_method,
              status, reference_note, payment_date, created_at, updated_at
            ) VALUES ('migration_import', $1, $2, $3, $4, $5, $6, NOW(), NOW())`,
            [
              payerId,
              parseFloat(data.amount),
              data.paymentMethod?.toLowerCase() || 'other',
              data.status?.toLowerCase() || 'paid',
              data.reference || null,
              data.paymentDate ? this.parseDate(data.paymentDate) : new Date(),
            ],
          );
          imported++;
        } catch (err: any) {
          errors.push({ row: rowNum, field: 'general', message: err.message });
        }
      }
    });

    return { totalRows, imported, skipped: totalRows - imported, errors };
  }

  /* ========== utility methods ========== */

  private applyMappings(
    row: Record<string, string>,
    columnMapping: Record<string, string | null>,
    valueMapping: Record<string, Record<string, string>>,
  ): Record<string, string> {
    const mapped: Record<string, string> = {};

    for (const [straklyField, csvColumn] of Object.entries(columnMapping)) {
      if (!csvColumn) {
        mapped[straklyField] = '';
        continue;
      }
      let val = row[csvColumn] ?? '';

      /* apply value mapping if present */
      if (valueMapping[straklyField] && val) {
        const lowerVal = val.toLowerCase();
        for (const [foreign, strakly] of Object.entries(valueMapping[straklyField])) {
          if (foreign.toLowerCase() === lowerVal) {
            val = strakly;
            break;
          }
        }
      }

      mapped[straklyField] = val;
    }
    return mapped;
  }

  private async generateAttendanceCode(client: any): Promise<string> {
    let code: string;
    let exists = true;
    do {
      code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const res = await client.query(
        'SELECT id FROM users WHERE attendance_code = $1',
        [code],
      );
      exists = res.rows.length > 0;
    } while (exists);
    return code;
  }

  private isValidEmail(val: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  }

  private isValidDate(val: string): boolean {
    /* accept YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY */
    const parsed = this.parseDate(val);
    return parsed !== null && !isNaN(parsed.getTime());
  }

  private parseDate(val: string): Date | null {
    if (!val) return null;

    /* try YYYY-MM-DD first */
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      return new Date(val + 'T00:00:00');
    }

    /* DD/MM/YYYY or DD-MM-YYYY */
    const dmy = val.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
      const d = parseInt(dmy[1]);
      const m = parseInt(dmy[2]);
      const y = parseInt(dmy[3]);
      if (d <= 31 && m <= 12) {
        return new Date(y, m - 1, d);
      }
    }

    /* fallback: JS Date parser */
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  private deriveMembershipStatus(endDateStr: string): string {
    const endDate = this.parseDate(endDateStr);
    if (!endDate) return 'active';
    return endDate < new Date() ? 'expired' : 'active';
  }

  private bufferToStream(buffer: Buffer): NodeJS.ReadableStream {
    const { Readable } = require('stream');
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    return stream;
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, stored] of this.fileStore.entries()) {
      if (now - stored.createdAt > this.TTL) {
        this.fileStore.delete(key);
      }
    }
  }
}
