import { IsOptional, ValidateNested, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { ManagerPermissionsDto } from './create-permission.dto';

// Update permission DTO - all fields are optional
export class UpdatePermissionDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ManagerPermissionsDto)
  @IsObject()
  permissions?: ManagerPermissionsDto;
}
