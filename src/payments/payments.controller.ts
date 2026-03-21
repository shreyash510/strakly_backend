import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Patch,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import {
  CreatePaymentDto,
  UpdatePaymentDto,
  PaymentFiltersDto,
} from './dto/payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

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
    @GymId() gymId: number,
    @Query() filters: PaymentFiltersDto,
  ) {
    return this.paymentsService.findAll(gymId, filters);
  }

  @Get('stats')
  async getStats(
    @GymId() gymId: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentsService.getStats(
      gymId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.paymentsService.findOne(id, gymId);
  }

  @Get('reference/:table/:id')
  async findByReference(
    @Param('table') table: string,
    @Param('id', ParseIntPipe) referenceId: number,
    @GymId() gymId: number,
  ) {
    return this.paymentsService.findByReference(table, referenceId, gymId);
  }

  @Post()
  async create(
    @Body() dto: CreatePaymentDto,
    @GymId() gymId: number,
    @UserId() userId: number,
  ) {
    const result = await this.paymentsService.create(dto, gymId, userId);
    this.notificationsGateway.emitPaymentChanged(gymId, { action: 'created' });
    return result;
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
