import {
  Controller,
  Get,
  Body,
  Param,
  Query,
  Patch,
  UseGuards,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import {
  UpdatePaymentDto,
  PaymentFiltersDto,
} from './dto/payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { AuthenticatedRequest } from '../common/types';
import { resolveEffectiveBranchId } from '../common';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin', 'admin', 'manager')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  @Get()
  async findAll(
    @Req() req: AuthenticatedRequest,
    @GymId() gymId: number,
    @Query() filters: PaymentFiltersDto,
  ) {
    filters.branchId = resolveEffectiveBranchId(req.user, filters.branchId ? String(filters.branchId) : undefined) ?? undefined;
    return this.paymentsService.findAll(gymId, filters);
  }

  @Get('stats')
  async getStats(
    @Req() req: AuthenticatedRequest,
    @GymId() gymId: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.paymentsService.getStats(
      gymId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      resolveEffectiveBranchId(req.user, branchId),
    );
  }

  @Get(':id')
  async findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.paymentsService.findOne(id, gymId, resolveEffectiveBranchId(req.user, undefined));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentDto,
    @GymId() gymId: number,
  ) {
    const result = await this.paymentsService.update(id, gymId, dto);
    this.notificationsGateway.emitPaymentChanged(gymId, { action: 'updated' });
    return result;
  }
}
