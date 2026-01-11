import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { FriendsService } from './friends.service';
import {
  SendFriendRequestDto,
  RespondFriendRequestDto,
} from './dto/send-friend-request.dto';

@Controller('friends')
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Get all friends (basic)
  @Get()
  getFriends(@Headers('x-user-id') userId: string) {
    return this.friendsService.getFriends(this.getUserId(userId));
  }

  // Get all users (for adding friends) - excludes current user
  @Get('all-users')
  getAllUsers(@Headers('x-user-id') userId: string) {
    return this.friendsService.getAllUsers(this.getUserId(userId));
  }

  // Get all friends with stats (totalStreak, challengesWon, challengesLost)
  @Get('with-stats')
  getFriendsWithStats(@Headers('x-user-id') userId: string) {
    return this.friendsService.getFriendsWithStats(this.getUserId(userId));
  }

  // Get pending friend requests (incoming and outgoing)
  @Get('requests')
  getFriendRequests(@Headers('x-user-id') userId: string) {
    return this.friendsService.getFriendRequests(this.getUserId(userId));
  }

  // Send friend request
  @Post('requests')
  sendFriendRequest(
    @Headers('x-user-id') userId: string,
    @Body() dto: SendFriendRequestDto,
  ) {
    return this.friendsService.sendFriendRequest(
      this.getUserId(userId),
      dto.toUserId,
    );
  }

  // Respond to friend request (accept/decline)
  @Post('requests/respond')
  respondToRequest(
    @Headers('x-user-id') userId: string,
    @Body() dto: RespondFriendRequestDto,
  ) {
    return this.friendsService.respondToRequest(
      this.getUserId(userId),
      dto.requestId,
      dto.accept ? 'accept' : 'decline',
    );
  }

  // Cancel sent friend request
  @Delete('requests/:requestId')
  cancelRequest(
    @Headers('x-user-id') userId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.friendsService.cancelRequest(this.getUserId(userId), requestId);
  }

  // Remove friend
  @Delete(':friendId')
  removeFriend(
    @Headers('x-user-id') userId: string,
    @Param('friendId') friendId: string,
  ) {
    return this.friendsService.removeFriend(this.getUserId(userId), friendId);
  }
}
