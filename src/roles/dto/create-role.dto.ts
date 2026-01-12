import { IsString, IsOptional, IsNumber, IsBoolean, IsEnum } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  name: string;

  @IsString()
  label: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(['system', 'gym'])
  level: string;

  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isSystem?: boolean;
}
