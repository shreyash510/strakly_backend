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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { TrainersService } from './trainers.service';
import { CreateTrainerDto } from './dto/create-trainer.dto';
import { UpdateTrainerDto } from './dto/update-trainer.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('Admin - Trainers')
@ApiBearerAuth()
@Controller('admin/trainers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TrainersController {
  constructor(private readonly trainersService: TrainersService) {}

  @Get()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Get all trainers (admin/superadmin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'specialization', required: false, type: String })
  @ApiQuery({ name: 'gymId', required: false, type: String })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('specialization') specialization?: string,
    @Query('gymId') gymId?: string,
  ) {
    return this.trainersService.findAll({
      page: parseInt(page || '1', 10),
      limit: parseInt(limit || '15', 10),
      search,
      status,
      specialization,
      gymId,
    });
  }

  @Get(':id')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Get trainer by ID (admin/superadmin)' })
  findOne(@Param('id') id: string) {
    return this.trainersService.findOne(id);
  }

  @Post()
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Create a new trainer (admin/superadmin)' })
  create(@Body() createTrainerDto: CreateTrainerDto) {
    return this.trainersService.create(createTrainerDto);
  }

  @Patch(':id')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Update a trainer (admin/superadmin)' })
  update(@Param('id') id: string, @Body() updateTrainerDto: UpdateTrainerDto) {
    return this.trainersService.update(id, updateTrainerDto);
  }

  @Delete(':id')
  @Roles('superadmin', 'admin')
  @ApiOperation({ summary: 'Delete a trainer (admin/superadmin)' })
  remove(@Param('id') id: string) {
    return this.trainersService.remove(id);
  }
}
