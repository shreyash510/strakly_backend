import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LookupsService } from './lookups.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@ApiTags('lookups')
@Controller('lookups')
export class LookupsController {
  constructor(
    private readonly lookupsService: LookupsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}
}
