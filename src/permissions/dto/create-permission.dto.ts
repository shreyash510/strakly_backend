import { IsBoolean, IsOptional, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

// DTO for CRUD permissions
export class CrudPermissionsDto {
  @IsOptional()
  @IsBoolean()
  create?: boolean;

  @IsOptional()
  @IsBoolean()
  read?: boolean;

  @IsOptional()
  @IsBoolean()
  update?: boolean;

  @IsOptional()
  @IsBoolean()
  delete?: boolean;
}

// DTO for read-only permissions
export class ReadOnlyPermissionsDto {
  @IsOptional()
  @IsBoolean()
  read?: boolean;
}

// DTO for manager permissions
export class ManagerPermissionsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CrudPermissionsDto)
  @IsObject()
  users?: CrudPermissionsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CrudPermissionsDto)
  @IsObject()
  trainers?: CrudPermissionsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CrudPermissionsDto)
  @IsObject()
  programs?: CrudPermissionsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CrudPermissionsDto)
  @IsObject()
  announcements?: CrudPermissionsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CrudPermissionsDto)
  @IsObject()
  challenges?: CrudPermissionsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReadOnlyPermissionsDto)
  @IsObject()
  reports?: ReadOnlyPermissionsDto;
}

// Create permission DTO
export class CreatePermissionDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ManagerPermissionsDto)
  @IsObject()
  permissions?: ManagerPermissionsDto;
}
