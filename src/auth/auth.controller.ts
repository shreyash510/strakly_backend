import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
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
  logout(@Request() req: any) {
    return this.authService.logout(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  getProfile(@Request() req: any) {
    return this.authService.getProfile(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile' })
  updateProfile(@Request() req: any, @Body() updateProfileDto: UpdateProfileDto) {
    return this.authService.updateProfile(req.user.userId, updateProfileDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change user password' })
  changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(
      req.user.userId,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh access token' })
  refreshToken(@Request() req: any) {
    return this.authService.refreshToken(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('search')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Search users by name or email' })
  searchUsers(
    @Request() req: any,
    @Query('q') query: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = parseInt(page || '1', 10) || 1;
    const limitNum = Math.min(parseInt(limit || '20', 10) || 20, 50);
    /* Superadmin can search all users, others only see their gym's users */
    const gymId = req.user.role === 'superadmin' ? undefined : req.user.gymId;
    return this.authService.searchUsers(query, req.user.userId, pageNum, limitNum, gymId);
  }
}
