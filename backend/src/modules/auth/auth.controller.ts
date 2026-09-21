import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { Roles } from './decorators/roles.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthService } from './auth.service';

import { ForgotPasswordDto, VerifyOtpDto, ResetPasswordDto } from './dto/password-reset.dto';

@Controller('auth') // <-- Keep this as 'auth' so frontend login works at /auth/login
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: ForgotPasswordDto, @Req() req: Request) {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress;
    return this.authService.forgotPassword(body, clientIp);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() body: VerifyOtpDto, @Req() req: Request) {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress;
    return this.authService.verifyOtp(body, undefined, clientIp);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: ResetPasswordDto, @Req() req: Request) {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress;
    return this.authService.resetPassword(body, undefined, undefined, clientIp);
  }

  @Get('me/homeroom-context')
  @UseGuards(JwtAuthGuard)
  async getTeacherHomeroomContext(@Req() req: Request & { user: { userId?: string; id?: string } }) {
    const userId = req.user.userId || req.user.id;
    if (!userId) {
      throw new UnauthorizedException('User ID not found in token');
    }
    return this.authService.getHomeroomContext(userId);
  }
  
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() request: Request & { user: { id: string } }) {
    return this.authService.getProfile(request.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin-only')
  adminOnly() {
    return { message: 'admin access granted' };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  @Get('teacher-only')
  teacherOnly() {
    return { message: 'teacher access granted' };
  }
}
