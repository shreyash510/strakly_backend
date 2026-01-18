import { Module } from '@nestjs/common';
import { DietsService } from './diets.service';
import { DietsController } from './diets.controller';

@Module({
  controllers: [DietsController],
  providers: [DietsService],
  exports: [DietsService],
})
export class DietsModule {}
