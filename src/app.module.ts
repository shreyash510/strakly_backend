import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LookupsModule } from './lookups/lookups.module';
import { AttendanceModule } from './attendance/attendance.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PlansModule } from './plans/plans.module';
import { OffersModule } from './offers/offers.module';
import { MembershipsModule } from './memberships/memberships.module';
import { BodyMetricsModule } from './body-metrics/body-metrics.module';
import { GymModule } from './gym/gym.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api/{*path}', '/docs/{*path}'],
    }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    LookupsModule,
    AttendanceModule,
    PermissionsModule,
    PlansModule,
    OffersModule,
    MembershipsModule,
    BodyMetricsModule,
    GymModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
