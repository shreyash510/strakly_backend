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
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import { DocumentsService } from './documents.service';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  SignDocumentDto,
  TemplateFiltersDto,
} from './dto/document.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { OptionalBranchId } from '../common/decorators/branch-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('documents')
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // --- Template routes (must come before parameterized /:id) ---

  @Get('templates')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'List all document templates' })
  async findAllTemplates(
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @Query() filters: TemplateFiltersDto,
  ) {
    return this.documentsService.findAllTemplates(gymId, branchId, filters);
  }

  @Get('templates/:id')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager')
  @ApiOperation({ summary: 'Get a document template by ID' })
  async findTemplateById(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.documentsService.findTemplateById(id, gymId);
  }

  @Post('templates')
  @Roles('superadmin', 'admin', 'branch_admin')
  @ApiOperation({ summary: 'Create a document template' })
  async createTemplate(
    @Body() dto: CreateTemplateDto,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @UserId() userId: number,
  ) {
    return this.documentsService.createTemplate(gymId, branchId, dto, userId);
  }

  @Patch('templates/:id')
  @Roles('superadmin', 'admin', 'branch_admin')
  @ApiOperation({ summary: 'Update a document template' })
  async updateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTemplateDto,
    @GymId() gymId: number,
  ) {
    return this.documentsService.updateTemplate(id, gymId, dto);
  }

  @Delete('templates/:id')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Soft-delete a document template' })
  async deleteTemplate(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.documentsService.softDeleteTemplate(id, gymId);
  }

  // --- Signed document routes (must come before parameterized /:id) ---

  @Post('sign')
  @ApiOperation({ summary: 'Sign a document (all authenticated users)' })
  async signDocument(
    @Body() dto: SignDocumentDto,
    @GymId() gymId: number,
    @OptionalBranchId() branchId: number | null,
    @UserId() userId: number,
    @Request() req: any,
  ) {
    const ipAddress = req.headers['x-forwarded-for'] || req.ip || '';
    const userAgent = req.headers['user-agent'] || '';
    return this.documentsService.signDocument(gymId, branchId, dto, userId, ipAddress, userAgent);
  }

  @Post('signed/:id/generate-pdf')
  @Roles('superadmin', 'admin', 'branch_admin')
  @ApiOperation({ summary: 'Generate PDF for a signed document' })
  async generatePdf(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    const url = await this.documentsService.generateAndStorePdf(id, gymId);
    return { pdfUrl: url };
  }

  @Get('signed/:id/pdf')
  @ApiOperation({ summary: 'Get PDF URL for a signed document' })
  async getSignedDocPdf(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.documentsService.getSignedDocPdf(id, gymId);
  }

  @Get('user/:userId')
  @Roles('superadmin', 'admin', 'branch_admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get signed documents for a specific user' })
  async getSignedByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @GymId() gymId: number,
  ) {
    return this.documentsService.getSignedByUser(userId, gymId);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get my signed documents (current user)' })
  async getMySignedDocs(
    @UserId() userId: number,
    @GymId() gymId: number,
  ) {
    return this.documentsService.getMySignedDocs(userId, gymId);
  }
}
