import { Module } from '@nestjs/common';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';
import { UsersModule } from '../users/users.module';
import { ProductsModule } from '../products/products.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [UsersModule, ProductsModule, TenantModule],
  controllers: [MigrationController],
  providers: [MigrationService],
})
export class MigrationModule {}
