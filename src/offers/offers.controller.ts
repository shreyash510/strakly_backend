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
import { OffersService } from './offers.service';
import { CreateOfferDto, UpdateOfferDto } from './dto/offer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('offers')
@Controller('offers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all offers' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(@Request() req: any, @Query('includeInactive') includeInactive?: string) {
    return this.offersService.findAll(req.user.gymId, includeInactive === 'true');
  }

  @Get('active')
  @ApiOperation({ summary: 'Get currently active offers' })
  findActive(@Request() req: any) {
    return this.offersService.findActive(req.user.gymId);
  }

  @Get('validate/:code')
  @ApiOperation({ summary: 'Validate an offer code' })
  validateCode(@Request() req: any, @Param('code') code: string) {
    return this.offersService.validateOfferCode(code, req.user.gymId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get offer by ID' })
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.offersService.findOne(parseInt(id), req.user.gymId);
  }

  @Get('code/:code')
  @ApiOperation({ summary: 'Get offer by code' })
  findByCode(@Request() req: any, @Param('code') code: string) {
    return this.offersService.findByCode(code, req.user.gymId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Create a new offer' })
  create(@Request() req: any, @Body() dto: CreateOfferDto) {
    return this.offersService.create(dto, req.user.gymId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Update an offer' })
  update(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateOfferDto) {
    return this.offersService.update(parseInt(id), req.user.gymId, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete an offer (soft delete)' })
  delete(@Request() req: any, @Param('id') id: string) {
    return this.offersService.delete(parseInt(id), req.user.gymId);
  }
}
