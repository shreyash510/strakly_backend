import { IsString, IsOptional, IsObject, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type DataType = 'members' | 'memberships' | 'staff' | 'payments';

export class UploadFileDto {
  @ApiProperty({ enum: ['members', 'memberships', 'staff', 'payments'] })
  @IsString()
  dataType: DataType;
}

export class ValidateDto {
  @ApiProperty()
  @IsString()
  fileId: string;

  @ApiProperty({ enum: ['members', 'memberships', 'staff', 'payments'] })
  @IsString()
  dataType: DataType;

  @ApiProperty({ description: 'Maps strakly field → CSV column name' })
  @IsObject()
  columnMapping: Record<string, string | null>;

  @ApiPropertyOptional({
    description: 'Maps strakly field → { foreignValue: straklyValue }',
  })
  @IsObject()
  @IsOptional()
  valueMapping?: Record<string, Record<string, string>>;
}

export class ImportDto extends ValidateDto {
  @ApiPropertyOptional({ description: 'Branch ID to assign imported records to' })
  @IsInt()
  @IsOptional()
  branchId?: number;
}

/* ---------- Field definition ---------- */

export interface FieldDef {
  key: string;
  label: string;
  required: boolean;
  type?: 'email' | 'date' | 'number' | 'enum';
  enumValues?: string[];
}

/* ---------- Response interfaces ---------- */

export interface ParseResult {
  columns: string[];
  previewRows: Record<string, string>[];
  totalRows: number;
  fileId: string;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ValidationResult {
  totalRows: number;
  validRows: number;
  errors: ValidationError[];
}

export interface ImportResult {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: ValidationError[];
}
