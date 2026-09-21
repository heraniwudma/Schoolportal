import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ExamStatus, ExamSessionStatus, Role } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class ExaminationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // FORM DATA
  // ─────────────────────────────────────────────────────────────────────────────

  async getTeacherFormData(userId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) throw new UnauthorizedException('Active user is not registered as a teacher');

    const assignments = await this.prisma.sectionSubjectTeacher.findMany({
      where: { teacherId: teacher.id },
      select: {
        subjectId: true,
        classSectionId: true,
        Subject: { select: { id: true, name: true, code: true } },
        ClassSection: { select: { id: true, name: true, GradeLevel: { select: { name: true } } } },
      },
      orderBy: [{ ClassSection: { name: 'asc' } }, { Subject: { name: 'asc' } }],
    });
    return { assignments };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEACHER EXAM CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  async findTeacherExaminations(userId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) throw new UnauthorizedException('Active user is not registered as a teacher');
    return this.prisma.examination.findMany({
      where: { teacherId: teacher.id },
      select: {
        id: true,
        title: true,
        status: true,
        duration: true,
        totalMarks: true,
        examDate: true,
        instructions: true,
        rejectionReason: true,
        isResubmitted: true,
        resubmittedAt: true,
        windowStart: true,
        windowEnd: true,
        delayMinutes: true,
        createdAt: true,
        updatedAt: true,
        Subject: { select: { id: true, name: true, code: true } },
        Class: { select: { id: true, name: true } },
        ClassSection: { select: { id: true, name: true } },
        questions: {
          select: {
            id: true,
            text: true,
            marks: true,
            options: { select: { id: true, optionText: true, isCorrect: true } },
          },
        },
        reviewHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createExamination(dto: any, userId?: string) {
    let teacherId: string | undefined;
    let teacher: any = null;
    if (userId) {
      teacher = await this.prisma.teacher.findUnique({ where: { userId } });
      if (teacher) teacherId = teacher.id;
    }
    const subjectId = dto.subjectId || (typeof dto.subject === 'string' ? dto.subject : undefined);
    if (!subjectId) throw new BadRequestException('Subject is required');
    if (!teacherId) throw new UnauthorizedException('Active user is not registered as a teacher');

    const teachingAssignment = await this.prisma.sectionSubjectTeacher.findFirst({
      where: { teacherId, subjectId, classSectionId: dto.classSectionId },
      include: { ClassSection: true },
    });
    if (!teachingAssignment) throw new BadRequestException('You are not assigned to this subject and section');

    const classId =
      dto.classId ||
      (await this.prisma.class.findFirst({ select: { id: true } }))?.id;
    if (!classId) throw new BadRequestException('A class must be configured before creating an examination');

    const calculatedTotalMarks =
      dto.questions?.length > 0
        ? dto.questions.reduce((s: number, q: any) => s + (Number(q.marks) || 10), 0)
        : dto.totalMarks || 100;

    const examId = crypto.randomUUID();
    const now = new Date();
    const targetStatus =
      dto.status === 'DRAFT'    ? ExamStatus.DRAFT    :
      dto.status === 'APPROVED' ? ExamStatus.APPROVED :
      ExamStatus.PENDING;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.examination.create({
          data: {
            id: examId,
            title: dto.title || 'Untitled Examination',
            subjectId,
            classId,
            classSectionId: dto.classSectionId,
            teacherId,
            duration: Number(dto.duration) || 60,
            status: targetStatus,
            instructions: dto.instructions !== undefined ? dto.instructions : null,
            totalMarks: calculatedTotalMarks,
            examDate: dto.examDate ? new Date(dto.examDate) : now,
            updatedAt: now,
            questions: {
              create: (dto.questions || []).map((q: any) => ({
                id: crypto.randomUUID(),
                text: q.questionText || q.text || '',
                marks: Number(q.marks) || 10,
                options: {
                  create: (q.options || []).map((opt: any) => ({
                    id: crypto.randomUUID(),
                    optionText: opt.optionText || opt.text || '',
                    isCorrect: Boolean(opt.isCorrect),
                  })),
                },
              })),
            },
          },
          include: {
            Subject: true,
            Class: true,
            ClassSection: true,
            questions: { include: { options: true } },
            reviewHistory: true,
          },
        });

        if (targetStatus === ExamStatus.PENDING) {
          await tx.examReviewHistory.create({
            data: {
              id: crypto.randomUUID(),
              examId: created.id,
              status: ExamStatus.PENDING,
              action: 'SUBMITTED',
              reason: 'Submitted for admin review',
              actionById: userId,
              actionByName: teacher ? `${teacher.firstName} ${teacher.lastName}`.trim() : undefined,
              createdAt: now,
            },
          });
        }

        return created;
      }, { timeout: 15000, maxWait: 10000 });
    } catch (error: any) {
      throw new InternalServerErrorException(`Failed to create examination: ${error.message}`);
    }
  }

  async updateExamination(id: string, dto: any, userId: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId },
      select: { id: true, firstName: true, lastName: true },
    });
    const existing = await this.prisma.examination.findUnique({ where: { id } });
    if (!teacher || !existing || existing.teacherId !== teacher.id) {
      throw new UnauthorizedException('You cannot edit this examination');
    }

    if (existing.status !== ExamStatus.DRAFT && existing.status !== ExamStatus.REJECTED) {
      throw new BadRequestException('Only DRAFT or REJECTED examinations can be edited');
    }

    if (dto.subjectId || dto.classSectionId) {
      const subjectId = dto.subjectId || existing.subjectId;
      const classSectionId = dto.classSectionId || existing.classSectionId;
      const assignment = await this.prisma.sectionSubjectTeacher.findFirst({
        where: { teacherId: teacher.id, subjectId, classSectionId },
        include: { ClassSection: true },
      });
      if (!assignment) throw new BadRequestException('You are not assigned to this subject and section');
    }

    const updateData: any = {
      title: dto.title,
      instructions: dto.instructions !== undefined ? dto.instructions : undefined,
      duration: dto.duration ? Number(dto.duration) : undefined,
      status: dto.status ? (dto.status as ExamStatus) : undefined,
      updatedAt: new Date(),
    };
    if (dto.subjectId)      updateData.subjectId      = dto.subjectId;
    if (dto.classId)        updateData.classId        = dto.classId;
    if (dto.classSectionId) updateData.classSectionId = dto.classSectionId;

    const isTransitioningToPending = dto.status === ExamStatus.PENDING;
    if (isTransitioningToPending && existing.status === ExamStatus.REJECTED) {
      updateData.isResubmitted = true;
      updateData.resubmittedAt = new Date();
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.questions) {
        await tx.question.deleteMany({ where: { examId: id } });
        updateData.totalMarks = dto.questions.reduce((s: number, q: any) => s + (Number(q.marks) || 10), 0);
        updateData.questions = {
          create: dto.questions.map((q: any) => ({
            id: crypto.randomUUID(),
            text: q.questionText || q.text || '',
            marks: Number(q.marks) || 10,
            options: {
              create: (q.options || []).map((opt: any) => ({
                id: crypto.randomUUID(),
                optionText: opt.optionText || opt.text || '',
                isCorrect: Boolean(opt.isCorrect),
              })),
            },
          })),
        };
      } else if (dto.totalMarks) {
        updateData.totalMarks = Number(dto.totalMarks);
      }

      const updated = await tx.examination.update({
        where: { id },
        data: updateData,
        include: {
          Subject: true,
          Class: true,
          ClassSection: true,
          questions: { include: { options: true } },
          reviewHistory: { orderBy: { createdAt: 'desc' } },
        },
      });

      if (isTransitioningToPending) {
        const action = existing.status === ExamStatus.REJECTED ? 'RESUBMITTED' : 'SUBMITTED';
        await tx.examReviewHistory.create({
          data: {
            id: crypto.randomUUID(),
            examId: id,
            status: ExamStatus.PENDING,
            action,
            reason: dto.resubmissionNote || (action === 'RESUBMITTED' ? 'Resubmitted after addressing feedback' : 'Submitted for review'),
            actionById: userId,
            actionByName: `${teacher.firstName} ${teacher.lastName}`.trim(),
            createdAt: new Date(),
          },
        });
      }

      return updated;
    }, { timeout: 15000, maxWait: 10000 });
  }

  async resubmitExam(id: string, dto: any, userId: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId },
      select: { id: true, firstName: true, lastName: true },
    });
    const existing = await this.prisma.examination.findUnique({
      where: { id },
      include: { questions: { include: { options: true } } },
    });
    if (!teacher || !existing || existing.teacherId !== teacher.id) {
      throw new UnauthorizedException('You cannot resubmit this examination');
    }
    if (existing.status !== ExamStatus.REJECTED && existing.status !== ExamStatus.DRAFT) {
      throw new BadRequestException('Only REJECTED or DRAFT examinations can be submitted to admin');
    }

    const title = dto.title || existing.title;
    const subjectId = dto.subjectId || existing.subjectId;
    const classSectionId = dto.classSectionId || existing.classSectionId;

    if (!title?.trim()) throw new BadRequestException('Exam title is required');
    if (!subjectId) throw new BadRequestException('Subject is required');
    if (!classSectionId) throw new BadRequestException('Class section is required');

    const assignment = await this.prisma.sectionSubjectTeacher.findFirst({
      where: { teacherId: teacher.id, subjectId, classSectionId },
      include: { ClassSection: true },
    });
    if (!assignment) throw new BadRequestException('You are not assigned to this subject and section');

    const classId = dto.classId || existing.classId;

    const questionsList = dto.questions || existing.questions;
    if (!questionsList || questionsList.length === 0) {
      throw new BadRequestException('At least one question is required to submit an examination');
    }

    for (let i = 0; i < questionsList.length; i++) {
      const q = questionsList[i];
      const qText = (q.questionText || q.text || '').trim();
      if (!qText) throw new BadRequestException(`Question ${i + 1} text cannot be empty`);
      const opts = q.options || [];
      if (opts.length < 2) throw new BadRequestException(`Question ${i + 1} must have at least 2 options`);
      const hasEmptyOpt = opts.some((o: any) => !(o.optionText || o.text || '').trim());
      if (hasEmptyOpt) throw new BadRequestException(`All options for question ${i + 1} must be filled out`);
      const hasCorrect = opts.some((o: any) => Boolean(o.isCorrect));
      if (!hasCorrect) throw new BadRequestException(`Question ${i + 1} must have a designated correct answer`);
    }

    const totalMarks = questionsList.reduce((s: number, q: any) => s + (Number(q.marks) || 10), 0);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.question.deleteMany({ where: { examId: id } });

      const updated = await tx.examination.update({
        where: { id },
        data: {
          title,
          subjectId,
          classId,
          classSectionId,
          instructions: dto.instructions !== undefined ? dto.instructions : existing.instructions,
          duration: Number(dto.duration) || existing.duration || 60,
          totalMarks,
          status: ExamStatus.PENDING,
          isResubmitted: true,
          resubmittedAt: now,
          updatedAt: now,
          questions: {
            create: questionsList.map((q: any) => ({
              id: crypto.randomUUID(),
              text: q.questionText || q.text || '',
              marks: Number(q.marks) || 10,
              options: {
                create: (q.options || []).map((opt: any) => ({
                  id: crypto.randomUUID(),
                  optionText: opt.optionText || opt.text || '',
                  isCorrect: Boolean(opt.isCorrect),
                })),
              },
            })),
          },
        },
        include: {
          Subject: true,
          Class: true,
          ClassSection: true,
          questions: { include: { options: true } },
          reviewHistory: { orderBy: { createdAt: 'desc' } },
        },
      });

      await tx.examReviewHistory.create({
        data: {
          id: crypto.randomUUID(),
          examId: id,
          status: ExamStatus.PENDING,
          action: 'RESUBMITTED',
          reason: dto.resubmissionNote || 'Resubmitted after addressing feedback',
          actionById: userId,
          actionByName: `${teacher.firstName} ${teacher.lastName}`.trim(),
          createdAt: now,
        },
      });

      return updated;
    }, { timeout: 15000, maxWait: 10000 });
  }

  async getDrafts(userId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) throw new UnauthorizedException('Active user is not registered as a teacher');
    return this.prisma.examination.findMany({
      where: { status: ExamStatus.DRAFT, teacherId: teacher.id },
      include: {
        Subject: true,
        Class: true,
        ClassSection: true,
        questions: {
          include: { options: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findRejectedForTeacher(userId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) throw new UnauthorizedException('Active user is not registered as a teacher');
    return this.prisma.examination.findMany({
      where: { status: ExamStatus.REJECTED, teacherId: teacher.id },
      include: {
        Subject: true,
        Class: true,
        ClassSection: true,
        questions: {
          include: { options: true },
        },
        reviewHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getExaminationById(id: string, userId: string, role: string) {
    const exam = await this.prisma.examination.findUnique({
      where: { id },
      include: {
        Subject: true,
        Class: true,
        ClassSection: true,
        questions: {
          include: { options: true },
        },
        reviewHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!exam) throw new NotFoundException('Examination not found');

    if (role === Role.TEACHER) {
      const teacher = await this.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
      if (!teacher || exam.teacherId !== teacher.id) {
        throw new UnauthorizedException('You do not have permission to view this examination');
      }
    } else if (role !== Role.ADMIN) {
      throw new UnauthorizedException('Unauthorized to view full examination details');
    }

    return exam;
  }

  async deleteDraft(id: string, userId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
    const draft = await this.prisma.examination.findFirst({
      where: { id, teacherId: teacher?.id, status: ExamStatus.DRAFT },
      select: { id: true },
    });
    if (!draft) throw new NotFoundException('Draft not found');
    return this.prisma.examination.delete({ where: { id: draft.id } });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN REVIEW WORKFLOW
  // ─────────────────────────────────────────────────────────────────────────────

  async findApprovedExaminations() {
    return this.prisma.examination.findMany({
      where: { status: ExamStatus.APPROVED },
      select: {
        id: true,
        title: true,
        totalMarks: true,
        duration: true,
        examDate: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        Subject:      { select: { id: true, name: true, code: true } },
        Teacher:      { select: { firstName: true, lastName: true, staffId: true } },
        Class:        { select: { id: true, name: true } },
        ClassSection: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  async findPendingExaminations() {
    return this.prisma.examination.findMany({
      where: { status: ExamStatus.PENDING },
      select: {
        id: true,
        title: true,
        totalMarks: true,
        duration: true,
        examDate: true,
        status: true,
        instructions: true,
        rejectionReason: true,
        isResubmitted: true,
        resubmittedAt: true,
        createdAt: true,
        updatedAt: true,
        Subject: { select: { id: true, name: true, code: true } },
        Teacher: {
          select: {
            firstName: true,
            lastName: true,
            staffId: true,
            User: { select: { email: true, avatarUrl: true } },
          },
        },
        Class:        { select: { id: true, name: true } },
        ClassSection: { select: { id: true, name: true } },
        questions: {
          select: {
            id: true,
            text: true,
            marks: true,
            options: {
              select: { id: true, optionText: true, isCorrect: true },
            },
          },
        },
        reviewHistory: {
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  async reviewExam(id: string, status: 'APPROVED' | 'REJECTED', rejectionReason?: string, adminUserId?: string) {
    const exam = await this.prisma.examination.findUnique({ where: { id } });
    if (!exam) throw new NotFoundException('Examination not found');
    if (exam.status !== ExamStatus.PENDING) {
      throw new BadRequestException('Only PENDING exams can be reviewed');
    }

    let adminName: string | undefined;
    if (adminUserId) {
      const admin = await this.prisma.user.findUnique({
        where: { id: adminUserId },
        select: { email: true },
      });
      adminName = admin?.email || 'Admin';
    }

    if (status === 'REJECTED' && (!rejectionReason || !rejectionReason.trim())) {
      throw new BadRequestException('A rejection reason is required when rejecting an examination');
    }

    const trimmedReason = rejectionReason?.trim();
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.examination.update({
        where: { id },
        data: {
          status: status as ExamStatus,
          rejectionReason: status === 'REJECTED' ? trimmedReason : null,
          updatedAt: now,
        },
        include: {
          Subject:      { select: { id: true, name: true } },
          Teacher:      { select: { firstName: true, lastName: true } },
          Class:        { select: { id: true, name: true } },
          ClassSection: { select: { id: true, name: true } },
        },
      });

      await tx.examReviewHistory.create({
        data: {
          id: crypto.randomUUID(),
          examId: id,
          status: status as ExamStatus,
          action: status,
          reason: trimmedReason || (status === 'APPROVED' ? 'Exam approved and cleared for publishing' : undefined),
          actionById: adminUserId,
          actionByName: adminName,
          createdAt: now,
        },
      });

      return updated;
    }, { timeout: 15000, maxWait: 10000 });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEACHER: APPROVED / PUBLISHED EXAM DASHBOARDS
  // ─────────────────────────────────────────────────────────────────────────────

  async findApprovedForTeacher(userId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) throw new UnauthorizedException('Active user is not registered as a teacher');

    return this.prisma.examination.findMany({
      where: { teacherId: teacher.id, status: ExamStatus.APPROVED },
      select: {
        id: true,
        title: true,
        totalMarks: true,
        duration: true,
        examDate: true,
        status: true,
        instructions: true,
        windowStart: true,
        windowEnd: true,
        delayMinutes: true,
        createdAt: true,
        updatedAt: true,
        Subject:      { select: { id: true, name: true } },
        Class:        { select: { id: true, name: true } },
        ClassSection: { select: { id: true, name: true } },
        questions:    { select: { id: true, text: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  async findPublishedForTeacher(userId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) throw new UnauthorizedException('Active user is not registered as a teacher');

    const exams = await this.prisma.examination.findMany({
      where: { teacherId: teacher.id, status: ExamStatus.PUBLISHED },
      select: {
        id: true,
        title: true,
        totalMarks: true,
        duration: true,
        examDate: true,
        status: true,
        instructions: true,
        windowStart: true,
        windowEnd: true,
        delayMinutes: true,
        resultsReleased: true,
        resultsReleasedAt: true,
        createdAt: true,
        updatedAt: true,
        Subject:      { select: { id: true, name: true } },
        ClassSection: { select: { id: true, name: true } },
        questions:    { select: { id: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    const now = new Date();
    return exams.map((e) => {
      let windowStatus: 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'NO_WINDOW' = 'NO_WINDOW';
      if (e.windowStart && e.windowEnd) {
        if (now < e.windowStart) windowStatus = 'SCHEDULED';
        else if (now > e.windowEnd) windowStatus = 'CLOSED';
        else windowStatus = 'OPEN';
      }
      return {
        id:                e.id,
        title:             e.title,
        duration:          e.duration,
        totalMarks:        e.totalMarks,
        status:            e.status,
        Subject:           e.Subject,
        ClassSection:      e.ClassSection,
        questionCount:     e.questions?.length ?? 0,
        windowStart:       e.windowStart?.toISOString() ?? null,
        windowEnd:         e.windowEnd?.toISOString()   ?? null,
        delayMinutes:      e.delayMinutes ?? 0,
        resultsReleased:   e.resultsReleased,
        resultsReleasedAt: e.resultsReleasedAt?.toISOString() ?? null,
        windowStatus,
        updatedAt:         e.updatedAt,
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEACHER: PUBLISH EXAM TO STUDENTS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Atomically moves an APPROVED exam to PUBLISHED and stamps the delivery
   * window so students can immediately see it on their dashboards.
   *
   * Guards:
   *  1. Caller must be the owning teacher.
   *  2. Exam must be APPROVED (not DRAFT / PENDING / REJECTED / already PUBLISHED).
   *  3. windowEnd must be after windowStart.
   *  4. Window cannot be more than 30 days in the future.
   *
   * Note: we do NOT reject start times close to or slightly before "now" because
   * the client sends a local-time value that may differ from the server clock by
   * several minutes depending on the teacher's timezone.  A 10-minute grace
   * window prevents false "in the past" rejections while still blocking clearly
   * stale dates.
   */
  async publishExam(
    examId: string,
    dto: { windowStart: string; windowEnd: string },
    userId: string,
  ) {
    // ── 1. Resolve teacher ───────────────────────────────────────────────────
    const teacher = await this.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) throw new UnauthorizedException('Active user is not registered as a teacher');

    // ── 2. Resolve exam ──────────────────────────────────────────────────────
    const exam = await this.prisma.examination.findUnique({ where: { id: examId } });
    if (!exam) throw new NotFoundException(`Examination with id "${examId}" not found`);
    if (exam.teacherId !== teacher.id) {
      throw new ForbiddenException('You do not own this examination');
    }

    if (exam.status === ExamStatus.PUBLISHED) {
      throw new BadRequestException(
        'This exam is already published. Use the delay endpoint to push the window back, or contact admin to retract.',
      );
    }
    if (exam.status !== ExamStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot publish an exam with status "${exam.status}". Only APPROVED exams can be published. ` +
        'Submit the exam for admin review first.',
      );
    }

    // ── 3. Parse and validate dates ──────────────────────────────────────────
    if (!dto.windowStart || !dto.windowEnd) {
      throw new BadRequestException('Both windowStart and windowEnd are required');
    }

    const start = new Date(dto.windowStart);
    const end   = new Date(dto.windowEnd);

    if (isNaN(start.getTime())) {
      throw new BadRequestException(
        `Invalid windowStart value: "${dto.windowStart}". Expected an ISO 8601 date string.`,
      );
    }
    if (isNaN(end.getTime())) {
      throw new BadRequestException(
        `Invalid windowEnd value: "${dto.windowEnd}". Expected an ISO 8601 date string.`,
      );
    }
    if (end <= start) {
      throw new BadRequestException(
        `windowEnd (${end.toISOString()}) must be after windowStart (${start.toISOString()})`,
      );
    }

    const now           = new Date();
    const maxFutureMs   = 30 * 24 * 60 * 60 * 1000;
    // 10-minute grace covers teacher timezone offset + network latency
    const gracePastMs   = 10 * 60 * 1000;

    if (start < new Date(now.getTime() - gracePastMs)) {
      throw new BadRequestException(
        'windowStart is too far in the past. Please choose a start time within the next 30 days.',
      );
    }
    if (start.getTime() - now.getTime() > maxFutureMs) {
      throw new BadRequestException('windowStart cannot be more than 30 days in the future');
    }

    // ── 4. Persist atomically ────────────────────────────────────────────────
    try {
      const updated = await this.prisma.examination.update({
        where: { id: examId },
        data: {
          status:       ExamStatus.PUBLISHED,
          windowStart:  start,
          windowEnd:    end,
          delayMinutes: 0,
          updatedAt:    now,
        },
        include: {
          Subject:      { select: { id: true, name: true } },
          ClassSection: { select: { id: true, name: true } },
          questions:    { select: { id: true } },
        },
      });

      return {
        id:            updated.id,
        title:         updated.title,
        status:        updated.status,
        windowStart:   updated.windowStart?.toISOString() ?? null,
        windowEnd:     updated.windowEnd?.toISOString()   ?? null,
        delayMinutes:  updated.delayMinutes,
        subject:       updated.Subject,
        classSection:  updated.ClassSection,
        questionCount: updated.questions?.length ?? 0,
        publishedAt:   now.toISOString(),
        message:
          `Exam "${updated.title}" has been published. ` +
          `Students can start from ${start.toLocaleString()} until ${end.toLocaleString()}.`,
      };
    } catch (error: any) {
      // Prisma errors (unique violations, DB unavailable, etc.) surface here
      // with a descriptive message instead of a raw 500.
      if (error.code === 'P2025') {
        throw new NotFoundException(`Examination "${examId}" was not found or was deleted`);
      }
      throw new InternalServerErrorException(
        `Failed to publish examination: ${error.message ?? 'Unknown database error'}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SCHEDULED DELIVERY WINDOW
  // ─────────────────────────────────────────────────────────────────────────────

  async scheduleWindow(examId: string, dto: { windowStart: string; windowEnd: string }, userId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) throw new UnauthorizedException('Active user is not registered as a teacher');

    const exam = await this.prisma.examination.findUnique({ where: { id: examId } });
    if (!exam) throw new NotFoundException('Examination not found');
    if (exam.teacherId !== teacher.id) throw new ForbiddenException('You do not own this examination');
    if (exam.status !== ExamStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED exams can be scheduled for delivery');
    }

    const start = new Date(dto.windowStart);
    const end   = new Date(dto.windowEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('Invalid date format for windowStart or windowEnd');
    }
    if (end <= start) throw new BadRequestException('windowEnd must be after windowStart');

    return this.prisma.examination.update({
      where: { id: examId },
      data:  { windowStart: start, windowEnd: end, updatedAt: new Date() },
      select: { id: true, title: true, windowStart: true, windowEnd: true, delayMinutes: true },
    });
  }

  async delayExam(examId: string, dto: { minutes: number }, userId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) throw new UnauthorizedException('Active user is not registered as a teacher');

    const exam = await this.prisma.examination.findUnique({ where: { id: examId } });
    if (!exam) throw new NotFoundException('Examination not found');
    if (exam.teacherId !== teacher.id) throw new ForbiddenException('You do not own this examination');

    // ── FIX: allow delaying both APPROVED and PUBLISHED exams ───────────────
    if (exam.status !== ExamStatus.APPROVED && exam.status !== ExamStatus.PUBLISHED) {
      throw new BadRequestException(
        `Cannot delay an exam with status "${exam.status}". Only APPROVED or PUBLISHED exams can be delayed.`,
      );
    }

    const mins = Number(dto.minutes);
    if (!mins || mins < 1 || mins > 120) {
      throw new BadRequestException('Delay must be between 1 and 120 minutes');
    }

    const shiftMs  = mins * 60 * 1000;
    const newStart = exam.windowStart ? new Date(exam.windowStart.getTime() + shiftMs) : null;
    const newEnd   = exam.windowEnd   ? new Date(exam.windowEnd.getTime()   + shiftMs) : null;

    return this.prisma.examination.update({
      where: { id: examId },
      data: {
        ...(newStart ? { windowStart: newStart } : {}),
        ...(newEnd   ? { windowEnd:   newEnd   } : {}),
        delayMinutes: (exam.delayMinutes ?? 0) + mins,
        updatedAt: new Date(),
      },
      select: { id: true, title: true, windowStart: true, windowEnd: true, delayMinutes: true },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STUDENT EXAM LISTING
  // ─────────────────────────────────────────────────────────────────────────────

  async getStudentAvailableExams(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: {
        id: true,
        classSectionId: true,
        StudentEnrollment: {
          where: { status: 'ACTIVE' },
          orderBy: { enrollmentDate: 'desc' },
          take: 1,
          select: { classSectionId: true },
        },
      },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    const effectiveSectionId = student.StudentEnrollment[0]?.classSectionId || student.classSectionId;
    if (!effectiveSectionId) {
      return [];
    }

    const exams = await this.prisma.examination.findMany({
      where: {
        classSectionId: effectiveSectionId,
        status:         ExamStatus.PUBLISHED,
      },
      select: {
        id: true, title: true, duration: true, totalMarks: true, examDate: true,
        windowStart: true, windowEnd: true, delayMinutes: true,
        resultsReleased: true, resultsReleasedAt: true,
        Subject:   { select: { id: true, name: true } },
        questions: { select: { id: true } },
        sessions: {
          where:  { studentId: student.id },
          select: {
            id: true,
            status: true,
            timeRemainingSeconds: true,
            startedAt: true,
            completedAt: true,
            score: true,
            totalMarks: true,
            percentage: true,
          },
        },
      },
      orderBy: { examDate: 'asc' },
    });

    const now = new Date();
    return exams.map((exam) => {
      const session = (exam.sessions as any[])?.[0] ?? null;
      let windowStatus: 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'NO_WINDOW' = 'NO_WINDOW';
      if (exam.windowStart && exam.windowEnd) {
        if (now < exam.windowStart) windowStatus = 'SCHEDULED';
        else if (now > exam.windowEnd) windowStatus = 'CLOSED';
        else windowStatus = 'OPEN';
      }
      return {
        id:                exam.id,
        title:             exam.title,
        duration:          exam.duration,
        totalMarks:        exam.totalMarks,
        examDate:          exam.examDate,
        windowStart:       exam.windowStart?.toISOString() ?? null,
        windowEnd:         exam.windowEnd?.toISOString()   ?? null,
        delayMinutes:      exam.delayMinutes ?? 0,
        resultsReleased:   exam.resultsReleased,
        resultsReleasedAt: exam.resultsReleasedAt?.toISOString() ?? null,
        windowStatus,
        subject:           exam.Subject,
        questionCount:     exam.questions?.length ?? 0,
        session: session
          ? {
              id:                   session.id,
              status:               session.status,
              timeRemainingSeconds: session.timeRemainingSeconds,
              startedAt:            session.startedAt,
              completedAt:          session.completedAt?.toISOString() ?? null,
              score:                session.score,
              totalMarks:           session.totalMarks,
              percentage:           session.percentage,
            }
          : null,
        serverNow: now.toISOString(),
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SESSION MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  async startSession(examId: string, userId: string, deviceFingerprint?: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: {
        id: true,
        classSectionId: true,
        StudentEnrollment: {
          where: { status: 'ACTIVE' },
          orderBy: { enrollmentDate: 'desc' },
          take: 1,
          select: { classSectionId: true },
        },
      },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    const effectiveSectionId = student.StudentEnrollment[0]?.classSectionId || student.classSectionId;

    const exam = await this.prisma.examination.findUnique({
      where: { id: examId },
      include: { questions: { include: { options: true } } },
    });
    if (!exam) throw new NotFoundException('Examination not found');

    if (exam.status !== ExamStatus.APPROVED && exam.status !== ExamStatus.PUBLISHED) {
      throw new BadRequestException('This exam is not available');
    }
    if (exam.classSectionId !== effectiveSectionId) {
      throw new ForbiddenException('This exam is not assigned to your class');
    }

    const now = new Date();
    if (exam.windowStart && now < exam.windowStart) {
      throw new BadRequestException(
        `Exam has not started yet. It opens at ${exam.windowStart.toISOString()}.`,
      );
    }
    if (exam.windowEnd && now > exam.windowEnd) {
      throw new BadRequestException('The exam window has closed. Contact your teacher.');
    }

    const existing = await this.prisma.examSession.findUnique({
      where: { examinationId_studentId: { examinationId: examId, studentId: student.id } },
    });

    if (existing) {
      if (existing.status === ExamSessionStatus.COMPLETED || existing.status === ExamSessionStatus.TIMED_OUT) {
        throw new BadRequestException('You have already completed this exam.');
      }
      if (existing.status === ExamSessionStatus.AWAITING_RESUME) {
        throw new BadRequestException('Your session is paused. Wait for your teacher to approve resumption.');
      }
      // ACTIVE or INTERRUPTED — re-issue token, restore state
      const newToken = crypto.randomBytes(32).toString('hex');
      const updated = await this.prisma.examSession.update({
        where: { id: existing.id },
        data: {
          sessionToken:      newToken,
          status:            ExamSessionStatus.ACTIVE,
          deviceFingerprint: deviceFingerprint ?? existing.deviceFingerprint,
          lastSavedAt:       now,
          resumeApprovedAt:  null,
        },
      });
      return {
        sessionToken:         newToken,
        timeRemainingSeconds: updated.timeRemainingSeconds,
        resumedAt:            now.toISOString(),
        answers:              JSON.parse(updated.answersJson || '{}'),
        questions:            this.scrubCorrectAnswers(exam.questions),
        serverNow:            now.toISOString(),
      };
    }

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const session = await this.prisma.examSession.create({
      data: {
        examinationId:        examId,
        studentId:            student.id,
        sessionToken,
        status:               ExamSessionStatus.ACTIVE,
        timeRemainingSeconds: exam.duration * 60,
        answersJson:          '{}',
        deviceFingerprint:    deviceFingerprint ?? null,
      },
    });

    return {
      sessionToken,
      timeRemainingSeconds: session.timeRemainingSeconds,
      resumedAt:            null,
      answers:              {},
      questions:            this.scrubCorrectAnswers(exam.questions),
      serverNow:            now.toISOString(),
    };
  }

  async saveProgress(
    examId: string,
    userId: string,
    dto: { sessionToken: string; answers: Record<string, string>; timeRemainingSeconds: number },
  ) {
    const student = await this.prisma.student.findUnique({ where: { userId }, select: { id: true } });
    if (!student) throw new NotFoundException('Student profile not found');

    const session = await this.prisma.examSession.findUnique({
      where: { examinationId_studentId: { examinationId: examId, studentId: student.id } },
    });
    if (!session) throw new NotFoundException('No active session found');
    if (session.sessionToken !== dto.sessionToken) {
      throw new ForbiddenException('Invalid session token');
    }
    if (session.status === ExamSessionStatus.COMPLETED || session.status === ExamSessionStatus.TIMED_OUT) {
      throw new BadRequestException('Session already ended');
    }

    await this.prisma.examSession.update({
      where: { id: session.id },
      data: {
        answersJson:          JSON.stringify(dto.answers),
        timeRemainingSeconds: Math.max(0, dto.timeRemainingSeconds),
        lastSavedAt:          new Date(),
        status:               ExamSessionStatus.ACTIVE,
      },
    });
    return { saved: true };
  }

  async submitSession(
    examId: string,
    userId: string,
    dto: { sessionToken: string; answers: Record<string, string> },
  ) {
    const student = await this.prisma.student.findUnique({ where: { userId }, select: { id: true } });
    if (!student) throw new NotFoundException('Student profile not found');

    const session = await this.prisma.examSession.findUnique({
      where: { examinationId_studentId: { examinationId: examId, studentId: student.id } },
    });
    if (!session) throw new NotFoundException('No active session found');
    if (session.sessionToken !== dto.sessionToken) throw new ForbiddenException('Invalid session token');
    if (session.status === ExamSessionStatus.COMPLETED || session.status === ExamSessionStatus.TIMED_OUT) {
      throw new BadRequestException('Session already ended');
    }

    const gradingResult = await this.submitAndAutoGrade({
      examinationId: examId,
      answers: Object.entries(dto.answers).map(([questionId, selectedOptionId]) => ({
        questionId,
        selectedOptionId,
      })),
    });

    await this.prisma.examSession.update({
      where: { id: session.id },
      data: {
        answersJson:          JSON.stringify(dto.answers),
        timeRemainingSeconds: 0,
        score:                gradingResult.score,
        totalMarks:           gradingResult.totalMarks,
        percentage:           gradingResult.percentage,
        status:               ExamSessionStatus.COMPLETED,
        completedAt:          new Date(),
        lastSavedAt:          new Date(),
      },
    });

    const exam = await this.prisma.examination.findUnique({
      where: { id: examId },
      select: { resultsReleased: true },
    });

    const isReleased = exam?.resultsReleased ?? false;

    return {
      success: true,
      score: gradingResult.score,
      totalMarks: gradingResult.totalMarks,
      percentage: gradingResult.percentage,
      breakdown: isReleased ? gradingResult.breakdown : [],
      resultsReleased: isReleased,
      sessionStatus: 'COMPLETED',
    };
  }

  async reportInterruption(examId: string, userId: string, dto: { sessionToken: string }) {
    const student = await this.prisma.student.findUnique({ where: { userId }, select: { id: true } });
    if (!student) throw new NotFoundException('Student profile not found');

    const session = await this.prisma.examSession.findUnique({
      where: { examinationId_studentId: { examinationId: examId, studentId: student.id } },
    });
    if (!session || session.sessionToken !== dto.sessionToken) {
      throw new ForbiddenException('Invalid session');
    }
    if (session.status !== ExamSessionStatus.ACTIVE && session.status !== ExamSessionStatus.INTERRUPTED) {
      return { status: session.status };
    }

    await this.prisma.examSession.update({
      where: { id: session.id },
      data: { status: ExamSessionStatus.AWAITING_RESUME },
    });
    return { status: 'AWAITING_RESUME' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEACHER: SESSION MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  async getInterruptedSessions(userId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) throw new UnauthorizedException('Active user is not registered as a teacher');

    const sessions = await this.prisma.examSession.findMany({
      where: {
        status:      ExamSessionStatus.AWAITING_RESUME,
        Examination: { teacherId: teacher.id },
      },
      include: { Examination: { select: { id: true, title: true, duration: true } } },
      orderBy: { lastSavedAt: 'asc' },
    });

    return Promise.all(
      sessions.map(async (s) => {
        const student = await this.prisma.student.findUnique({
          where:  { id: s.studentId },
          select: { id: true, firstName: true, lastName: true, admissionNo: true },
        });
        const questionCount = await this.prisma.question.count({ where: { examId: s.examinationId } });
        return {
          sessionId:            s.id,
          examId:               s.examinationId,
          examTitle:            s.Examination.title,
          studentId:            s.studentId,
          studentName:          student ? `${student.firstName} ${student.lastName}` : 'Unknown',
          admissionNo:          student?.admissionNo ?? '—',
          timeRemainingSeconds: s.timeRemainingSeconds,
          interruptedAt:        s.lastSavedAt,
          answeredCount:        Object.keys(JSON.parse(s.answersJson || '{}')).length,
          totalQuestions:       questionCount,
        };
      }),
    );
  }

  async approveResume(sessionId: string, userId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) throw new UnauthorizedException('Active user is not registered as a teacher');

    const session = await this.prisma.examSession.findUnique({
      where:   { id: sessionId },
      include: { Examination: { select: { teacherId: true } } },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.Examination.teacherId !== teacher.id) {
      throw new ForbiddenException('You do not own the examination for this session');
    }
    if (session.status !== ExamSessionStatus.AWAITING_RESUME) {
      throw new BadRequestException(`Session is already ${session.status}`);
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    const updated = await this.prisma.examSession.update({
      where: { id: sessionId },
      data: {
        status:              ExamSessionStatus.ACTIVE,
        sessionToken:        newToken,
        resumeApprovedAt:    new Date(),
        resumeApprovedById:  userId,
      },
    });

    return {
      approved:             true,
      sessionId:            updated.id,
      newSessionToken:      newToken,
      timeRemainingSeconds: updated.timeRemainingSeconds,
    };
  }

  async pollResumeStatus(examId: string, userId: string) {
    const student = await this.prisma.student.findUnique({ where: { userId }, select: { id: true } });
    if (!student) throw new NotFoundException('Student profile not found');

    const session = await this.prisma.examSession.findUnique({
      where: { examinationId_studentId: { examinationId: examId, studentId: student.id } },
    });
    if (!session) throw new NotFoundException('No session found for this exam');

    if (session.status === ExamSessionStatus.ACTIVE && session.resumeApprovedAt) {
      return {
        status:               'APPROVED',
        sessionToken:         session.sessionToken,
        timeRemainingSeconds: session.timeRemainingSeconds,
        answers:              JSON.parse(session.answersJson || '{}'),
      };
    }
    return { status: session.status };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTO-GRADE (legacy + session submit)
  // ─────────────────────────────────────────────────────────────────────────────

  async submitAndAutoGrade(dto: {
    examinationId: string;
    studentId?: string;
    answers: Array<{ questionId: string; selectedOptionId: string }>;
  }) {
    const exam = await this.prisma.examination.findUnique({ where: { id: dto.examinationId } });
    if (!exam) throw new NotFoundException('Examination not found');

    const questions = await this.prisma.question.findMany({
      where: { examId: dto.examinationId },
      include: { options: true },
    });

    let earnedScore       = 0;
    let totalPossibleMarks = 0;
    const gradedAnswers: any[] = [];
    const perQ = questions.length > 0 && exam.totalMarks > 0 ? exam.totalMarks / questions.length : 10;

    for (const question of questions) {
      const qMarks = (question as any).marks || perQ;
      totalPossibleMarks += qMarks;

      const correctOption  = question.options.find((o: any) => o.isCorrect);
      const studentAnswer  = (dto.answers || []).find((a) => a.questionId === question.id);
      const selectedOptionId = studentAnswer?.selectedOptionId ?? '';
      const isCorrect      = correctOption ? correctOption.id === selectedOptionId : false;

      if (isCorrect) earnedScore += qMarks;

      gradedAnswers.push({
        questionId:      question.id,
        questionText:    question.text,
        selectedOptionId,
        correctOptionId: correctOption?.id || '',
        isCorrect,
        marksAwarded:    isCorrect ? qMarks : 0,
        options:         question.options,
      });
    }

    return {
      success:    true,
      score:      earnedScore,
      totalMarks: totalPossibleMarks,
      percentage: totalPossibleMarks > 0 ? Math.round((earnedScore / totalPossibleMarks) * 100) : 0,
      breakdown:  gradedAnswers,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // POST-EXAM REVIEW & RESULTS RELEASE
  // ─────────────────────────────────────────────────────────────────────────────

  async toggleResultsRelease(examId: string, teacherUserId: string, release: boolean) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: teacherUserId },
      select: { id: true },
    });
    if (!teacher) throw new UnauthorizedException('Active user is not registered as a teacher');

    const exam = await this.prisma.examination.findUnique({
      where: { id: examId },
      select: { id: true, teacherId: true, title: true, status: true },
    });
    if (!exam) throw new NotFoundException('Examination not found');
    if (exam.teacherId !== teacher.id) {
      throw new ForbiddenException('You do not have permission to manage this examination');
    }

    const updated = await this.prisma.examination.update({
      where: { id: examId },
      data: {
        resultsReleased: release,
        resultsReleasedAt: release ? new Date() : null,
      },
      select: {
        id: true,
        title: true,
        resultsReleased: true,
        resultsReleasedAt: true,
      },
    });

    return {
      success: true,
      message: release
        ? `Exam review and results successfully released to students for "${exam.title}".`
        : `Exam review retracted. Students can no longer access the answer key.`,
      exam: updated,
    };
  }

  async getTeacherExamResultsSummary(examId: string, teacherUserId: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: teacherUserId },
      select: { id: true },
    });
    if (!teacher) throw new UnauthorizedException('Active user is not registered as a teacher');

    const exam = await this.prisma.examination.findUnique({
      where: { id: examId },
      select: {
        id: true,
        title: true,
        totalMarks: true,
        duration: true,
        status: true,
        teacherId: true,
        resultsReleased: true,
        resultsReleasedAt: true,
        windowStart: true,
        windowEnd: true,
        classSectionId: true,
        Subject: { select: { id: true, name: true, code: true } },
        ClassSection: { select: { id: true, name: true } },
        questions: {
          select: {
            id: true,
            text: true,
            options: {
              select: { id: true, optionText: true, isCorrect: true },
            },
          },
        },
      },
    });
    if (!exam) throw new NotFoundException('Examination not found');
    if (exam.teacherId !== teacher.id) {
      throw new ForbiddenException('You do not have permission to view this examination');
    }

    // Fetch all enrolled students in this class section
    const enrolledStudents = await this.prisma.student.findMany({
      where: { classSectionId: exam.classSectionId },
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        gender: true,
      },
      orderBy: { firstName: 'asc' },
    });

    // Fetch all exam sessions for this exam
    const sessions = await this.prisma.examSession.findMany({
      where: { examinationId: examId },
      select: {
        id: true,
        studentId: true,
        status: true,
        score: true,
        totalMarks: true,
        percentage: true,
        answersJson: true,
        startedAt: true,
        completedAt: true,
        lastSavedAt: true,
      },
    });

    const sessionMap = new Map(sessions.map((s) => [s.studentId, s]));

    const studentRows = enrolledStudents.map((st) => {
      const s = sessionMap.get(st.id);
      let answersCount = 0;
      if (s?.answersJson) {
        try {
          answersCount = Object.keys(JSON.parse(s.answersJson)).length;
        } catch {
          answersCount = 0;
        }
      }

      const score = s?.score ?? null;
      const totalMarks = s?.totalMarks ?? exam.totalMarks;
      const percentage = s?.percentage ?? (score !== null && totalMarks > 0 ? Math.round((score / totalMarks) * 100) : null);
      const passed = percentage !== null ? percentage >= 60 : null;

      return {
        studentId: st.id,
        admissionNo: st.admissionNo,
        studentName: `${st.firstName} ${st.lastName}`.trim(),
        gender: st.gender,
        sessionId: s?.id ?? null,
        sessionStatus: s?.status ?? 'NOT_STARTED',
        startedAt: s?.startedAt?.toISOString() ?? null,
        completedAt: s?.completedAt?.toISOString() ?? null,
        score,
        totalMarks,
        percentage,
        passed,
        answeredQuestionsCount: answersCount,
      };
    });

    const completed = studentRows.filter((r) => r.sessionStatus === 'COMPLETED' || r.sessionStatus === 'TIMED_OUT');
    const scores = completed.map((r) => r.score ?? 0);
    const averageScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
    const highestScore = scores.length > 0 ? Math.max(...scores) : 0;
    const lowestScore = scores.length > 0 ? Math.min(...scores) : 0;
    const passCount = completed.filter((r) => r.passed).length;
    const passRate = completed.length > 0 ? Math.round((passCount / completed.length) * 100) : 0;

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        totalMarks: exam.totalMarks,
        duration: exam.duration,
        resultsReleased: exam.resultsReleased,
        resultsReleasedAt: exam.resultsReleasedAt?.toISOString() ?? null,
        subject: exam.Subject,
        classSection: exam.ClassSection,
        questionCount: exam.questions.length,
      },
      stats: {
        totalEnrolled: enrolledStudents.length,
        submissionsCount: completed.length,
        pendingCount: enrolledStudents.length - completed.length,
        averageScore,
        highestScore,
        lowestScore,
        passRate,
        passCount,
      },
      students: studentRows,
    };
  }

  async deleteStudentExamResult(examId: string, studentId: string, teacherUserId: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: teacherUserId },
      select: { id: true },
    });
    if (!teacher) throw new UnauthorizedException('Active user is not registered as a teacher');

    const exam = await this.prisma.examination.findUnique({
      where: { id: examId },
      select: { id: true, teacherId: true },
    });
    if (!exam) throw new NotFoundException('Examination not found');
    if (exam.teacherId !== teacher.id) {
      throw new ForbiddenException('You do not have permission to manage this examination');
    }

    await this.prisma.examSession.deleteMany({
      where: {
        examinationId: examId,
        studentId,
      },
    });

    return {
      success: true,
      message: 'Student exam session and results have been reset.',
    };
  }

  async getStudentExamReview(examId: string, studentUserId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId: studentUserId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!student) throw new NotFoundException('Student profile not found');

    const exam = await this.prisma.examination.findUnique({
      where: { id: examId },
      select: {
        id: true,
        title: true,
        totalMarks: true,
        duration: true,
        resultsReleased: true,
        resultsReleasedAt: true,
        instructions: true,
        Subject: { select: { id: true, name: true, code: true } },
        ClassSection: { select: { id: true, name: true } },
        questions: {
          select: {
            id: true,
            text: true,
            options: {
              select: {
                id: true,
                optionText: true,
                isCorrect: true,
              },
            },
          },
        },
      },
    });
    if (!exam) throw new NotFoundException('Examination not found');

    // STRICT SECURITY CHECK:
    if (!exam.resultsReleased) {
      throw new ForbiddenException(
        'Exam review and correct answers have not been released by your teacher yet.',
      );
    }

    const session = await this.prisma.examSession.findUnique({
      where: {
        examinationId_studentId: {
          examinationId: examId,
          studentId: student.id,
        },
      },
    });

    if (!session || (session.status !== ExamSessionStatus.COMPLETED && session.status !== ExamSessionStatus.TIMED_OUT)) {
      throw new BadRequestException('You have not completed this exam yet.');
    }

    let studentAnswers: Record<string, string> = {};
    if (session.answersJson) {
      try {
        studentAnswers = JSON.parse(session.answersJson);
      } catch {
        studentAnswers = {};
      }
    }

    const perQ = exam.questions.length > 0 && exam.totalMarks > 0 ? exam.totalMarks / exam.questions.length : 10;
    let totalEarnedScore = 0;
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    const questionBreakdown = exam.questions.map((q, idx) => {
      const qMarks = (q as any).marks || perQ;
      const selectedOptionId = studentAnswers[q.id] || null;
      const correctOption = q.options.find((o) => o.isCorrect) || null;
      const isAnswered = Boolean(selectedOptionId);
      const isCorrect = isAnswered && correctOption ? selectedOptionId === correctOption.id : false;

      if (isCorrect) {
        totalEarnedScore += qMarks;
        correctCount += 1;
      } else if (!isAnswered) {
        unansweredCount += 1;
      } else {
        incorrectCount += 1;
      }

      return {
        questionNumber: idx + 1,
        questionId: q.id,
        questionText: q.text,
        maxMarks: qMarks,
        earnedMarks: isCorrect ? qMarks : 0,
        status: isCorrect ? 'CORRECT' : !isAnswered ? 'UNANSWERED' : 'INCORRECT',
        studentAnswer: {
          optionId: selectedOptionId,
          optionText: q.options.find((o) => o.id === selectedOptionId)?.optionText ?? null,
        },
        correctAnswer: {
          optionId: correctOption?.id ?? null,
          optionText: correctOption?.optionText ?? null,
        },
        options: q.options.map((opt) => ({
          id: opt.id,
          text: opt.optionText,
          isCorrect: opt.isCorrect,
          isSelected: opt.id === selectedOptionId,
        })),
      };
    });

    const finalScore = session.score ?? totalEarnedScore;
    const finalTotalMarks = session.totalMarks ?? exam.totalMarks;
    const percentage = session.percentage ?? (finalTotalMarks > 0 ? Math.round((finalScore / finalTotalMarks) * 100) : 0);

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        totalMarks: finalTotalMarks,
        duration: exam.duration,
        subjectName: exam.Subject?.name ?? 'Subject',
        subjectCode: exam.Subject?.code ?? '',
        classSection: exam.ClassSection?.name ?? '',
        resultsReleasedAt: exam.resultsReleasedAt?.toISOString() ?? null,
      },
      summary: {
        score: finalScore,
        totalMarks: finalTotalMarks,
        percentage,
        passed: percentage >= 60,
        totalQuestions: exam.questions.length,
        correctCount,
        incorrectCount,
        unansweredCount,
        completedAt: session.completedAt?.toISOString() ?? session.lastSavedAt.toISOString(),
      },
      questions: questionBreakdown,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INTERNAL HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  private scrubCorrectAnswers(questions: any[]) {
    return questions.map((q) => ({
      id:      q.id,
      text:    q.text,
      options: q.options.map((o: any) => ({ id: o.id, optionText: o.optionText })),
    }));
  }
}
