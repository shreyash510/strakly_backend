import { Module } from '@nestjs/common';
import { AdminUsersService } from './users.service';
import { AdminUsersController } from './users.controller';

@Module({
  controllers: [AdminUsersController],
  providers: [AdminUsersService],
  exports: [AdminUsersService],
})
export class AdminUsersModule {}
