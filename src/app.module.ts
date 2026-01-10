import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { FirebaseModule } from './firebase/firebase.module';
import { AuthModule } from './auth/auth.module';
import { GoalsModule } from './goals/goals.module';
import { HabitsModule } from './habits/habits.module';
import { TasksModule } from './tasks/tasks.module';
import { MistakesModule } from './mistakes/mistakes.module';
import { RulesModule } from './rules/rules.module';
import { RewardsModule } from './rewards/rewards.module';
import { StreaksModule } from './streaks/streaks.module';
import { PunishmentsModule } from './punishments/punishments.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import firebaseConfig from './config/firebase.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [firebaseConfig],
    }),
    ScheduleModule.forRoot(),
    FirebaseModule,
    AuthModule,
    GoalsModule,
    HabitsModule,
    TasksModule,
    MistakesModule,
    RulesModule,
    RewardsModule,
    StreaksModule,
    PunishmentsModule,
    SchedulerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
