import { PartialType, OmitType } from '@nestjs/swagger';
import { AdminCreateUserDto } from './create-user.dto';

export class AdminUpdateUserDto extends PartialType(
  OmitType(AdminCreateUserDto, ['password'] as const),
) {}
