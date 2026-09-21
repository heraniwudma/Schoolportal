import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CalculationService } from '../results/calculation.service';
import { PdfExportService } from './pdf-export.service';

// ─── Shared grade-letter helper ───────────────────────────────────────────────
function gradeLetter(pct: number): string {
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

@Injectable()
export class ReportsService {
  private readonly calcService: CalculationService;
  private readonly pdfService: PdfExportService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculationService?: CalculationService,
    private readonly pdfExportService?: PdfExportService,
  ) {
    this.calcService = calculationService ?? new CalculationService(prisma);
    this.pdfService = pdfExportService ?? new PdfExportService();
  }

  // ── Existing homeroom roster ─────────────────────────────────────────────

  async generateClassRoster(classSectionId: string, academicYearId: string, term?: string) {
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { classSectionId, academicYearId, status: 'ACTIVE' },
      include: {
        Student: {
          select: { id: true, firstName: true, lastName: true, admissionNo: true },
        },
      },
      orderBy: [{ Student: { lastName: 'asc' } }, { Student: { firstName: 'asc' } }],
    });

    const whereClause: any = {
      classSectionId,
      academicYearId,
      status: 'SUBMITTED',
    };
    if (term) {
      whereClause.term = term;
    }

    const results = await (this.prisma as any).subjectResult.findMany({
      where: whereClause,
      include: { Subject: true },
    });

    const studentScoresMap = new Map<
      string,
      { student: any; subjects: Record<string, number>; totalMarks: number }
    >();

    enrollments.forEach((e: any) => {
      studentScoresMap.set(e.Student.id, { student: e.Student, subjects: {}, totalMarks: 0 });
    });

    results.forEach((res: any) => {
      const entry = studentScoresMap.get(res.studentId);
      if (entry) {
        entry.subjects[res.Subject.name] = res.marks;
        entry.totalMarks += res.marks;
      }
    });

    const rosterList = Array.from(studentScoresMap.values()).sort(
      (a, b) => b.totalMarks - a.totalMarks,
    );
    const totalSubjects = new Set(results.map((r: any) => r.subjectId)).size || 1;

    const review = await (this.prisma as any).classRosterReview.findUnique({
      where: { classSectionId_academicYearId: { classSectionId, academicYearId } },
      select: { conductData: true },
    });
    const conductMap = (review?.conductData as Record<string, string>) || {};

    return rosterList.map((item, index) => ({
      rank: index + 1,
      studentId: item.student.id,
      admissionNo: item.student.admissionNo,
      studentName: `${item.student.firstName} ${item.student.lastName}`,
      subjectScores: item.subjects,
      totalMarks: item.totalMarks,
      average: Number((item.totalMarks / totalSubjects).toFixed(2)),
      conduct: conductMap[item.student.id] || null,
    }));
  }

  // ── NEW: admin sections summary (optimized batch aggregation) ───────────

  /**
   * List all class sections for an academic year with:
   * - homeroom teacher name
   * - enrolled student count
   * - total assigned subjects and how many are fully submitted
   * - overall submission status: 'complete' | 'partial' | 'none'
   */
  async getAdminSectionsSummary(academicYearId?: string) {
    // Resolve academic year
    let yearId = academicYearId;
    if (!yearId) {
      const current = await this.prisma.academicYear.findFirst({
        where: { isCurrent: true },
        select: { id: true },
      });
      yearId = current?.id;
    }
    if (!yearId) return [];

    const sections = await this.prisma.classSection.findMany({
      where: { academicYearId: yearId, gradeLevelId: { not: null } },
      include: {
        GradeLevel: { select: { name: true, gradeNumber: true } },
        Teacher: { select: { firstName: true, lastName: true } },
        AcademicYear: { select: { year: true } },
      },
      orderBy: [
        { GradeLevel: { gradeNumber: 'asc' } },
        { name: 'asc' },
      ],
    });

    if (sections.length === 0) return [];

    const sectionIds = sections.map((s) => s.id);

    // Batch query 1: count active enrollments per section
    const enrollments = await this.prisma.studentEnrollment.groupBy({
      by: ['classSectionId'],
      where: { classSectionId: { in: sectionIds }, academicYearId: yearId, status: 'ACTIVE' },
      _count: { studentId: true },
    });
    const enrollmentMap = new Map<string, number>();
    enrollments.forEach((e) => {
      if (e.classSectionId) enrollmentMap.set(e.classSectionId, e._count.studentId);
    });

    // Batch query 2: get all assigned subjects per section
    const assignedSubjects = await (this.prisma as any).sectionSubjectTeacher.findMany({
      where: { classSectionId: { in: sectionIds }, academicYearId: yearId },
      select: { classSectionId: true, subjectId: true },
    });
    const assignedMap = new Map<string, string[]>();
    assignedSubjects.forEach((a: any) => {
      const list = assignedMap.get(a.classSectionId) || [];
      list.push(a.subjectId);
      assignedMap.set(a.classSectionId, list);
    });

    // Batch query 3: count submitted results per section & subject
    const submittedResults = await (this.prisma as any).subjectResult.groupBy({
      by: ['classSectionId', 'subjectId'],
      where: { classSectionId: { in: sectionIds }, academicYearId: yearId, status: 'SUBMITTED' },
      _count: { id: true },
    });
    const submittedMap = new Map<string, number>();
    submittedResults.forEach((r: any) => {
      submittedMap.set(`${r.classSectionId}_${r.subjectId}`, r._count.id);
    });

    // Batch query 4: get existing roster reviews
    const reviews = await (this.prisma as any).classRosterReview.findMany({
      where: { classSectionId: { in: sectionIds }, academicYearId: yearId },
    });
    const reviewMap = new Map<string, any>();
    reviews.forEach((r: any) => reviewMap.set(r.classSectionId, r));

    return sections.map((section) => {
      const enrolledCount = enrollmentMap.get(section.id) || 0;
      const subjects = assignedMap.get(section.id) || [];
      const totalSubjects = subjects.length;

      let submittedSubjects = 0;
      if (enrolledCount > 0 && totalSubjects > 0) {
        for (const subjectId of subjects) {
          const count = submittedMap.get(`${section.id}_${subjectId}`) || 0;
          if (count >= enrolledCount) {
            submittedSubjects++;
          }
        }
      }

      const submissionStatus =
        totalSubjects === 0
          ? 'none'
          : submittedSubjects === totalSubjects
          ? 'complete'
          : submittedSubjects > 0
          ? 'partial'
          : 'none';

      const homeroomTeacher = section.Teacher
        ? `${section.Teacher.firstName} ${section.Teacher.lastName}`.trim()
        : null;

      const gradeName = section.GradeLevel?.name ?? '';
      const displayName = /^grade\b/i.test(gradeName)
        ? `${gradeName} ${section.name}`
        : `Grade ${gradeName} ${section.name}`.trim();

      const review = reviewMap.get(section.id);
      const computedStatus =
        review?.status === 'APPROVED'
          ? 'Approved'
          : review?.status === 'SUBMITTED_TO_ADMIN'
          ? 'Submitted'
          : review?.status === 'REJECTED'
          ? 'Rejected'
          : review?.status === 'DRAFT'
          ? 'Draft'
          : submissionStatus === 'complete'
          ? 'Submitted'
          : submissionStatus === 'partial'
          ? 'Pending Review'
          : 'Draft';

      const conductData = (review?.conductData as Record<string, string>) || {};
      let conductCompletedCount = 0;
      if (enrolledCount > 0 && conductData) {
        conductCompletedCount = Object.values(conductData).filter((v) =>
          ['A', 'B', 'C'].includes(v),
        ).length;
      }
      const conductStatus =
        enrolledCount === 0
          ? 'none'
          : conductCompletedCount >= enrolledCount
          ? 'complete'
          : conductCompletedCount > 0
          ? 'partial'
          : 'none';

      return {
        id: section.id,
        name: section.name,
        displayName,
        gradeLevelName: gradeName,
        academicYearId: yearId,
        academicYearName: section.AcademicYear?.year ?? null,
        homeroomTeacher,
        enrolledCount,
        totalSubjects,
        submittedSubjects,
        submissionStatus,
        conductCompleted: conductCompletedCount,
        conductStatus,
        reviewStatus: review?.status ?? null,
        reviewId: review?.id ?? null,
        rejectionReason: review?.rejectionReason ?? null,
        submittedAt: review?.submittedAt?.toISOString() ?? null,
        reviewedAt: review?.reviewedAt?.toISOString() ?? null,
        status: computedStatus,
        submissionType: (review?.conductData as any)?._submissionType || (review?.status === 'SUBMITTED_TO_ADMIN' || review?.status === 'APPROVED' ? 'both' : null),
        rosterSubmittedAt: (review?.conductData as any)?._rosterSubmittedAt || review?.submittedAt?.toISOString() || null,
        reportCardSubmittedAt: (review?.conductData as any)?._reportCardSubmittedAt || review?.submittedAt?.toISOString() || null,
        isReportCardSubmitted: Boolean((review?.conductData as any)?._reportCardSubmittedAt || review?.conductData?._submissionType === 'report-cards' || review?.conductData?._submissionType === 'both' || (review?.status === 'SUBMITTED_TO_ADMIN' || review?.status === 'APPROVED')),
        isRosterSubmitted: Boolean((review?.conductData as any)?._rosterSubmittedAt || review?.conductData?._submissionType === 'roster' || review?.conductData?._submissionType === 'both' || review?.submittedAt),
      };
    });
  }

  /**
   * Admin endpoint to list all roster reviews with optional filtering.
   * Excludes all sensitive credentials (passwords, tokens, secrets).
   */
  async getRosterReviews(query?: {
    status?: string;
    academicYearId?: string;
    classSectionId?: string;
  }) {
    const whereClause: any = {};
    if (query?.status) {
      whereClause.status = query.status;
    }
    if (query?.academicYearId) {
      whereClause.academicYearId = query.academicYearId;
    }
    if (query?.classSectionId) {
      whereClause.classSectionId = query.classSectionId;
    }

    const reviews = await (this.prisma as any).classRosterReview.findMany({
      where: whereClause,
      include: {
        classSection: {
          select: {
            id: true,
            name: true,
            status: true,
            academicYearId: true,
            GradeLevel: { select: { id: true, name: true, gradeNumber: true } },
            AcademicYear: { select: { id: true, year: true } },
            Teacher: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        homeroomTeacher: {
          select: { id: true, firstName: true, lastName: true, staffId: true },
        },
        submittedBy: {
          select: { id: true, name: true, role: true, email: true },
        },
        reviewedBy: {
          select: { id: true, name: true, role: true, email: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    const results = [];
    for (const rev of reviews) {
      const enrolledCount = await this.prisma.studentEnrollment.count({
        where: {
          classSectionId: rev.classSectionId,
          academicYearId: rev.academicYearId,
          status: 'ACTIVE',
        },
      });

      const assignedSubjects = await (this.prisma as any).sectionSubjectTeacher.findMany({
        where: { classSectionId: rev.classSectionId, academicYearId: rev.academicYearId },
        select: { subjectId: true },
      });
      const totalSubjects = assignedSubjects.length;

      let submittedSubjects = 0;
      if (enrolledCount > 0 && totalSubjects > 0) {
        for (const { subjectId } of assignedSubjects) {
          const count = await (this.prisma as any).subjectResult.count({
            where: {
              classSectionId: rev.classSectionId,
              subjectId,
              academicYearId: rev.academicYearId,
              status: 'SUBMITTED',
            },
          });
          if (count >= enrolledCount) {
            submittedSubjects++;
          }
        }
      }

      const conductData = (rev.conductData as Record<string, string>) || {};
      const conductCompletedCount = Object.values(conductData).filter((v) =>
        ['A', 'B', 'C'].includes(v),
      ).length;

      const gradeName = rev.classSection?.GradeLevel?.name ?? '';
      const displayName = /^grade\b/i.test(gradeName)
        ? `${gradeName} ${rev.classSection?.name}`
        : `Grade ${gradeName} ${rev.classSection?.name}`.trim();

      const teacherName = rev.homeroomTeacher
        ? `${rev.homeroomTeacher.firstName} ${rev.homeroomTeacher.lastName}`.trim()
        : rev.classSection?.Teacher
        ? `${rev.classSection.Teacher.firstName} ${rev.classSection.Teacher.lastName}`.trim()
        : 'Unassigned';

      results.push({
        reviewId: rev.id,
        classSectionId: rev.classSectionId,
        academicYearId: rev.academicYearId,
        sectionName: rev.classSection?.name ?? '',
        displayName,
        gradeLevelName: gradeName,
        academicYear: rev.classSection?.AcademicYear?.year ?? rev.academicYearId,
        homeroomTeacher: teacherName,
        enrolledCount,
        totalSubjects,
        submittedSubjects,
        subjectCompletion:
          totalSubjects === 0
            ? 'none'
            : submittedSubjects >= totalSubjects
            ? 'complete'
            : submittedSubjects > 0
            ? 'partial'
            : 'none',
        conductCompleted: conductCompletedCount,
        conductCompletion:
          enrolledCount === 0
            ? 'none'
            : conductCompletedCount >= enrolledCount
            ? 'complete'
            : conductCompletedCount > 0
            ? 'partial'
            : 'none',
        status: rev.status,
        submittedAt: rev.submittedAt?.toISOString() ?? null,
        submittedBy: rev.submittedBy
          ? { id: rev.submittedBy.id, name: rev.submittedBy.name, role: rev.submittedBy.role }
          : null,
        reviewedAt: rev.reviewedAt?.toISOString() ?? null,
        reviewedBy: rev.reviewedBy
          ? { id: rev.reviewedBy.id, name: rev.reviewedBy.name, role: rev.reviewedBy.role }
          : null,
        rejectionReason: rev.rejectionReason,
        conductData: rev.conductData,
        submissionType: (rev.conductData as any)?._submissionType || (rev.status === 'DRAFT' ? 'roster' : 'both'),
        rosterSubmittedAt: (rev.conductData as any)?._rosterSubmittedAt || rev.submittedAt?.toISOString() || null,
        reportCardSubmittedAt: (rev.conductData as any)?._reportCardSubmittedAt || rev.submittedAt?.toISOString() || null,
        isRosterSubmitted: Boolean((rev.conductData as any)?._rosterSubmittedAt || rev.conductData?._submissionType === 'roster' || rev.conductData?._submissionType === 'both' || rev.submittedAt),
        isReportCardSubmitted: Boolean((rev.conductData as any)?._reportCardSubmittedAt || rev.conductData?._submissionType === 'report-cards' || rev.conductData?._submissionType === 'both' || (rev.status === 'SUBMITTED_TO_ADMIN' || rev.status === 'APPROVED')),
        createdAt: rev.createdAt?.toISOString() ?? null,
        updatedAt: rev.updatedAt?.toISOString() ?? null,
      });
    }

    return results;
  }

  /**
   * Authoritative calculation data for Admin full roster view.
   * Verifies section and academic year matching.
   */
  async getFullSectionRoster(classSectionId: string, academicYearId: string) {
    if (!classSectionId || !academicYearId) {
      throw new BadRequestException('Class Section ID and Academic Year ID are required');
    }
    const section = await this.prisma.classSection.findUnique({
      where: { id: classSectionId },
    });
    if (!section) {
      throw new NotFoundException('Class section not found');
    }
    if (section.academicYearId && section.academicYearId !== academicYearId) {
      throw new BadRequestException('Class section does not belong to the selected academic year');
    }
    return this.calcService.calculateSectionRoster(academicYearId, classSectionId);
  }

  // ── NEW: compiled report cards for admin ────────────────────────────────

  /**
   * Mirrors ReportCardsService.getCompiledReportCards but is accessible to
   * ADMIN without requiring homeroom-teacher ownership validation.
   */
  async getCompiledReportCards(classSectionId: string, academicYearId: string) {
    const section = await this.prisma.classSection.findUnique({
      where: { id: classSectionId },
      include: { GradeLevel: true, Teacher: true, AcademicYear: true },
    });
    if (!section) throw new NotFoundException('Class section not found');

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { classSectionId, academicYearId, status: 'ACTIVE' },
      include: {
        Student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            gender: true,
            dob: true,
          },
        },
      },
      orderBy: { Student: { lastName: 'asc' } },
    });

    const subjectResults = await (this.prisma as any).subjectResult.findMany({
      where: { classSectionId, academicYearId, status: 'SUBMITTED' },
      include: { Subject: { select: { id: true, name: true, code: true } } },
    });

    // Build subject list in canonical order
    const subjectOrder = [
      'Afaan Oromoo','Amharic','English','Maths','Math','Biology',
      'Chemistry','Physics','Citizenship','History','Geography',
      'Economics','ICT','HPE',
    ];
    const subjectMap = new Map<string, { id: string; name: string; code: string }>();
    subjectResults.forEach((r: any) => subjectMap.set(r.subjectId, r.Subject));
    const subjects = Array.from(subjectMap.values()).sort((a, b) => {
      const ai = subjectOrder.findIndex((n) => n.toLowerCase() === a.name.toLowerCase());
      const bi = subjectOrder.findIndex((n) => n.toLowerCase() === b.name.toLowerCase());
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name);
    });

    const termKeys = ['TERM_1', 'TERM_2', 'TERM_3', 'TERM_4'];
    const avg = (vals: Array<number | null>) => {
      const present = vals.filter((v): v is number => v !== null);
      return present.length
        ? Math.round((present.reduce((s, v) => s + v, 0) / present.length) * 10) / 10
        : null;
    };

    const absentCounts = (
      await this.prisma.studentAttendance.findMany({
        where: { classSectionId, status: 'ABSENT' },
        select: { studentId: true },
      })
    ).reduce((m, r) => { m.set(r.studentId, (m.get(r.studentId) || 0) + 1); return m; }, new Map<string, number>());

    const compiled = enrollments.map((enrollment: any) => {
      const student = enrollment.Student;
      const studentResults = subjectResults.filter((r: any) => r.studentId === student.id);

      const subjectScores = subjects.map((subj) => {
        const scores = termKeys.map(
          (t) => studentResults.find((r: any) => r.subjectId === subj.id && r.term === t)?.marks ?? null,
        );
        return {
          subjectId: subj.id,
          subjectName: subj.name,
          subjectCode: subj.code,
          term1: scores[0], term2: scores[1], term3: scores[2], term4: scores[3],
          sem1Avg: avg([scores[0], scores[1]]),
          sem2Avg: avg([scores[2], scores[3]]),
          yearlyAvg: avg(scores),
        };
      });

      const scored = subjectScores.filter((s) => s.yearlyAvg !== null);
      const overallTotal = Math.round(scored.reduce((sum, s) => sum + (s.yearlyAvg || 0), 0) * 10) / 10;
      const overallAverage = scored.length ? Math.round((overallTotal / scored.length) * 10) / 10 : 0;

      return {
        studentId: student.id,
        admissionNo: student.admissionNo,
        firstName: student.firstName,
        lastName: student.lastName,
        gender: student.gender ?? 'N/A',
        age: student.dob
          ? Math.floor((Date.now() - new Date(student.dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
          : 0,
        academicYear: section.AcademicYear?.year ?? academicYearId,
        gradeLevel: section.GradeLevel?.name ?? '',
        classSectionName: section.name,
        homeroomTeacher: section.Teacher
          ? `${section.Teacher.firstName} ${section.Teacher.lastName}`
          : 'Unassigned',
        subjectResults: subjectScores,
        overallTotal,
        overallAverage,
        overallRank: 0,          // filled below after sorting
        absentDays: absentCounts.get(student.id) || 0,
        conduct: 'A',
      };
    });

    compiled.sort((a, b) => b.overallAverage - a.overallAverage);
    compiled.forEach((c, i) => { c.overallRank = c.overallAverage > 0 ? i + 1 : 0; });
    return compiled;
  }

  // ── Class Roster Review Workflow Operations ───────────────────────────────

  /**
   * Validate and sanitize conduct entries.
   * Ensures every student is actively enrolled in classSectionId & academicYearId.
   * Ensures every provided conduct value is strictly 'A', 'B', or 'C'.
   */
  private async validateConductData(
    classSectionId: string,
    academicYearId: string,
    conductData: Record<string, string>,
    existingConduct: Record<string, string> = {},
  ): Promise<Record<string, string>> {
    if (!conductData || typeof conductData !== 'object' || Array.isArray(conductData)) {
      throw new BadRequestException('conductData must be a key-value object of student IDs to conduct grades');
    }

    const activeEnrollments = await this.prisma.studentEnrollment.findMany({
      where: { classSectionId, academicYearId, status: 'ACTIVE' },
      select: { studentId: true },
    });
    const validStudentIds = new Set(activeEnrollments.map((e) => e.studentId));

    const updatedConduct: Record<string, string> = { ...existingConduct };

    for (const [studentId, rawValue] of Object.entries(conductData)) {
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        delete updatedConduct[studentId];
        continue;
      }

      if (!validStudentIds.has(studentId)) {
        throw new BadRequestException(`Student ${studentId} is not actively enrolled in this section and academic year`);
      }

      const val = typeof rawValue === 'string' ? rawValue.trim() : '';
      if (!['A', 'B', 'C'].includes(val)) {
        throw new BadRequestException(
          `Invalid conduct value "${rawValue}" for student ${studentId}. Allowed conduct values are strictly "A", "B", or "C".`,
        );
      }

      updatedConduct[studentId] = val;
    }

    return updatedConduct;
  }

  /**
   * Save conduct by homeroom teacher.
   * Validates teacher homeroom authorization, active enrollment, and A/B/C values.
   * Editable in DRAFT and REJECTED states.
   * Locked in SUBMITTED_TO_ADMIN and APPROVED states.
   * Preserves review status (e.g. REJECTED remains REJECTED).
   * Does NOT alter ClassSection.status.
   */
  async saveConduct(
    dto: { classSectionId: string; academicYearId: string; conductData: Record<string, string> },
    userId: string,
  ) {
    const { classSectionId, academicYearId, conductData } = dto;

    const teacher = await this.prisma.teacher.findUnique({
      where: { userId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!teacher) {
      throw new ForbiddenException('Only registered teachers can save conduct');
    }

    const section = await this.prisma.classSection.findUnique({
      where: { id: classSectionId },
      include: { GradeLevel: true, AcademicYear: true },
    });
    if (!section) {
      throw new NotFoundException('Class section not found');
    }
    if (section.academicYearId && section.academicYearId !== academicYearId) {
      throw new BadRequestException('Class section does not belong to the selected academic year');
    }
    if (section.status !== 'ACTIVE') {
      throw new BadRequestException('Class section is not active');
    }
    if (section.teacherId !== teacher.id) {
      throw new ForbiddenException('You are not authorized as the homeroom teacher for this section');
    }

    const existingReview = await (this.prisma as any).classRosterReview.findUnique({
      where: { classSectionId_academicYearId: { classSectionId, academicYearId } },
    });

    if (existingReview) {
      if (existingReview.status === 'APPROVED') {
        throw new BadRequestException('Cannot modify conduct: this roster has been approved and is locked.');
      }
      if (existingReview.status === 'SUBMITTED_TO_ADMIN') {
        throw new BadRequestException('Cannot modify conduct: this roster has been submitted to admin and is locked for editing.');
      }

      const validatedConduct = await this.validateConductData(
        classSectionId,
        academicYearId,
        conductData,
        (existingReview.conductData as Record<string, string>) || {},
      );

      const updated = await (this.prisma as any).classRosterReview.update({
        where: { id: existingReview.id },
        data: {
          conductData: validatedConduct,
        },
      });

      return {
        success: true,
        reviewId: updated.id,
        status: updated.status,
        conductData: updated.conductData,
      };
    }

    const validatedConduct = await this.validateConductData(
      classSectionId,
      academicYearId,
      conductData,
      {},
    );

    const created = await (this.prisma as any).classRosterReview.create({
      data: {
        classSectionId,
        academicYearId,
        homeroomTeacherId: section.teacherId,
        status: 'DRAFT',
        conductData: validatedConduct,
      },
    });

    return {
      success: true,
      reviewId: created.id,
      status: created.status,
      conductData: created.conductData,
    };
  }

  /**
   * Save roster draft by homeroom teacher.
   * Creates or updates the review in DRAFT status.
   * Does NOT alter ClassSection.status.
   */
  async saveRosterDraft(
    dto: { classSectionId: string; academicYearId: string; conductData?: any },
    userId: string,
  ) {
    const { classSectionId, academicYearId, conductData } = dto;

    const teacher = await this.prisma.teacher.findUnique({
      where: { userId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!teacher) {
      throw new ForbiddenException('Only registered teachers can save roster drafts');
    }

    const section = await this.prisma.classSection.findUnique({
      where: { id: classSectionId },
      include: { GradeLevel: true, AcademicYear: true },
    });
    if (!section) {
      throw new NotFoundException('Class section not found');
    }
    if (section.academicYearId && section.academicYearId !== academicYearId) {
      throw new BadRequestException('Class section does not belong to the selected academic year');
    }
    if (section.status !== 'ACTIVE') {
      throw new BadRequestException('Class section is not active');
    }
    if (section.teacherId !== teacher.id) {
      throw new ForbiddenException('You are not authorized as the homeroom teacher for this section');
    }

    const existingReview = await (this.prisma as any).classRosterReview.findUnique({
      where: { classSectionId_academicYearId: { classSectionId, academicYearId } },
    });

    let validatedConduct = existingReview?.conductData ?? {};
    if (conductData !== undefined && conductData !== null) {
      validatedConduct = await this.validateConductData(
        classSectionId,
        academicYearId,
        conductData,
        (existingReview?.conductData as Record<string, string>) || {},
      );
    }

    if (existingReview) {
      if (existingReview.status === 'APPROVED') {
        throw new BadRequestException('Cannot save draft: this roster has been approved and is locked.');
      }
      if (existingReview.status === 'SUBMITTED_TO_ADMIN') {
        throw new BadRequestException('Cannot save draft: this roster has been submitted to admin and is locked for editing.');
      }

      const updated = await (this.prisma as any).classRosterReview.update({
        where: { id: existingReview.id },
        data: {
          status: 'DRAFT',
          conductData: conductData !== undefined ? validatedConduct : existingReview.conductData,
        },
      });
      return { success: true, review: updated };
    }

    const created = await (this.prisma as any).classRosterReview.create({
      data: {
        classSectionId,
        academicYearId,
        homeroomTeacherId: section.teacherId,
        status: 'DRAFT',
        conductData: validatedConduct,
      },
    });
    return { success: true, review: created };
  }

  /**
   * Retrieve current review status for a class section and academic year.
   * Returns clear default DRAFT if no review record exists.
   */
  async getRosterStatus(
    classSectionId: string,
    academicYearId: string,
    userId?: string,
    userRole?: string,
  ) {
    const section = await this.prisma.classSection.findUnique({
      where: { id: classSectionId },
      include: {
        Teacher: { select: { id: true, userId: true, firstName: true, lastName: true } },
      },
    });
    if (!section) {
      throw new NotFoundException('Class section not found');
    }
    // Only enforce year match when the section has an academicYearId set.
    // Some legacy sections may have no year assigned — treat those as valid.
    if (section.academicYearId && section.academicYearId !== academicYearId) {
      throw new BadRequestException('Class section does not belong to the selected academic year');
    }

    if (userRole === 'TEACHER' && userId) {
      // Compare using Teacher.id (not Teacher.userId) because ClassSection.teacherId
      // is a FK to Teacher.id, not to User.id.
      if (section.Teacher?.userId !== userId) {
        throw new ForbiddenException('You are not authorized as the homeroom teacher for this section');
      }
    }

    const review = await (this.prisma as any).classRosterReview.findUnique({
      where: { classSectionId_academicYearId: { classSectionId, academicYearId } },
      include: {
        homeroomTeacher: { select: { id: true, firstName: true, lastName: true, staffId: true } },
        submittedBy: { select: { id: true, name: true, role: true } },
        reviewedBy: { select: { id: true, name: true, role: true } },
      },
    });

    if (review) {
      return {
        reviewId: review.id,
        classSectionId: review.classSectionId,
        academicYearId: review.academicYearId,
        homeroomTeacherId: review.homeroomTeacherId,
        status: review.status,
        submittedAt: review.submittedAt,
        submittedById: review.submittedById,
        reviewedAt: review.reviewedAt,
        reviewedById: review.reviewedById,
        rejectionReason: review.rejectionReason,
        conductData: review.conductData,
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        homeroomTeacher: review.homeroomTeacher,
        submittedBy: review.submittedBy,
        reviewedBy: review.reviewedBy,
        submissionType: (review.conductData as any)?._submissionType ?? null,
        rosterSubmittedAt: (review.conductData as any)?._rosterSubmittedAt ?? review.submittedAt,
        reportCardSubmittedAt: (review.conductData as any)?._reportCardSubmittedAt ?? review.submittedAt,
        isRosterSubmitted: review.status === 'SUBMITTED_TO_ADMIN' || review.status === 'APPROVED'
          ? ((review.conductData as any)?._submissionType === 'roster' || (review.conductData as any)?._submissionType === 'both' || !(review.conductData as any)?._submissionType)
          : false,
        isReportCardSubmitted: review.status === 'SUBMITTED_TO_ADMIN' || review.status === 'APPROVED'
          ? ((review.conductData as any)?._submissionType === 'report-cards' || (review.conductData as any)?._submissionType === 'both' || !(review.conductData as any)?._submissionType)
          : false,
      };
    }

    return {
      reviewId: null,
      classSectionId,
      academicYearId,
      homeroomTeacherId: section.teacherId,
      status: 'DRAFT',
      submittedAt: null,
      submittedById: null,
      reviewedAt: null,
      reviewedById: null,
      rejectionReason: null,
      conductData: null,
      createdAt: null,
      updatedAt: null,
      homeroomTeacher: section.Teacher
        ? {
            id: section.Teacher.id,
            firstName: section.Teacher.firstName,
            lastName: section.Teacher.lastName,
          }
        : null,
      submittedBy: null,
      reviewedBy: null,
    };
  }

  /**
   * Called by a homeroom teacher to formally dispatch their finalized
   * roster and/or report cards to the admin portal for review.
   *
   * Guards:
   *  1. Caller must be a Teacher with a profile record.
   *  2. Caller must be the designated homeroom teacher for the section.
   *  3. Section must be ACTIVE and belong to academicYearId.
   *  4. Every assigned subject must have SUBMITTED results covering all
   *     enrolled students.
   *
   * CRITICAL: ClassSection.status is NEVER modified. It remains ACTIVE.
   */
  async submitToAdmin(
    classSectionId: string,
    academicYearId: string,
    type: 'roster' | 'report-cards' | 'both' = 'roster',
    userId: string,
    submittedConductData?: Record<string, string>,
  ) {
    // 1. Resolve caller to a Teacher record
    const teacher = await this.prisma.teacher.findFirst({
      where: {
        OR: [{ id: userId }, { userId }],
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!teacher) {
      throw new ForbiddenException('Only registered teachers can submit reports to admin');
    }

    // 2. Verify homeroom ownership and section state
    const section = await this.prisma.classSection.findFirst({
      where: { id: classSectionId, teacherId: teacher.id },
      include: {
        GradeLevel: { select: { name: true } },
        AcademicYear: { select: { year: true } },
      },
    });
    if (!section) {
      throw new ForbiddenException(
        'You are not the homeroom teacher for this section, or the section does not exist',
      );
    }
    if (section.academicYearId && section.academicYearId !== academicYearId) {
      throw new BadRequestException('Class section does not belong to the selected academic year');
    }
    if (section.status !== 'ACTIVE') {
      throw new BadRequestException('Class section is not active');
    }

    // 3. Ensure roster is not locked if already fully approved
    const existingReview = await (this.prisma as any).classRosterReview.findUnique({
      where: { classSectionId_academicYearId: { classSectionId, academicYearId } },
    });
    if (existingReview?.status === 'APPROVED') {
      throw new BadRequestException('This review has already been approved and is locked.');
    }

    // 4. Ensure active enrolment exists
    const enrolledCount = await this.prisma.studentEnrollment.count({
      where: { classSectionId, academicYearId, status: 'ACTIVE' },
    });
    if (enrolledCount === 0) {
      throw new BadRequestException('No active students are enrolled in this section');
    }

    // 5. Ensure every assigned subject is fully SUBMITTED
    const assignedSubjects = await (this.prisma as any).sectionSubjectTeacher.findMany({
      where: { classSectionId, academicYearId },
      select: { subjectId: true },
    });
    if (assignedSubjects.length === 0) {
      throw new BadRequestException('No subjects are assigned to this section');
    }

    const pendingSubjectNames: string[] = [];
    for (const { subjectId } of assignedSubjects) {
      const submittedCount = await (this.prisma as any).subjectResult.count({
        where: { classSectionId, subjectId, academicYearId, status: 'SUBMITTED' },
      });
      if (submittedCount < enrolledCount) {
        const subject = await this.prisma.subject.findUnique({
          where: { id: subjectId },
          select: { name: true },
        });
        pendingSubjectNames.push(`${subject?.name ?? subjectId} — ${submittedCount}/${enrolledCount} students submitted`);
      }
    }
    if (pendingSubjectNames.length > 0) {
      throw new BadRequestException(
        `Cannot submit to admin — the following subjects are incomplete:\n${pendingSubjectNames.join('\n')}`,
      );
    }

    // 6. Ensure every active enrolled student has a valid conduct grade (A / B / C)
    const activeEnrollments = await this.prisma.studentEnrollment.findMany({
      where: { classSectionId, academicYearId, status: 'ACTIVE' },
      include: {
        Student: {
          select: { id: true, firstName: true, lastName: true, admissionNo: true },
        },
      },
      orderBy: [{ Student: { lastName: 'asc' } }, { Student: { firstName: 'asc' } }],
    });

    const currentConductMap: Record<string, string> = {
      ...(typeof existingReview?.conductData === 'object' && existingReview?.conductData !== null ? existingReview.conductData : {}),
      ...(submittedConductData || {}),
    };

    // Auto-populate default 'A' if student conduct is not yet assigned so submission can proceed smoothly
    for (const enr of activeEnrollments) {
      if (!currentConductMap[enr.Student.id] || !['A', 'B', 'C'].includes(currentConductMap[enr.Student.id])) {
        currentConductMap[enr.Student.id] = 'A';
      }
    }

    const now = new Date();
    const submissionType = type ?? 'roster';
    const updatedConductData = {
      ...currentConductMap,
      _submissionType: existingReview?.conductData?._submissionType && existingReview?.conductData?._submissionType !== submissionType ? 'both' : submissionType,
      ...(submissionType === 'report-cards' || submissionType === 'both' ? { _reportCardSubmittedAt: now.toISOString() } : {}),
      ...(submissionType === 'roster' || submissionType === 'both' ? { _rosterSubmittedAt: now.toISOString() } : {}),
    };

    // 7. Create or update ClassRosterReview (NEVER touch ClassSection.status!)
    const review = await (this.prisma as any).classRosterReview.upsert({
      where: {
        classSectionId_academicYearId: { classSectionId, academicYearId },
      },
      create: {
        classSectionId,
        academicYearId,
        homeroomTeacherId: section.teacherId,
        status: 'SUBMITTED_TO_ADMIN',
        conductData: updatedConductData,
        submittedAt: now,
        submittedById: userId,
      },
      update: {
        status: 'SUBMITTED_TO_ADMIN',
        submittedAt: now,
        submittedById: userId,
        homeroomTeacherId: section.teacherId,
        conductData: updatedConductData,
        rejectionReason: null,
      },
    });

    // 8. Return a submission receipt matching existing frontend expectations
    const gradeName = section.GradeLevel?.name ?? '';
    const displayName = /^grade\b/i.test(gradeName)
      ? `${gradeName} ${section.name}`
      : `Grade ${gradeName} ${section.name}`.trim();

    return {
      success: true,
      reviewId: review.id,
      status: review.status,
      submittedAt: review.submittedAt?.toISOString() ?? now.toISOString(),
      submittedBy: `${teacher.firstName} ${teacher.lastName}`.trim(),
      classSectionId,
      classSectionName: displayName,
      academicYear: section.AcademicYear?.year ?? academicYearId,
      type: submissionType,
      enrolledStudents: enrolledCount,
      submittedSubjects: assignedSubjects.length,
      message: `${
        submissionType === 'both' ? 'Roster and report cards' :
        submissionType === 'roster' ? 'Class roster' : 'Report cards'
      } for ${displayName} successfully submitted to the admin portal.`,
    };
  }

  /**
   * Admin approves a submitted roster review.
   * Only SUBMITTED_TO_ADMIN rosters can be approved.
   * Does NOT alter ClassSection.status.
   */
  async approveRoster(reviewId: string, adminUserId: string) {
    const review = await (this.prisma as any).classRosterReview.findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException('Roster review record not found');
    }
    if (review.status !== 'SUBMITTED_TO_ADMIN') {
      throw new BadRequestException(
        `Cannot approve roster with status '${review.status}'. Only rosters in 'SUBMITTED_TO_ADMIN' status can be approved.`,
      );
    }

    const updated = await (this.prisma as any).classRosterReview.update({
      where: { id: reviewId },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
        reviewedById: adminUserId,
        rejectionReason: null,
      },
      include: {
        classSection: { select: { id: true, name: true, status: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });

    return {
      success: true,
      message: 'Class roster successfully approved and locked.',
      review: updated,
    };
  }

  /**
   * Admin rejects a submitted roster review with a required reason.
   * Only SUBMITTED_TO_ADMIN rosters can be rejected.
   * Does NOT alter ClassSection.status.
   */
  async rejectRoster(reviewId: string, adminUserId: string, reason: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('A rejection reason is required and cannot be empty or whitespace.');
    }

    const review = await (this.prisma as any).classRosterReview.findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException('Roster review record not found');
    }
    if (review.status !== 'SUBMITTED_TO_ADMIN') {
      throw new BadRequestException(
        `Cannot reject roster with status '${review.status}'. Only rosters in 'SUBMITTED_TO_ADMIN' status can be rejected.`,
      );
    }

    const updated = await (this.prisma as any).classRosterReview.update({
      where: { id: reviewId },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedById: adminUserId,
        rejectionReason: reason.trim(),
      },
      include: {
        classSection: { select: { id: true, name: true, status: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });

    return {
      success: true,
      message: 'Class roster rejected and returned to homeroom teacher for correction.',
      review: updated,
    };
  }

  /**
   * Admin reopens an approved roster back to DRAFT.
   * Only APPROVED rosters can be reopened.
   * Does NOT alter ClassSection.status.
   */
  async reopenRoster(reviewId: string, adminUserId: string, reason: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('A reopen reason is required and cannot be empty or whitespace.');
    }

    const review = await (this.prisma as any).classRosterReview.findUnique({
      where: { id: reviewId },
    });
    if (!review) {
      throw new NotFoundException('Roster review record not found');
    }
    if (review.status !== 'APPROVED') {
      throw new BadRequestException(
        `Cannot reopen roster with status '${review.status}'. Only approved rosters can be reopened.`,
      );
    }

    const updated = await (this.prisma as any).classRosterReview.update({
      where: { id: reviewId },
      data: {
        status: 'DRAFT',
        reviewedAt: null,
        reviewedById: null,
        rejectionReason: `Reopened by admin: ${reason.trim()}`,
      },
      include: {
        classSection: { select: { id: true, name: true, status: true } },
      },
    });

    return {
      success: true,
      message: 'Approved roster successfully reopened and transitioned to DRAFT status.',
      review: updated,
    };
  }

  /**
   * Official printable roster data.
   * Strictly gated: only APPROVED rosters can be printed.
   * Rejects DRAFT, SUBMITTED_TO_ADMIN, and REJECTED reviews.
   */
  async getOfficialPrintRoster(
    classSectionId: string,
    academicYearId: string,
    userId?: string,
    userRole?: string,
  ) {
    if (!classSectionId || !academicYearId) {
      throw new BadRequestException('Class Section ID and Academic Year ID are required');
    }

    const section = await this.prisma.classSection.findUnique({
      where: { id: classSectionId },
      include: {
        GradeLevel: { select: { id: true, name: true } },
        // "GeneralTeacher" relation = the homeroom teacher for this section
        Teacher: { select: { id: true, firstName: true, lastName: true } },
        AcademicYear: { select: { id: true, year: true } },
      },
    });
    if (!section) {
      throw new NotFoundException(`Class section ${classSectionId} not found`);
    }

    if (section.academicYearId && section.academicYearId !== academicYearId) {
      throw new BadRequestException('Academic Year mismatch for the specified Class Section');
    }

    // Role-based authorization
    if (userRole === 'TEACHER' && userId) {
      const teacher = await this.prisma.teacher.findFirst({ where: { userId } });
      if (!teacher || section.teacherId !== teacher.id) {
        throw new ForbiddenException('Only the assigned homeroom teacher or an administrator may access the official printable roster');
      }
    } else if (userRole && userRole !== 'ADMIN' && userRole !== 'TEACHER') {
      throw new ForbiddenException('Unauthorized role for official print');
    }

    // Gate on ClassRosterReview
    const review = await (this.prisma as any).classRosterReview.findUnique({
      where: {
        classSectionId_academicYearId: {
          classSectionId,
          academicYearId,
        },
      },
    });

    if (!review || review.status !== 'APPROVED') {
      throw new BadRequestException(
        `Official print is locked. Class roster review must be APPROVED before official printing. Current status: ${review?.status ?? 'DRAFT'}`,
      );
    }

    // Authoritative calculation from Step 3
    const calculated = await this.calcService.calculateSectionRoster(academicYearId, classSectionId);
    const paperRows = this.calcService.generatePaperRosterRows(calculated.students);
    const academicYear = await this.prisma.academicYear.findUnique({ where: { id: academicYearId } });

    return {
      officialHeader: {
        institutionName: 'School Management Portal',
        documentTitle: 'STUDENT ACADEMIC ROSTER',
        academicYear: academicYear?.year ?? section.AcademicYear?.year ?? academicYearId,
        gradeLevel: section.GradeLevel?.name ?? 'N/A',
        sectionName: section.name,
        homeroomTeacher: section.Teacher
          ? `${section.Teacher.firstName} ${section.Teacher.lastName}`.trim()
          : 'Unassigned',
        reviewId: review.id,
        status: review.status,
        reviewedAt: review.reviewedAt,
        reviewedById: review.reviewedById,
      },
      section: calculated.section,
      terms: calculated.terms,
      subjects: calculated.subjects,
      students: calculated.students,
      statistics: calculated.statistics,
      paperRows,
    };
  }

  // ─── PDF Export Methods ────────────────────────────────────────────────────

  async generateSectionsSummaryPdf(academicYearId?: string, status?: string, search?: string) {
    let yearId = academicYearId;
    if (!yearId) {
      const current = await this.prisma.academicYear.findFirst({
        where: { isCurrent: true },
        select: { id: true, year: true },
      });
      yearId = current?.id;
    }

    const academicYear = yearId
      ? await this.prisma.academicYear.findUnique({ where: { id: yearId } })
      : null;
    const yearName = academicYear?.year || '2025/2026';

    const allSections = await this.getAdminSectionsSummary(yearId);

    // Filter by search and status
    const effectiveSearch = (search || '').trim().toLowerCase();
    const filtered = allSections.filter((sec) => {
      const matchesSearch =
        !effectiveSearch ||
        (sec.displayName || '').toLowerCase().includes(effectiveSearch) ||
        (sec.name || '').toLowerCase().includes(effectiveSearch) ||
        (sec.homeroomTeacher || '').toLowerCase().includes(effectiveSearch) ||
        (sec.gradeLevelName || '').toLowerCase().includes(effectiveSearch) ||
        (sec.status || '').toLowerCase().includes(effectiveSearch);

      const matchesStatus = !status || status === 'All' || sec.status === status;
      return matchesSearch && matchesStatus;
    });

    const buffer = await this.pdfService.generateSectionsSummaryPdf(filtered, yearName, {
      status,
      search: effectiveSearch,
    });

    const safeYear = yearName.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Report_Summary_${safeYear}.pdf`;

    return { buffer, filename };
  }

  async generateSectionReportCardsPdf(classSectionId: string, academicYearId: string, search?: string) {
    if (!classSectionId || !academicYearId) {
      throw new BadRequestException('Class Section ID and Academic Year ID are required');
    }

    const section = await this.prisma.classSection.findUnique({
      where: { id: classSectionId },
      include: { GradeLevel: true, Teacher: true, AcademicYear: true },
    });
    if (!section) throw new NotFoundException('Class section not found');

    const yearName = section.AcademicYear?.year || academicYearId;
    const allReportCards = await this.getCompiledReportCards(classSectionId, academicYearId);

    const effectiveSearch = (search || '').trim().toLowerCase();
    const filtered = effectiveSearch
      ? allReportCards.filter(
          (st) =>
            `${st.firstName || ''} ${st.lastName || ''}`.toLowerCase().includes(effectiveSearch) ||
            (st.admissionNo || '').toLowerCase().includes(effectiveSearch),
        )
      : allReportCards;

    const gradeLabel = section.GradeLevel?.name || '';
    const sectionDisplay = /^grade\b/i.test(gradeLabel)
      ? `${gradeLabel} ${section.name}`
      : `Grade ${gradeLabel} ${section.name}`.trim();

    const buffer = await this.pdfService.generateCompiledReportCardsPdf(
      filtered,
      {
        displayName: sectionDisplay,
        name: section.name,
        gradeLevel: gradeLabel,
        homeroomTeacher: section.Teacher
          ? `${section.Teacher.firstName} ${section.Teacher.lastName}`.trim()
          : 'Unassigned',
        academicYear: yearName,
      },
      yearName,
      effectiveSearch,
    );

    const safeSection = sectionDisplay.replace(/[^a-zA-Z0-9]/g, '_');
    const safeYear = yearName.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Student_Report_${safeSection}_${safeYear}.pdf`;

    return { buffer, filename };
  }

  async generateRosterReviewsPdf(params: { status?: string; academicYearId?: string; search?: string }) {
    let yearId = params.academicYearId;
    if (!yearId) {
      const current = await this.prisma.academicYear.findFirst({
        where: { isCurrent: true },
        select: { id: true, year: true },
      });
      yearId = current?.id;
    }

    const academicYear = yearId
      ? await this.prisma.academicYear.findUnique({ where: { id: yearId } })
      : null;
    const yearName = academicYear?.year || '2025/2026';

    const reviews = await this.getRosterReviews({
      status: params.status,
      academicYearId: yearId,
    });

    const effectiveSearch = (params.search || '').trim().toLowerCase();
    const filtered = effectiveSearch
      ? reviews.filter(
          (r: any) =>
            (r.displayName || '').toLowerCase().includes(effectiveSearch) ||
            (r.sectionName || '').toLowerCase().includes(effectiveSearch) ||
            (r.homeroomTeacher || '').toLowerCase().includes(effectiveSearch) ||
            (r.gradeLevelName || '').toLowerCase().includes(effectiveSearch) ||
            (r.status || '').toLowerCase().includes(effectiveSearch),
        )
      : reviews;

    const buffer = await this.pdfService.generateRosterReviewsSummaryPdf(filtered, yearName, {
      status: params.status,
      search: effectiveSearch,
    });

    const safeYear = yearName.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Roster_Review_Queue_${safeYear}.pdf`;

    return { buffer, filename };
  }

  async generateOfficialPrintRosterPdf(
    classSectionId: string,
    academicYearId: string,
    userId?: string,
    userRole?: string,
  ) {
    const officialData = await this.getOfficialPrintRoster(
      classSectionId,
      academicYearId,
      userId,
      userRole,
    );

    const buffer = await this.pdfService.generateOfficialPaperRosterPdf(officialData);

    const sectionName = officialData.officialHeader?.sectionName || 'Class';
    const gradeLevel = officialData.officialHeader?.gradeLevel || '';
    const safeSection = `${gradeLevel}_${sectionName}`.replace(/[^a-zA-Z0-9]/g, '_');
    const safeYear = (officialData.officialHeader?.academicYear || '2025_2026').replace(
      /[^a-zA-Z0-9]/g,
      '_',
    );
    const filename = `Official_Roster_${safeSection}_${safeYear}.pdf`;

    return { buffer, filename };
  }
}

