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
} from '@nestjs/common';
import { MistakesService } from './mistakes.service';
import { CreateMistakeDto } from './dto/create-mistake.dto';
import { UpdateMistakeDto } from './dto/update-mistake.dto';

@Controller('mistakes')
export class MistakesController {
  constructor(private readonly mistakesService: MistakesService) {}

  private getUserId(authHeader: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('User ID header is required');
    }
    return authHeader;
  }

  @Get()
  findAll(@Headers('x-user-id') userId: string) {
    return this.mistakesService.findAll(this.getUserId(userId));
  }

  @Get(':id')
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.mistakesService.findOne(this.getUserId(userId), id);
  }

  @Post()
  create(
    @Headers('x-user-id') userId: string,
    @Body() createMistakeDto: CreateMistakeDto,
  ) {
    return this.mistakesService.create(this.getUserId(userId), createMistakeDto);
  }

  @Patch(':id')
  update(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() updateMistakeDto: UpdateMistakeDto,
  ) {
    return this.mistakesService.update(
      this.getUserId(userId),
      id,
      updateMistakeDto,
    );
  }

  @Patch(':id/toggle-resolved')
  toggleResolved(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.mistakesService.toggleResolved(this.getUserId(userId), id);
  }

  @Delete(':id')
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.mistakesService.remove(this.getUserId(userId), id);
  }
}
