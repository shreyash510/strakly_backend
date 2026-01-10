import { Module } from '@nestjs/common';
import { PostsService } from './posts.service';
import { PostsController } from './posts.controller';
import { FirebaseModule } from '../firebase/firebase.module';
import { FriendsModule } from '../friends/friends.module';

@Module({
  imports: [FirebaseModule, FriendsModule],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
