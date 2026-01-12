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

// New RBAC & Gym modules
import { RolesModule } from './roles/roles.module';
import { GymsModule } from './gyms/gyms.module';
import { TrainerAssignmentsModule } from './trainer-assignments/trainer-assignments.module';
import { DietPlansModule } from './diet-plans/diet-plans.module';
import { ExercisePlansModule } from './exercise-plans/exercise-plans.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';

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

    // RBAC & Gym Management
    RolesModule,
    GymsModule,
    TrainerAssignmentsModule,

    // Plans
    DietPlansModule,
    ExercisePlansModule,

    // Gym Features
    AnnouncementsModule,
    SubscriptionsModule,

    // User Features
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
