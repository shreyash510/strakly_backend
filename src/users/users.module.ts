import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { LookupsModule } from '../lookups/lookups.module';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';

@Module({
  imports: [LookupsModule, ActivityLogsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
