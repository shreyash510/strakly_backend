import { Module } from '@nestjs/common';
import { ProgressPhotosService } from './progress-photos.service';
import { ProgressPhotosController } from './progress-photos.controller';
import { TenantModule } from '../tenant/tenant.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [TenantModule, UploadModule],
  controllers: [ProgressPhotosController],
  providers: [ProgressPhotosService],
  exports: [ProgressPhotosService],
})
export class ProgressPhotosModule {}
