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
import { CampaignsService } from './campaigns.service';
import {
  CreateCampaignTemplateDto,
  UpdateCampaignTemplateDto,
  CreateCampaignDto,
  UpdateCampaignDto,
  ScheduleCampaignDto,
  AudienceFilterDto,
  CampaignTemplateFiltersDto,
  CampaignFiltersDto,
  RecipientFiltersDto,
} from './dto/campaigns.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlanFeaturesGuard } from '../auth/guards/plan-features.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlanFeatures } from '../auth/decorators/plan-features.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { OptionalBranchId } from '../common/decorators/branch-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
import { PLAN_FEATURES } from '../common/constants/features';

@ApiTags('campaigns')
@Controller('campaigns')
@UseGuards(JwtAuthGuard, RolesGuard, PlanFeaturesGuard)
@PlanFeatures(PLAN_FEATURES.CAMPAIGNS)
@ApiBearerAuth()
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  // ─── Templates ───

  @Get('templates')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'List campaign templates' })
  findAllTemplates(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: CampaignTemplateFiltersDto,
  ) {
    return this.campaignsService.findAllTemplates(gymId, branchId, filters);
  }

  @Get('templates/:id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get campaign template by ID' })
  @ApiParam({ name: 'id', type: Number })
  findOneTemplate(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.campaignsService.findOneTemplate(id, gymId);
  }

  @Post('templates')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Create campaign template' })
  createTemplate(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Body() dto: CreateCampaignTemplateDto,
  ) {
    return this.campaignsService.createTemplate(gymId, branchId, dto);
  }

  @Patch('templates/:id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Update campaign template' })
  @ApiParam({ name: 'id', type: Number })
  updateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @Body() dto: UpdateCampaignTemplateDto,
  ) {
    return this.campaignsService.updateTemplate(id, gymId, dto);
  }

  @Delete('templates/:id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Delete campaign template' })
  @ApiParam({ name: 'id', type: Number })
  removeTemplate(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.campaignsService.softDeleteTemplate(id, gymId);
  }

  // ─── Audience Preview (before :id to avoid route conflicts) ───

  @Post('audience/preview')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Preview audience count for a filter' })
  previewAudience(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Body() filter: AudienceFilterDto,
  ) {
    return this.campaignsService.previewAudience(gymId, branchId, filter);
  }

  // ─── Campaigns ───

  @Get()
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'List all campaigns' })
  findAllCampaigns(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: CampaignFiltersDto,
  ) {
    return this.campaignsService.findAllCampaigns(gymId, branchId, filters);
  }

  @Get(':id')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get campaign by ID' })
  @ApiParam({ name: 'id', type: Number })
  findOneCampaign(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.campaignsService.findOneCampaign(id, gymId);
  }

  @Get(':id/recipients')
  @Roles('admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get campaign recipients' })
  @ApiParam({ name: 'id', type: Number })
  getRecipients(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @Query() filters: RecipientFiltersDto,
  ) {
    return this.campaignsService.getRecipients(id, gymId, filters);
  }

  @Post()
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Create a campaign (draft)' })
  createCampaign(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @UserId() userId: number,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaignsService.createCampaign(gymId, branchId, dto, userId);
  }

  @Patch(':id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Update a campaign (draft only)' })
  @ApiParam({ name: 'id', type: Number })
  updateCampaign(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.updateCampaign(id, gymId, dto);
  }

  @Post(':id/send')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Send campaign immediately' })
  @ApiParam({ name: 'id', type: Number })
  sendCampaign(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.campaignsService.sendCampaign(id, gymId);
  }

  @Post(':id/schedule')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Schedule campaign for future send' })
  @ApiParam({ name: 'id', type: Number })
  scheduleCampaign(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @Body() dto: ScheduleCampaignDto,
  ) {
    return this.campaignsService.scheduleCampaign(id, gymId, dto);
  }

  @Post(':id/cancel')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Cancel a scheduled campaign' })
  @ApiParam({ name: 'id', type: Number })
  cancelCampaign(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.campaignsService.cancelCampaign(id, gymId);
  }

  @Delete(':id')
  @Roles('admin', 'branch_admin')
  @ApiOperation({ summary: 'Delete a campaign (draft only)' })
  @ApiParam({ name: 'id', type: Number })
  removeCampaign(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.campaignsService.softDeleteCampaign(id, gymId);
  }
}
