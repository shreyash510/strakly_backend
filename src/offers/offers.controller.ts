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
import { OffersService } from './offers.service';
import { CreateOfferDto, UpdateOfferDto, AssignOfferToPlansDto } from './dto/offer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('offers')
@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all offers' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.offersService.findAll(includeInactive === 'true');
  }

  @Get('active')
  @ApiOperation({ summary: 'Get currently active offers' })
  findActive() {
    return this.offersService.findActive();
  }

  @Get('validate/:code')
  @ApiOperation({ summary: 'Validate an offer code' })
  @ApiQuery({ name: 'planId', required: false })
  validateCode(
    @Param('code') code: string,
    @Query('planId') planId?: string,
  ) {
    return this.offersService.validateOfferCode(code, planId ? parseInt(planId) : undefined);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get offer by ID' })
  findOne(@Param('id') id: string) {
    return this.offersService.findOne(parseInt(id));
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get offer by code' })
  findByCode(@Param('code') code: string) {
    return this.offersService.findByCode(code);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new offer' })
  create(@Body() dto: CreateOfferDto) {
    return this.offersService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an offer' })
  update(@Param('id') id: string, @Body() dto: UpdateOfferDto) {
    return this.offersService.update(parseInt(id), dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an offer (soft delete)' })
  delete(@Param('id') id: string) {
    return this.offersService.delete(parseInt(id));
  }

  // Plan associations
  @Post(':id/plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign offer to multiple plans' })
  assignToPlans(@Param('id') id: string, @Body() dto: AssignOfferToPlansDto) {
    return this.offersService.assignToPlans(parseInt(id), dto);
  }

  @Post(':id/plans/:planId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add offer to a plan' })
  addToPlan(@Param('id') id: string, @Param('planId') planId: string) {
    return this.offersService.addToPlan(parseInt(id), parseInt(planId));
  }

  @Delete(':id/plans/:planId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove offer from a plan' })
  removeFromPlan(@Param('id') id: string, @Param('planId') planId: string) {
    return this.offersService.removeFromPlan(parseInt(id), parseInt(planId));
  }
}
