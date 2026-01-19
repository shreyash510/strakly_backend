import { IsString, IsNotEmpty, Length } from 'class-validator';

export class MarkAttendanceDto {
  @IsString()
  @IsNotEmpty()
  @Length(4, 4)
  code: string;

  @IsString()
  @IsNotEmpty()
  staffId: string;

  @IsString()
  @IsNotEmpty()
  staffName: string;
}
