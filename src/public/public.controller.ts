import { Controller, Post, Get, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PublicService } from './public.service';
import { MemberRegistrationDto } from './dto/member-registration.dto';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register as a new member (public - no auth required)' })
  registerMember(@Body() dto: MemberRegistrationDto) {
    return this.publicService.registerMember(dto);
  }

  @Get('gym/:id')
  @ApiOperation({ summary: 'Get gym info for registration page (public)' })
  getGymInfo(@Param('id', ParseIntPipe) id: number) {
    return this.publicService.getGymInfo(id);
  }

  @Get('gym/:gymId/branch/:branchId')
  @ApiOperation({ summary: 'Get branch info for registration page (public)' })
  getBranchInfo(
    @Param('gymId', ParseIntPipe) gymId: number,
    @Param('branchId', ParseIntPipe) branchId: number,
  ) {
    return this.publicService.getBranchInfo(gymId, branchId);
  }
}
