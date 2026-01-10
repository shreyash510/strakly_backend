import { PartialType } from '@nestjs/mapped-types';
import { CreatePunishmentDto, PunishmentStatus } from './create-punishment.dto';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdatePunishmentDto extends PartialType(CreatePunishmentDto) {
  @IsEnum(PunishmentStatus)
  @IsOptional()
  status?: PunishmentStatus;

  @IsString()
  @IsOptional()
  completedAt?: string;
}
