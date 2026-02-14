import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { TenantModule } from './tenant/tenant.module';
import { CommonModule } from './common/common.module';
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
import { BranchModule } from './branch/branch.module';
import { SupportModule } from './support/support.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PublicModule } from './public/public.module';
import { ContactRequestsModule } from './contact-requests/contact-requests.module';
import { SaasSubscriptionsModule } from './saas-subscriptions/saas-subscriptions.module';
import { SalaryModule } from './salary/salary.module';
import { EmailModule } from './email/email.module';
import { ReportsModule } from './reports/reports.module';
import { DietsModule } from './diets/diets.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { AmenitiesModule } from './amenities/amenities.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { ActivityLogsModule } from './activity-logs/activity-logs.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { MemberNotesModule } from './member-notes/member-notes.module';
import { MemberGoalsModule } from './member-goals/member-goals.module';
import { UploadModule } from './upload/upload.module';
import { MigrationModule } from './migration/migration.module';
import { RabbitMqModule } from './rabbitmq/rabbitmq.module';
import { ConversationsModule } from './conversations/conversations.module';
import { ProgressPhotosModule } from './progress-photos/progress-photos.module';
import { LeadsModule } from './leads/leads.module';
import { ReferralsModule } from './referrals/referrals.module';
import { DocumentsModule } from './documents/documents.module';
import { ClassesModule } from './classes/classes.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { GuestVisitsModule } from './guest-visits/guest-visits.module';
import { EquipmentModule } from './equipment/equipment.module';
import { ProductsModule } from './products/products.module';
import { CampaignsModule } from './campaigns/campaigns.module';
// Phase 5: Advanced / Differentiators
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { SurveysModule } from './surveys/surveys.module';
import { EngagementModule } from './engagement/engagement.module';
import { GamificationModule } from './gamification/gamification.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { WearablesModule } from './wearables/wearables.module';
import { CurrenciesModule } from './currencies/currencies.module';

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
    RabbitMqModule,
    CommonModule,
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
    BranchModule,
    SupportModule,
    DashboardModule,
    PublicModule,
    ContactRequestsModule,
    SaasSubscriptionsModule,
    SalaryModule,
    EmailModule,
    ReportsModule,
    DietsModule,
    FacilitiesModule,
    AmenitiesModule,
    NotificationsModule,
    PaymentsModule,
    ActivityLogsModule,
    AnnouncementsModule,
    MemberNotesModule,
    MemberGoalsModule,
    UploadModule,
    MigrationModule,
    ConversationsModule,
    ProgressPhotosModule,
    LeadsModule,
    ReferralsModule,
    DocumentsModule,
    ClassesModule,
    AppointmentsModule,
    GuestVisitsModule,
    EquipmentModule,
    ProductsModule,
    CampaignsModule,
    // Phase 5: Advanced / Differentiators
    CustomFieldsModule,
    SurveysModule,
    EngagementModule,
    GamificationModule,
    LoyaltyModule,
    WearablesModule,
    CurrenciesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
