import { Global, Module } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import {
  UserFirebaseService,
  FriendFirebaseService,
  ChallengeFirebaseService,
  StreakFirebaseService,
} from './services';

@Global()
@Module({
  providers: [
    FirebaseService,
    UserFirebaseService,
    FriendFirebaseService,
    ChallengeFirebaseService,
    StreakFirebaseService,
  ],
  exports: [
    FirebaseService,
    UserFirebaseService,
    FriendFirebaseService,
    ChallengeFirebaseService,
    StreakFirebaseService,
  ],
})
export class FirebaseModule {}
