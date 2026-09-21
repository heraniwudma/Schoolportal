import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { TimetableService } from './timetable.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreatePeriodDto } from './dto/create-period.dto';
import { UpdatePeriodDto } from './dto/update-period.dto';
import { BulkSaveScheduleDto } from './dto/bulk-save-schedule.dto';
import { PublishScheduleDto } from './dto/publish-schedule.dto';
import { PdfExportService } from '../reports/pdf-export.service';

@Controller('timetable')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TimetableController {
  constructor(
    private readonly timetableService: TimetableService,
    private readonly pdfExportService: PdfExportService,
  ) {}

  // ─── Period Management Endpoints ────────────────────────────────────────────

  @Get('periods')
  @Roles('ADMIN', 'TEACHER')
  getPeriods(
    @Query('academicYearId') academicYearId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.timetableService.getPeriods(
      academicYearId,
      includeInactive === 'true',
    );
  }

  @Post('periods')
  @Roles('ADMIN')
  createPeriod(@Body() dto: CreatePeriodDto) {
    return this.timetableService.createPeriod(dto);
  }

  @Patch('periods/:id')
  @Roles('ADMIN')
  updatePeriod(@Param('id') id: string, @Body() dto: UpdatePeriodDto) {
    return this.timetableService.updatePeriod(id, dto);
  }

  @Delete('periods/:id')
  @Roles('ADMIN')
  deletePeriod(@Param('id') id: string) {
    return this.timetableService.deletePeriod(id);
  }

  // ─── Section Schedule Management Endpoints ──────────────────────────────────

  @Get('section/:classSectionId')
  @Roles('ADMIN', 'TEACHER')
  getSectionSchedule(
    @Param('classSectionId') classSectionId: string,
    @Req() req: any,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.timetableService.getSectionSchedule(
      classSectionId,
      req.user,
      academicYearId,
    );
  }

  @Put('section/:classSectionId/draft')
  @Roles('ADMIN')
  saveDraftSchedule(
    @Param('classSectionId') classSectionId: string,
    @Body() dto: BulkSaveScheduleDto,
  ) {
    return this.timetableService.saveDraftSchedule(classSectionId, dto);
  }

  @Put('section/:classSectionId/publish')
  @Roles('ADMIN')
  publishSchedule(
    @Param('classSectionId') classSectionId: string,
    @Body() dto: PublishScheduleDto,
  ) {
    return this.timetableService.publishSchedule(classSectionId, dto);
  }

  @Delete('entries/:id')
  @Roles('ADMIN')
  deleteEntry(@Param('id') id: string) {
    return this.timetableService.deleteEntry(id);
  }

  // ─── Consumer Schedule Endpoints (Sub-Stage 2.4) ────────────────────────────

  @Get('me/teacher')
  @Roles('TEACHER')
  getTeacherSchedule(
    @Req() req: any,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.timetableService.getTeacherSchedule(req.user.id, academicYearId);
  }

  @Get('me/teacher/pdf')
  @Roles('TEACHER')
  async getTeacherSchedulePdf(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Query('academicYearId') academicYearId?: string,
    @Query('day') day?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.timetableService.getTeacherSchedule(req.user.id, academicYearId);
    if (!data || !data.entries || data.entries.length === 0) {
      throw new BadRequestException('No schedule entries found to generate PDF.');
    }

    const buffer = await this.pdfExportService.generateTeacherSchedulePdf(data, { day, search });
    const cleanName = (data.teacher.fullName || 'Teacher').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanYear = (data.academicYear.year || 'Schedule').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Teacher_Schedule_${cleanName}_${cleanYear}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    return new StreamableFile(buffer);
  }

  @Get('section/:classSectionId/pdf')
  @Roles('ADMIN', 'TEACHER')
  async getSectionSchedulePdf(
    @Param('classSectionId') classSectionId: string,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Query('academicYearId') academicYearId?: string,
    @Query('day') day?: string,
    @Query('search') search?: string,
  ) {
    // Strictly enforces teacher authorization for classSectionId via getSectionSchedule
    const data = await this.timetableService.getSectionSchedule(
      classSectionId,
      req.user,
      academicYearId,
    );
    if (!data || !data.entries || data.entries.length === 0) {
      throw new BadRequestException('No schedule entries found to generate PDF for this section.');
    }

    const buffer = await this.pdfExportService.generateSectionSchedulePdf(data, { day, search });
    const cleanSection = (data.classSection.name || 'Section').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanYear = (data.academicYear.year || 'Schedule').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Class_Schedule_${cleanSection}_${cleanYear}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    return new StreamableFile(buffer);
  }

  @Get('teacher/:teacherId')
  @Roles('ADMIN')
  getTeacherScheduleById(
    @Param('teacherId') teacherId: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.timetableService.getTeacherScheduleById(teacherId, academicYearId);
  }

  @Get('me/student')
  @Roles('STUDENT')
  getStudentSchedule(
    @Req() req: any,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.timetableService.getStudentSchedule(req.user.id, academicYearId);
  }

  @Get('me/student/pdf')
  @Roles('STUDENT')
  async getStudentSchedulePdf(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Query('academicYearId') academicYearId?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.timetableService.getStudentSchedule(req.user.id, academicYearId);
    if (!data || !data.entries || data.entries.length === 0) {
      throw new BadRequestException('No published timetable available for your class to generate PDF.');
    }

    const buffer = await this.pdfExportService.generateStudentSchedulePdf(data, { search });
    const cleanName = (data.student.fullName || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanSection = (data.classSection?.name || 'Class').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanYear = (data.academicYear.year || 'Schedule').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Student_Schedule_${cleanName}_${cleanSection}_${cleanYear}.pdf`;

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    return new StreamableFile(buffer);
  }
}
