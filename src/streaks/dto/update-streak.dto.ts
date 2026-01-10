import { IsString, IsNumber, Min } from 'class-validator';

export class UpdateStreakDto {
  @IsString()
  itemName: string;

  @IsNumber()
  @Min(0)
  streak: number;
}

export class BulkUpdateStreaksDto {
  streaks: Record<string, number>;
}
