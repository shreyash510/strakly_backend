import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class CreateRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description: string;

  @IsBoolean()
  isActive: boolean;

  @IsNumber()
  @Min(1)
  @Max(10)
  priority: number;
}
