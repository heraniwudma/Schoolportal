import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LinkChildrenDto } from './dto/link-children.dto';
import { createClient } from '@supabase/supabase-js';

// ─── Safe user shape returned to the frontend ────────────────────────────────

const USER_SELECT = {
  id: true,
  loginId: true,
  email: true,
  name: true,
  role: true,
  phoneNumber: true,
  avatarUrl: true,
  isActive: true,
  isDeleted: true,
  createdAt: true,
  lastLoginAt: true,
  Student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      gender: true,
      dob: true,
      address: true,
      emergencyContact: true,
      status: true,
      institutionId: true,
      institutionName: true,
      fatherName: true,
      grandfatherName: true,
      admissionType: true,
      hasDisability: true,
      disabilityType: true,
      nationality: true,
      familyKebele: true,
      locationType: true,
      fatherEducationLevel: true,
      motherEducationLevel: true,
      economicStatus: true,
      guardianFullName: true,
      familyHeadGender: true,
      guardianEmail: true,
      guardianPhone: true,
      nationalId: true,
      residenceRegion: true,
      residenceZone: true,
      residenceWoreda: true,
      birthRegion: true,
      birthZone: true,
      birthWoreda: true,
      parentStatus: true,
      ClassSection: { select: { id: true, name: true, GradeLevel: { select: { id: true, name: true } } } },
      Parent: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phoneNumber: true,
          relationship: true,
        },
      },
    },
  },
  Teacher: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      staffId: true,
      qualification: true,
      phoneNumber: true,
      address: true,
    },
  },
  Parent: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phoneNumber: true,
      occupation: true,
      relationship: true,
      Student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNo: true,
        },
      },
    },
  },
} as const;

@Injectable()
export class UsersService {
  private supabaseUrl = process.env.DIRECT_URL ? process.env.DIRECT_URL.replace('postgres://', 'https://').split(':')[0] : '';
  private supabase = createClient(
    process.env.SUPABASE_URL || this.extractSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'fake-key-for-now',
    { auth: { persistSession: false } }
  );

  private extractSupabaseUrl() {
    const dbUrl = process.env.DATABASE_URL || '';
    const match = dbUrl.match(/@(.*?)\.pooler/);
    if (match) {
      const parts = match[1].split('-');
      const ref = parts.length > 2 ? parts[0] : match[1];
      const userMatch = dbUrl.match(/postgres\.(.*?):/);
      if (userMatch) {
        return `https://${userMatch[1]}.supabase.co`;
      }
    }
    return '';
  }

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enrollment always derives its grade and year from the selected section.
   * Clients never get to compose a free-form "Grade 10 A" value or supply a
   * separate grade ID that can drift from the section relationship.
   */
  private async resolveCanonicalSection(classSectionId: string): Promise<{
    id: string;
    academicYearId: string;
    gradeLevelId: string;
  }> {
    const section = await this.prisma.classSection.findUnique({
      where: { id: classSectionId },
      select: { id: true, academicYearId: true, gradeLevelId: true },
    });
    if (!section?.academicYearId || !section.gradeLevelId) {
      throw new BadRequestException('Select a valid class section with a grade and academic year');
    }
    const currentYear = await this.prisma.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    if (!currentYear || section.academicYearId !== currentYear.id) {
      throw new BadRequestException('Select a class section from the current academic year');
    }
    return {
      id: section.id,
      academicYearId: section.academicYearId,
      gradeLevelId: section.gradeLevelId,
    };
  }

  // ─── Query Builders (Shared between List & Export) ──────────────────────────

  private buildWhereClause(query: QueryUsersDto): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {
      isDeleted: false,
    };

    if (query.role) {
      where.role = query.role as Role;
    }

    if (query.status === 'active') {
      where.isActive = true;
    } else if (query.status === 'inactive') {
      where.isActive = false;
    }

    if (query.search) {
      const s = query.search.trim();
      const parts = s.split(/\s+/).filter(Boolean);

      const orConditions: Prisma.UserWhereInput[] = [
        { loginId: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } },
        { name: { contains: s, mode: 'insensitive' } },
        { phoneNumber: { contains: s, mode: 'insensitive' } },
        {
          Student: {
            OR: [
              { firstName: { contains: s, mode: 'insensitive' } },
              { lastName: { contains: s, mode: 'insensitive' } },
              { fatherName: { contains: s, mode: 'insensitive' } },
              { admissionNo: { contains: s, mode: 'insensitive' } },
              { emergencyContact: { contains: s, mode: 'insensitive' } },
            ],
          },
        },
        {
          Teacher: {
            OR: [
              { firstName: { contains: s, mode: 'insensitive' } },
              { lastName: { contains: s, mode: 'insensitive' } },
              { staffId: { contains: s, mode: 'insensitive' } },
              { phoneNumber: { contains: s, mode: 'insensitive' } },
            ],
          },
        },
        {
          Parent: {
            OR: [
              { firstName: { contains: s, mode: 'insensitive' } },
              { lastName: { contains: s, mode: 'insensitive' } },
              { phoneNumber: { contains: s, mode: 'insensitive' } },
            ],
          },
        },
      ];

      if (parts.length > 1) {
        orConditions.push(
          {
            Student: {
              AND: parts.map((part) => ({
                OR: [
                  { firstName: { contains: part, mode: 'insensitive' } },
                  { lastName: { contains: part, mode: 'insensitive' } },
                  { fatherName: { contains: part, mode: 'insensitive' } },
                ],
              })),
            },
          },
          {
            Teacher: {
              AND: parts.map((part) => ({
                OR: [
                  { firstName: { contains: part, mode: 'insensitive' } },
                  { lastName: { contains: part, mode: 'insensitive' } },
                ],
              })),
            },
          },
          {
            Parent: {
              AND: parts.map((part) => ({
                OR: [
                  { firstName: { contains: part, mode: 'insensitive' } },
                  { lastName: { contains: part, mode: 'insensitive' } },
                ],
              })),
            },
          },
        );
      }

      where.OR = orConditions;
    }

    return where;
  }

  private buildOrderByClause(query: QueryUsersDto): Prisma.UserOrderByWithRelationInput {
    let orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };
    if (query.sortBy === 'role') orderBy = { role: query.sortOrder ?? 'asc' };
    else if (query.sortBy === 'status') orderBy = { isActive: query.sortOrder ?? 'asc' };
    else if (query.sortBy === 'createdAt') orderBy = { createdAt: query.sortOrder ?? 'desc' };
    else if (query.sortBy === 'name') orderBy = { loginId: query.sortOrder ?? 'asc' };
    return orderBy;
  }

  // ─── LIST with search / filter / sort / pagination ──────────────────────────

  async findAll(query: QueryUsersDto, requesterId: string) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = this.buildWhereClause(query);
    const orderBy = this.buildOrderByClause(query);

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, orderBy, skip, take: limit, select: USER_SELECT }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map(this.sanitize),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── CSV EXPORT (Unpaginated dataset with current filters) ──────────────────

  private escapeCsvCell(val: unknown): string {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  async exportUsers(query: QueryUsersDto): Promise<{ csv: string; filename: string; count: number }> {
    const where = this.buildWhereClause(query);
    const orderBy = this.buildOrderByClause(query);

    const users = await this.prisma.user.findMany({
      where,
      orderBy,
      select: USER_SELECT,
    });

    if (users.length === 0) {
      throw new NotFoundException('No users match the selected filters.');
    }

    const headers = [
      'User ID',
      'Login ID',
      'Role',
      'Status',
      'First Name',
      'Last Name',
      'Full Name',
      'Email',
      'Phone Number',
      'Profile ID / Number',
      'Gender',
      'Grade Level',
      'Class Section',
      'Parent / Guardian Name',
      'Parent / Guardian Phone',
      'Teacher Qualification',
      'Linked Children Count',
      'Linked Children',
      'Created At',
      'Last Login At',
    ];

    const rows: string[] = [headers.map((h) => this.escapeCsvCell(h)).join(',')];

    for (const rawUser of users) {
      const u = rawUser as any;
      const firstName = u.Student?.firstName ?? u.Teacher?.firstName ?? u.Parent?.firstName ?? (u.name ? u.name.split(' ')[0] : '');
      const lastName = u.Student?.lastName ?? u.Teacher?.lastName ?? u.Parent?.lastName ?? (u.name ? u.name.split(' ').slice(1).join(' ') : '');

      let fullName = '';
      if (u.Student) fullName = `${u.Student.firstName} ${u.Student.lastName}`.trim();
      else if (u.Teacher) fullName = `${u.Teacher.firstName} ${u.Teacher.lastName}`.trim();
      else if (u.Parent) fullName = `${u.Parent.firstName} ${u.Parent.lastName}`.trim();
      else fullName = u.name || u.loginId;

      const profileId = u.Student?.admissionNo ?? u.Teacher?.staffId ?? '';
      const phone = u.phoneNumber ?? u.Teacher?.phoneNumber ?? u.Parent?.phoneNumber ?? '';

      const parentName = u.Student?.Parent
        ? `${u.Student.Parent.firstName} ${u.Student.Parent.lastName}`.trim()
        : (u.Student?.guardianFullName ?? '');

      const parentPhone = u.Student?.Parent?.phoneNumber ?? u.Student?.guardianPhone ?? '';

      const linkedChildrenCount = u.Parent?.Student?.length !== undefined ? String(u.Parent.Student.length) : '';
      const linkedChildren = u.Parent?.Student
        ? u.Parent.Student.map((s: any) => `${s.firstName} ${s.lastName} (${s.admissionNo})`).join('; ')
        : '';

      const rowValues = [
        u.id,
        u.loginId,
        u.role,
        u.isActive ? 'Active' : 'Inactive',
        firstName,
        lastName,
        fullName,
        u.email ?? '',
        phone,
        profileId,
        u.Student?.gender ?? '',
        u.Student?.ClassSection?.GradeLevel?.name ?? '',
        u.Student?.ClassSection?.name ?? '',
        parentName,
        parentPhone,
        u.Teacher?.qualification ?? '',
        linkedChildrenCount,
        linkedChildren,
        u.createdAt ? new Date(u.createdAt).toISOString() : '',
        u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : '',
      ];

      rows.push(rowValues.map((val) => this.escapeCsvCell(val)).join(','));
    }

    // UTF-8 BOM prefix (\uFEFF) ensures Excel and spreadsheet applications recognize Unicode / Amharic encoding
    const csvContent = '\uFEFF' + rows.join('\r\n');

    const isFiltered = Boolean(query.search || query.role || query.status);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = isFiltered ? `users-filtered-${dateStr}.csv` : `users-all-${dateStr}.csv`;

    return {
      csv: csvContent,
      filename,
      count: users.length,
    };
  }

  // ─── STATS ───────────────────────────────────────────────────────────────────

  async getStats() {
    const grouped = await this.prisma.user.groupBy({
      by: ['role', 'isActive'],
      where: { isDeleted: false },
      _count: { id: true },
    });

    let total = 0;
    let active = 0;
    let inactive = 0;
    const roleMap: Record<string, number> = {
      STUDENT: 0,
      TEACHER: 0,
      PARENT: 0,
      ADMIN: 0,
    };

    for (const item of grouped) {
      const count = item._count.id;
      total += count;
      if (item.isActive) {
        active += count;
      } else {
        inactive += count;
      }
      roleMap[item.role] = (roleMap[item.role] || 0) + count;
    }

    return {
      total,
      active,
      inactive,
      students: roleMap['STUDENT'] ?? 0,
      teachers: roleMap['TEACHER'] ?? 0,
      parents: roleMap['PARENT'] ?? 0,
      admins: roleMap['ADMIN'] ?? 0,
    };
  }

  // ─── GET ONE ──────────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  // ─── CREATE ───────────────────────────────────────────────────────────────────

  async create(dto: CreateUserDto) {
    const loginId = dto.loginId.trim();
    const email = dto.email?.trim().toLowerCase();

    // Uniqueness checks
    const existing = await this.prisma.user.findUnique({ where: { loginId }, select: { id: true } });
    if (existing) throw new ConflictException('A user with that login ID already exists');

    if (email) {
      const existingEmail = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existingEmail) throw new ConflictException('A user with that email already exists');
    }

    // For Teacher/Student uniqueness on profile IDs
    if (dto.role === 'TEACHER' && dto.staffId) {
      const dup = await this.prisma.teacher.findUnique({ where: { staffId: dto.staffId }, select: { id: true } });
      if (dup) throw new ConflictException('A teacher with that Staff ID already exists');
    }

    if (dto.role === 'STUDENT' && dto.admissionNo) {
      const dup = await this.prisma.student.findUnique({ where: { admissionNo: dto.admissionNo }, select: { id: true } });
      if (dup) throw new ConflictException('A student with that Admission Number already exists');
    }

    // Validate parent if provided for Student creation
    let validatedParentId: string | null = null;
    if (dto.role === 'STUDENT' && dto.parentId) {
      const parent = await this.prisma.parent.findUnique({
        where: { id: dto.parentId },
        include: { User: true },
      });
      if (!parent) {
        throw new NotFoundException('Selected parent does not exist');
      }
      if (!parent.User || parent.User.isDeleted || !parent.User.isActive) {
        throw new BadRequestException('Cannot link student to an inactive or deleted parent account');
      }
      validatedParentId = parent.id;
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const userId = randomUUID();
    const now = new Date();
    const section = dto.role === 'STUDENT' && dto.classSectionId
      ? await this.resolveCanonicalSection(dto.classSectionId)
      : null;

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          id: userId,
          loginId,
          email,
          password: passwordHash,
          role: dto.role as Role,
          phoneNumber: dto.phoneNumber,
          avatarUrl: dto.avatarUrl,
          isActive: true,
          isDeleted: false,
        },
        select: USER_SELECT,
      });

      // Create the role-specific profile record
      if (dto.role === 'STUDENT') {
        const student = await tx.student.create({
          data: {
            id: randomUUID(),
            userId,
            firstName: dto.firstName,
            lastName: dto.lastName,
            admissionNo: dto.admissionNo ?? loginId,
            gender: dto.gender,
            address: dto.address,
            emergencyContact: dto.emergencyContact,
            // Compatibility mirror only. StudentEnrollment is the canonical
            // class assignment used by rosters, grade entry, and attendance.
            classSectionId: section?.id ?? dto.classSectionId ?? null,
            parentId: validatedParentId,
            updatedAt: now,
            ...(dto.dob ? { dob: new Date(dto.dob) } : {}),
          },
        });
        if (section) {
          await tx.studentEnrollment.create({
            data: {
              studentId: student.id,
              academicYearId: section.academicYearId,
              gradeLevelId: section.gradeLevelId,
              classSectionId: section.id,
              status: 'ACTIVE',
            },
          });
        }
      } else if (dto.role === 'TEACHER') {
        await tx.teacher.create({
          data: {
            id: randomUUID(),
            userId,
            firstName: dto.firstName,
            lastName: dto.lastName,
            staffId: dto.staffId,
            qualification: dto.qualification,
            phoneNumber: dto.phoneNumber,
            address: dto.address,
            updatedAt: now,
          },
        });
      } else if (dto.role === 'PARENT') {
        await tx.parent.create({
          data: {
            id: randomUUID(),
            userId,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phoneNumber: dto.phoneNumber,
            occupation: dto.occupation,
            relationship: dto.relationship,
            updatedAt: now,
          },
        });
      }
      // ADMIN — no profile table, basic User record is sufficient

      return created;
    });

    // Re-fetch to include relations
    return this.findOne(userId);
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateUserDto, requesterId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id, isDeleted: false },
      select: { id: true, role: true, isActive: true, Student: { select: { id: true } }, Teacher: { select: { id: true } }, Parent: { select: { id: true } } },
    });
    if (!existing) throw new NotFoundException('User not found');

    // Prevent admin from deactivating themselves
    if (id === requesterId && dto.isActive === false) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }

    // loginId uniqueness if changing
    if (dto.loginId) {
      const dup = await this.prisma.user.findFirst({ where: { loginId: dto.loginId, id: { not: id } }, select: { id: true } });
      if (dup) throw new ConflictException('Login ID already in use');
    }

    // email uniqueness
    if (dto.email) {
      const email = dto.email.trim().toLowerCase();
      const dup = await this.prisma.user.findFirst({ where: { email, id: { not: id } }, select: { id: true } });
      if (dup) throw new ConflictException('Email already in use');
      dto.email = email;
    }

    // Validate parent if supplied for Student update
    let updatedParentId: string | null | undefined = undefined;
    if (existing.role === 'STUDENT' && dto.parentId !== undefined) {
      if (dto.parentId) {
        const parent = await this.prisma.parent.findUnique({
          where: { id: dto.parentId },
          include: { User: true },
        });
        if (!parent) {
          throw new NotFoundException('Selected parent does not exist');
        }
        if (!parent.User || parent.User.isDeleted || !parent.User.isActive) {
          throw new BadRequestException('Cannot link student to an inactive or deleted parent account');
        }
        updatedParentId = parent.id;
      } else {
        updatedParentId = null; // Unlink parent if explicitly null or empty string
      }
    }

    const now = new Date();
    const section = existing.role === 'STUDENT' && dto.classSectionId
      ? await this.resolveCanonicalSection(dto.classSectionId)
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          ...(dto.loginId !== undefined && { loginId: dto.loginId }),
          ...(dto.email !== undefined && { email: dto.email || null }),
          ...(dto.phoneNumber !== undefined && { phoneNumber: dto.phoneNumber }),
          ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });

      // Update profile record
      const profileData: Record<string, unknown> = {
        updatedAt: now,
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
      };

      if (existing.role === 'STUDENT' && existing.Student) {
        await tx.student.update({
          where: { userId: id },
          data: {
            ...profileData,
            ...(dto.admissionNo !== undefined && { admissionNo: dto.admissionNo }),
            ...(dto.classSectionId !== undefined && { classSectionId: section?.id ?? null }),
            ...(dto.gender !== undefined && { gender: dto.gender }),
            ...(dto.address !== undefined && { address: dto.address }),
            ...(dto.emergencyContact !== undefined && { emergencyContact: dto.emergencyContact }),
            ...(dto.dob !== undefined && { dob: dto.dob ? new Date(dto.dob) : null }),
            ...(updatedParentId !== undefined && { parentId: updatedParentId }),
          },
        });
        if (dto.classSectionId !== undefined) {
          if (!section) {
            const currentYear = await tx.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
            if (currentYear) {
              await tx.studentEnrollment.updateMany({
                where: { studentId: existing.Student.id, academicYearId: currentYear.id, status: 'ACTIVE' },
                data: { status: 'INACTIVE' },
              });
            }
          } else {
            await tx.studentEnrollment.upsert({
              where: { studentId_academicYearId: { studentId: existing.Student.id, academicYearId: section.academicYearId } },
              update: { gradeLevelId: section.gradeLevelId, classSectionId: section.id, status: 'ACTIVE' },
              create: {
                studentId: existing.Student.id,
                academicYearId: section.academicYearId,
                gradeLevelId: section.gradeLevelId,
                classSectionId: section.id,
                status: 'ACTIVE',
              },
            });
          }
        }
      } else if (existing.role === 'TEACHER' && existing.Teacher) {
        await tx.teacher.update({
          where: { userId: id },
          data: {
            ...profileData,
            ...(dto.staffId !== undefined && { staffId: dto.staffId }),
            ...(dto.qualification !== undefined && { qualification: dto.qualification }),
            ...(dto.phoneNumber !== undefined && { phoneNumber: dto.phoneNumber }),
            ...(dto.address !== undefined && { address: dto.address }),
          },
        });
      } else if (existing.role === 'PARENT' && existing.Parent) {
        await tx.parent.update({
          where: { userId: id },
          data: {
            ...profileData,
            ...(dto.phoneNumber !== undefined && { phoneNumber: dto.phoneNumber }),
            ...(dto.occupation !== undefined && { occupation: dto.occupation }),
            ...(dto.relationship !== undefined && { relationship: dto.relationship }),
          },
        });
      }
    });

    return this.findOne(id);
  }

  // ─── TOGGLE ACTIVE ────────────────────────────────────────────────────────────

  async setActive(id: string, isActive: boolean, requesterId: string) {
    if (id === requesterId && !isActive) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    const user = await this.prisma.user.findUnique({ where: { id, isDeleted: false }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.user.update({ where: { id }, data: { isActive } });
    return this.findOne(id);
  }

  // ─── RESET PASSWORD ───────────────────────────────────────────────────────────

  async resetPassword(id: string, dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id, isDeleted: false }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    const hash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id }, data: { password: hash } });
    return { message: 'Password reset successfully' };
  }

  // ─── SOFT DELETE ──────────────────────────────────────────────────────────────

  async remove(id: string, requesterId: string) {
    if (id === requesterId) {
      throw new ForbiddenException('You cannot delete your own account');
    }
    const user = await this.prisma.user.findUnique({ where: { id, isDeleted: false }, select: { id: true, role: true } });
    if (!user) throw new NotFoundException('User not found');

    // Check remaining admins before deleting an admin
    if (user.role === 'ADMIN') {
      const adminCount = await this.prisma.user.count({ where: { role: 'ADMIN', isDeleted: false, isActive: true } });
      if (adminCount <= 1) throw new ForbiddenException('Cannot delete the last active admin account');
    }

    // Soft delete
    await this.prisma.user.update({ where: { id }, data: { isDeleted: true, isActive: false } });
    return { message: 'User deleted successfully' };
  }

  // ─── GET CLASS SECTIONS (for dropdowns) ─────────────────────────────────────

  async getClassSections(academicYearId?: string) {
    let yearId = academicYearId?.trim();
    if (!yearId) {
      const currentYear = await this.prisma.academicYear.findFirst({
        where: { isCurrent: true },
        select: { id: true },
      });
      yearId = currentYear?.id;
    }
    if (!yearId) return [];
    const sections = await this.prisma.classSection.findMany({
      where: {
        academicYearId: yearId,
        gradeLevelId: { not: null },
      },
      select: { id: true, name: true, gradeLevelId: true, GradeLevel: { select: { name: true, gradeNumber: true } } },
      orderBy: [{ GradeLevel: { gradeNumber: 'asc' } }, { name: 'asc' }],
    });
    return sections.map((section) => ({
      ...section,
      displayName: `${section.GradeLevel?.name?.startsWith('Grade') ? section.GradeLevel.name : `Grade ${section.GradeLevel?.name || ''}`.trim()} ${section.name}`.trim(),
    }));
  }

  // ─── GET PARENTS LIST (for dropdowns) ────────────────────────────────────────

  async getParentsList() {
    return this.prisma.parent.findMany({
      where: {
        User: {
          isActive: true,
          isDeleted: false,
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        relationship: true,
        User: {
          select: {
            loginId: true,
            email: true,
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  // ─── GET STUDENTS LOOKUP (for Admin Parent-Child Linking) ───────────────────

  async getStudentsLookup() {
    const students = await this.prisma.student.findMany({
      where: {
        User: {
          isDeleted: false,
        },
      },
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        gender: true,
        status: true,
        parentId: true,
        classSectionId: true,
        ClassSection: {
          select: {
            id: true,
            name: true,
            roomNumber: true,
            GradeLevel: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        Parent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
            relationship: true,
            User: {
              select: {
                loginId: true,
                email: true,
              },
            },
          },
        },
        User: {
          select: {
            id: true,
            loginId: true,
            email: true,
            isActive: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    return students.map((s) => ({
      id: s.id,
      admissionNo: s.admissionNo,
      firstName: s.firstName,
      lastName: s.lastName,
      fullName: `${s.firstName} ${s.lastName}`.trim(),
      gender: s.gender,
      status: s.status,
      isActive: s.User?.isActive ?? true,
      avatarUrl: s.User?.avatarUrl || null,
      classSectionId: s.classSectionId,
      classSectionName: s.ClassSection?.name || null,
      gradeLevelName: s.ClassSection?.GradeLevel?.name || null,
      parentId: s.parentId,
      parent: s.Parent
        ? {
            id: s.Parent.id,
            fullName: `${s.Parent.firstName} ${s.Parent.lastName}`.trim(),
            loginId: s.Parent.User?.loginId || '',
            phoneNumber: s.Parent.phoneNumber || null,
            relationship: s.Parent.relationship || null,
          }
        : null,
    }));
  }

  // ─── GET PARENT LINKED CHILDREN ─────────────────────────────────────────────

  async getParentChildren(parentIdOrUserId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: {
        OR: [{ id: parentIdOrUserId }, { userId: parentIdOrUserId }],
        User: { isDeleted: false },
      },
      include: {
        User: {
          select: {
            id: true,
            loginId: true,
            email: true,
            isActive: true,
          },
        },
        Student: {
          where: {
            User: { isDeleted: false },
          },
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            gender: true,
            status: true,
            classSectionId: true,
            ClassSection: {
              select: {
                id: true,
                name: true,
                roomNumber: true,
                GradeLevel: { select: { id: true, name: true } },
              },
            },
            User: {
              select: {
                id: true,
                loginId: true,
                isActive: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        },
      },
    });

    if (!parent) {
      throw new NotFoundException('Parent record not found');
    }

    return {
      parent: {
        id: parent.id,
        userId: parent.userId,
        firstName: parent.firstName,
        lastName: parent.lastName,
        fullName: `${parent.firstName} ${parent.lastName}`.trim(),
        loginId: parent.User?.loginId,
        email: parent.User?.email,
        phoneNumber: parent.phoneNumber,
        relationship: parent.relationship,
      },
      children: parent.Student.map((s) => ({
        id: s.id,
        admissionNo: s.admissionNo,
        firstName: s.firstName,
        lastName: s.lastName,
        fullName: `${s.firstName} ${s.lastName}`.trim(),
        gender: s.gender,
        status: s.status,
        isActive: s.User?.isActive ?? true,
        avatarUrl: s.User?.avatarUrl || null,
        classSectionName: s.ClassSection?.name || null,
        gradeLevelName: s.ClassSection?.GradeLevel?.name || null,
      })),
    };
  }

  // ─── LINK / UNLINK PARENT CHILDREN ──────────────────────────────────────────

  async linkParentChildren(parentIdOrUserId: string, dto: LinkChildrenDto) {
    const parent = await this.prisma.parent.findFirst({
      where: {
        OR: [{ id: parentIdOrUserId }, { userId: parentIdOrUserId }],
      },
      include: {
        User: true,
      },
    });

    if (!parent) {
      throw new NotFoundException('Parent record not found');
    }

    if (!parent.User || parent.User.isDeleted) {
      throw new BadRequestException('Cannot link children to a deleted parent account');
    }

    const { studentIds } = dto;

    // Validate that all requested student IDs exist and are active/non-deleted
    if (studentIds.length > 0) {
      const foundStudents = await this.prisma.student.findMany({
        where: {
          id: { in: studentIds },
          User: { isDeleted: false },
        },
        select: { id: true, firstName: true, lastName: true, admissionNo: true },
      });

      if (foundStudents.length !== studentIds.length) {
        const foundIdSet = new Set(foundStudents.map((s) => s.id));
        const missingIds = studentIds.filter((id) => !foundIdSet.has(id));
        throw new NotFoundException(`One or more student records were not found or are deleted: ${missingIds.join(', ')}`);
      }
    }

    // Atomic transaction: unlink removed children, link selected children
    await this.prisma.$transaction(async (tx) => {
      // 1. Unlink students previously linked to this parent who are not in the new studentIds list
      await tx.student.updateMany({
        where: {
          parentId: parent.id,
          id: { notIn: studentIds },
        },
        data: {
          parentId: null,
        },
      });

      // 2. Link all selected students to this parent
      if (studentIds.length > 0) {
        await tx.student.updateMany({
          where: {
            id: { in: studentIds },
          },
          data: {
            parentId: parent.id,
          },
        });
      }
    });

    // Return the updated parent children view
    return this.getParentChildren(parent.id);
  }

  // ─── ACCOUNT MANAGEMENT FOR AUTHENTICATED USER ─────────────────────────────

  async getAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('Account not found');
    return user;
  }

  async updateAccount(userId: string, data: {
    name?: string;
    loginId?: string;
    email?: string;
    student?: object;
    firstName?: string;
    lastName?: string;
    staffId?: string;
    phoneNumber?: string;
    address?: string;
    qualification?: string;
  }) {
    // Check if loginId is unique if changing
    if (data.loginId) {
      const existing = await this.prisma.user.findUnique({ where: { loginId: data.loginId } });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Login ID is already in use by another account');
      }
    }
    // Check if email is unique if changing
    if (data.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email is already in use by another account');
      }
    }

    const { student, firstName, lastName, staffId, phoneNumber, address, qualification, ...userData } = data;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user) throw new NotFoundException('Account not found');
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

    const updatedUser = await this.prisma.$transaction(async (tx) => {
      if (student) {
        const existingStudent = await tx.student.findUnique({ where: { userId }, select: { id: true } });
        if (!existingStudent) throw new BadRequestException('Student profile not found');
        await tx.student.update({
          where: { id: existingStudent.id },
          data: student as Prisma.StudentUpdateInput,
        });
      }
      if (user.role === Role.TEACHER && (firstName !== undefined || lastName !== undefined || staffId !== undefined || phoneNumber !== undefined || address !== undefined || qualification !== undefined)) {
        await tx.teacher.update({
          where: { userId },
          data: { firstName, lastName, staffId, phoneNumber, address, qualification },
        });
      }
      return tx.user.update({
        where: { id: userId },
        data: {
          ...userData,
          name: fullName || userData.name,
        },
        select: USER_SELECT,
      });
    });
    return updatedUser;
  }

  async updatePassword(userId: string, data: { currentPassword?: string; newPassword?: string; confirmPassword?: string }) {
    if (!data.currentPassword || !data.newPassword || !data.confirmPassword) {
      throw new BadRequestException('Current password, new password, and confirmation are required');
    }
    if (data.newPassword !== data.confirmPassword) {
      throw new BadRequestException('New password and confirmation do not match');
    }
    if (data.newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters long');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Account not found');

    const isValid = await bcrypt.compare(data.currentPassword, user.password);
    if (!isValid) {
      throw new ForbiddenException('Current password incorrect');
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: passwordHash },
    });
    return { success: true, message: 'Password changed successfully.' };
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Image file is required');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Account not found');

    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '').toLowerCase();
    const fileName = `${userId}-${Date.now()}-${sanitizedName}`;

    const { error: uploadError } = await this.supabase.storage
      .from('avatars')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) {
      throw new BadRequestException(`Avatar upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: publicData } = this.supabase.storage.from('avatars').getPublicUrl(fileName);

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: publicData.publicUrl },
      select: USER_SELECT,
    });

    return updatedUser;
  }

  async removeAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Account not found');

    if (user.avatarUrl) {
      // Extract filename from the URL assuming standard supabase storage URL structure
      const match = user.avatarUrl.match(/\/avatars\/(.*)$/);
      if (match) {
        await this.supabase.storage.from('avatars').remove([match[1]]);
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: null },
      select: USER_SELECT,
    });

    return updatedUser;
  }

  // Submission files use the same server-side Supabase client as avatars.  The
  // client and its service-role credential never leave the backend.
  async uploadSubmissionFile(studentId: string, assignmentId: string, file: Express.Multer.File) {
    const bucket = 'submissions';
    const bucketInfo = await this.supabase.storage.getBucket(bucket);
    if (bucketInfo.error) {
      const { error } = await this.supabase.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: '10485760',
      });
      if (error && !error.message.toLowerCase().includes('already exists')) {
        throw new InternalServerErrorException('Submission storage is unavailable. Please try again later.');
      }
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '').toLowerCase() || 'submission';
    const path = `${studentId}/${assignmentId}/${randomUUID()}-${safeName}`;
    const { error } = await this.supabase.storage.from(bucket).upload(path, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });
    if (error) throw new InternalServerErrorException('Submission file upload failed. Please try again later.');
    return { bucket, path };
  }

  async removeSubmissionFile(path?: string | null) {
    if (!path) return;
    await this.supabase.storage.from('submissions').remove([path]);
  }

  // ─── SANITIZE — strip password from result ───────────────────────────────────

  private sanitize(user: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safe } = user as { password?: unknown } & Record<string, unknown>;
    return safe;
  }
}
