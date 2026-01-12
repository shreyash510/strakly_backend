import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ChallengesService } from './challenges.service';
import {
  CreateChallengeDto,
  RespondChallengeInvitationDto,
} from './dto/create-challenge.dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';

@Controller('challenges')
@UseGuards(JwtAuthGuard)
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  // Get all challenges for current user
  @Get()
  getChallenges(@CurrentUser() user: any) {
    return this.challengesService.getChallenges(user.userId);
  }

  // Get pending challenge invitations
  @Get('invitations')
  getInvitations(@CurrentUser() user: any) {
    return this.challengesService.getInvitations(user.userId);
  }

  // Get single challenge
  @Get(':id')
  getChallenge(@CurrentUser() user: any, @Param('id') id: string) {
    return this.challengesService.getChallenge(user.userId, id);
  }

  // Create new challenge
  @Post()
  createChallenge(@CurrentUser() user: any, @Body() dto: CreateChallengeDto) {
    return this.challengesService.createChallenge(user.userId, dto);
  }

  // Respond to challenge invitation
  @Post('invitations/respond')
  respondToInvitation(
    @CurrentUser() user: any,
    @Body() dto: RespondChallengeInvitationDto,
  ) {
    return this.challengesService.respondToInvitation(
      user.userId,
      dto.invitationId,
      dto.action,
    );
  }

  // Mark today as complete
  @Patch(':id/complete')
  markComplete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.challengesService.markComplete(user.userId, id);
  }

  // Delete challenge (only creator, only upcoming)
  @Delete(':id')
  deleteChallenge(@CurrentUser() user: any, @Param('id') id: string) {
    return this.challengesService.deleteChallenge(user.userId, id);
  }
}
