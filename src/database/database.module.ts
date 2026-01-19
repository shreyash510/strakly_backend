import { Module, DynamicModule, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import databaseConfig from '../config/database.config';
import { MongoDBService } from './mongodb.service';
import { DatabaseService } from './database.service';
import { BaseMongoService, UserMongoService } from './services';

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        ConfigModule.forFeature(databaseConfig),
        MongooseModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => {
            const uri = configService.get<string>('database.mongodb.uri');
            console.log('Connecting to MongoDB Atlas...');
            return { uri };
          },
        }),
      ],
      providers: [
        MongoDBService,
        DatabaseService,
        BaseMongoService,
        UserMongoService,
      ],
      exports: [
        MongooseModule,
        MongoDBService,
        DatabaseService,
        BaseMongoService,
        UserMongoService,
      ],
    };
  }
}
