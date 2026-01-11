import { Global, Module } from '@nestjs/common';
import { FirebaseService } from './firebase.service';
import {
  UserFirebaseService,
  FriendFirebaseService,
  ChallengeFirebaseService,
  PostFirebaseService,
  StreakFirebaseService,
} from './services';

@Global()
@Module({
  providers: [
    FirebaseService,
    UserFirebaseService,
    FriendFirebaseService,
    ChallengeFirebaseService,
    PostFirebaseService,
    StreakFirebaseService,
  ],
  exports: [
    FirebaseService,
    UserFirebaseService,
    FriendFirebaseService,
    ChallengeFirebaseService,
    PostFirebaseService,
    StreakFirebaseService,
  ],
})
export class FirebaseModule {}
