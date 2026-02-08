import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PdfGeneratorService } from './pdf-generator.service';
import { PdfTemplateService } from './pdf-template.service';
import { DatabaseModule } from '../database/database.module';
import { TenantModule } from '../tenant/tenant.module';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [DatabaseModule, TenantModule, AttendanceModule],
  controllers: [ReportsController],
  providers: [ReportsService, PdfGeneratorService, PdfTemplateService],
  exports: [ReportsService],
})
export class ReportsModule {}
