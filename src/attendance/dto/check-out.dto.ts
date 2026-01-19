import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CheckOutDto {
  @IsString()
  @IsOptional()
  staffId?: string;

  @IsString()
  @IsOptional()
  staffName?: string;
}
