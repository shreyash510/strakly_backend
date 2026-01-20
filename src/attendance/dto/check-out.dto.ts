import { IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class CheckOutDto {
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  staffId?: number;
}
