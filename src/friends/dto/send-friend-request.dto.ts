import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class SendFriendRequestDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class RespondFriendRequestDto {
  @IsString()
  @IsNotEmpty()
  requestId: string;

  @IsString()
  @IsNotEmpty()
  action: 'accept' | 'decline';
}
