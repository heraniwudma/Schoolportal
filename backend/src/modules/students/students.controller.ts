import { Body, Controller, Get, HttpStatus, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors, ParseFilePipeBuilder } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StudentsService } from './students.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { FileInterceptor } from '@nestjs/platform-express';

const safeUserSelect = {
  id: true,
  loginId: true,
  name: true,
  email: true,
  phoneNumber: true,
  avatarUrl: true,
  role: true,
} as const;

@Controller('students')
@UseGuards(JwtAuthGuard)
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly prisma: PrismaService,
  ) {}

  // ==========================================
  // 1. STATIC & "ME" ROUTES (Must be at the top)
  // ==========================================

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Get('me/attendance')
  async getMyAttendance(@Req() req: Request & { user: { id: string } }) {
    const userId = req.user.id;
    return await this.studentsService.getMyAttendance(userId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Get('me/courses')
  getMyCourses(@Req() req: Request & { user: { id: string } }) {
    return this.studentsService.getMyCourses(req.user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Get('me/schedule')
  getMySchedule(
    @Req() req: Request & { user: { id: string } },
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.studentsService.getMySchedule(req.user.id, academicYearId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Get('me/results')
  getMyResults(@Req() req: Request & { user: { id: string } }) {
    return this.studentsService.getMyResults(req.user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Get('my-assignments')
  async getMyAssignments(@Req() req: Request & { user: { id: string } }) {
    return this.studentsService.getMyAssignments(req.user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Get('my-assignments/:id')
  async getMyAssignment(@Param('id') id: string, @Req() req: Request & { user: { id: string } }) {
    return this.studentsService.getMyAssignment(req.user.id, id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Get('my-assignments/:id/resource')
  async getMyAssignmentResource(@Param('id') id: string, @Req() req: Request & { user: { id: string } }) {
    return this.studentsService.getAssignmentResourceUrl(req.user.id, id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Post('my-assignments/:id/submission')
  @UseInterceptors(FileInterceptor('file'))
  async submitMyAssignment(
    @Param('id') id: string,
    @Body('content') content: string | undefined,
    @Req() req: Request & { user: { id: string } },
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 10 * 1024 * 1024, message: 'File is too large. Maximum size is 10MB.' })
        .build({ errorHttpStatusCode: HttpStatus.PAYLOAD_TOO_LARGE, fileIsRequired: false }),
    ) file?: Express.Multer.File,
  ) {
    return this.studentsService.submitMyAssignment(req.user.id, id, file, content);
  }

  @Get('class-sections')
  async getClassSections() {
    return this.prisma.classSection.findMany();
  }

  @Get('by-section')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  async getStudentsBySection(
    @Query('section') section?: string,
    @Query('subject') subject?: string,
  ) {
    return this.prisma.student.findMany({
      where: {
        OR: [
          ...(section ? [
            { classSectionId: section },       
            { ClassSection: { name: section } } 
          ] : [])
        ],
      },
      include: {
        ClassSection: true,
        User: { select: safeUserSelect },
      },
    });
  }

  // ==========================================
  // 2. PARAMETERIZED & GENERIC ROUTES (At the bottom)
  // ==========================================

  @Get('by-class-section/:classSectionId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  async getStudentsByClassSectionId(
    @Param('classSectionId') classSectionId: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.prisma.student.findMany({
      where: {
        StudentEnrollment: {
          some: {
            classSectionId,
            status: 'ACTIVE',
            ...(academicYearId ? { academicYearId } : {}),
          },
        },
      },
      include: {
        ClassSection: true,
        User: { select: safeUserSelect },
      },
    });
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  async getStudentsByClass(@Query('className') className?: string) {
    return this.prisma.student.findMany({
      where: className ? {
        OR: [
          { classSectionId: className },
          { ClassSection: { name: className } },
        ],
      } : undefined,
      include: { ClassSection: true, User: { select: safeUserSelect } },
    });
  }
}
