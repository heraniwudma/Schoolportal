import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, Req, UnauthorizedException,
} from '@nestjs/common';
import { ExaminationsService } from './examinations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('examinations')
export class ExaminationsController {
  constructor(private readonly examinationsService: ExaminationsService) {}

  // ── Teacher: form metadata ─────────────────────────────────────────────────
  @Get('form-data')
  @UseGuards(JwtAuthGuard)
  getFormData(@Req() req: any) {
    return this.examinationsService.getTeacherFormData(req.user.id);
  }

  // ── Teacher: own exam list ─────────────────────────────────────────────────
  @Get('teacher')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  getTeacherExams(@Req() req: any) {
    const userId = req.user?.sub || req.user?.id;
    if (!userId) throw new UnauthorizedException('User unauthenticated');
    return this.examinationsService.findTeacherExaminations(userId);
  }

  // ── Teacher: own drafts ────────────────────────────────────────────────────
  @Get('drafts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  getDrafts(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.examinationsService.getDrafts(userId);
  }

  // ── Teacher: own rejected exams ────────────────────────────────────────────
  @Get('rejected-for-teacher')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  getRejectedForTeacher(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.examinationsService.findRejectedForTeacher(userId);
  }

  // ── Teacher: own approved exams (ready to publish) ───────────────────────
  @Get('approved-for-teacher')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  getApprovedForTeacher(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.examinationsService.findApprovedForTeacher(userId);
  }

  // ── Teacher: already-published exams (deployed to students) ──────────────
  @Get('published-for-teacher')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  getPublishedForTeacher(@Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.examinationsService.findPublishedForTeacher(userId);
  }

  // ── Teacher / Admin: single exam details ──────────────────────────────────
  @Get('details/:id')
  @UseGuards(JwtAuthGuard)
  getExaminationDetails(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.examinationsService.getExaminationById(id, userId, req.user?.role);
  }

  // ── Teacher: publish an APPROVED exam to students ─────────────────────────
  @Post(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  publishExam(
    @Param('id') id: string,
    @Body() body: { windowStart: string; windowEnd: string },
    @Req() req: any,
  ) {
    return this.examinationsService.publishExam(id, body, req.user.id);
  }

  // ── Teacher: sessions awaiting resume approval ────────────────────────────
  @Get('sessions/interrupted')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  getInterruptedSessions(@Req() req: any) {
    return this.examinationsService.getInterruptedSessions(req.user.id);
  }

  // ── Teacher: approve a student's resume request ───────────────────────────
  @Patch('sessions/:sessionId/approve-resume')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  approveResume(@Param('sessionId') sessionId: string, @Req() req: any) {
    return this.examinationsService.approveResume(sessionId, req.user.id);
  }

  // ── Admin: all APPROVED exams ─────────────────────────────────────────────
  @Get('approved')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getApproved() {
    return this.examinationsService.findApprovedExaminations();
  }

  // ── Admin: all PENDING exams ──────────────────────────────────────────────
  @Get('pending')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  getPending() {
    return this.examinationsService.findPendingExaminations();
  }

  // ── Student: available exams (approved, in section, with window state) ────
  @Get('student/available')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  getStudentExams(@Req() req: any) {
    return this.examinationsService.getStudentAvailableExams(req.user.id);
  }

  // ── Student: poll resume approval status while waiting ────────────────────
  @Get(':examId/session/resume-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  pollResumeStatus(@Param('examId') examId: string, @Req() req: any) {
    return this.examinationsService.pollResumeStatus(examId, req.user.id);
  }

  // ── Student: start session (time-lock enforced server-side) ───────────────
  @Post(':examId/session/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  startSession(
    @Param('examId') examId: string,
    @Body() body: { deviceFingerprint?: string },
    @Req() req: any,
  ) {
    return this.examinationsService.startSession(examId, req.user.id, body.deviceFingerprint);
  }

  // ── Student: periodic answer auto-save ───────────────────────────────────
  @Post(':examId/session/save')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  saveProgress(
    @Param('examId') examId: string,
    @Body() body: { sessionToken: string; answers: Record<string, string>; timeRemainingSeconds: number },
    @Req() req: any,
  ) {
    return this.examinationsService.saveProgress(examId, req.user.id, body);
  }

  // ── Student: final submission ─────────────────────────────────────────────
  @Post(':examId/session/submit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  submitSession(
    @Param('examId') examId: string,
    @Body() body: { sessionToken: string; answers: Record<string, string> },
    @Req() req: any,
  ) {
    return this.examinationsService.submitSession(examId, req.user.id, body);
  }

  // ── Student: report abrupt interruption (triggers AWAITING_RESUME) ────────
  @Post(':examId/session/interrupt')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  reportInterruption(
    @Param('examId') examId: string,
    @Body() body: { sessionToken: string },
    @Req() req: any,
  ) {
    return this.examinationsService.reportInterruption(examId, req.user.id, body);
  }

  // ── Teacher: set delivery window ──────────────────────────────────────────
  @Patch(':id/schedule')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  scheduleWindow(
    @Param('id') id: string,
    @Body() body: { windowStart: string; windowEnd: string },
    @Req() req: any,
  ) {
    return this.examinationsService.scheduleWindow(id, body, req.user.id);
  }

  // ── Teacher: push back start/end times by N minutes ──────────────────────
  @Post(':id/delay')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  delayExam(
    @Param('id') id: string,
    @Body() body: { minutes: number },
    @Req() req: any,
  ) {
    return this.examinationsService.delayExam(id, body, req.user.id);
  }

  // ── Teacher: create exam ──────────────────────────────────────────────────
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  createExamination(@Body() dto: any, @Req() req: any) {
    const userId = req.user?.sub || req.user?.id;
    return this.examinationsService.createExamination(dto, userId);
  }

  // ── Teacher: update exam ──────────────────────────────────────────────────
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  updateExamination(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.examinationsService.updateExamination(id, dto, userId);
  }

  // ── Teacher: resubmit rejected exam for admin review ───────────────────────
  @Post(':id/resubmit')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  resubmitExam(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.examinationsService.resubmitExam(id, dto, userId);
  }

  // ── Teacher: delete draft ─────────────────────────────────────────────────
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  deleteDraft(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id || req.user?.sub;
    return this.examinationsService.deleteDraft(id, userId);
  }

  // ── Admin: review (approve/reject) ────────────────────────────────────────
  @Patch(':id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  reviewExam(
    @Param('id') id: string,
    @Body() body: { status: 'APPROVED' | 'REJECTED'; rejectionReason?: string },
    @Req() req: any,
  ) {
    const adminUserId = req.user?.id || req.user?.sub;
    return this.examinationsService.reviewExam(id, body.status, body.rejectionReason, adminUserId);
  }

  // ── Teacher: release / retract exam review & results ──────────────────────
  @Post(':id/release-results')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  toggleResultsRelease(
    @Param('id') id: string,
    @Body() body: { release: boolean },
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    return this.examinationsService.toggleResultsRelease(id, userId, body.release ?? true);
  }

  // ── Teacher: get class exam performance & results summary ─────────────────
  @Get(':id/results-summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  getTeacherExamResultsSummary(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.sub || req.user?.id;
    return this.examinationsService.getTeacherExamResultsSummary(id, userId);
  }

  // ── Teacher: reset / delete student submission ───────────────────────────
  @Delete(':id/results/:studentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.TEACHER)
  deleteStudentExamResult(
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || req.user?.id;
    return this.examinationsService.deleteStudentExamResult(id, studentId, userId);
  }

  // ── Student: view graded review with correct answers (once released) ──────
  @Get(':id/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.STUDENT)
  getStudentExamReview(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.sub || req.user?.id;
    return this.examinationsService.getStudentExamReview(id, userId);
  }

  // ── Student: legacy submit & auto-grade (kept for compatibility) ──────────
  @Post('submit')
  submitExam(@Body() dto: any) {
    return this.examinationsService.submitAndAutoGrade(dto);
  }
}
