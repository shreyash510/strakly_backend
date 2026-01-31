import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  IsInt,
} from 'class-validator';

export class CreateDietDto {
  @ApiProperty({ description: 'Diet title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    enum: ['meal_plan', 'nutrition_guide', 'supplement_plan', 'custom'],
  })
  @IsEnum(['meal_plan', 'nutrition_guide', 'supplement_plan', 'custom'])
  type: 'meal_plan' | 'nutrition_guide' | 'supplement_plan' | 'custom';

  @ApiPropertyOptional({ description: 'Diet description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description:
      'Diet category (e.g., weight_loss, muscle_gain, maintenance, general_health)',
  })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ description: 'Diet content/details' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({
    enum: ['draft', 'active', 'archived'],
    default: 'active',
  })
  @IsEnum(['draft', 'active', 'archived'])
  @IsOptional()
  status?: 'draft' | 'active' | 'archived';

  @ApiPropertyOptional({ description: 'Branch ID for the diet' })
  @IsInt()
  @IsOptional()
  branchId?: number;
}

export class UpdateDietDto {
  @ApiPropertyOptional({ description: 'Diet title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    enum: ['meal_plan', 'nutrition_guide', 'supplement_plan', 'custom'],
  })
  @IsEnum(['meal_plan', 'nutrition_guide', 'supplement_plan', 'custom'])
  @IsOptional()
  type?: 'meal_plan' | 'nutrition_guide' | 'supplement_plan' | 'custom';

  @ApiPropertyOptional({ description: 'Diet description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Diet category' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Diet content/details' })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiPropertyOptional({ enum: ['draft', 'active', 'archived'] })
  @IsEnum(['draft', 'active', 'archived'])
  @IsOptional()
  status?: 'draft' | 'active' | 'archived';
}

export class AssignDietDto {
  @ApiProperty({ description: 'Diet ID to assign' })
  @IsInt()
  dietId: number;

  @ApiProperty({ description: 'Client user ID to assign the diet to' })
  @IsInt()
  userId: number;

  @ApiPropertyOptional({ description: 'Notes for the assignment' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateDietAssignmentDto {
  @ApiPropertyOptional({ enum: ['active', 'completed', 'cancelled'] })
  @IsEnum(['active', 'completed', 'cancelled'])
  @IsOptional()
  status?: 'active' | 'completed' | 'cancelled';

  @ApiPropertyOptional({ description: 'Notes for the assignment' })
  @IsString()
  @IsOptional()
  notes?: string;
}
