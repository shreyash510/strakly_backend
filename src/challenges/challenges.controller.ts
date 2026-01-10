import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Headers,
  UnauthorizedException,
  Patch,
} from '@nestjs/common';
import { ChallengesService } from './challenges.service';
import {
  CreateChallengeDto,
  RespondChallengeInvitationDto,
} from './dto/create-challenge.dto';

@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Get all challenges for current user
  @Get()
  getChallenges(@Headers('x-user-id') userId: string) {
    return this.challengesService.getChallenges(this.getUserId(userId));
  }

  // Get pending challenge invitations
  @Get('invitations')
  getInvitations(@Headers('x-user-id') userId: string) {
    return this.challengesService.getInvitations(this.getUserId(userId));
  }

  // Get single challenge
  @Get(':id')
  getChallenge(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.challengesService.getChallenge(this.getUserId(userId), id);
  }

  // Create new challenge
  @Post()
  createChallenge(
    @Headers('x-user-id') userId: string,
    @Body() dto: CreateChallengeDto,
  ) {
    return this.challengesService.createChallenge(this.getUserId(userId), dto);
  }

  // Respond to challenge invitation
  @Post('invitations/respond')
  respondToInvitation(
    @Headers('x-user-id') userId: string,
    @Body() dto: RespondChallengeInvitationDto,
  ) {
    return this.challengesService.respondToInvitation(
      this.getUserId(userId),
      dto.invitationId,
      dto.action,
    );
  }

  // Mark today as complete
  @Patch(':id/complete')
  markComplete(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.challengesService.markComplete(this.getUserId(userId), id);
  }

  // Delete challenge (only creator, only upcoming)
  @Delete(':id')
  deleteChallenge(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.challengesService.deleteChallenge(this.getUserId(userId), id);
  }
}
