import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsNotEmpty({ message: 'Login ID or username is required' })
  @IsString({ message: 'Login ID must be a string' })
  loginId!: string;

  @IsNotEmpty({ message: 'Registered email address is required' })
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;
}

export class VerifyOtpDto {
  @IsOptional()
  @IsString({ message: 'Login ID must be a string' })
  loginId?: string;

  @IsNotEmpty({ message: 'Registered email address is required' })
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;

  @IsNotEmpty({ message: 'Verification code is required' })
  @IsString({ message: 'Verification code must be a string' })
  otp!: string;
}

export class ResetPasswordDto {
  @IsOptional()
  @IsString({ message: 'Reset token must be a string' })
  resetToken?: string;

  @IsOptional()
  @IsString({ message: 'Login ID must be a string' })
  loginId?: string;

  @IsOptional()
  @IsString({ message: 'Email must be a string' })
  email?: string;

  @IsOptional()
  @IsString({ message: 'Verification code must be a string' })
  otp?: string;

  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(6, { message: 'New password must be at least 6 characters long' })
  newPassword!: string;
}
