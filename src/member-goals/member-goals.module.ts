import { Module } from '@nestjs/common';
import { MemberGoalsService } from './member-goals.service';
import { MemberGoalsController } from './member-goals.controller';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [MemberGoalsController],
  providers: [MemberGoalsService],
  exports: [MemberGoalsService],
})
export class MemberGoalsModule {}
