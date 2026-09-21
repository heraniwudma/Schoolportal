import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TeacherAssignmentsService } from '../teacher-assignments/teacher-assignments.service'; // Adjust path to point to your service file

import { AuthRateLimiterService } from './auth-rate-limiter.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimiterService, JwtStrategy, RolesGuard, TeacherAssignmentsService],
  exports: [AuthService, AuthRateLimiterService, JwtModule, PassportModule, RolesGuard],
})
export class AuthModule {}
