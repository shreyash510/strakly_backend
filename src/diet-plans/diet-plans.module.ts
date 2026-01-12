import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DietPlansController } from './diet-plans.controller';
import { DietPlansService } from './diet-plans.service';
import { DietPlan, DietPlanSchema } from '../database/schemas/diet-plan.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DietPlan.name, schema: DietPlanSchema },
    ]),
  ],
  controllers: [DietPlansController],
  providers: [DietPlansService],
  exports: [DietPlansService],
})
export class DietPlansModule {}
