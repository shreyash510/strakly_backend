import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CustomFieldsService } from './custom-fields.service';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
  BulkUpsertValuesDto,
  CustomFieldFiltersDto,
  ReorderDto,
} from './dto/custom-fields.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { OptionalBranchId } from '../common/decorators/branch-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
import { PLAN_FEATURES } from '../common/constants/features';

@ApiTags('custom-fields')
@Controller('custom-fields')
@UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.CUSTOM_FIELDS)
@ApiBearerAuth()
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Get()
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get all custom field definitions' })
  findAll(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: CustomFieldFiltersDto,
  ) {
    return this.customFieldsService.findAll(gymId, branchId, filters);
  }

  @Get('entity/:entityType/:entityId/values')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get custom field values for a specific entity' })
  getEntityValues(
    @GymId() gymId: number,
    @Param('entityType') entityType: string,
    @Param('entityId', ParseIntPipe) entityId: number,
  ) {
    return this.customFieldsService.getEntityValues(gymId, entityType, entityId);
  }

  @Put('entity/:entityType/:entityId/values')
  @Roles('admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Upsert custom field values for a specific entity' })
  upsertEntityValues(
    @GymId() gymId: number,
    @Param('entityType') entityType: string,
    @Param('entityId', ParseIntPipe) entityId: number,
    @Body() dto: BulkUpsertValuesDto,
  ) {
    return this.customFieldsService.upsertEntityValues(
      gymId,
      entityType,
      entityId,
      dto.values,
    );
  }

  @Patch('reorder')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Reorder custom fields' })
  reorder(
    @GymId() gymId: number,
    @Body() dto: ReorderDto,
  ) {
    return this.customFieldsService.reorder(gymId, dto.items);
  }

  @Get(':id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get a custom field definition by ID' })
  findOne(
    @GymId() gymId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.customFieldsService.findOne(id, gymId);
  }

  @Post()
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Create a new custom field definition' })
  create(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @UserId() userId: number,
    @Body() dto: CreateCustomFieldDto,
  ) {
    return this.customFieldsService.create(dto, gymId, branchId, userId);
  }

  @Patch(':id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Update a custom field definition' })
  update(
    @GymId() gymId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomFieldDto,
  ) {
    return this.customFieldsService.update(id, gymId, dto);
  }

  @Delete(':id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Soft-delete a custom field definition' })
  softDelete(
    @GymId() gymId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.customFieldsService.softDelete(id, gymId);
  }
}
