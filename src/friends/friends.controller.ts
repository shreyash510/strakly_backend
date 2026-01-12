import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { FriendsService } from './friends.service';
import {
  SendFriendRequestDto,
  RespondFriendRequestDto,
} from './dto/send-friend-request.dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  // Get all friends (basic)
  @Get()
  getFriends(@CurrentUser() user: any) {
    return this.friendsService.getFriends(user.userId);
  }

  // Get all users (for adding friends) - excludes current user
  @Get('all-users')
  getAllUsers(@CurrentUser() user: any) {
    return this.friendsService.getAllUsers(user.userId);
  }

  // Get all friends with stats (totalStreak, challengesWon, challengesLost)
  @Get('with-stats')
  getFriendsWithStats(@CurrentUser() user: any) {
    return this.friendsService.getFriendsWithStats(user.userId);
  }

  // Get pending friend requests (incoming and outgoing)
  @Get('requests')
  getFriendRequests(@CurrentUser() user: any) {
    return this.friendsService.getFriendRequests(user.userId);
  }

  // Send friend request
  @Post('requests')
  sendFriendRequest(@CurrentUser() user: any, @Body() dto: SendFriendRequestDto) {
    return this.friendsService.sendFriendRequest(user.userId, dto.toUserId);
  }

  // Respond to friend request (accept/decline)
  @Post('requests/respond')
  respondToRequest(@CurrentUser() user: any, @Body() dto: RespondFriendRequestDto) {
    return this.friendsService.respondToRequest(
      user.userId,
      dto.requestId,
      dto.accept ? 'accept' : 'decline',
    );
  }

  // Cancel sent friend request
  @Delete('requests/:requestId')
  cancelRequest(@CurrentUser() user: any, @Param('requestId') requestId: string) {
    return this.friendsService.cancelRequest(user.userId, requestId);
  }

  // Remove friend
  @Delete(':friendId')
  removeFriend(@CurrentUser() user: any, @Param('friendId') friendId: string) {
    return this.friendsService.removeFriend(user.userId, friendId);
  }
}
