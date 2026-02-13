import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { TenantModule } from '../tenant/tenant.module';
import { PaymentsModule } from '../payments/payments.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [TenantModule, PaymentsModule, DatabaseModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
