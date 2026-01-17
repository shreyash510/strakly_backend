import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProgramsService } from './programs.service';
import { CreateProgramDto } from './dto/create-program.dto';
import { UpdateProgramDto } from './dto/update-program.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('Admin - Programs')
@ApiBearerAuth()
@Controller('admin/programs')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  @Get()
  @Roles('superadmin', 'admin', 'trainer')
  @ApiOperation({ summary: 'Get all programs (admin/trainer)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'difficulty', required: false, type: String })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('difficulty') difficulty?: string,
  ) {
    return this.programsService.findAll({
      page: parseInt(page || '1', 10),
      limit: parseInt(limit || '15', 10),
      search,
      type,
      status,
      difficulty,
    });
  }

  @Get(':id')
  @Roles('superadmin', 'admin', 'trainer')
  @ApiOperation({ summary: 'Get program by ID (admin/trainer)' })
  findOne(@Param('id') id: string) {
    return this.programsService.findOne(id);
  }

  @Post()
  @Roles('superadmin', 'admin', 'trainer')
  @ApiOperation({ summary: 'Create a new program (admin/trainer)' })
  create(@Request() req: any, @Body() createProgramDto: CreateProgramDto) {
    return this.programsService.create(createProgramDto, req.user.userId);
  }

  @Patch(':id')
  @Roles('superadmin', 'admin', 'trainer')
  @ApiOperation({ summary: 'Update a program (admin/trainer)' })
  update(@Param('id') id: string, @Body() updateProgramDto: UpdateProgramDto) {
    return this.programsService.update(id, updateProgramDto);
  }

  @Delete(':id')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete a program (admin only)' })
  remove(@Param('id') id: string) {
    return this.programsService.remove(id);
  }
}
