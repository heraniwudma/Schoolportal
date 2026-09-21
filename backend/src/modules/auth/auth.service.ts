import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import * as crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { ForgotPasswordDto, VerifyOtpDto, ResetPasswordDto } from './dto/password-reset.dto';

type SafeAuthUser = {
  id: string;
  name: string;
  loginId: string;
  email: string | null;
  role: Lowercase<Role>;
};

@Injectable()
export class AuthService {
  private transporter: nodemailer.Transporter;
  private readonly rateLimiterService: AuthRateLimiterService;
  private readonly profileCache = new Map<string, { profile: any; expiresAt: number }>();
  private readonly inFlightProfiles = new Map<string, Promise<any>>();
  private readonly PROFILE_CACHE_TTL_MS = 30 * 1000; // 30 seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly rateLimiter?: AuthRateLimiterService,
  ) {
    this.rateLimiterService = rateLimiter ?? new AuthRateLimiterService();
    // Initialize Nodemailer transporter with your Gmail SMTP settings from .env
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port: Number(process.env.MAIL_PORT) || 587,
      secure: false, // true for 465, false for other ports like 587
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD,
      },
    });
  }

  async register(registerDto: RegisterDto & { classId?: string; classSectionId?: string; grade?: string }) {
    if (registerDto.password !== registerDto.confirmPassword) {
      throw new BadRequestException('Password confirmation does not match');
    }

    const role = this.mapRegisterRole(registerDto.role);
    const loginId = (role === Role.STUDENT
      ? registerDto.studentId || registerDto.idNumber
      : registerDto.idNumber).trim();
    const email = registerDto.email?.trim().toLowerCase();

    if (role === Role.STUDENT) {
      const required = ['institutionId', 'institutionName', 'fatherName', 'grandfatherName', 'admissionType', 'gender', 'dob', 'nationality', 'familyKebele', 'locationType', 'fatherEducationLevel', 'motherEducationLevel', 'economicStatus', 'guardianFullName', 'familyHeadGender', 'guardianPhone', 'nationalId', 'residenceRegion', 'residenceZone', 'residenceWoreda', 'birthRegion', 'birthZone', 'birthWoreda', 'parentStatus'];
      const missing = required.filter((field) => !String((registerDto as unknown as Record<string, unknown>)[field] ?? '').trim());
      if (missing.length) throw new BadRequestException(`Missing required student registration information: ${missing.join(', ')}`);
      if (registerDto.disability === 'yes' && !registerDto.disabilityType?.trim()) {
        throw new BadRequestException('Disability type is required when disability is Yes');
      }
    }

    const existingByLoginId = await this.prisma.user.findUnique({
      where: { loginId },
      select: { id: true },
    });
    if (existingByLoginId) {
      throw new ConflictException('A user with that ID number already exists');
    }

    if (email) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existingByEmail) {
        throw new ConflictException('A user with that email already exists');
      }
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 12);
    const userId = randomUUID();

    const nameParts = registerDto.name ? registerDto.name.trim().split(/\s+/) : ['User'];
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || firstName;

    try {
      const createdUser = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            id: userId,
            loginId,
            name: registerDto.name.trim(),
            email,
            password: passwordHash,
            role,
          },
          select: {
            id: true,
            loginId: true,
            email: true,
            role: true,
          },
        });

        if (role === Role.TEACHER) {
          await tx.teacher.create({
            data: {
              id: randomUUID(),
              userId: user.id,
              firstName,
              lastName,
              updatedAt: new Date(),
            },
          });
        } else if (role === Role.PARENT) {
          await tx.parent.create({
            data: {
              id: randomUUID(),
              userId: user.id,
              firstName,
              lastName,
              updatedAt: new Date(),
            },
          });
        } else if (role === Role.STUDENT) {
          const classInput = (registerDto as any).classSectionId || (registerDto as any).classId || (registerDto as any).grade;
          let resolvedClassSectionId: string | null = null;
          const currentYear = classInput
            ? await tx.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } })
            : null;

          if (classInput) {
            const normalizedInput = String(classInput).trim();
            if (!currentYear) {
              throw new BadRequestException('A current academic year must be set before selecting a class section');
            }
            let sectionRecord = await tx.classSection.findFirst({
              where: {
                AND: [
                  { academicYearId: currentYear.id, gradeLevelId: { not: null } },
                  {
                    OR: [
                      { id: normalizedInput },
                      // A full display label is accepted only when it resolves to
                      // an existing grade/section pair; never create a raw class.
                      { name: normalizedInput },
                    ],
                  },
                ],
              },
            });

            if (!sectionRecord) {
              const match = normalizedInput.match(/^grade\s*(\d+)\s*([a-z][a-z0-9]{0,3})$/i);
              if (match) {
                sectionRecord = await tx.classSection.findFirst({
                  where: {
                    name: match[2].toUpperCase(),
                    academicYearId: currentYear.id,
                    GradeLevel: {
                      OR: [
                        { gradeNumber: Number(match[1]) },
                        { name: `Grade ${match[1]}` },
                      ],
                    },
                  },
                });
              }
            }

            if (!sectionRecord || !sectionRecord.gradeLevelId || !sectionRecord.academicYearId) {
              throw new BadRequestException('Select a valid class and section, for example Grade 10 A');
            }
            resolvedClassSectionId = sectionRecord.id;
          }

          const student = await tx.student.create({
            data: {
              id: randomUUID(),
              userId: user.id,
              admissionNo: loginId,
              firstName,
              lastName,
              gender: registerDto.gender,
              institutionId: registerDto.institutionId?.trim(),
              institutionName: registerDto.institutionName?.trim(),
              fatherName: registerDto.fatherName?.trim(),
              grandfatherName: registerDto.grandfatherName?.trim(),
              admissionType: registerDto.admissionType?.trim(),
              hasDisability: registerDto.disability === 'yes',
              disabilityType: registerDto.disability === 'yes' ? registerDto.disabilityType?.trim() : null,
              dob: registerDto.dob ? new Date(registerDto.dob) : undefined,
              nationality: registerDto.nationality?.trim(),
              familyKebele: registerDto.familyKebele?.trim(),
              locationType: registerDto.locationType?.trim(),
              fatherEducationLevel: registerDto.fatherEducationLevel?.trim(),
              motherEducationLevel: registerDto.motherEducationLevel?.trim(),
              economicStatus: registerDto.economicStatus?.trim(),
              guardianFullName: registerDto.guardianFullName?.trim(),
              familyHeadGender: registerDto.familyHeadGender?.trim(),
              guardianEmail: registerDto.guardianEmail?.trim().toLowerCase(),
              guardianPhone: registerDto.guardianPhone?.trim(),
              nationalId: registerDto.nationalId?.trim(),
              residenceRegion: registerDto.residenceRegion?.trim(),
              residenceZone: registerDto.residenceZone?.trim(),
              residenceWoreda: registerDto.residenceWoreda?.trim(),
              birthRegion: registerDto.birthRegion?.trim(),
              birthZone: registerDto.birthZone?.trim(),
              birthWoreda: registerDto.birthWoreda?.trim(),
              parentStatus: registerDto.parentStatus?.trim(),
              updatedAt: new Date(),
              ...(resolvedClassSectionId ? { classSectionId: resolvedClassSectionId } : {}),
            },
          });
          if (resolvedClassSectionId) {
            const section = await tx.classSection.findUnique({
              where: { id: resolvedClassSectionId },
              select: { academicYearId: true, gradeLevelId: true },
            });
            if (!section?.academicYearId || !section.gradeLevelId || section.academicYearId !== currentYear?.id) {
              throw new BadRequestException('Select a class section from the current academic year');
            }
            await tx.studentEnrollment.create({
              data: {
                studentId: student.id,
                academicYearId: section.academicYearId,
                gradeLevelId: section.gradeLevelId,
                classSectionId: resolvedClassSectionId,
                status: 'ACTIVE',
              },
            });
          }
        }

        return user;
      }, {
        maxWait: 10000,
        timeout: 10000,
      });

      const safeUser = this.toSafeUser(createdUser, registerDto.name);
      const accessToken = await this.signToken(createdUser.id, createdUser.role);

      return {
        accessToken,
        user: safeUser,
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const target = (error.meta?.target as string[]) || [];
          if (target.includes('email')) {
            throw new ConflictException('A user with that email already exists');
          }
          if (target.includes('loginId')) {
            throw new ConflictException('A user with that ID number already exists');
          }
          if (target.includes('admissionNo')) {
            throw new ConflictException('A student with that admission ID already exists');
          }
          if (target.includes('staffId')) {
            throw new ConflictException('A teacher with that staff ID already exists');
          }
          throw new ConflictException(`Duplicate record value detected: ${target.join(', ') || 'Unique constraint failure'}`);
        }
        if (error.code === 'P2003') {
          throw new BadRequestException('Invalid reference: selected class section, grade, or parent record does not exist');
        }
      }
      throw error;
    }
  }

  async getTeacherPermissions(userId: string) {
    // 1. Find the teacher record using their user ID
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId },
      include: {
        // ClassSection[] via "GeneralTeacher" relation = homeroom sections
        ClassSection: true,
      },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    // 2. Check if they have at least one homeroom section assigned
    const isHomeroomTeacher = teacher.ClassSection.length > 0;

    // 3. Return their info plus the permission flag
    return {
      id: teacher.id,
      name: `${teacher.firstName} ${teacher.lastName}`,
      isHomeroomTeacher, // true or false
    };
  }

  async login(loginDto: LoginDto) {
    const identifier = [
      loginDto.identifier,
      loginDto.loginId,
      loginDto.idNumber,
      loginDto.username,
      loginDto.email,
    ].find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();

    if (!identifier) {
      throw new BadRequestException('An ID number, username, or email is required');
    }

    const emailIdentifier = identifier.toLowerCase();

    const selectFields = {
      id: true,
      loginId: true,
      email: true,
      password: true,
      role: true,
      name: true,
      avatarUrl: true,
      isActive: true,
      isDeleted: true,
      Teacher: { select: { firstName: true, lastName: true } },
      Student: { select: { firstName: true, lastName: true } },
      Parent: { select: { firstName: true, lastName: true } },
    } as const;

    // Fast path: Exact indexed matching (uses B-tree unique index in ~2ms)
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { loginId: identifier },
          { email: emailIdentifier },
          { Student: { admissionNo: identifier } },
        ],
      },
      select: selectFields,
    });

    // Fallback: If not found, fall back to case-insensitive search to maintain 100% backward compatibility
    if (!user) {
      user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { loginId: { equals: identifier, mode: 'insensitive' } },
            { email: { equals: emailIdentifier, mode: 'insensitive' } },
            { Student: { admissionNo: { equals: identifier, mode: 'insensitive' } } },
          ],
        },
        select: selectFields,
      });
    }

    if (!user || !user.isActive || user.isDeleted) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    const passwordMatches = await bcrypt.compare(loginDto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    // Record last login timestamp asynchronously without blocking the user response
    void this.prisma.user
      .update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
        select: { id: true },
      })
      .catch((err) => {
        console.warn('Failed to update lastLoginAt:', err?.message || err);
      });

    const safeUser = this.toSafeUser(user);
    this.profileCache.set(user.id, {
      profile: safeUser,
      expiresAt: Date.now() + this.PROFILE_CACHE_TTL_MS,
    });
    const accessToken = await this.signToken(user.id, user.role);

    return {
      accessToken,
      user: safeUser,
    };
  }

  private getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required in production.');
    }
    return secret || 'dev-secret-change-in-production';
  }

  private hashOtp(otp: string): string {
    return crypto.createHmac('sha256', this.getJwtSecret()).update(otp.trim()).digest('hex');
  }

  private hashResetToken(token: string): string {
    return crypto.createHmac('sha256', this.getJwtSecret()).update(token.trim()).digest('hex');
  }

  private safeTimingCompare(a: string, b: string): boolean {
    if (!a || !b) return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  private async findUserByLoginId(loginId: string) {
    if (!loginId || !loginId.trim()) return null;
    const cleanId = loginId.trim();

    return this.prisma.user.findFirst({
      where: {
        OR: [
          { loginId: { equals: cleanId, mode: 'insensitive' } },
          { Student: { admissionNo: { equals: cleanId, mode: 'insensitive' } } },
          { Teacher: { staffId: { equals: cleanId, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true,
        loginId: true,
        email: true,
        isActive: true,
        isDeleted: true,
        resetOtp: true,
        resetOtpExpiresAt: true,
      },
    });
  }

  // ─── Password Reset Workflow ─────────────────────────────────────────────────

  async forgotPassword(input: ForgotPasswordDto | string, clientIp?: string) {
    const dto: ForgotPasswordDto =
      typeof input === 'string'
        ? { loginId: input, email: input }
        : input;

    if (!dto.loginId?.trim() || !dto.email?.trim()) {
      throw new BadRequestException('Login ID and registered email address are required');
    }

    const ip = (clientIp || 'unknown').trim();
    const rateCheck = this.rateLimiterService.checkForgotRateLimit(ip, dto.loginId);
    if (!rateCheck.allowed) {
      throw new HttpException(
        `Too many password reset requests. Please try again in ${rateCheck.retryAfterSeconds} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.rateLimiterService.recordForgotAttempt(ip, dto.loginId);

    // 1. Identify user strictly by Login ID
    const user = await this.findUserByLoginId(dto.loginId);

    // Generic error message for all mismatches to prevent account enumeration
    const genericRejectionMessage =
      'Invalid Login ID or registered email address. Please verify your details.';

    if (!user || user.isDeleted || !user.isActive) {
      throw new BadRequestException(genericRejectionMessage);
    }

    // 2. Strict comparison against authoritative registered email
    const normalizedEnteredEmail = dto.email.trim().toLowerCase();
    const normalizedRegisteredEmail = (user.email || '').trim().toLowerCase();

    if (!normalizedRegisteredEmail || normalizedEnteredEmail !== normalizedRegisteredEmail) {
      throw new BadRequestException(genericRejectionMessage);
    }

    // 3. Cryptographically secure 6-digit OTP generation
    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const hashedOtp = this.hashOtp(rawOtp);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // 4. Store HMAC-SHA256 hash in database (never store plaintext OTP)
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetOtp: hashedOtp, resetOtpExpiresAt: otpExpiresAt },
    });

    // 5. Send OTP strictly to registered email (never to user-supplied destination)
    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.MAIL_USER,
        to: user.email as string,
        subject: 'Password Reset Code - School Portal',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 480px; color: #333;">
            <h2 style="color: #1e3a5f;">Password Reset Request</h2>
            <p>You requested a password reset for your School Portal account (<strong>${user.loginId}</strong>).</p>
            <p>Your one-time verification code is:</p>
            <div style="margin: 24px 0; text-align: center;">
              <span style="display: inline-block; font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #4F46E5; background: #f0f0ff; padding: 12px 24px; border-radius: 8px;">${rawOtp}</span>
            </div>
            <p>This code expires in <strong>10 minutes</strong>.</p>
            <p style="color: #888; font-size: 13px;">If you did not request this, you can safely ignore this email. Your password will not change.</p>
          </div>
        `,
      });
    } catch (error) {
      console.error('Failed to send password reset email:', (error as any)?.message || 'SMTP transport error');
      throw new InternalServerErrorException('Failed to send password reset email. Please try again later.');
    }

    return {
      message: 'If an account matches the provided details, a verification code has been sent to the registered email address.',
    };
  }

  async verifyOtp(input: VerifyOtpDto | string, otpParam?: string, clientIp?: string) {
    const dto: VerifyOtpDto =
      typeof input === 'string'
        ? { email: input, otp: otpParam || '' }
        : input;

    if (!dto.email?.trim() || !dto.otp?.trim()) {
      throw new BadRequestException('Email address and verification code are required');
    }

    const cleanKey = dto.loginId ? dto.loginId.trim().toLowerCase() : dto.email.trim().toLowerCase();
    const verifyCheck = this.rateLimiterService.checkOtpVerifyRateLimit(cleanKey);
    if (!verifyCheck.allowed) {
      throw new HttpException(
        `Too many failed verification attempts. This request has been temporarily locked. Please try again in ${verifyCheck.retryAfterSeconds} seconds.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const normalizedEnteredEmail = dto.email.trim().toLowerCase();
    let user = dto.loginId ? await this.findUserByLoginId(dto.loginId) : null;
    if (!user) {
      user = await this.prisma.user.findUnique({
        where: { email: normalizedEnteredEmail },
        select: {
          id: true,
          loginId: true,
          email: true,
          isActive: true,
          isDeleted: true,
          resetOtp: true,
          resetOtpExpiresAt: true,
        },
      });
    }

    const invalidOtpMessage = 'Invalid or expired verification code.';

    if (!user || user.isDeleted || !user.isActive || !user.resetOtp || !user.resetOtpExpiresAt) {
      this.rateLimiterService.recordOtpVerifyFailure(cleanKey);
      throw new BadRequestException(invalidOtpMessage);
    }

    if (user.resetOtpExpiresAt < new Date()) {
      this.rateLimiterService.recordOtpVerifyFailure(cleanKey);
      throw new BadRequestException(invalidOtpMessage);
    }

    const registeredEmail = (user.email || '').trim().toLowerCase();
    if (registeredEmail !== normalizedEnteredEmail) {
      this.rateLimiterService.recordOtpVerifyFailure(cleanKey);
      throw new BadRequestException(invalidOtpMessage);
    }

    const enteredHash = this.hashOtp(dto.otp);
    const isMatch = this.safeTimingCompare(enteredHash, user.resetOtp);

    if (!isMatch) {
      const failure = this.rateLimiterService.recordOtpVerifyFailure(cleanKey);
      if (failure.locked) {
        // Auto-burn the OTP upon lockout to prevent brute-force attacks
        await this.prisma.user.update({
          where: { id: user.id },
          data: { resetOtp: null, resetOtpExpiresAt: null },
        });
      }
      throw new BadRequestException(invalidOtpMessage);
    }

    // Reset failure attempts on successful verification
    this.rateLimiterService.clearOtpVerifyFailures(cleanKey);

    // Single-use authorization: generate signed resetToken and replace resetOtp in DB
    const resetToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        loginId: user.loginId,
        purpose: 'PASSWORD_RESET',
      },
      {
        expiresIn: '10m',
        secret: this.getJwtSecret(),
      },
    );

    const hashedToken = this.hashResetToken(resetToken);
    const tokenExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Invalidate the OTP immediately in the database and store hashed token
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetOtp: hashedToken, resetOtpExpiresAt: tokenExpiresAt },
    });

    return {
      message: 'Verification code verified successfully',
      resetToken,
    };
  }

  async resetPassword(
    input: ResetPasswordDto | string,
    otpParam?: string,
    newPasswordParam?: string,
    clientIp?: string,
  ) {
    const dto: ResetPasswordDto =
      typeof input === 'string'
        ? { email: input, otp: otpParam, newPassword: newPasswordParam || '' }
        : input;

    if (!dto.newPassword || dto.newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters long');
    }

    let user: any = null;

    if (dto.resetToken) {
      // Primary secure flow: Verify signed resetToken
      let payload: any;
      try {
        payload = await this.jwtService.verifyAsync(dto.resetToken, {
          secret: this.getJwtSecret(),
        });
      } catch {
        throw new BadRequestException('Invalid or expired password reset authorization.');
      }

      if (payload.purpose !== 'PASSWORD_RESET' || !payload.sub) {
        throw new BadRequestException('Invalid password reset token.');
      }

      user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          loginId: true,
          email: true,
          isActive: true,
          isDeleted: true,
          resetOtp: true,
          resetOtpExpiresAt: true,
        },
      });

      if (!user || user.isDeleted || !user.isActive || !user.resetOtp || !user.resetOtpExpiresAt) {
        throw new BadRequestException('Invalid or expired password reset request.');
      }

      if (user.resetOtpExpiresAt < new Date()) {
        throw new BadRequestException('Password reset request has expired. Please request a new code.');
      }

      const expectedHashedToken = this.hashResetToken(dto.resetToken);
      if (!this.safeTimingCompare(expectedHashedToken, user.resetOtp)) {
        throw new BadRequestException('Reset authorization token is invalid or has already been used.');
      }
    } else if (dto.otp) {
      // Fallback flow: direct OTP submission
      const cleanKey = dto.loginId ? dto.loginId.trim().toLowerCase() : (dto.email || '').trim().toLowerCase();
      const verifyCheck = this.rateLimiterService.checkOtpVerifyRateLimit(cleanKey);
      if (!verifyCheck.allowed) {
        throw new HttpException(
          `Too many failed attempts. Please try again in ${verifyCheck.retryAfterSeconds} seconds.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      user = dto.loginId ? await this.findUserByLoginId(dto.loginId) : null;
      if (!user && dto.email) {
        user = await this.prisma.user.findUnique({
          where: { email: dto.email.trim().toLowerCase() },
          select: {
            id: true,
            loginId: true,
            email: true,
            isActive: true,
            isDeleted: true,
            resetOtp: true,
            resetOtpExpiresAt: true,
          },
        });
      }

      if (!user || user.isDeleted || !user.isActive || !user.resetOtp || !user.resetOtpExpiresAt) {
        this.rateLimiterService.recordOtpVerifyFailure(cleanKey);
        throw new BadRequestException('Invalid or expired password reset request.');
      }

      if (user.resetOtpExpiresAt < new Date()) {
        this.rateLimiterService.recordOtpVerifyFailure(cleanKey);
        throw new BadRequestException('Verification code has expired. Please request a new code.');
      }

      const expectedHash = this.hashOtp(dto.otp);
      if (!this.safeTimingCompare(expectedHash, user.resetOtp)) {
        const failure = this.rateLimiterService.recordOtpVerifyFailure(cleanKey);
        if (failure.locked) {
          await this.prisma.user.update({
            where: { id: user.id },
            data: { resetOtp: null, resetOtpExpiresAt: null },
          });
        }
        throw new BadRequestException('Invalid or expired verification code.');
      }
    } else {
      throw new BadRequestException('Reset token or verification code is required.');
    }

    // Hash the new password securely
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: passwordHash,
        resetOtp: null,
        resetOtpExpiresAt: null,
      },
    });

    // Invalidate cached profile
    this.profileCache.delete(user.id);

    return { message: 'Password has been reset successfully. You can now log in.' };
  }

  /**
   * Resolves homeroom duty from ClassSection.teacherId. Subject assignments
   * live in SectionSubjectTeacher and must not grant homeroom access.
   */
  async getHomeroomContext(userId: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!teacher) {
      return { isHomeroomTeacher: false, assignedSection: null };
    }

    const section = await this.prisma.classSection.findFirst({
      where: { teacherId: teacher.id },
      select: {
        id: true,
        name: true,
        GradeLevel: { select: { name: true } },
        _count: { select: { students: true } },
      },
      orderBy: { name: 'asc' },
    });

    if (!section) {
      return { isHomeroomTeacher: false, assignedSection: null };
    }

    return {
      isHomeroomTeacher: true,
      assignedSection: {
        id: section.id,
        name: section.name,
        grade: section.GradeLevel?.name ?? null,
        studentCount: section._count.students,
      },
    };
  }

  async getProfile(userId: string) {
    const now = Date.now();
    const cached = this.profileCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.profile;
    }

    let lookup = this.inFlightProfiles.get(userId);
    if (!lookup) {
      lookup = this.prisma.user
        .findUnique({
          where: { id: userId },
          select: {
            id: true,
            loginId: true,
            email: true,
            role: true,
            name: true,
            isActive: true,
            isDeleted: true,
            Teacher: { select: { firstName: true, lastName: true } },
            Student: { select: { firstName: true, lastName: true } },
            Parent: { select: { firstName: true, lastName: true } },
          },
        })
        .finally(() => {
          this.inFlightProfiles.delete(userId);
        });
      this.inFlightProfiles.set(userId, lookup);
    }

    const user = await lookup;

    if (!user || !user.isActive || user.isDeleted) {
      this.profileCache.delete(userId);
      throw new UnauthorizedException('Unauthorized');
    }

    const safeUser = this.toSafeUser(user);
    this.profileCache.set(userId, {
      profile: safeUser,
      expiresAt: now + this.PROFILE_CACHE_TTL_MS,
    });

    return safeUser;
  }

  invalidateProfileCache(userId: string) {
    this.profileCache.delete(userId);
  }

  private async signToken(userId: string, role: Role) {
    return this.jwtService.signAsync({
      sub: userId,
      role,
    });
  }

  private mapRegisterRole(role?: string): Role {
    const normalized = role?.toLowerCase();
    if (!normalized) {
      return Role.STUDENT;
    }
    if (normalized === 'admin') {
      throw new UnauthorizedException('Admin accounts cannot be created via public registration');
    }
    if (normalized === 'teacher') {
      return Role.TEACHER;
    }
    if (normalized === 'parent') {
      return Role.PARENT;
    }
    return Role.STUDENT;
  }

  private toSafeUser(
    user: any,
    nameOverride?: string,
  ) {
    let name = (user as any).name || user.loginId; // Fallback to User.name, then loginId

    if (nameOverride) {
      name = nameOverride.trim();
    } else if (user.Student) {
      name = `${user.Student.firstName} ${user.Student.lastName}`;
    } else if (user.Teacher) {
      name = `${user.Teacher.firstName} ${user.Teacher.lastName}`;
    } else if (user.Parent) {
      name = `${user.Parent.firstName} ${user.Parent.lastName}`;
    }

    return {
      id: user.id,
      loginId: user.loginId,
      email: user.email,
      role: user.role.toLowerCase() as Lowercase<Role>,
      name,
      avatarUrl: user.avatarUrl,
    };
  }
}
