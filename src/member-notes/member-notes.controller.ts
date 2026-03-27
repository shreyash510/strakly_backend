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
import { MemberNotesService } from './member-notes.service';
import {
  CreateMemberNoteDto,
  UpdateMemberNoteDto,
  MemberNoteFiltersDto,
} from './dto/member-note.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GymId } from '../common/decorators/gym-id.decorator';
import { UserId } from '../common/decorators/user-id.decorator';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('member-notes')
@Controller('member-notes')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MemberNotesController {
  constructor(private readonly memberNotesService: MemberNotesService) {}

  @Get()
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Get client notes' })
  async findAll(
    @GymId() gymId: number,
    @Query() filters: MemberNoteFiltersDto,
  ) {
    return this.memberNotesService.findAll(gymId, filters);
  }

  @Post()
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Create a client note' })
  async create(
    @Body() dto: CreateMemberNoteDto,
    @GymId() gymId: number,
    @UserId() userId: number,
  ) {
    return this.memberNotesService.create(dto, gymId, userId);
  }

  @Patch(':id')
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Update a client note' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMemberNoteDto,
    @GymId() gymId: number,
  ) {
    return this.memberNotesService.update(id, gymId, dto);
  }

  @Patch(':id/pin')
  @Roles('superadmin', 'admin', 'manager', 'trainer')
  @ApiOperation({ summary: 'Toggle pin on a client note' })
  async togglePin(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
  ) {
    return this.memberNotesService.togglePin(id, gymId);
  }

  @Delete(':id')
  @Roles('superadmin', 'admin', 'manager')
  @ApiOperation({ summary: 'Delete a client note' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @GymId() gymId: number,
    @UserId() userId: number,
  ) {
    return this.memberNotesService.remove(id, gymId, userId);
  }
}
