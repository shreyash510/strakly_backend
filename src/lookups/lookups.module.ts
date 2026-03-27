import { Module } from '@nestjs/common';
import { LookupsService } from './lookups.service';

@Module({
  providers: [LookupsService],
  exports: [LookupsService],
})
export class LookupsModule {}
