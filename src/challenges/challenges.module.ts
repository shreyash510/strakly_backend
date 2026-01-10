import { Module } from '@nestjs/common';
import { ChallengesService } from './challenges.service';
import { ChallengesController } from './challenges.controller';
import { FirebaseModule } from '../firebase/firebase.module';
import { FriendsModule } from '../friends/friends.module';

@Module({
  imports: [FirebaseModule, FriendsModule],
  controllers: [ChallengesController],
  providers: [ChallengesService],
  exports: [ChallengesService],
})
export class ChallengesModule {}
