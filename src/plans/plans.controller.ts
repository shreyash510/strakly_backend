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
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PlansService } from './plans.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('plans')
@Controller('plans')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @ApiOperation({ summary: 'Get all active plans' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(@Request() req: any, @Query('includeInactive') includeInactive?: string) {
    return this.plansService.findAll(req.user.gymId, includeInactive === 'true');
  }

  @Get('featured')
  @ApiOperation({ summary: 'Get featured plans' })
  findFeatured(@Request() req: any) {
    return this.plansService.findFeatured(req.user.gymId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get plan by ID' })
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.plansService.findOne(parseInt(id), req.user.gymId);
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get plan by code' })
  findByCode(@Request() req: any, @Param('code') code: string) {
    return this.plansService.findByCode(code, req.user.gymId);
  }

  @Get(':id/price')
  @ApiOperation({ summary: 'Calculate price with optional offer code' })
  @ApiQuery({ name: 'offerCode', required: false })
  calculatePrice(
    @Request() req: any,
    @Param('id') id: string,
    @Query('offerCode') offerCode?: string,
  ) {
    return this.plansService.calculatePriceWithOffer(parseInt(id), req.user.gymId, offerCode);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Create a new plan' })
  create(@Request() req: any, @Body() dto: CreatePlanDto) {
    return this.plansService.create(dto, req.user.gymId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Update a plan' })
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(parseInt(id), req.user.gymId, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete a plan (soft delete)' })
  delete(@Request() req: any, @Param('id') id: string) {
    return this.plansService.delete(parseInt(id), req.user.gymId);
  }
}
