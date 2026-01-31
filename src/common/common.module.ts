import { Module, Global } from '@nestjs/common';
import { CrossSchemaValidatorService } from './validators/cross-schema-validator.service';
import { DatabaseModule } from '../database/database.module';
import { TenantModule } from '../tenant/tenant.module';

@Global()
@Module({
  imports: [DatabaseModule, TenantModule],
  providers: [CrossSchemaValidatorService],
  exports: [CrossSchemaValidatorService],
})
export class CommonModule {}
