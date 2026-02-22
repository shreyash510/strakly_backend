import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { CurrenciesService } from './currencies.service';
import {
  CreateCurrencyDto,
  UpdateCurrencyDto,
  CreateExchangeRateDto,
  ConvertDto,
} from './dto/currencies.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { PLAN_FEATURES } from '../common/constants/features';

@ApiTags('currencies')
@Controller('currencies')
@UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.MULTI_CURRENCY)
@ApiBearerAuth()
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  // ─── Currencies ───

  @Get()
  @ApiOperation({ summary: 'List all active currencies' })
  findAll(@GymId() gymId: number) {
    return this.currenciesService.findAll(gymId);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a currency' })
  create(@GymId() gymId: number, @Body() dto: CreateCurrencyDto) {
    return this.currenciesService.create(gymId, dto);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update currency (toggle active status)' })
  @ApiParam({ name: 'id', type: Number })
  update(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @Body() dto: UpdateCurrencyDto,
  ) {
    return this.currenciesService.update(id, gymId, dto);
  }

  // ─── Exchange Rates ───

  @Get('exchange-rates')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'List current exchange rates (latest per pair)' })
  getExchangeRates(@GymId() gymId: number) {
    return this.currenciesService.getExchangeRates(gymId);
  }

  @Post('exchange-rates')
  @Roles('admin')
  @ApiOperation({ summary: 'Create or update an exchange rate' })
  createExchangeRate(
    @GymId() gymId: number,
    @Body() dto: CreateExchangeRateDto,
  ) {
    return this.currenciesService.createExchangeRate(gymId, dto);
  }

  // ─── Convert ───

  @Get('convert')
  @ApiOperation({ summary: 'Convert an amount between currencies' })
  convert(@GymId() gymId: number, @Query() dto: ConvertDto) {
    return this.currenciesService.convert(gymId, dto.from, dto.to, dto.amount);
  }
}
