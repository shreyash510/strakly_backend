import { Module, forwardRef } from '@nestjs/common';
import { GymController } from './gym.controller';
import { GymService } from './gym.service';
import { DatabaseModule } from '../database/database.module';
import { BranchModule } from '../branch/branch.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => BranchModule)],
  controllers: [GymController],
  providers: [GymService],
  exports: [GymService],
})
export class GymModule {}
