import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TrainerAssignmentsController } from './trainer-assignments.controller';
import { TrainerAssignmentsService } from './trainer-assignments.service';
import { TrainerAssignment, TrainerAssignmentSchema } from '../database/schemas/trainer-assignment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TrainerAssignment.name, schema: TrainerAssignmentSchema },
    ]),
  ],
  controllers: [TrainerAssignmentsController],
  providers: [TrainerAssignmentsService],
  exports: [TrainerAssignmentsService],
})
export class TrainerAssignmentsModule {}
