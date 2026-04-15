import { IsString, MinLength, Matches } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  @Matches(/[A-Z]/, { message: 'newPassword must contain at least one uppercase letter' })
  @Matches(/[a-z]/, { message: 'newPassword must contain at least one lowercase letter' })
  @Matches(/[0-9]/, { message: 'newPassword must contain at least one number' })
  newPassword: string;
}
