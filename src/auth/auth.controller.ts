import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RegisterAdminWithGymDto } from './dto/register-admin-with-gym.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { GymId, UserId } from './decorators';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @Post('register-admin')
  @ApiOperation({ summary: 'Register a new admin user' })
  registerAdmin(@Body() createUserDto: CreateUserDto) {
    return this.authService.registerAdmin(createUserDto);
  }

  @Post('register-admin-with-gym')
  @ApiOperation({ summary: 'Register a new admin user with gym' })
  registerAdminWithGym(@Body() dto: RegisterAdminWithGymDto) {
    return this.authService.registerAdminWithGym(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout user' })
  logout(@UserId() userId: number) {
    return this.authService.logout(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@UserId() userId: number, @GymId() gymId: number) {
    return this.authService.getProfile(userId, gymId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile' })
  updateProfile(
    @UserId() userId: number,
    @GymId() gymId: number,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, gymId, updateProfileDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change user password' })
  changePassword(
    @UserId() userId: number,
    @GymId() gymId: number,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      userId,
      gymId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh access token' })
  refreshToken(@UserId() userId: number, @GymId() gymId: number) {
    return this.authService.refreshToken(userId, gymId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('search')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search users by name or email' })
  searchUsers(
    @UserId() userId: number,
    @GymId() gymId: number,
    @Query('q') query: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = parseInt(page || '1', 10) || 1;
    const limitNum = Math.min(parseInt(limit || '20', 10) || 20, 50);
    return this.authService.searchStaff(query, userId, gymId, pageNum, limitNum);
  }

  @UseGuards(JwtAuthGuard)
  @Post('switch-gym')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Switch to a different gym (for multi-gym staff)' })
  switchGym(
    @UserId() userId: number,
    @Body('gymId') targetGymId: number,
  ) {
    return this.authService.switchGym(userId, targetGymId);
  }
}
