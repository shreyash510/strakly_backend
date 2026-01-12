import { IsString, IsNumber, IsMongoId, IsDateString } from 'class-validator';

export class CreateSubscriptionDto {
  @IsMongoId()
  userId: string;

  @IsMongoId()
  gymId: string;

  @IsString()
  planName: string;

  @IsNumber()
  amount: number;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
