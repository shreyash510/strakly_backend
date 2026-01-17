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
import { GymsService } from './gyms.service';
import { CreateGymDto } from './dto/create-gym.dto';
import { UpdateGymDto } from './dto/update-gym.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@ApiTags('Admin - Gyms')
@ApiBearerAuth()
@Controller('admin/gyms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GymsController {
  constructor(private readonly gymsService: GymsService) {}

  @Get()
  @Roles('superadmin')
  @ApiOperation({ summary: 'Get all gyms (superadmin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.gymsService.findAll({
      page: parseInt(page || '1', 10),
      limit: parseInt(limit || '15', 10),
      search,
      status,
    });
  }

  @Get(':id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Get gym by ID (superadmin only)' })
  findOne(@Param('id') id: string) {
    return this.gymsService.findOne(id);
  }

  @Post()
  @Roles('superadmin')
  @ApiOperation({ summary: 'Create a new gym (superadmin only)' })
  create(@Body() createGymDto: CreateGymDto) {
    return this.gymsService.create(createGymDto);
  }

  @Patch(':id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Update a gym (superadmin only)' })
  update(@Param('id') id: string, @Body() updateGymDto: UpdateGymDto) {
    return this.gymsService.update(id, updateGymDto);
  }

  @Delete(':id')
  @Roles('superadmin')
  @ApiOperation({ summary: 'Delete a gym (superadmin only)' })
  remove(@Param('id') id: string) {
    return this.gymsService.remove(id);
  }
}
