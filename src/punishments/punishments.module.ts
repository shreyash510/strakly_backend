import { Module } from '@nestjs/common';
import { PunishmentsService } from './punishments.service';
import { PunishmentsController } from './punishments.controller';

@Module({
  controllers: [PunishmentsController],
  providers: [PunishmentsService],
  exports: [PunishmentsService],
})
export class PunishmentsModule {}
