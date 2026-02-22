import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { SurveysService } from './surveys.service';
import {
  CreateSurveyDto,
  UpdateSurveyDto,
  UpdateStatusDto,
  SubmitSurveyResponseDto,
  SurveyFiltersDto,
} from './dto/surveys.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { OptionalBranchId } from '../common/decorators/branch-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
import { PLAN_FEATURES } from '../common/constants/features';

@ApiTags('surveys')
@Controller('surveys')
@UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.NPS_SURVEYS)
@ApiBearerAuth()
export class SurveysController {
  constructor(private readonly surveysService: SurveysService) {}

  @Get()
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'List all surveys' })
  findAll(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: SurveyFiltersDto,
  ) {
    return this.surveysService.findAll(gymId, branchId, filters);
  }

  @Get('me/pending')
  @Roles('client', 'trainer')
  @ApiOperation({ summary: 'Get pending surveys for the current user' })
  getPendingSurveys(
    @GymId() gymId: number,
    @UserId() userId: number,
  ) {
    return this.surveysService.getPendingSurveys(gymId, userId);
  }

  @Get('nps/latest')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Get latest NPS score' })
  getLatestNps(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
  ) {
    return this.surveysService.getLatestNps(gymId, branchId);
  }

  @Get(':id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get survey by ID' })
  @ApiParam({ name: 'id', type: Number })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.surveysService.findOne(id, gymId);
  }

  @Post()
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Create a new survey' })
  create(
    @Body() dto: CreateSurveyDto,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @UserId() userId: number,
  ) {
    return this.surveysService.create(dto, gymId, branchId, userId);
  }

  @Patch(':id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Update survey metadata' })
  @ApiParam({ name: 'id', type: Number })
  update(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @Body() dto: UpdateSurveyDto,
  ) {
    return this.surveysService.update(id, gymId, dto);
  }

  @Delete(':id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Soft delete a survey' })
  @ApiParam({ name: 'id', type: Number })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.surveysService.softDelete(id, gymId);
  }

  @Patch(':id/status')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Update survey status (draft, active, closed, archived)' })
  @ApiParam({ name: 'id', type: Number })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.surveysService.updateStatus(id, gymId, dto.status);
  }

  @Get(':id/analytics')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get survey analytics and NPS score' })
  @ApiParam({ name: 'id', type: Number })
  getAnalytics(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.surveysService.getAnalytics(id, gymId);
  }

  @Post(':id/respond')
  @Roles('admin', 'branch_admin', 'manager', 'trainer', 'client')
  @ApiOperation({ summary: 'Submit a survey response' })
  @ApiParam({ name: 'id', type: Number })
  submitResponse(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @UserId() userId: number,
    @Body() dto: SubmitSurveyResponseDto,
  ) {
    return this.surveysService.submitResponse(id, gymId, userId, dto);
  }

  @Get(':id/responses')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'List survey responses with answers' })
  @ApiParam({ name: 'id', type: Number })
  getResponses(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @Query() filters: SurveyFiltersDto,
  ) {
    return this.surveysService.getResponses(id, gymId, filters);
  }
}
