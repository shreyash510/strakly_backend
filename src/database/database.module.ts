import { Module, DynamicModule, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import databaseConfig from '../config/database.config';
import { MongoDBService } from './mongodb.service';
import { DatabaseService } from './database.service';
import { FirebaseModule } from '../firebase/firebase.module';
import {
  BaseMongoService,
  UserMongoService,
  FriendMongoService,
  ChallengeMongoService,
  PostMongoService,
  StreakMongoService,
} from './services';

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        ConfigModule.forFeature(databaseConfig),
        FirebaseModule,
        MongooseModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => {
            const dbType = configService.get<string>('database.type');

            if (dbType === 'mongodb') {
              const uri = configService.get<string>('database.mongodb.uri');
              console.log('Connecting to MongoDB Atlas...');
              return {
                uri,
              };
            }

            // Return dummy config for Firebase (MongoDB won't be connected)
            console.log('Using Firebase - MongoDB disabled');
            return {
              uri: undefined,
            };
          },
        }),
      ],
      providers: [
        MongoDBService,
        DatabaseService,
        BaseMongoService,
        UserMongoService,
        FriendMongoService,
        ChallengeMongoService,
        PostMongoService,
        StreakMongoService,
      ],
      exports: [
        MongooseModule,
        MongoDBService,
        DatabaseService,
        BaseMongoService,
        UserMongoService,
        FriendMongoService,
        ChallengeMongoService,
        PostMongoService,
        StreakMongoService,
      ],
    };
  }
}
