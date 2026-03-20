import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePaymentConfigDto } from './dto/platform-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('platform-settings')
@Controller('platform-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class PlatformSettingsController {
  constructor(private readonly service: PlatformSettingsService) {}

  @Get('payment-config')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Get payment configuration (bank/UPI/PayPal/Wise details)' })
  getPaymentConfig() {
    return this.service.getPaymentConfig();
  }

  @Put('payment-config')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Update payment configuration (superadmin only)' })
  updatePaymentConfig(@Body() dto: UpdatePaymentConfigDto) {
    return this.service.updatePaymentConfig(dto);
  }
}
