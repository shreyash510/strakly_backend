import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @ApiOperation({ summary: 'Get all active plans' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.plansService.findAll(includeInactive === 'true');
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured plans' })
  findFeatured() {
    return this.plansService.findFeatured();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get plan by ID' })
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get plan by code' })
  findByCode(@Param('code') code: string) {
    return this.plansService.findByCode(code);
  }

  @Get(':id/offers')
  @ApiOperation({ summary: 'Get active offers for a plan' })
  getActiveOffers(@Param('id') id: string) {
    return this.plansService.getActiveOffers(id);
  }

  @Get(':id/price')
  @ApiOperation({ summary: 'Calculate price with optional offer code' })
  @ApiQuery({ name: 'offerCode', required: false })
  calculatePrice(
    @Param('id') id: string,
    @Query('offerCode') offerCode?: string,
  ) {
    return this.plansService.calculatePriceWithOffer(id, offerCode);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new plan' })
  create(@Body() dto: CreatePlanDto) {
    return this.plansService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a plan' })
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a plan (soft delete)' })
  delete(@Param('id') id: string) {
    return this.plansService.delete(id);
  }
}
