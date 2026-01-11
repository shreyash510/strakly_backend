import { IsNotEmpty, IsString } from 'class-validator';

export class SendFriendRequestDto {
  @IsString()
  @IsNotEmpty()
  toUserId: string;
}

export class RespondFriendRequestDto {
  @IsString()
  @IsNotEmpty()
  requestId: string;

  @IsNotEmpty()
  accept: boolean;
}
