import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Headers,
  UnauthorizedException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DietsService } from './diets.service';
import { CreateDietDto } from './dto/create-diet.dto';
import { UpdateDietDto } from './dto/update-diet.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('diets')
export class DietsController {
  constructor(private readonly dietsService: DietsService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Get all diets with pagination and filters
  @Get()
  findAll(
    @Headers('x-user-id') userId: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('difficulty') difficulty?: string,
    @Query('gymId') gymId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.dietsService.findAll(this.getUserId(userId), {
      category,
      status,
      difficulty,
      gymId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  // Get diets assigned to current user
  @Get('my')
  findMyDiets(@Headers('x-user-id') userId: string) {
    return this.dietsService.findMyDiets(this.getUserId(userId));
  }

  // Get diets by gym
  @Get('gym/:gymId')
  findByGym(@Param('gymId') gymId: string) {
    return this.dietsService.findByGym(gymId);
  }

  // Get single diet
  @Get(':id')
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.dietsService.findOne(this.getUserId(userId), id);
  }

  // Create new diet
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin', 'trainer')
  create(
    @Headers('x-user-id') userId: string,
    @Body() createDietDto: CreateDietDto,
  ) {
    return this.dietsService.create(this.getUserId(userId), createDietDto);
  }

  // Update diet
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin', 'trainer')
  update(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() updateDietDto: UpdateDietDto,
  ) {
    return this.dietsService.update(this.getUserId(userId), id, updateDietDto);
  }

  // Delete diet
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin', 'trainer')
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.dietsService.remove(this.getUserId(userId), id);
  }
}
