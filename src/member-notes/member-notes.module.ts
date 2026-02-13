import { Module } from '@nestjs/common';
import { MemberNotesService } from './member-notes.service';
import { MemberNotesController } from './member-notes.controller';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [MemberNotesController],
  providers: [MemberNotesService],
  exports: [MemberNotesService],
})
export class MemberNotesModule {}
