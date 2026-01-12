import { IsString, IsOptional, IsEmail } from 'class-validator';

export class CreateGymDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  zipCode?: string;

  @IsString()
  @IsOptional()
  logo?: string;
}
