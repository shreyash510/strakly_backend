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
import { RulesService } from './rules.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  @Get()
  findAll(@Headers('x-user-id') userId: string) {
    return this.rulesService.findAll(this.getUserId(userId));
  }

  @Get(':id')
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.rulesService.findOne(this.getUserId(userId), id);
  }

  @Post()
  create(
    @Headers('x-user-id') userId: string,
    @Body() createRuleDto: CreateRuleDto,
  ) {
    return this.rulesService.create(this.getUserId(userId), createRuleDto);
  }

  @Patch(':id')
  update(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() updateRuleDto: UpdateRuleDto,
  ) {
    return this.rulesService.update(this.getUserId(userId), id, updateRuleDto);
  }

  @Patch(':id/toggle-active')
  toggleActive(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.rulesService.toggleActive(this.getUserId(userId), id);
  }

  @Delete(':id')
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.rulesService.remove(this.getUserId(userId), id);
  }
}
