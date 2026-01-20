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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { GymService } from './gym.service';
import { CreateGymDto, UpdateGymDto } from './dto/gym.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('gyms')
@Controller('gyms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
@ApiBearerAuth()
export class GymController {
  constructor(private readonly gymService: GymService) {}

  @Get()
  @ApiOperation({ summary: 'Get all gyms' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.gymService.findAll(includeInactive === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get gym by ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.gymService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new gym' })
  create(@Body() dto: CreateGymDto) {
    return this.gymService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a gym' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGymDto) {
    return this.gymService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a gym' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.gymService.remove(id);
  }

  @Post(':id/toggle-status')
  @ApiOperation({ summary: 'Toggle gym active status' })
  toggleStatus(@Param('id', ParseIntPipe) id: number) {
    return this.gymService.toggleStatus(id);
  }
}
