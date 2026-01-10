import { PartialType } from '@nestjs/mapped-types';
import { CreatePunishmentRuleDto } from './create-punishment-rule.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePunishmentRuleDto extends PartialType(CreatePunishmentRuleDto) {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
