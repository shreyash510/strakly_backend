import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { OffersService } from './offers.service';
import { CreateOfferDto, UpdateOfferDto } from './dto/offer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ManagerPermissionsGuard } from '../auth/guards/manager-permissions.guard';
import { ManagerPermission } from '../auth/decorators/manager-permission.decorator';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import type { AuthenticatedRequest } from '../common/types';

@ApiTags('offers')
@Controller('offers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OffersController {
  constructor(
    private readonly offersService: OffersService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all offers' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(
    @Request() req: AuthenticatedRequest,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.offersService.findAll(
      req.user.gymId!,
      includeInactive === 'true',
    );
  }

  @Get('active')
  @ApiOperation({ summary: 'Get currently active offers' })
  findActive(@Request() req: AuthenticatedRequest) {
    return this.offersService.findActive(req.user.gymId!);
  }

  @Post()
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('offers', 'create')
  @ApiOperation({ summary: 'Create a new offer' })
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateOfferDto,
  ) {
    const result = await this.offersService.create(dto, req.user.gymId!);
    this.notificationsGateway.emitOfferChanged(req.user.gymId!, { action: 'created' });
    return result;
  }

  @Patch(':id')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('offers', 'update')
  @ApiOperation({ summary: 'Update an offer' })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOfferDto,
  ) {
    const result = await this.offersService.update(id, req.user.gymId!, dto);
    this.notificationsGateway.emitOfferChanged(req.user.gymId!, { action: 'updated' });
    return result;
  }

  @Delete(':id')
  @UseGuards(RolesGuard, ManagerPermissionsGuard)
  @Roles('superadmin', 'admin', 'manager')
  @ManagerPermission('offers', 'delete')
  @ApiOperation({ summary: 'Delete an offer (soft delete)' })
  async delete(@Request() req: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    const result = await this.offersService.delete(id, req.user.gymId!);
    this.notificationsGateway.emitOfferChanged(req.user.gymId!, { action: 'deleted' });
    return result;
  }
}
