import { IsString, IsMongoId } from 'class-validator';

export class CreateTrainerAssignmentDto {
  @IsMongoId()
  trainerId: string;

  @IsMongoId()
  userId: string;

  @IsMongoId()
  gymId: string;
}
