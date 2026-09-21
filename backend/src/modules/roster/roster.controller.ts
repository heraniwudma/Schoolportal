import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, ValidationPipe, Req, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { RosterService } from './roster.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TeachersService } from '../teachers/teachers.service';
import { PdfExportService } from '../reports/pdf-export.service';

@Controller('roster')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RosterController {
  constructor(
    private readonly rosterService: RosterService,
    private readonly teachersService: TeachersService,
    private readonly pdfExportService: PdfExportService,
  ) {}

  @Get('consolidated')
  @Roles('TEACHER', 'ADMIN')
  async getConsolidated(@Query('academicYearId') academicYearId: string, @Query('classSectionId') classSectionId: string, @Req() req: any) {
    if (req.user?.role === 'TEACHER') {
      await this.teachersService.verifyHomeroomAccess(req.user.id, classSectionId);
    }
    return this.rosterService.getConsolidatedRoster(academicYearId, classSectionId);
  }

  @Get('consolidated/pdf')
  @Roles('TEACHER', 'ADMIN')
  async getConsolidatedPdf(
    @Query('academicYearId') academicYearId: string,
    @Query('classSectionId') classSectionId: string,
    @Query('search') search: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (req.user?.role === 'TEACHER') {
      await this.teachersService.verifyHomeroomAccess(req.user.id, classSectionId);
    }
    const data = await this.rosterService.getConsolidatedRoster(academicYearId, classSectionId);

    const effectiveSearch = (search || '').trim().toLowerCase();
    let filteredStudents = data.students;
    if (effectiveSearch) {
      filteredStudents = data.students.filter((s: any) =>
        (s.studentName || '').toLowerCase().includes(effectiveSearch) ||
        (s.admissionNo || '').toLowerCase().includes(effectiveSearch) ||
        (s.sex || '').toLowerCase() === effectiveSearch,
      );
    }

    const filteredData = {
      ...data,
      students: filteredStudents,
    };

    const buffer = await this.pdfExportService.generateConsolidatedRosterPdf(
      filteredData,
      academicYearId,
      effectiveSearch,
    );

    const sectionLabel = data.section?.name || 'Class';
    const safeSection = sectionLabel.replace(/[^a-zA-Z0-9]/g, '_');
    const safeYear = (academicYearId || '2025_2026').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Roster_${safeSection}_${safeYear}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    return new StreamableFile(buffer);
  }


  @Patch('students/:studentId/conduct')
  @Roles('TEACHER', 'ADMIN')
  async updateConduct(
    @Param('studentId') studentId: string,
    @Body('classSectionId') classSectionId: string,
    @Body('academicYearId') academicYearId: string,
    @Body('conduct') conduct: string,
    @Req() req: any,
  ) {
    if (req.user?.role === 'TEACHER' && classSectionId) {
      await this.teachersService.verifyHomeroomAccess(req.user.id, classSectionId);
    }
    return this.rosterService.updateStudentConduct(studentId, classSectionId, academicYearId, conduct);
  }

  @Get()
  @Roles('ADMIN', 'TEACHER')
  async getRoster(
    @Query('academicYearId') academicYearId: string,
    @Query('classSectionId') classSectionId: string
  ) {
    return this.rosterService.getRoster(academicYearId, classSectionId);
  }

  @Get('enrolled-students')
  @Roles('ADMIN', 'TEACHER')
  async getEnrolledStudents(
    @Query('academicYearId') academicYearId: string,
    @Query('classSectionId') classSectionId: string,
  ) {
    return this.rosterService.getEnrolledStudents(academicYearId, classSectionId);
  }

  @Get('summary')
  @Roles('ADMIN', 'TEACHER')
  async getSummary(
    @Query('academicYearId') academicYearId: string,
    @Query('classSectionId') classSectionId: string
  ) {
    return this.rosterService.getSummary(academicYearId, classSectionId);
  }

  @Post('enroll')
  @Roles('ADMIN')
  async enrollStudent(@Body(new ValidationPipe({ whitelist: true })) body: any) {
    return this.rosterService.enrollStudent({
      studentId: body.studentId,
      academicYearId: body.academicYearId,
      gradeLevelId: body.gradeLevelId,
      classSectionId: body.classSectionId,
      enrollmentDate: body.enrollmentDate,
      status: body.status || 'ACTIVE'
    });
  }
}
