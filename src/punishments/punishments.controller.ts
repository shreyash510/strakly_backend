import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { PunishmentsService } from './punishments.service';
import { CreatePunishmentRuleDto } from './dto/create-punishment-rule.dto';
import { UpdatePunishmentRuleDto } from './dto/update-punishment-rule.dto';
import { CreatePunishmentDto } from './dto/create-punishment.dto';
import { UpdatePunishmentDto } from './dto/update-punishment.dto';
import { JwtAuthGuard } from '../auth/guards';
import { CurrentUser } from '../auth/decorators';

@Controller('punishments')
@UseGuards(JwtAuthGuard)
export class PunishmentsController {
  constructor(private readonly punishmentsService: PunishmentsService) {}

  // Punishment Rules Endpoints
  @Get('rules')
  findAllRules(@CurrentUser() user: any) {
    return this.punishmentsService.findAllRules(user.userId);
  }

  @Get('rules/:id')
  findOneRule(@CurrentUser() user: any, @Param('id') id: string) {
    return this.punishmentsService.findOneRule(user.userId, id);
  }

  @Post('rules')
  createRule(
    @CurrentUser() user: any,
    @Body() createRuleDto: CreatePunishmentRuleDto,
  ) {
    return this.punishmentsService.createRule(user.userId, createRuleDto);
  }

  @Patch('rules/:id')
  updateRule(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateRuleDto: UpdatePunishmentRuleDto,
  ) {
    return this.punishmentsService.updateRule(user.userId, id, updateRuleDto);
  }

  @Patch('rules/:id/toggle')
  toggleRuleActive(@CurrentUser() user: any, @Param('id') id: string) {
    return this.punishmentsService.toggleRuleActive(user.userId, id);
  }

  @Delete('rules/:id')
  removeRule(@CurrentUser() user: any, @Param('id') id: string) {
    return this.punishmentsService.removeRule(user.userId, id);
  }

  // Punishments Endpoints
  @Get()
  findAllPunishments(@CurrentUser() user: any) {
    return this.punishmentsService.findAllPunishments(user.userId);
  }

  @Get(':id')
  findOnePunishment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.punishmentsService.findOnePunishment(user.userId, id);
  }

  @Post()
  createPunishment(
    @CurrentUser() user: any,
    @Body() createPunishmentDto: CreatePunishmentDto,
  ) {
    return this.punishmentsService.createPunishment(user.userId, createPunishmentDto);
  }

  @Patch(':id')
  updatePunishment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updatePunishmentDto: UpdatePunishmentDto,
  ) {
    return this.punishmentsService.updatePunishment(user.userId, id, updatePunishmentDto);
  }

  @Patch(':id/complete')
  completePunishment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.punishmentsService.completePunishment(user.userId, id);
  }

  @Patch(':id/skip')
  skipPunishment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.punishmentsService.skipPunishment(user.userId, id);
  }

  @Delete(':id')
  removePunishment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.punishmentsService.removePunishment(user.userId, id);
  }

  // Trigger punishment from rule
  @Post('trigger/:ruleId')
  triggerPunishment(
    @CurrentUser() user: any,
    @Param('ruleId') ruleId: string,
    @Body() body: { reason: string; streak?: number },
  ) {
    return this.punishmentsService.triggerPunishment(
      user.userId,
      ruleId,
      body.reason,
      body.streak,
    );
  }
}
