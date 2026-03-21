import { Module } from '@nestjs/common';
import { GymController } from './gym.controller';
import { GymService } from './gym.service';
import { DatabaseModule } from '../database/database.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [DatabaseModule, UploadModule],
  controllers: [GymController],
  providers: [GymService],
  exports: [GymService],
})
export class GymModule {}
