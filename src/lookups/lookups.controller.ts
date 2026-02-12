import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LookupsService } from './lookups.service';
import {
  CreateLookupTypeDto,
  UpdateLookupTypeDto,
} from './dto/create-lookup-type.dto';
import { CreateLookupDto, UpdateLookupDto } from './dto/create-lookup.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@ApiTags('lookups')
@Controller('lookups')
export class LookupsController {
  constructor(
    private readonly lookupsService: LookupsService,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  // ============ LOOKUP TYPES ============

  @Get('types')
  @ApiOperation({ summary: 'Get all lookup types with their values' })
  findAllTypes() {
    return this.lookupsService.findAllLookupTypes();
  }

  @Get('types/:code')
  @ApiOperation({ summary: 'Get lookup type by code with its values' })
  findTypeByCode(@Param('code') code: string) {
    return this.lookupsService.findLookupTypeByCode(code);
  }

  @Post('types')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new lookup type' })
  async createType(@Body() dto: CreateLookupTypeDto) {
    const result = await this.lookupsService.createLookupType(dto);
    this.notificationsGateway.emitLookupChanged({ action: 'type_created' });
    return result;
  }

  @Patch('types/:code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a lookup type' })
  async updateType(@Param('code') code: string, @Body() dto: UpdateLookupTypeDto) {
    const result = await this.lookupsService.updateLookupType(code, dto);
    this.notificationsGateway.emitLookupChanged({ action: 'type_updated' });
    return result;
  }

  @Delete('types/:code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a lookup type (soft delete)' })
  async deleteType(@Param('code') code: string) {
    const result = await this.lookupsService.deleteLookupType(code);
    this.notificationsGateway.emitLookupChanged({ action: 'type_deleted' });
    return result;
  }

  // ============ LOOKUPS (static routes BEFORE wildcard) ============

  @Get('value/:id')
  @ApiOperation({ summary: 'Get a single lookup value by ID' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.lookupsService.findLookupById(id);
  }

  @Patch('value/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a lookup value' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLookupDto) {
    const result = await this.lookupsService.updateLookup(id, dto);
    this.notificationsGateway.emitLookupChanged({ action: 'value_updated' });
    return result;
  }

  @Delete('value/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a lookup value (soft delete)' })
  async delete(@Param('id', ParseIntPipe) id: number) {
    const result = await this.lookupsService.deleteLookup(id);
    this.notificationsGateway.emitLookupChanged({ action: 'value_deleted' });
    return result;
  }

  // ============ WILDCARD routes (MUST be last) ============

  @Get(':typeCode')
  @ApiOperation({ summary: 'Get all lookup values for a type' })
  findByType(@Param('typeCode') typeCode: string) {
    return this.lookupsService.findLookupsByType(typeCode);
  }

  @Post(':typeCode')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new lookup value for a type' })
  async create(@Param('typeCode') typeCode: string, @Body() dto: CreateLookupDto) {
    const result = await this.lookupsService.createLookup(typeCode, dto);
    this.notificationsGateway.emitLookupChanged({ action: 'value_created' });
    return result;
  }

  @Post(':typeCode/bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create multiple lookup values for a type' })
  async createBulk(
    @Param('typeCode') typeCode: string,
    @Body() dtos: CreateLookupDto[],
  ) {
    const result = await this.lookupsService.createBulkLookups(typeCode, dtos);
    this.notificationsGateway.emitLookupChanged({ action: 'bulk_created' });
    return result;
  }
}
