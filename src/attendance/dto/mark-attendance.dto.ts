import { IsString, IsNotEmpty, Length, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class MarkAttendanceDto {
  @IsString()
  @IsNotEmpty()
  @Length(4, 4)
  code: string;

  @IsNumber()
  @IsNotEmpty()
  @Type(() => Number)
  staffId: number;
}
