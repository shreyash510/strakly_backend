import { Module } from '@nestjs/common';
import { SalaryService } from './salary.service';
import { SalaryController } from './salary.controller';
import { DatabaseModule } from '../database/database.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [DatabaseModule, PaymentsModule],
  controllers: [SalaryController],
  providers: [SalaryService],
  exports: [SalaryService],
})
export class SalaryModule {}
