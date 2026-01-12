import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GymsController } from './gyms.controller';
import { GymsService } from './gyms.service';
import { Gym, GymSchema } from '../database/schemas/gym.schema';
import { UserGym, UserGymSchema } from '../database/schemas/user-gym.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Gym.name, schema: GymSchema },
      { name: UserGym.name, schema: UserGymSchema },
    ]),
  ],
  controllers: [GymsController],
  providers: [GymsService],
  exports: [GymsService],
})
export class GymsModule {}
