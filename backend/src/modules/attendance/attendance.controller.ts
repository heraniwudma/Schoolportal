import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Req, ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as crypto from 'crypto';

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper to resolve all classSectionIds a teacher is authorized for
   * (combining subject-teaching and homeroom sections).
   * Returns null if the user is not a teacher (e.g. admin).
   */
  private async getTeacherAssignedSectionIds(userId: string): Promise<string[] | null> {
    const teacher = await this.prisma.teacher.findFirst({
      where: {
        OR: [{ id: userId }, { userId: userId }],
      },
      select: {
        id: true,
        subjectSections: { select: { classSectionId: true } },
        ClassSection: { select: { id: true } },
      },
    });

    if (!teacher) return null; // Caller is not a teacher (e.g. admin)

    const subjectSectionIds = teacher.subjectSections.map((s) => s.classSectionId);
    const homeroomSectionIds = teacher.ClassSection.map((s) => s.id);
    return [...new Set([...subjectSectionIds, ...homeroomSectionIds])];
  }

  @Get()
  async getPastAttendance(
    @Req() req: Request & { user: { id: string } },
    @Query('classSectionId') classSectionId?: string,
    @Query('date') date?: string,
    @Query('status') status?: string,
    @Query('studentName') studentName?: string,
  ) {
    const where: any = {};
    const assignedSectionIds = await this.getTeacherAssignedSectionIds(req.user.id);

    if (assignedSectionIds !== null) {
      if (classSectionId) {
        if (!assignedSectionIds.includes(classSectionId)) {
          throw new ForbiddenException('You are not authorized to view attendance for this section');
        }
        where.classSectionId = classSectionId;
      } else {
        where.classSectionId = { in: assignedSectionIds };
      }
    } else if (classSectionId) {
      where.classSectionId = classSectionId;
    }

    if (date) {
      const startDate = new Date(date);
      startDate.setUTCHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setUTCHours(23, 59, 59, 999);

      where.date = {
        gte: startDate,
        lte: endDate,
      };
    }

    if (status) where.status = status;
    if (studentName) {
      const s = studentName.trim();
      const parts = s.split(/\s+/).filter(Boolean);
      if (parts.length > 1) {
        where.Student = {
          AND: parts.map((part) => ({
            OR: [
              { firstName: { contains: part, mode: 'insensitive' } },
              { lastName: { contains: part, mode: 'insensitive' } },
              { fatherName: { contains: part, mode: 'insensitive' } },
            ],
          })),
        };
      } else {
        where.Student = {
          OR: [
            { firstName: { contains: s, mode: 'insensitive' } },
            { lastName: { contains: s, mode: 'insensitive' } },
            { admissionNo: { contains: s, mode: 'insensitive' } },
          ],
        };
      }
    }

    const records = await this.prisma.studentAttendance.findMany({
      where,
      include: {
        Student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
          },
        },
        ClassSection: {
          select: {
            id: true,
            name: true,
            GradeLevel: { select: { name: true } },
          },
        },
      },
      orderBy: [
        { date: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return records;
  }

  @Get('students')
  async getSectionStudents(
    @Req() req: Request & { user: { id: string } },
    @Query('classSectionId') classSectionId: string,
  ) {
    if (!classSectionId) {
      throw new BadRequestException('classSectionId is required');
    }

    const assignedSectionIds = await this.getTeacherAssignedSectionIds(req.user.id);
    if (assignedSectionIds !== null && !assignedSectionIds.includes(classSectionId)) {
      throw new ForbiddenException('You are not authorized to access students of this section');
    }

    // Check StudentEnrollment first
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        classSectionId,
        status: 'ACTIVE',
      },
      select: {
        Student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
          },
        },
      },
      orderBy: [{ Student: { lastName: 'asc' } }, { Student: { firstName: 'asc' } }],
    });

    if (enrollments.length > 0) {
      return enrollments.map((e) => ({
        id: e.Student.id,
        firstName: e.Student.firstName,
        lastName: e.Student.lastName,
        name: `${e.Student.firstName} ${e.Student.lastName}`.trim(),
        admissionNo: e.Student.admissionNo,
        status: 'PRESENT',
      }));
    }

    // Fallback to direct Student records
    const students = await this.prisma.student.findMany({
      where: {
        classSectionId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNo: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    return students.map((s) => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      name: `${s.firstName} ${s.lastName}`.trim(),
      admissionNo: s.admissionNo,
      status: 'PRESENT',
    }));
  }

  @Patch(':id')
  async updateAttendanceRecord(
    @Param('id') id: string,
    @Body() body: { status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'; remarks?: string },
    @Req() req: Request & { user: { id: string } },
  ) {
    const existing = await this.prisma.studentAttendance.findUnique({
      where: { id },
      select: { id: true, classSectionId: true },
    });

    if (!existing) {
      throw new NotFoundException('Attendance record not found');
    }

    const assignedSectionIds = await this.getTeacherAssignedSectionIds(req.user.id);
    if (assignedSectionIds !== null && !assignedSectionIds.includes(existing.classSectionId)) {
      throw new ForbiddenException('You are not authorized to edit attendance for this section');
    }

    const updated = await this.prisma.studentAttendance.update({
      where: { id },
      data: {
        status: body.status,
        remarks: body.remarks !== undefined ? body.remarks : undefined,
        recordedById: req.user.id,
        updatedAt: new Date(),
      },
      include: {
        Student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
          },
        },
        ClassSection: {
          select: {
            id: true,
            name: true,
            GradeLevel: { select: { name: true } },
          },
        },
      },
    });

    return {
      message: 'Attendance record updated successfully',
      record: {
        id: updated.id,
        studentId: updated.studentId,
        studentName: `${updated.Student?.firstName || ''} ${updated.Student?.lastName || ''}`.trim(),
        admissionNo: updated.Student?.admissionNo || null,
        classSectionId: updated.classSectionId,
        className: updated.ClassSection
          ? `${updated.ClassSection.GradeLevel?.name ? `Grade ${updated.ClassSection.GradeLevel.name} - ` : ''}${updated.ClassSection.name}`
          : 'Assigned Class',
        date: updated.date.toISOString(),
        period: updated.period ?? 1,
        status: updated.status,
        remarks: updated.remarks || '',
      },
    };
  }

  @Post()
  async saveAttendance(
    @Body() body: any, 
    @Req() req: Request & { user: { id: string } }
  ) {
    const { classSectionId, date, period, records } = body;
    if (!classSectionId || !records || !Array.isArray(records)) {
      throw new BadRequestException('Invalid attendance submission payload');
    }

    const assignedSectionIds = await this.getTeacherAssignedSectionIds(req.user.id);
    if (assignedSectionIds !== null && !assignedSectionIds.includes(classSectionId)) {
      throw new ForbiddenException('You are not authorized to record attendance for this section');
    }

    const teacherId = req.user?.id;
    const parsedDate = new Date(date || Date.now());
    parsedDate.setUTCHours(0, 0, 0, 0);
    const parsedPeriod = Number(period) || 1;

    const attendancePromises = records.map((record: any) => {
      return this.prisma.studentAttendance.upsert({
        where: {
          studentId_date_period: {
            studentId: record.studentId,
            date: parsedDate,
            period: parsedPeriod,
          },
        },
        update: {
          status: record.status,
          remarks: record.remarks || null,
          recordedById: teacherId,
          updatedAt: new Date(),
        },
        create: {
          id: crypto.randomUUID(),
          classSectionId: classSectionId,
          studentId: record.studentId,
          recordedById: teacherId,
          date: parsedDate,
          period: parsedPeriod,
          status: record.status,
          remarks: record.remarks || null,
          updatedAt: new Date(),
        } as any,
      });
    });

    await Promise.all(attendancePromises);
    return { message: 'Attendance saved successfully' };
  }
}