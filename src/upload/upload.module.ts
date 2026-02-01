import { Module, forwardRef } from '@nestjs/common';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [forwardRef(() => UsersModule)],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
