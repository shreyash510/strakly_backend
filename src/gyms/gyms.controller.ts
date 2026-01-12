import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { GymsService } from './gyms.service';
import { CreateGymDto } from './dto/create-gym.dto';
import { UpdateGymDto } from './dto/update-gym.dto';
import { JwtAuthGuard, RolesGuard, PermissionsGuard } from '../auth/guards';
import { Roles, Permissions, CurrentUser } from '../auth/decorators';
import { SystemRoles, GymRoles } from '../common/constants';

@Controller('gyms')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class GymsController {
  constructor(private readonly gymsService: GymsService) {}

  @Post()
  @Roles(SystemRoles.SUPER_ADMIN)
  @Permissions('ADMIN_CREATE')
  create(@Body() createGymDto: CreateGymDto, @CurrentUser() user: any) {
    // When creating gym, adminId will come from body or be set later
    return this.gymsService.create(createGymDto, user.userId, user.userId);
  }

  @Get()
  @Roles(SystemRoles.SUPER_ADMIN)
  @Permissions('GYM_READ_ALL')
  findAll(@Query('isArchived') isArchived?: string) {
    return this.gymsService.findAll({
      isArchived: isArchived === 'true',
    });
  }

  @Get('my-gyms')
  @Roles(GymRoles.ADMIN)
  findMyGyms(@CurrentUser() user: any) {
    return this.gymsService.findByAdmin(user.userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gymsService.findOne(id);
  }

  @Get(':id/users')
  @Roles(SystemRoles.SUPER_ADMIN, GymRoles.ADMIN)
  getGymUsers(@Param('id') id: string) {
    return this.gymsService.getGymUsers(id);
  }

  @Patch(':id')
  @Roles(SystemRoles.SUPER_ADMIN, GymRoles.ADMIN)
  @Permissions('GYM_MANAGE', 'GYM_UPDATE_ANY')
  update(
    @Param('id') id: string,
    @Body() updateGymDto: UpdateGymDto,
    @CurrentUser() user: any,
  ) {
    return this.gymsService.update(id, updateGymDto, user.userId);
  }

  @Patch(':id/activate')
  @Roles(SystemRoles.SUPER_ADMIN)
  activate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gymsService.activate(id, user.userId);
  }

  @Delete(':id')
  @Roles(SystemRoles.SUPER_ADMIN)
  @Permissions('GYM_DELETE_ANY')
  archive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.gymsService.archive(id, user.userId);
  }

  @Post(':id/users/:userId')
  @Roles(SystemRoles.SUPER_ADMIN, GymRoles.ADMIN)
  addUserToGym(
    @Param('id') gymId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: any,
  ) {
    return this.gymsService.addUserToGym(userId, gymId, user.userId);
  }

  @Delete(':id/users/:userId')
  @Roles(SystemRoles.SUPER_ADMIN, GymRoles.ADMIN)
  removeUserFromGym(
    @Param('id') gymId: string,
    @Param('userId') userId: string,
  ) {
    return this.gymsService.removeUserFromGym(userId, gymId);
  }
}
