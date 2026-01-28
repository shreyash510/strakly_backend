import { Module } from '@nestjs/common';
import { BranchController, BranchMigrationController } from './branch.controller';
import { BranchService } from './branch.service';
import { DatabaseModule } from '../database/database.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [DatabaseModule, TenantModule],
  controllers: [BranchController, BranchMigrationController],
  providers: [BranchService],
  exports: [BranchService],
})
export class BranchModule {}
