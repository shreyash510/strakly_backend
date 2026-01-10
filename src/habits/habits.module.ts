import { Module, forwardRef } from '@nestjs/common';
import { HabitsService } from './habits.service';
import { HabitsController } from './habits.controller';
import { StreaksModule } from '../streaks/streaks.module';

@Module({
  imports: [forwardRef(() => StreaksModule)],
  controllers: [HabitsController],
  providers: [HabitsService],
  exports: [HabitsService],
})
export class HabitsModule {}
