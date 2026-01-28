import { IsString, IsOptional, IsBoolean, IsEmail, IsNotEmpty, MaxLength, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreateBranchDto {
  @ApiProperty({ description: 'Branch name', example: 'Koregaon Park Branch' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Branch code (unique per gym)', example: 'KP' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @ApiPropertyOptional({ description: 'Branch phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Branch email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Street address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'State' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'ZIP/Postal code' })
  @IsOptional()
  @IsString()
  zipCode?: string;

  @ApiPropertyOptional({ description: 'Is branch active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBranchDto extends PartialType(CreateBranchDto) {}

export class BranchResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  gymId: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  code: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  address?: string;

  @ApiPropertyOptional()
  city?: string;

  @ApiPropertyOptional()
  state?: string;

  @ApiPropertyOptional()
  zipCode?: string;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  isDefault: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class BranchLimitResponseDto {
  @ApiProperty({ description: 'Current number of branches' })
  current: number;

  @ApiProperty({ description: 'Maximum allowed branches based on plan' })
  max: number;

  @ApiProperty({ description: 'Whether more branches can be added' })
  canAdd: boolean;

  @ApiPropertyOptional({ description: 'Current subscription plan name' })
  plan?: string;
}

export enum MembershipTransferAction {
  CANCEL = 'cancel', // Cancel current membership
  TRANSFER = 'transfer', // Transfer membership to new branch
  KEEP = 'keep', // Keep membership unchanged (for later manual handling)
}

export class TransferMemberDto {
  @ApiProperty({ description: 'Member/Client ID to transfer' })
  @IsNumber()
  memberId: number;

  @ApiProperty({ description: 'Source branch ID (current branch)' })
  @IsNumber()
  fromBranchId: number;

  @ApiProperty({ description: 'Destination branch ID' })
  @IsNumber()
  toBranchId: number;

  @ApiPropertyOptional({
    description: 'What to do with active membership',
    enum: MembershipTransferAction,
    default: MembershipTransferAction.TRANSFER,
  })
  @IsOptional()
  @IsEnum(MembershipTransferAction)
  membershipAction?: MembershipTransferAction;

  @ApiPropertyOptional({ description: 'Notes about the transfer' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class TransferMemberResponseDto {
  @ApiProperty({ description: 'Whether transfer was successful' })
  success: boolean;

  @ApiProperty({ description: 'Transfer message' })
  message: string;

  @ApiProperty({ description: 'Member ID that was transferred' })
  memberId: number;

  @ApiProperty({ description: 'Old branch ID' })
  fromBranchId: number;

  @ApiProperty({ description: 'New branch ID' })
  toBranchId: number;

  @ApiPropertyOptional({ description: 'Number of memberships affected' })
  membershipsAffected?: number;

  @ApiPropertyOptional({ description: 'Number of attendance records updated' })
  attendanceRecordsUpdated?: number;
}
