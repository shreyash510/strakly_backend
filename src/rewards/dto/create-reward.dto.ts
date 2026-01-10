import {
  IsString,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

export class CreateRewardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  challenge: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reward: string;

  @IsString()
  @IsNotEmpty()
  startDate: string;

  @IsString()
  @IsNotEmpty()
  endDate: string;
}
