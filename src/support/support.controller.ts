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
} from '@nestjs/common';
import { SupportService } from './support.service';
import { CreateSupportDto, UpdateSupportDto, AddTicketResponseDto } from './dto/create-support.dto';

@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  // Get all tickets with optional filters
  @Get()
  findAll(
    @Headers('x-user-id') userId: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('category') category?: string,
  ) {
    return this.supportService.findAll(this.getUserId(userId), { status, priority, category });
  }

  // Get single ticket
  @Get(':id')
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.supportService.findOne(this.getUserId(userId), id);
  }

  // Create new ticket
  @Post()
  create(
    @Headers('x-user-id') userId: string,
    @Body() createSupportDto: CreateSupportDto,
  ) {
    return this.supportService.create(this.getUserId(userId), createSupportDto);
  }

  // Update ticket
  @Patch(':id')
  update(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() updateSupportDto: UpdateSupportDto,
  ) {
    return this.supportService.update(this.getUserId(userId), id, updateSupportDto);
  }

  // Delete ticket
  @Delete(':id')
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.supportService.remove(this.getUserId(userId), id);
  }

  // Add response to ticket
  @Post(':id/responses')
  addResponse(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() responseDto: AddTicketResponseDto,
    @Query('isStaff') isStaff?: string,
  ) {
    return this.supportService.addResponse(
      this.getUserId(userId),
      id,
      responseDto,
      isStaff === 'true',
    );
  }

  // Assign ticket to staff
  @Patch(':id/assign')
  assignTicket(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() body: { assignedTo: string; assignedToName?: string },
  ) {
    return this.supportService.assignTicket(
      this.getUserId(userId),
      id,
      body.assignedTo,
      body.assignedToName,
    );
  }

  // Resolve ticket
  @Patch(':id/resolve')
  resolveTicket(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() body: { resolution: string },
  ) {
    return this.supportService.resolveTicket(
      this.getUserId(userId),
      id,
      body.resolution,
    );
  }
}
