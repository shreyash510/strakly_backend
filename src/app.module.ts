import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { TenantModule } from './tenant/tenant.module';
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
import { SupportModule } from './support/support.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PublicModule } from './public/public.module';
import { ContactRequestsModule } from './contact-requests/contact-requests.module';
import { SaasSubscriptionsModule } from './saas-subscriptions/saas-subscriptions.module';
import { SalaryModule } from './salary/salary.module';
import { EmailModule } from './email/email.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api/{*path}', '/docs/{*path}'],
    }),
    DatabaseModule,
    TenantModule,
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
    SupportModule,
    DashboardModule,
    PublicModule,
    ContactRequestsModule,
    SaasSubscriptionsModule,
    SalaryModule,
    EmailModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
