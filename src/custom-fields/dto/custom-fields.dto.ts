import { IsString, IsOptional, IsNumber, IsBoolean, IsArray, IsEnum, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCustomFieldDto {
  @IsString() @IsNotEmpty()
  entityType: string;

  @IsString() @IsNotEmpty()
  name: string;

  @IsString() @IsNotEmpty()
  label: string;

  @IsString() @IsNotEmpty()
  fieldType: string;

  @IsOptional() @IsArray()
  options?: any[];

  @IsOptional() @IsString()
  defaultValue?: string;

  @IsOptional() @IsBoolean()
  isRequired?: boolean;

  @IsOptional() @IsString()
  visibility?: string;

  @IsOptional() @IsNumber() @Type(() => Number)
  displayOrder?: number;

  @IsOptional()
  validationRules?: any;
}

export class UpdateCustomFieldDto {
  @IsOptional() @IsString()
  label?: string;

  @IsOptional() @IsString()
  fieldType?: string;

  @IsOptional() @IsArray()
  options?: any[];

  @IsOptional() @IsString()
  defaultValue?: string;

  @IsOptional() @IsBoolean()
  isRequired?: boolean;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsString()
  visibility?: string;

  @IsOptional() @IsNumber() @Type(() => Number)
  displayOrder?: number;

  @IsOptional()
  validationRules?: any;
}

export class UpsertCustomFieldValueDto {
  @IsNumber() @Type(() => Number)
  fieldId: number;

  @IsOptional() @IsString()
  value?: string;

  @IsOptional() @IsString()
  fileUrl?: string;
}

export class BulkUpsertValuesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertCustomFieldValueDto)
  values: UpsertCustomFieldValueDto[];
}

export class CustomFieldFiltersDto {
  @IsOptional() @IsString()
  entityType?: string;

  @IsOptional() @IsString()
  isActive?: string;

  @IsOptional() @IsNumber() @Type(() => Number)
  page?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  limit?: number;
}

export class ReorderDto {
  @IsArray()
  items: { id: number; displayOrder: number }[];
}
