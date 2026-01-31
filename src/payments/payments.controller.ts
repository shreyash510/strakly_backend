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
import { GymId } from '../common/decorators/gym-id.decorator';
import { BranchId } from '../common/decorators/branch-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  async findAll(
    @GymId() gymId: number,
    @BranchId() branchId: number | null,
    @Query() filters: PaymentFiltersDto,
  ) {
    return this.paymentsService.findAll(gymId, branchId, filters);
  }

  @Get('stats')
  async getStats(
    @GymId() gymId: number,
    @BranchId() branchId: number | null,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.paymentsService.getStats(
      gymId,
      branchId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @BranchId() branchId: number | null,
  ) {
    return this.paymentsService.findOne(id, gymId, branchId);
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
    return this.paymentsService.create(dto, gymId, userId);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentDto,
    @GymId() gymId: number,
  ) {
    return this.paymentsService.update(id, gymId, dto);
  }
}
