import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FirebaseModule } from './firebase/firebase.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { GoalsModule } from './goals/goals.module';
import { HabitsModule } from './habits/habits.module';
import { TasksModule } from './tasks/tasks.module';
import { RewardsModule } from './rewards/rewards.module';
import { StreaksModule } from './streaks/streaks.module';
import { PunishmentsModule } from './punishments/punishments.module';
import { FriendsModule } from './friends/friends.module';
import { ChallengesModule } from './challenges/challenges.module';
import { PostsModule } from './posts/posts.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CounterModule } from './counter/counter.module';
import { GymsModule } from './gyms/gyms.module';
import { UsersModule } from './users/users.module';
import { TrainersModule } from './trainers/trainers.module';
import { SupportModule } from './support/support.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProgramsModule } from './programs/programs.module';
import { ReportsModule } from './reports/reports.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { AdminModule } from './admin/admin.module';
import firebaseConfig from './config/firebase.config';
import databaseConfig from './config/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [firebaseConfig, databaseConfig],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api*', '/docs*'],
    }),
    DatabaseModule.forRoot(),
    FirebaseModule,
    AuthModule,
    GoalsModule,
    HabitsModule,
    TasksModule,
    RewardsModule,
    StreaksModule,
    PunishmentsModule,
    FriendsModule,
    ChallengesModule,
    PostsModule,
    DashboardModule,
    CounterModule,
    GymsModule,
    UsersModule,
    TrainersModule,
    SupportModule,
    AnnouncementsModule,
    NotificationsModule,
    ProgramsModule,
    ReportsModule,
    SubscriptionsModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
