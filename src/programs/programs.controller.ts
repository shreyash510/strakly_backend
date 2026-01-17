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
import { ProgramsService } from './programs.service';
import { CreateProgramDto, UpdateProgramDto } from './dto/create-program.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('programs')
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Get all programs for user
  @Get()
  findAll(@Headers('x-user-id') userId: string) {
    return this.programsService.findAll(this.getUserId(userId));
  }

  // Get all public programs
  @Get('public')
  findPublic() {
    return this.programsService.findPublic();
  }

  // Get programs by type
  @Get('type/:type')
  findByType(
    @Headers('x-user-id') userId: string,
    @Param('type') type: string,
  ) {
    return this.programsService.findByType(this.getUserId(userId), type);
  }

  // Get programs by gym
  @Get('gym/:gymId')
  findByGym(@Param('gymId') gymId: string) {
    return this.programsService.findByGym(gymId);
  }

  // Get single program
  @Get(':id')
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.programsService.findOne(this.getUserId(userId), id);
  }

  // Create new program
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin', 'trainer')
  create(
    @Headers('x-user-id') userId: string,
    @Body() createProgramDto: CreateProgramDto,
  ) {
    return this.programsService.create(this.getUserId(userId), createProgramDto);
  }

  // Update program
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin', 'trainer')
  update(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() updateProgramDto: UpdateProgramDto,
  ) {
    return this.programsService.update(this.getUserId(userId), id, updateProgramDto);
  }

  // Delete program
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin', 'admin', 'trainer')
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.programsService.remove(this.getUserId(userId), id);
  }
}
