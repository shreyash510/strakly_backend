import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsDateString,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';

export class CreateChallengeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  prize: string;

  @IsDateString()
  @IsNotEmpty()
  startDate: string;

  @IsDateString()
  @IsNotEmpty()
  endDate: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  invitedFriendIds: string[];
}

export class RespondChallengeInvitationDto {
  @IsString()
  @IsNotEmpty()
  invitationId: string;

  @IsString()
  @IsNotEmpty()
  action: 'accept' | 'decline';
}

export class MarkChallengeCompleteDto {
  @IsString()
  @IsNotEmpty()
  challengeId: string;
}
