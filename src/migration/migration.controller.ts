import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  Res,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MigrationService } from './migration.service';
import { ValidateDto, ImportDto } from './dto/migration.dto';
import type { DataType } from './dto/migration.dto';
import type { AuthenticatedRequest } from '../common/types';

const ALLOWED_TYPES = ['members', 'memberships', 'staff', 'payments'];

const ALLOWED_MIME_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // some browsers send this for .csv
];

@ApiTags('migration')
@Controller('migration')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'branch_admin')
export class MigrationController {
  constructor(private readonly migrationService: MigrationService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload CSV/Excel file and parse headers + preview' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (_req, file, callback) => {
        const ext = file.originalname.toLowerCase();
        if (!ext.endsWith('.csv') && !ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
          return callback(
            new BadRequestException('Only CSV and Excel files are allowed'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('dataType') dataType: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!dataType || !ALLOWED_TYPES.includes(dataType)) {
      throw new BadRequestException(
        `Invalid dataType. Must be one of: ${ALLOWED_TYPES.join(', ')}`,
      );
    }

    const result = await this.migrationService.parseFile(file);
    const fields = this.migrationService.getFieldDefinitions(dataType as DataType);

    return { ...result, fields };
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate all rows with column+value mappings' })
  async validateData(@Body() dto: ValidateDto) {
    return this.migrationService.validateRows(
      dto.fileId,
      dto.dataType,
      dto.columnMapping,
      dto.valueMapping,
    );
  }

  @Post('import')
  @ApiOperation({ summary: 'Apply mappings and bulk insert into tenant schema' })
  async importData(@Body() dto: ImportDto, @Req() req: AuthenticatedRequest) {
    const gymId = req.user.gymId;
    if (!gymId) throw new BadRequestException('Gym context required');

    return this.migrationService.importData(
      gymId,
      dto.fileId,
      dto.dataType,
      dto.columnMapping,
      dto.valueMapping,
      dto.branchId,
    );
  }

  @Get('templates/:type')
  @ApiOperation({ summary: 'Download Excel template for a data type' })
  async downloadTemplate(
    @Param('type') type: string,
    @Res() res: Response,
  ) {
    if (!ALLOWED_TYPES.includes(type)) {
      throw new BadRequestException(
        `Invalid type. Must be one of: ${ALLOWED_TYPES.join(', ')}`,
      );
    }

    const workbook = await this.migrationService.generateTemplate(type as DataType);
    const filename = `strakly-${type}-template.xlsx`;

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });

    await workbook.xlsx.write(res);
    res.end();
  }
}
