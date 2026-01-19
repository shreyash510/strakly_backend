import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsString()
  module: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdatePermissionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignRolePermissionsDto {
  @IsString()
  role: string;

  @IsArray()
  @IsString({ each: true })
  permissionCodes: string[];
}
