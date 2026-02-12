import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthRegisterDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RegisterAdminWithGymDto } from './dto/register-admin-with-gym.dto';
import { GoogleCallbackDto, GoogleRegisterWithGymDto } from './dto/google-auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  RequestPasswordResetDto,
  VerifyOtpDto,
  ResetPasswordDto,
} from './dto/forgot-password.dto';
import { GymId, UserId, OptionalGymId } from './decorators';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  register(@Body() createUserDto: AuthRegisterDto) {
    return this.authService.register(createUserDto);
  }

  @Post('register-admin')
  @ApiOperation({ summary: 'Register a new admin user' })
  registerAdmin(@Body() createUserDto: AuthRegisterDto) {
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
  getProfile(@UserId() userId: number, @OptionalGymId() gymId: number | null) {
    return this.authService.getProfile(userId, gymId ?? undefined);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile' })
  updateProfile(
    @UserId() userId: number,
    @OptionalGymId() gymId: number | null,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, gymId ?? undefined, updateProfileDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change user password' })
  changePassword(
    @UserId() userId: number,
    @OptionalGymId() gymId: number | null,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      userId,
      gymId ?? undefined,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh access token' })
  refreshToken(@UserId() userId: number, @OptionalGymId() gymId: number | null) {
    return this.authService.refreshToken(userId, gymId ?? undefined);
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
    return this.authService.searchStaff(
      query,
      userId,
      gymId,
      pageNum,
      limitNum,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('switch-gym')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Switch to a different gym (for multi-gym staff)' })
  switchGym(@UserId() userId: number, @Body('gymId') targetGymId: number) {
    return this.authService.switchGym(userId, targetGymId);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset OTP' })
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('verify-otp')
  @ApiOperation({ summary: 'Verify password reset OTP' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto.email, dto.otp);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with OTP verification' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPasswordWithOtp(
      dto.email,
      dto.otp,
      dto.newPassword,
    );
  }

  @Post('resend-otp')
  @ApiOperation({ summary: 'Resend password reset OTP' })
  resendOtp(@Body() dto: RequestPasswordResetDto) {
    return this.authService.resendOtp(dto.email);
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email with OTP' })
  verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyEmail(dto.email, dto.otp);
  }

  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend email verification OTP' })
  resendVerification(@Body() dto: RequestPasswordResetDto) {
    return this.authService.resendVerificationEmail(dto.email);
  }

  @Post('send-signup-otp')
  @ApiOperation({ summary: 'Send OTP for signup email verification' })
  sendSignupOtp(@Body() dto: { email: string; name: string }) {
    return this.authService.sendSignupVerificationOtp(dto.email, dto.name);
  }

  @Post('verify-signup-otp')
  @ApiOperation({ summary: 'Verify signup OTP' })
  verifySignupOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifySignupOtp(dto.email, dto.otp);
  }

  @UseGuards(JwtAuthGuard)
  @Get('email-verification-status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check email verification status' })
  checkEmailVerification(@UserId() userId: number, @OptionalGymId() gymId: number | null) {
    return this.authService.checkEmailVerification(userId, false, gymId ?? undefined);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('superadmin')
  @Post('impersonate/:gymId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Impersonate a gym as superadmin' })
  impersonateGym(
    @UserId() userId: number,
    @Param('gymId', ParseIntPipe) gymId: number,
  ) {
    return this.authService.impersonateGym(userId, gymId);
  }

  // ============================================
  // GOOGLE OAUTH ENDPOINTS
  // ============================================

  @Post('google/callback')
  @ApiOperation({
    summary: 'Google OAuth callback',
    description:
      'Exchanges Google auth code for user info. For LOGIN intent, returns auth token if user exists. For SIGNUP intent, returns user info for gym setup.',
  })
  googleCallback(@Body() dto: GoogleCallbackDto) {
    return this.authService.googleCallback(dto);
  }

  @Post('google/register-with-gym')
  @ApiOperation({
    summary: 'Register Google user with gym',
    description:
      'Creates a new user with Google OAuth and creates their gym. Used after Google SIGNUP returns requiresGymSetup: true.',
  })
  googleRegisterWithGym(@Body() dto: GoogleRegisterWithGymDto) {
    return this.authService.googleRegisterWithGym(dto);
  }
}
