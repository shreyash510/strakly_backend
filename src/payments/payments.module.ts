import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { DatabaseModule } from '../database/database.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [DatabaseModule, TenantModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
