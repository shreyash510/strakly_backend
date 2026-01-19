import { Module } from '@nestjs/common';
import { BodyMetricsController } from './body-metrics.controller';
import { BodyMetricsService } from './body-metrics.service';

@Module({
  controllers: [BodyMetricsController],
  providers: [BodyMetricsService],
  exports: [BodyMetricsService],
})
export class BodyMetricsModule {}
