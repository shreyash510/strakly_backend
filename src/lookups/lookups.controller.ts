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
import { CreateLookupTypeDto, UpdateLookupTypeDto } from './dto/create-lookup-type.dto';
import { CreateLookupDto, UpdateLookupDto } from './dto/create-lookup.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('lookups')
@Controller('lookups')
export class LookupsController {
  constructor(private readonly lookupsService: LookupsService) {}

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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new lookup type' })
  createType(@Body() dto: CreateLookupTypeDto) {
    return this.lookupsService.createLookupType(dto);
  }

  @Patch('types/:code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a lookup type' })
  updateType(@Param('code') code: string, @Body() dto: UpdateLookupTypeDto) {
    return this.lookupsService.updateLookupType(code, dto);
  }

  @Delete('types/:code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a lookup type (soft delete)' })
  deleteType(@Param('code') code: string) {
    return this.lookupsService.deleteLookupType(code);
  }

  // ============ LOOKUPS ============

  @Get(':typeCode')
  @ApiOperation({ summary: 'Get all lookup values for a type' })
  findByType(@Param('typeCode') typeCode: string) {
    return this.lookupsService.findLookupsByType(typeCode);
  }

  @Get('value/:id')
  @ApiOperation({ summary: 'Get a single lookup value by ID' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.lookupsService.findLookupById(id);
  }

  @Post(':typeCode')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new lookup value for a type' })
  create(@Param('typeCode') typeCode: string, @Body() dto: CreateLookupDto) {
    return this.lookupsService.createLookup(typeCode, dto);
  }

  @Post(':typeCode/bulk')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create multiple lookup values for a type' })
  createBulk(@Param('typeCode') typeCode: string, @Body() dtos: CreateLookupDto[]) {
    return this.lookupsService.createBulkLookups(typeCode, dtos);
  }

  @Patch('value/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a lookup value' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateLookupDto) {
    return this.lookupsService.updateLookup(id, dto);
  }

  @Delete('value/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a lookup value (soft delete)' })
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.lookupsService.deleteLookup(id);
  }
}
