import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { PunishmentsService } from './punishments.service';
import { CreatePunishmentRuleDto } from './dto/create-punishment-rule.dto';
import { UpdatePunishmentRuleDto } from './dto/update-punishment-rule.dto';
import { CreatePunishmentDto } from './dto/create-punishment.dto';
import { UpdatePunishmentDto } from './dto/update-punishment.dto';

@Controller('punishments')
export class PunishmentsController {
  constructor(private readonly punishmentsService: PunishmentsService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Punishment Rules Endpoints
  @Get('rules')
  findAllRules(@Headers('x-user-id') userId: string) {
    return this.punishmentsService.findAllRules(this.getUserId(userId));
  }

  @Get('rules/:id')
  findOneRule(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.punishmentsService.findOneRule(this.getUserId(userId), id);
  }

  @Post('rules')
  createRule(
    @Headers('x-user-id') userId: string,
    @Body() createRuleDto: CreatePunishmentRuleDto,
  ) {
    return this.punishmentsService.createRule(this.getUserId(userId), createRuleDto);
  }

  @Patch('rules/:id')
  updateRule(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() updateRuleDto: UpdatePunishmentRuleDto,
  ) {
    return this.punishmentsService.updateRule(
      this.getUserId(userId),
      id,
      updateRuleDto,
    );
  }

  @Patch('rules/:id/toggle')
  toggleRuleActive(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.punishmentsService.toggleRuleActive(this.getUserId(userId), id);
  }

  @Delete('rules/:id')
  removeRule(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.punishmentsService.removeRule(this.getUserId(userId), id);
  }

  // Punishments Endpoints
  @Get()
  findAllPunishments(@Headers('x-user-id') userId: string) {
    return this.punishmentsService.findAllPunishments(this.getUserId(userId));
  }

  @Get(':id')
  findOnePunishment(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.punishmentsService.findOnePunishment(this.getUserId(userId), id);
  }

  @Post()
  createPunishment(
    @Headers('x-user-id') userId: string,
    @Body() createPunishmentDto: CreatePunishmentDto,
  ) {
    return this.punishmentsService.createPunishment(
      this.getUserId(userId),
      createPunishmentDto,
    );
  }

  @Patch(':id')
  updatePunishment(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() updatePunishmentDto: UpdatePunishmentDto,
  ) {
    return this.punishmentsService.updatePunishment(
      this.getUserId(userId),
      id,
      updatePunishmentDto,
    );
  }

  @Patch(':id/complete')
  completePunishment(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.punishmentsService.completePunishment(this.getUserId(userId), id);
  }

  @Patch(':id/skip')
  skipPunishment(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.punishmentsService.skipPunishment(this.getUserId(userId), id);
  }

  @Delete(':id')
  removePunishment(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.punishmentsService.removePunishment(this.getUserId(userId), id);
  }

  // Trigger punishment from rule
  @Post('trigger/:ruleId')
  triggerPunishment(
    @Headers('x-user-id') userId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: { reason: string; streak?: number },
  ) {
    return this.punishmentsService.triggerPunishment(
      this.getUserId(userId),
      ruleId,
      body.reason,
      body.streak,
    );
  }
}
