import { Module } from '@nestjs/common';
import { EquipmentController } from './equipment.controller';
import { EquipmentService } from './equipment.service';
import { TenantModule } from '../tenant/tenant.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [TenantModule, DatabaseModule],
  controllers: [EquipmentController],
  providers: [EquipmentService],
  exports: [EquipmentService],
})
export class EquipmentModule {}
