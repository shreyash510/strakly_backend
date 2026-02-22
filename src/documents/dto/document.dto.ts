import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsNotEmpty,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum DocumentType {
  WAIVER = 'waiver',
  CONTRACT = 'contract',
  PAR_Q = 'par_q',
  CONSENT = 'consent',
  TERMS = 'terms',
}

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsString()
  @IsNotEmpty()
  content: string;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SignDocumentDto {
  @IsNumber()
  @Type(() => Number)
  templateId: number;

  @IsString()
  @IsNotEmpty()
  signerName: string;

  @IsBoolean()
  agreed: boolean;

  @IsOptional()
  @IsString()
  signatureData?: string;
}

export class TemplateFiltersDto {
  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeInactive?: boolean;
}
