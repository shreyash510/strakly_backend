import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { MigrationService, type ValidationError } from './migration.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import type { AuthenticatedRequest } from '../common/types';

@ApiTags('migration')
@Controller('migration')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MigrationController {
  constructor(private readonly migrationService: MigrationService) {}

  /**
   * Download Excel template for data import
   * GET /migration/template/:type
   */
  @Get('template/:type')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Download import template (members or products)' })
  async downloadTemplate(
    @Param('type') type: string,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.migrationService.generateTemplate(type);

    const filename = `${type}_import_template.xlsx`;
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    });

    res.send(buffer);
  }

  /**
   * Upload and parse CSV/Excel file
   * POST /migration/upload
   */
  @Post('upload')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Upload CSV/Excel file for parsing' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
      },
      fileFilter: (_req, file, callback) => {
        const allowedMimes = [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv',
          'application/csv',
        ];
        const ext = file.originalname.split('.').pop()?.toLowerCase();
        if (
          allowedMimes.includes(file.mimetype) ||
          ['xlsx', 'xls', 'csv'].includes(ext || '')
        ) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException(
              'Only .xlsx, .xls, and .csv files are allowed',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.migrationService.parseFile(file);
  }

  /**
   * Validate parsed data before import
   * POST /migration/validate
   */
  @Post('validate')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Validate parsed file data' })
  async validateData(
    @Body()
    body: {
      fileId: string;
      dataType: string;
      columnMapping: Record<string, string>;
    },
  ): Promise<{ totalRows: number; validRows: number; errors: ValidationError[] }> {
    if (!body.fileId || !body.dataType || !body.columnMapping) {
      throw new BadRequestException(
        'fileId, dataType, and columnMapping are required',
      );
    }

    return this.migrationService.validateData(
      body.fileId,
      body.dataType,
      body.columnMapping,
    );
  }

  /**
   * Execute bulk import
   * POST /migration/import
   */
  @Post('import')
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Import data from uploaded file' })
  async importData(
    @Body()
    body: {
      fileId: string;
      dataType: string;
      columnMapping: Record<string, string>;
    },
    @GymId() gymId: number,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!body.fileId || !body.dataType || !body.columnMapping) {
      throw new BadRequestException(
        'fileId, dataType, and columnMapping are required',
      );
    }

    const actorInfo = {
      id: req.user.userId,
      name: req.user.name,
      role: req.user.role,
    };

    return this.migrationService.importData(
      body.fileId,
      body.dataType,
      body.columnMapping,
      gymId,
      actorInfo,
      null,
    );
  }
}
