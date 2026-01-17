import { Module } from '@nestjs/common';
import { GymsModule } from './gyms/gyms.module';
import { AdminUsersModule } from './users/users.module';
import { TrainersModule } from './trainers/trainers.module';
import { ProgramsModule } from './programs/programs.module';

@Module({
  imports: [
    GymsModule,
    AdminUsersModule,
    TrainersModule,
    ProgramsModule,
  ],
  exports: [
    GymsModule,
    AdminUsersModule,
    TrainersModule,
    ProgramsModule,
  ],
})
export class AdminModule {}
