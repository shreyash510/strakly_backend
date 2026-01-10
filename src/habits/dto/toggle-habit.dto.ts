import { IsString, IsNotEmpty } from 'class-validator';

export class ToggleHabitCompletionDto {
  @IsString()
  @IsNotEmpty()
  date: string;
}
