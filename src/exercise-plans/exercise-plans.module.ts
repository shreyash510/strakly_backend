import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExercisePlansController } from './exercise-plans.controller';
import { ExercisePlansService } from './exercise-plans.service';
import { ExercisePlan, ExercisePlanSchema } from '../database/schemas/exercise-plan.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExercisePlan.name, schema: ExercisePlanSchema },
    ]),
  ],
  controllers: [ExercisePlansController],
  providers: [ExercisePlansService],
  exports: [ExercisePlansService],
})
export class ExercisePlansModule {}
