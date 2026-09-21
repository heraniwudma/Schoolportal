import { Controller, Get, Param, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ReportCardsService } from './report-cards.service';
import { TeachersService } from '../teachers/teachers.service';
import { PdfExportService } from '../reports/pdf-export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('report-cards')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.TEACHER)
export class ReportCardsController {
  constructor(
    private readonly reportCardsService: ReportCardsService,
    private readonly teachersService: TeachersService,
    private readonly pdfExportService: PdfExportService,
  ) {}

  @Get('filters/terms')
  getTerms(@Query('academicYearId') academicYearId: string) {
    return this.reportCardsService.getTerms(academicYearId);
  }

  @Get('students')
  getStudents(
    @Query('classSectionId') classSectionId: string, 
    @Query('search') search?: string
  ) {
    return this.reportCardsService.getStudents(classSectionId, search);
  }

  @Get('class-roster')
  async getRoster(
    @Req() req: any, 
    @Query('classSectionId') classSectionId: string
  ) {
    // If user is a teacher, verify their live homeroom assignment
    if (req.user?.role === Role.TEACHER) {
      await this.teachersService.verifyHomeroomAccess(req.user.id, classSectionId);
    }
    return this.reportCardsService.generateClassRoster(classSectionId);
  }

  @Get('student/:id')
  async getReportCard(
    @Req() req: any,
    @Param('id') studentId: string,
    @Query('classSectionId') classSectionId: string,
    @Query('termId') termId: string,
  ) {
    if (req.user?.role === Role.TEACHER) {
      await this.teachersService.verifyHomeroomAccess(req.user.id, classSectionId);
    }
    return this.reportCardsService.getReportCard(studentId, classSectionId, termId);
  }

  @Get('compiled')
  async getCompiledReportCards(
    @Req() req: any,
    @Query('classSectionId') classSectionId: string,
    @Query('academicYearId') academicYearId: string,
  ) {
    if (req.user?.role === Role.TEACHER) {
      await this.teachersService.verifyHomeroomAccess(req.user.id, classSectionId);
    }
    return this.reportCardsService.getCompiledReportCards(classSectionId, academicYearId);
  }

  @Get('compiled/pdf')
  async getCompiledReportCardsPdf(
    @Req() req: any,
    @Query('classSectionId') classSectionId: string,
    @Query('academicYearId') academicYearId: string,
    @Query('search') search: string,
    @Query('studentIds') studentIds: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (req.user?.role === Role.TEACHER) {
      await this.teachersService.verifyHomeroomAccess(req.user.id, classSectionId);
    }
    const cards = await this.reportCardsService.getCompiledReportCards(classSectionId, academicYearId);

    // Apply studentIds filter if specified (comma separated)
    let filtered = cards;
    if (studentIds) {
      const idSet = new Set(studentIds.split(',').map((id) => id.trim()).filter(Boolean));
      if (idSet.size > 0) {
        filtered = filtered.filter((s: any) => idSet.has(s.studentId));
      }
    }

    // Apply search filter if specified
    const effectiveSearch = (search || '').trim().toLowerCase();
    if (effectiveSearch) {
      filtered = filtered.filter(
        (s: any) =>
          `${s.firstName || ''} ${s.lastName || ''}`.toLowerCase().includes(effectiveSearch) ||
          (s.admissionNo || '').toLowerCase().includes(effectiveSearch),
      );
    }

    const first = cards[0];
    const sectionName = first?.classSectionName || 'Class';
    const gradeLevel = first?.gradeLevel || '';
    const sectionDisplay = `${gradeLevel ? `${gradeLevel} ` : ''}${sectionName}`.trim();
    const homeroomTeacher = first?.homeroomTeacher || 'Unassigned';
    const yearName = first?.academicYear || academicYearId || '2025/2026';

    const buffer = await this.pdfExportService.generateCompiledReportCardsPdf(
      filtered,
      {
        displayName: sectionDisplay,
        name: sectionName,
        gradeLevel,
        homeroomTeacher,
        academicYear: yearName,
      },
      yearName,
      effectiveSearch,
    );

    const safeSection = sectionDisplay.replace(/[^a-zA-Z0-9]/g, '_');
    const safeYear = String(yearName).replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Student_Report_${safeSection}_${safeYear}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    return new StreamableFile(buffer);
  }
}