import { IsString, IsNotEmpty, IsEmail, MinLength } from 'class-validator';

export class AuthRegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}
