import { Injectable, BadRequestException, ForbiddenException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ReturnSubjectDto, GetSubjectStatusDto } from './dto/correction-request.dto';
import { GetGradeItemsDto, UpdateGradeItemDto } from './dto/grade-items.dto';

@Injectable()
export class ResultsService {
  constructor(private readonly prisma: PrismaService) {}

  // Subject Teacher saves draft or updates marks
  private async getTeacher(userId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { userId }, select: { id: true } });
    if (!teacher) throw new UnauthorizedException('Active user is not registered as a teacher');
    return teacher;
  }

  private async assertAssignment(userId: string, classSectionId: string, subjectId: string, academicYearId: string) {
    const teacher = await this.getTeacher(userId);
    const assignment = await (this.prisma as any).sectionSubjectTeacher.findFirst({ where: { teacherId: teacher.id, classSectionId, subjectId, academicYearId } });
    if (!assignment) throw new ForbiddenException('You are not assigned to this subject and section');
  }

  private async getActiveRosterStudentIds(classSectionId: string, academicYearId: string) {
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { classSectionId, academicYearId, status: 'ACTIVE' },
      select: { studentId: true },
    });
    return new Set(enrollments.map((enrollment) => enrollment.studentId));
  }

  private async assertRosterNotLocked(classSectionId: string, academicYearId: string) {
    const review = await (this.prisma as any).classRosterReview.findUnique({
      where: {
        classSectionId_academicYearId: {
          classSectionId,
          academicYearId,
        },
      },
      select: { status: true },
    });

    if (!review) return;

    if (review.status === 'APPROVED') {
      throw new BadRequestException(
        'The class roster for this section and academic year has been approved by the administrator and is locked for editing.',
      );
    }

    if (review.status === 'SUBMITTED_TO_ADMIN') {
      throw new BadRequestException(
        'The class roster for this section and academic year has been submitted to the administrator and is locked for editing.',
      );
    }
  }

  async saveGradesDraft(dto: {
    classSectionId: string;
    subjectId: string;
    academicYearId: string;
    term: string;
    grades: Array<{
      studentId: string;
      marks: number;
      mid?: number;
      assignment?: number;
      quiz?: number;
      classwork?: number;
      final?: number;
    }>;
  }, userId: string) {
    await this.assertAssignment(userId, dto.classSectionId, dto.subjectId, dto.academicYearId);
    await this.assertRosterNotLocked(dto.classSectionId, dto.academicYearId);
    const enrolledIds = await this.getActiveRosterStudentIds(dto.classSectionId, dto.academicYearId);
    // The client can retain a stale row after an enrollment transfer. Save
    // active-roster grades and report ignored rows instead of rejecting class work.
    const validGrades = dto.grades.filter((grade) => enrolledIds.has(grade.studentId));
    const ignoredStudentIds = dto.grades
      .filter((grade) => !enrolledIds.has(grade.studentId))
      .map((grade) => grade.studentId);
    const submittedResultCount = await (this.prisma as any).subjectResult.count({
      where: {
        classSectionId: dto.classSectionId,
        subjectId: dto.subjectId,
        academicYearId: dto.academicYearId,
        term: dto.term,
        status: 'SUBMITTED',
      },
    });
    if (submittedResultCount > 0) {
      throw new BadRequestException('Submitted results are locked. Ask the homeroom teacher to return them for correction.');
    }
    const operations = validGrades.map((g) =>
      (this.prisma as any).subjectResult.upsert({
        where: {
          studentId_subjectId_classSectionId_academicYearId_term: {
            studentId: g.studentId,
            subjectId: dto.subjectId,
            classSectionId: dto.classSectionId,
            academicYearId: dto.academicYearId,
            term: dto.term,
          },
        },
        update: { marks: g.marks, status: 'DRAFT' },
        create: {
          studentId: g.studentId,
          subjectId: dto.subjectId,
          classSectionId: dto.classSectionId,
          academicYearId: dto.academicYearId,
          term: dto.term,
          marks: g.marks,
          status: 'DRAFT',
        },
      })
    );
    const results = operations.length ? await this.prisma.$transaction(operations) : [];

    // Also persist student component scores into Grade table for granular breakdown
    const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    const subjectName = subject?.name || dto.subjectId;
    const quarter = dto.term.startsWith('TERM_') ? dto.term.replace('TERM_', 'Quarter ') : dto.term;

    for (const g of validGrades) {
      if (
        g.mid !== undefined ||
        g.assignment !== undefined ||
        g.quiz !== undefined ||
        g.classwork !== undefined ||
        g.final !== undefined
      ) {
        const existingGrade = await this.prisma.grade.findFirst({
          where: {
            studentId: g.studentId,
            subject: subjectName,
            quarter,
          },
        });
        if (existingGrade) {
          await this.prisma.grade.update({
            where: { id: existingGrade.id },
            data: {
              mid: g.mid !== undefined ? g.mid : existingGrade.mid,
              assignment: g.assignment !== undefined ? g.assignment : existingGrade.assignment,
              quiz: g.quiz !== undefined ? g.quiz : existingGrade.quiz,
              classwork: g.classwork !== undefined ? g.classwork : existingGrade.classwork,
              final: g.final !== undefined ? g.final : existingGrade.final,
              score: g.marks,
            },
          });
        } else {
          await this.prisma.grade.create({
            data: {
              studentId: g.studentId,
              subject: subjectName,
              quarter,
              mid: g.mid ?? 0,
              assignment: g.assignment ?? 0,
              quiz: g.quiz ?? 0,
              classwork: g.classwork ?? 0,
              final: g.final ?? 0,
              score: g.marks,
            },
          });
        }
      }
    }

    return { results, savedCount: results.length, ignoredStudentIds };
  }

  async publishStudentResult(dto: { classSectionId: string; subjectId: string; academicYearId: string; term: string; studentId: string }, userId: string) {
    await this.assertAssignment(userId, dto.classSectionId, dto.subjectId, dto.academicYearId);
    await this.assertRosterNotLocked(dto.classSectionId, dto.academicYearId);
    
    const activeStudentIds = await this.getActiveRosterStudentIds(dto.classSectionId, dto.academicYearId);
    if (!activeStudentIds.has(dto.studentId)) {
      throw new BadRequestException('Student is not actively enrolled in this class section for the selected academic year');
    }

    // Verify result exists for this student with marks
    const existingResult = await (this.prisma as any).subjectResult.findUnique({
      where: {
        studentId_subjectId_classSectionId_academicYearId_term: {
          studentId: dto.studentId,
          subjectId: dto.subjectId,
          classSectionId: dto.classSectionId,
          academicYearId: dto.academicYearId,
          term: dto.term
        }
      }
    });
    if (!existingResult) {
      throw new BadRequestException('Save this student result before publishing');
    }

    // Publish the result
    const result = await (this.prisma as any).subjectResult.update({
      where: {
        studentId_subjectId_classSectionId_academicYearId_term: {
          studentId: dto.studentId,
          subjectId: dto.subjectId,
          classSectionId: dto.classSectionId,
          academicYearId: dto.academicYearId,
          term: dto.term
        }
      },
      data: { status: 'SUBMITTED' }
    });
    return { success: true, count: 1, result };
  }

  // Subject Teacher submits grades to Homeroom Teacher (Locks editing)
  async submitToHomeroom(
    dto: {
      classSectionId: string;
      subjectId: string;
      academicYearId: string;
      term: string;
      homeroomTeacherId?: string;
      // Optional inline grades array — if provided, we save the draft first so
      // the teacher never has to press "Save" before pressing "Send to Homeroom".
      grades?: Array<{ studentId: string; marks: number }>;
    },
    userId: string,
  ) {
    await this.assertAssignment(userId, dto.classSectionId, dto.subjectId, dto.academicYearId);
    await this.assertRosterNotLocked(dto.classSectionId, dto.academicYearId);

    // Verify the class section and resolve its homeroom teacher
    const classSection = await this.prisma.classSection.findUnique({
      where: { id: dto.classSectionId },
      select: { teacherId: true },
    });
    if (!classSection) throw new BadRequestException('Class section not found');
    if (!classSection.teacherId) throw new BadRequestException('No homeroom teacher assigned to this class section');

    const activeStudentIds = await this.getActiveRosterStudentIds(dto.classSectionId, dto.academicYearId);
    const enrolledCount = activeStudentIds.size;
    if (enrolledCount === 0) throw new BadRequestException('No active students enrolled in this class section');

    // ── Auto-save any grades passed inline ───────────────────────────────────
    // This lets the frontend call submit-to-homeroom in a single round-trip
    // without requiring a prior explicit draft save.
    if (dto.grades && dto.grades.length > 0) {
      const validGrades = dto.grades.filter((g) => activeStudentIds.has(g.studentId));
      if (validGrades.length > 0) {
        // Only upsert if results are not already locked (SUBMITTED)
        const lockedCount = await (this.prisma as any).subjectResult.count({
          where: {
            classSectionId: dto.classSectionId,
            subjectId: dto.subjectId,
            academicYearId: dto.academicYearId,
            term: dto.term,
            status: 'SUBMITTED',
          },
        });
        if (lockedCount === 0) {
          const upserts = validGrades.map((g) =>
            (this.prisma as any).subjectResult.upsert({
              where: {
                studentId_subjectId_classSectionId_academicYearId_term: {
                  studentId: g.studentId,
                  subjectId: dto.subjectId,
                  classSectionId: dto.classSectionId,
                  academicYearId: dto.academicYearId,
                  term: dto.term,
                },
              },
              update: { marks: g.marks },
              create: {
                studentId: g.studentId,
                subjectId: dto.subjectId,
                classSectionId: dto.classSectionId,
                academicYearId: dto.academicYearId,
                term: dto.term,
                marks: g.marks,
                status: 'DRAFT',
              },
            }),
          );
          await this.prisma.$transaction(upserts);

          // Persist student component scores into Grade table
          const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
          const subjectName = subject?.name || dto.subjectId;
          const quarter = dto.term.startsWith('TERM_') ? dto.term.replace('TERM_', 'Quarter ') : dto.term;

          for (const g of validGrades as any[]) {
            if (
              g.mid !== undefined ||
              g.assignment !== undefined ||
              g.quiz !== undefined ||
              g.classwork !== undefined ||
              g.final !== undefined
            ) {
              const existingGrade = await this.prisma.grade.findFirst({
                where: {
                  studentId: g.studentId,
                  subject: subjectName,
                  quarter,
                },
              });
              if (existingGrade) {
                await this.prisma.grade.update({
                  where: { id: existingGrade.id },
                  data: {
                    mid: g.mid !== undefined ? g.mid : existingGrade.mid,
                    assignment: g.assignment !== undefined ? g.assignment : existingGrade.assignment,
                    quiz: g.quiz !== undefined ? g.quiz : existingGrade.quiz,
                    classwork: g.classwork !== undefined ? g.classwork : existingGrade.classwork,
                    final: g.final !== undefined ? g.final : existingGrade.final,
                    score: g.marks,
                  },
                });
              } else {
                await this.prisma.grade.create({
                  data: {
                    studentId: g.studentId,
                    subject: subjectName,
                    quarter,
                    mid: g.mid ?? 0,
                    assignment: g.assignment ?? 0,
                    quiz: g.quiz ?? 0,
                    classwork: g.classwork ?? 0,
                    final: g.final ?? 0,
                    score: g.marks,
                  },
                });
              }
            }
          }
        }
      }
    }

    // ── Validation: every active enrolled student must have a result row ─────
    // We count rows that exist regardless of status, so a teacher who saved a
    // draft for all students can submit even before individual rows are SUBMITTED.
    const resultCount = await (this.prisma as any).subjectResult.count({
      where: {
        classSectionId: dto.classSectionId,
        subjectId: dto.subjectId,
        academicYearId: dto.academicYearId,
        term: dto.term,
        studentId: { in: [...activeStudentIds] },
      },
    });

    if (resultCount === 0) {
      throw new BadRequestException('Enter marks for at least one student before submitting to homeroom');
    }
    if (resultCount < enrolledCount) {
      const missingCount = enrolledCount - resultCount;
      throw new BadRequestException(
        `${missingCount} enrolled student${missingCount > 1 ? 's are' : ' is'} still missing marks. ` +
          `Fill in all ${enrolledCount} students or use "Save Class Results" first.`,
      );
    }

    // ── Atomically mark all results SUBMITTED and resolve pending correction requests ─────
    const updated = await (this.prisma as any).subjectResult.updateMany({
      where: {
        classSectionId: dto.classSectionId,
        subjectId: dto.subjectId,
        academicYearId: dto.academicYearId,
        term: dto.term,
        studentId: { in: [...activeStudentIds] },
      },
      data: { status: 'SUBMITTED' },
    });

    await (this.prisma as any).subjectCorrectionRequest.updateMany({
      where: {
        classSectionId: dto.classSectionId,
        academicYearId: dto.academicYearId,
        subjectId: dto.subjectId,
        term: dto.term,
        status: 'PENDING',
      },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    });

    return { success: true, count: updated.count, homeroomTeacherId: classSection.teacherId };
  }

  // Homeroom Teacher checks submission status across all subjects
  async getHomeroomSubmissionMatrix(classSectionId: string, academicYearId: string, term: string, userId: string) {
    // Homeroom teacher is stored via ClassSection.teacherId
    const teacher = await this.prisma.teacher.findFirst({ where: { userId }, select: { id: true } });
    const section = teacher
      ? await this.prisma.classSection.findFirst({
          where: { id: classSectionId, teacherId: teacher.id },
          select: {
            id: true,
            name: true,
            GradeLevel: { select: { name: true } },
            AcademicYear: { select: { year: true } },
          },
        })
      : null;
    if (!section) throw new ForbiddenException('Only the homeroom teacher can view this submission matrix');

    const [enrolledCount, assignedSubjects, allSubmittedResults, allReturnedResults, allPendingCorrections, review] = await Promise.all([
      this.prisma.studentEnrollment.count({
        where: { classSectionId, academicYearId, status: 'ACTIVE' },
      }),
      (this.prisma as any).sectionSubjectTeacher.findMany({
        where: { classSectionId, academicYearId },
        select: {
          subjectId: true,
          teacherId: true,
          Subject: { select: { name: true, code: true } },
          Teacher: { select: { firstName: true, lastName: true } },
        },
        orderBy: { Subject: { name: 'asc' } },
      }),
      (this.prisma as any).subjectResult.findMany({
        where: {
          classSectionId,
          academicYearId,
          term,
          status: 'SUBMITTED',
        },
        select: { subjectId: true, studentId: true, updatedAt: true },
      }),
      (this.prisma as any).subjectResult.findMany({
        where: {
          classSectionId,
          academicYearId,
          term,
          status: 'RETURNED_FOR_CORRECTION',
        },
        select: { subjectId: true, studentId: true },
      }),
      (this.prisma as any).subjectCorrectionRequest.findMany({
        where: {
          classSectionId,
          academicYearId,
          term,
          status: 'PENDING',
        },
        orderBy: { createdAt: 'desc' },
      }),
      (this.prisma as any).classRosterReview.findUnique({
        where: {
          classSectionId_academicYearId: { classSectionId, academicYearId },
        },
        select: { status: true },
      }),
    ]);

    // Group submitted results by subjectId in memory
    const resultsBySubject = new Map<string, Array<{ studentId: string; updatedAt: Date }>>();
    for (const result of allSubmittedResults) {
      let list = resultsBySubject.get(result.subjectId);
      if (!list) {
        list = [];
        resultsBySubject.set(result.subjectId, list);
      }
      list.push(result);
    }

    const returnedBySubject = new Set(allReturnedResults.map((r: any) => r.subjectId));
    const correctionsBySubject = new Map<string, any>();
    for (const corr of allPendingCorrections) {
      if (!correctionsBySubject.has(corr.subjectId)) {
        correctionsBySubject.set(corr.subjectId, corr);
      }
    }

    const isRosterLocked = review?.status === 'APPROVED' || review?.status === 'SUBMITTED_TO_ADMIN';

    const matrix = assignedSubjects.map((assignment: any) => {
      const submittedResults = resultsBySubject.get(assignment.subjectId) || [];
      const submittedCount = new Set(submittedResults.map((result: any) => result.studentId)).size;
      const submittedAt = submittedResults.length
        ? submittedResults.reduce(
            (latest: Date, result: any) => (result.updatedAt > latest ? result.updatedAt : latest),
            submittedResults[0].updatedAt,
          )
        : null;

      const isReturned = returnedBySubject.has(assignment.subjectId);
      const pendingCorrection = correctionsBySubject.get(assignment.subjectId);
      const isCorrectionRequired = isReturned || !!pendingCorrection;
      const isSubmitted = !isCorrectionRequired && enrolledCount > 0 && submittedCount === enrolledCount;

      return {
        subjectId: assignment.subjectId,
        subjectName: assignment.Subject.name,
        subjectCode: assignment.Subject.code,
        teacherId: assignment.teacherId,
        teacherName: `${assignment.Teacher.firstName} ${assignment.Teacher.lastName}`,
        submittedCount,
        enrolledCount,
        isSubmitted,
        isReturnedForCorrection: isCorrectionRequired,
        correctionRequired: isCorrectionRequired,
        correctionReason: pendingCorrection?.reason ?? null,
        returnedAt: pendingCorrection?.createdAt ?? null,
        canReturn: isSubmitted && !isRosterLocked,
        status: isCorrectionRequired
          ? 'RETURNED_FOR_CORRECTION'
          : isSubmitted
            ? 'SUBMITTED'
            : submittedCount > 0
              ? 'DRAFT'
              : 'NOT_STARTED',
        completionPercentage: enrolledCount ? Math.round((submittedCount / enrolledCount) * 100) : 0,
        submittedAt,
      };
    });

    const allSubmitted = matrix.length > 0 && matrix.every((item: any) => item.isSubmitted);
    return {
      allSubmitted,
      subjects: matrix,
      matrix,
      totalSubmitted: matrix.filter((item: any) => item.isSubmitted).length,
      totalSubjects: matrix.length,
      isRosterLocked,
      rosterReviewStatus: review?.status ?? 'DRAFT',
      classSectionName: [section.GradeLevel?.name, section.name].filter(Boolean).join(' '),
      academicYear: section.AcademicYear?.year ?? academicYearId,
      term,
    };
  }

  // Get available homeroom teachers for a class section
  async getHomeroomTeachers(classSectionId: string, academicYearId: string) {
    // Get the class section with its current homeroom teacher
    const classSection = await this.prisma.classSection.findUnique({
      where: { id: classSectionId },
      include: {
        Teacher: {
          select: { id: true, userId: true, firstName: true, lastName: true }
        }
      }
    });

    if (!classSection) {
      throw new BadRequestException('Class section not found');
    }

    if (!classSection.Teacher) {
      throw new BadRequestException('No homeroom teacher assigned to this class section');
    }

    // A subject result must be sent to the section's actual homeroom teacher.
    // Offering subject teachers as alternate recipients caused invisible results.
    const teachers = [{
        id: classSection.Teacher.id,
        name: `${classSection.Teacher.firstName} ${classSection.Teacher.lastName}`,
        isCurrentHomeroom: true
    }];

    return {
      classSectionId,
      teachers,
      defaultHomeroomTeacherId: classSection.teacherId
    };
  }

  // Get all student results for a given class, term
  async getStudentResults(classSectionId: string, academicYearId: string, term: string, userId: string) {
    // Verify user is homeroom teacher for this section
    const teacher = await this.prisma.teacher.findFirst({ where: { userId }, select: { id: true } });
    const section = teacher
      ? await this.prisma.classSection.findFirst({
          where: { id: classSectionId, teacherId: teacher.id },
          select: { id: true },
        })
      : null;
    if (!section) throw new ForbiddenException('Only the homeroom teacher can view student results');

    // Fetch all submitted results for this section/term
    const results = await (this.prisma as any).subjectResult.findMany({
      where: {
        classSectionId,
        academicYearId,
        term,
        status: 'SUBMITTED'
      },
      include: { 
        Student: { select: { admissionNo: true, firstName: true, lastName: true } },
        Subject: true
      },
      orderBy: [{ studentId: 'asc' }, { subjectId: 'asc' }]
    });

    return results.map((result: any) => ({
      studentId: result.studentId,
      admissionNo: result.Student.admissionNo,
      studentName: `${result.Student.firstName} ${result.Student.lastName}`,
      marks: result.marks,
      subjectId: result.subjectId,
      term: result.term,
      status: result.status
    }));
  }

  // ── Step 2: Subject Grade Return & Correction ─────────────────────────────

  async returnSubjectResultToTeacher(
    dto: ReturnSubjectDto,
    userId: string,
  ) {
    const teacher = await this.getTeacher(userId);

    const section = await this.prisma.classSection.findUnique({
      where: { id: dto.classSectionId },
      select: {
        id: true,
        name: true,
        status: true,
        academicYearId: true,
        teacherId: true,
      },
    });

    if (!section) {
      throw new BadRequestException('Class section not found');
    }
    if (section.academicYearId !== dto.academicYearId) {
      throw new BadRequestException('Class section does not belong to the selected academic year');
    }
    if (section.status !== 'ACTIVE') {
      throw new BadRequestException('Class section is not active');
    }
    if (section.teacherId !== teacher.id) {
      throw new ForbiddenException('Only the assigned homeroom teacher can return a subject for correction');
    }

    const review = await (this.prisma as any).classRosterReview.findUnique({
      where: {
        classSectionId_academicYearId: {
          classSectionId: dto.classSectionId,
          academicYearId: dto.academicYearId,
        },
      },
      select: { status: true },
    });

    if (review?.status === 'APPROVED') {
      throw new BadRequestException('Cannot return subject: this roster has already been approved and is locked.');
    }
    if (review?.status === 'SUBMITTED_TO_ADMIN') {
      throw new BadRequestException('Cannot return subject: this roster has been submitted to admin and is locked.');
    }

    const submittedCount = await (this.prisma as any).subjectResult.count({
      where: {
        classSectionId: dto.classSectionId,
        academicYearId: dto.academicYearId,
        subjectId: dto.subjectId,
        term: dto.term,
        status: { in: ['SUBMITTED', 'RETURNED_FOR_CORRECTION'] },
      },
    });

    if (submittedCount === 0) {
      throw new BadRequestException('Only submitted subject results can be returned for correction');
    }

    const cleanReason = dto.reason?.trim() ? dto.reason.trim() : null;

    // Execute atomically in a transaction: update results and create/update correction request
    // ClassSection.status and ClassRosterReview.status are NEVER modified.
    return this.prisma.$transaction(async (tx) => {
      const updatedResults = await (tx as any).subjectResult.updateMany({
        where: {
          classSectionId: dto.classSectionId,
          academicYearId: dto.academicYearId,
          subjectId: dto.subjectId,
          term: dto.term,
          status: 'SUBMITTED',
        },
        data: { status: 'RETURNED_FOR_CORRECTION' },
      });

      // Prevent duplicate simultaneous PENDING requests for the same section/year/subject/term
      const existingPending = await (tx as any).subjectCorrectionRequest.findFirst({
        where: {
          classSectionId: dto.classSectionId,
          academicYearId: dto.academicYearId,
          subjectId: dto.subjectId,
          term: dto.term,
          status: 'PENDING',
        },
      });

      let correctionRequest;
      if (existingPending) {
        correctionRequest = await (tx as any).subjectCorrectionRequest.update({
          where: { id: existingPending.id },
          data: {
            reason: cleanReason,
            requestedById: userId,
            createdAt: new Date(),
          },
        });
      } else {
        correctionRequest = await (tx as any).subjectCorrectionRequest.create({
          data: {
            classSectionId: dto.classSectionId,
            academicYearId: dto.academicYearId,
            subjectId: dto.subjectId,
            term: dto.term,
            requestedById: userId,
            reason: cleanReason,
            status: 'PENDING',
          },
        });
      }

      return {
        success: true,
        count: updatedResults.count,
        correctionRequestId: correctionRequest.id,
        reason: cleanReason,
        status: 'RETURNED_FOR_CORRECTION',
      };
    });
  }

  async getSubjectStatus(
    dto: GetSubjectStatusDto,
    userId: string,
  ) {
    const teacher = await this.getTeacher(userId);

    const [assignment, section] = await Promise.all([
      (this.prisma as any).sectionSubjectTeacher.findFirst({
        where: {
          teacherId: teacher.id,
          classSectionId: dto.classSectionId,
          subjectId: dto.subjectId,
          academicYearId: dto.academicYearId,
        },
      }),
      this.prisma.classSection.findUnique({
        where: { id: dto.classSectionId },
        select: { id: true, teacherId: true, academicYearId: true, status: true },
      }),
    ]);

    if (!section) {
      throw new BadRequestException('Class section not found');
    }
    if (section.academicYearId !== dto.academicYearId) {
      throw new BadRequestException('Class section does not belong to the selected academic year');
    }

    const isHomeroom = section.teacherId === teacher.id;
    if (!assignment && !isHomeroom) {
      throw new ForbiddenException('You are not assigned to this subject and section');
    }

    const [enrolledCount, results, latestCorrection, review] = await Promise.all([
      this.prisma.studentEnrollment.count({
        where: { classSectionId: dto.classSectionId, academicYearId: dto.academicYearId, status: 'ACTIVE' },
      }),
      (this.prisma as any).subjectResult.findMany({
        where: {
          classSectionId: dto.classSectionId,
          academicYearId: dto.academicYearId,
          subjectId: dto.subjectId,
          term: dto.term,
        },
        include: {
          Student: { select: { id: true, admissionNo: true, firstName: true, lastName: true } },
        },
        orderBy: { Student: { admissionNo: 'asc' } },
      }),
      (this.prisma as any).subjectCorrectionRequest.findFirst({
        where: {
          classSectionId: dto.classSectionId,
          academicYearId: dto.academicYearId,
          subjectId: dto.subjectId,
          term: dto.term,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          requestedBy: {
            select: {
              id: true,
              name: true,
              Teacher: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      (this.prisma as any).classRosterReview.findUnique({
        where: {
          classSectionId_academicYearId: {
            classSectionId: dto.classSectionId,
            academicYearId: dto.academicYearId,
          },
        },
        select: { status: true },
      }),
    ]);

    let subjectStatus: string = 'NOT_STARTED';
    const hasReturned = results.some((r: any) => r.status === 'RETURNED_FOR_CORRECTION');
    const allSubmitted = enrolledCount > 0 && results.length >= enrolledCount && results.every((r: any) => r.status === 'SUBMITTED');

    if (hasReturned) {
      subjectStatus = 'RETURNED_FOR_CORRECTION';
    } else if (allSubmitted) {
      subjectStatus = 'SUBMITTED';
    } else if (results.length > 0) {
      subjectStatus = 'DRAFT';
    }

    const isCorrectionPending = latestCorrection?.status === 'PENDING';
    const correctionRequired = isCorrectionPending || hasReturned;
    const isRosterLocked = review?.status === 'APPROVED' || review?.status === 'SUBMITTED_TO_ADMIN';

    const returnedByName = isCorrectionPending && latestCorrection?.requestedBy
      ? (latestCorrection.requestedBy.Teacher
          ? `${latestCorrection.requestedBy.Teacher.firstName} ${latestCorrection.requestedBy.Teacher.lastName}`.trim()
          : latestCorrection.requestedBy.name ?? null)
      : null;

    const subject = await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    const subjectName = subject?.name || dto.subjectId;
    const quarter = dto.term.startsWith('TERM_') ? dto.term.replace('TERM_', 'Quarter ') : dto.term;

    const existingGradeRows = await this.prisma.grade.findMany({
      where: {
        studentId: { in: results.map((r: any) => r.studentId) },
        subject: subjectName,
        quarter,
      },
    });
    const gradeRowsMap = new Map(existingGradeRows.map((gr) => [gr.studentId, gr]));

    return {
      status: subjectStatus,
      isSubmitted: subjectStatus === 'SUBMITTED',
      isReturnedForCorrection: correctionRequired,
      correctionRequired,
      correctionReason: isCorrectionPending ? latestCorrection?.reason ?? null : null,
      returnedAt: isCorrectionPending ? latestCorrection?.createdAt ?? null : null,
      returnedBy: returnedByName,
      rosterReviewStatus: review?.status ?? 'DRAFT',
      rosterLocked: isRosterLocked,
      isRosterLocked,
      enrolledCount,
      resultsCount: results.length,
      grades: results.map((r: any) => {
        const gr = gradeRowsMap.get(r.studentId);
        return {
          studentId: r.studentId,
          admissionNo: r.Student.admissionNo,
          studentName: `${r.Student.firstName} ${r.Student.lastName}`.trim(),
          marks: r.marks,
          status: r.status,
          components: gr
            ? {
                mid: gr.mid ?? 0,
                assignment: gr.assignment ?? 0,
                quiz: gr.quiz ?? 0,
                classwork: gr.classwork ?? 0,
                final: gr.final ?? 0,
              }
            : null,
        };
      }),
    };
  }

  // ─── Flexible Grade Items Management ──────────────────────────────────────────

  private async getTeacherOrAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, Teacher: { select: { id: true } } },
    });
    if (!user) throw new UnauthorizedException('User not found');
    if (user.role !== 'ADMIN' && !user.Teacher) {
      throw new UnauthorizedException('Active user is not registered as a teacher');
    }
    return {
      user,
      isAdmin: user.role === 'ADMIN',
      teacher: user.Teacher,
    };
  }

  async getGradeItems(
    dto: GetGradeItemsDto,
    userId: string,
  ) {
    const { isAdmin, teacher } = await this.getTeacherOrAdmin(userId);
    const [teachingAssignment, section] = await Promise.all([
      (this.prisma as any).sectionSubjectTeacher.findFirst({
        where: {
          ...(teacher?.id ? { teacherId: teacher.id } : {}),
          classSectionId: dto.classSectionId,
          subjectId: dto.subjectId,
          academicYearId: dto.academicYearId,
        },
        include: { Subject: true, ClassSection: true },
      }),
      this.prisma.classSection.findUnique({
        where: { id: dto.classSectionId },
        select: { id: true, teacherId: true, name: true, gradeLevelId: true },
      }),
    ]);

    if (!isAdmin) {
      const isHomeroom = section?.teacherId === teacher?.id;
      if (!teachingAssignment && !isHomeroom) {
        throw new ForbiddenException('You are not authorized to access grade items for this class and subject');
      }
    }

    const subject = teachingAssignment?.Subject || await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    if (!subject) throw new BadRequestException('Subject not found');

    const term = dto.term || 'TERM_1';
    const quarter = term.startsWith('TERM_') ? term.replace('TERM_', 'Quarter ') : term;

    // Find Class record for Examination creation fallback if needed
    const classRecord = await this.prisma.class.findFirst();
    const classId = classRecord?.id || 'rpt-class-grade10';
    const effectiveTeacherId = teacher?.id || section?.teacherId || (await this.prisma.teacher.findFirst())?.id || 'default-teacher';

    // 1. Fetch or provision the 5 core standard items backed by Examination & Assignment
    // Item 1: Midterm Exam (Examination, type: MIDTERM)
    let midExam = await this.prisma.examination.findFirst({
      where: {
        classSectionId: dto.classSectionId,
        subjectId: dto.subjectId,
        type: 'MIDTERM',
      },
    });
    if (!midExam) {
      midExam = await this.prisma.examination.create({
        data: {
          title: 'Midterm Exam',
          type: 'MIDTERM',
          totalMarks: 20,
          duration: 60,
          examDate: new Date(),
          updatedAt: new Date(),
          classSectionId: dto.classSectionId,
          subjectId: dto.subjectId,
          classId,
          teacherId: effectiveTeacherId,
          status: 'PUBLISHED',
        },
      });
    }

    // Item 2: Assignment 1 (Assignment)
    let asgn = await this.prisma.assignment.findFirst({
      where: {
        classSectionId: dto.classSectionId,
        OR: [
          { description: 'GRADE_ITEM:assignment' },
          {
            AND: [
              { OR: [{ subject: subject.name }, { subject: dto.subjectId }] },
              { title: { contains: 'Assignment' } },
            ],
          },
        ],
      },
    });
    if (!asgn) {
      asgn = await this.prisma.assignment.create({
        data: {
          title: 'Assignment 1',
          subject: subject.name,
          description: 'GRADE_ITEM:assignment',
          instructions: 'MAX_MARK:20',
          targetClass: section?.name || 'Class',
          classSectionId: dto.classSectionId,
          teacherId: effectiveTeacherId,
          dueDate: new Date(),
        },
      });
    } else if (asgn.description !== 'GRADE_ITEM:assignment') {
      await this.prisma.assignment.update({
        where: { id: asgn.id },
        data: { description: 'GRADE_ITEM:assignment' },
      });
    }

    // Item 3: Quiz 1 (Examination, type: QUIZ)
    let quizExam = await this.prisma.examination.findFirst({
      where: {
        classSectionId: dto.classSectionId,
        subjectId: dto.subjectId,
        type: 'QUIZ',
      },
    });
    if (!quizExam) {
      quizExam = await this.prisma.examination.create({
        data: {
          title: 'Quiz 1',
          type: 'QUIZ',
          totalMarks: 10,
          duration: 30,
          examDate: new Date(),
          updatedAt: new Date(),
          classSectionId: dto.classSectionId,
          subjectId: dto.subjectId,
          classId,
          teacherId: effectiveTeacherId,
          status: 'PUBLISHED',
        },
      });
    }

    // Item 4: Classwork (Assignment)
    let cw = await this.prisma.assignment.findFirst({
      where: {
        classSectionId: dto.classSectionId,
        OR: [
          { description: 'GRADE_ITEM:classwork' },
          {
            AND: [
              { OR: [{ subject: subject.name }, { subject: dto.subjectId }] },
              { title: { contains: 'Classwork' } },
            ],
          },
        ],
      },
    });
    if (!cw) {
      cw = await this.prisma.assignment.create({
        data: {
          title: 'Classwork',
          subject: subject.name,
          description: 'GRADE_ITEM:classwork',
          instructions: 'MAX_MARK:10',
          targetClass: section?.name || 'Class',
          classSectionId: dto.classSectionId,
          teacherId: effectiveTeacherId,
          dueDate: new Date(),
        },
      });
    } else if (cw.description !== 'GRADE_ITEM:classwork') {
      await this.prisma.assignment.update({
        where: { id: cw.id },
        data: { description: 'GRADE_ITEM:classwork' },
      });
    }

    // Item 5: Final Exam (Examination, type: FINAL)
    let finalExam = await this.prisma.examination.findFirst({
      where: {
        classSectionId: dto.classSectionId,
        subjectId: dto.subjectId,
        type: 'FINAL',
      },
    });
    if (!finalExam) {
      finalExam = await this.prisma.examination.create({
        data: {
          title: 'Final Exam',
          type: 'FINAL',
          totalMarks: 40,
          duration: 120,
          examDate: new Date(),
          updatedAt: new Date(),
          classSectionId: dto.classSectionId,
          subjectId: dto.subjectId,
          classId,
          teacherId: effectiveTeacherId,
          status: 'PUBLISHED',
        },
      });
    }

    // Determine maxMark for assignments from instructions or Grade rows or defaults
    const parseInstructionsMaxMark = (instructions: string | null) => {
      if (!instructions) return null;
      const match = instructions.match(/MAX_MARK:([0-9]+(\.[0-9]+)?)/);
      if (match && match[1]) {
        const val = parseFloat(match[1]);
        if (!isNaN(val) && val > 0) return val;
      }
      return null;
    };

    const [asgnGrade, cwGrade] = await Promise.all([
      this.prisma.grade.findFirst({ where: { assignmentId: asgn.id, maxScore: { gt: 0 } }, select: { maxScore: true }, orderBy: { updatedAt: 'desc' } }),
      this.prisma.grade.findFirst({ where: { assignmentId: cw.id, maxScore: { gt: 0 } }, select: { maxScore: true }, orderBy: { updatedAt: 'desc' } }),
    ]);

    const asgnMax = parseInstructionsMaxMark(asgn.instructions) ?? asgnGrade?.maxScore ?? 20;
    const cwMax = parseInstructionsMaxMark(cw.instructions) ?? cwGrade?.maxScore ?? 10;

    // Query active student IDs
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { classSectionId: dto.classSectionId, academicYearId: dto.academicYearId },
      select: { studentId: true },
    });
    const studentIds = enrollments.map((e) => e.studentId);

    // Query highest existing grades on each item across Grade rows
    const studentGrades = await this.prisma.grade.findMany({
      where: {
        OR: [
          { examinationId: { in: [midExam.id, quizExam.id, finalExam.id] } },
          { assignmentId: { in: [asgn.id, cw.id] } },
          {
            student: { classSectionId: dto.classSectionId },
            subject: subject.name,
            quarter,
          },
          ...(studentIds.length > 0 ? [{ studentId: { in: studentIds }, subject: subject.name, quarter }] : []),
        ],
      },
      select: {
        examinationId: true,
        assignmentId: true,
        score: true,
        mid: true,
        assignment: true,
        quiz: true,
        classwork: true,
        final: true,
      },
    });

    const maxGradeForMid = Math.max(0, ...studentGrades.map((g) => (g.examinationId === midExam!.id ? g.score : g.mid ?? 0)));
    const maxGradeForAsgn = Math.max(0, ...studentGrades.map((g) => (g.assignmentId === asgn!.id ? g.score : g.assignment ?? 0)));
    const maxGradeForQuiz = Math.max(0, ...studentGrades.map((g) => (g.examinationId === quizExam!.id ? g.score : g.quiz ?? 0)));
    const maxGradeForCw = Math.max(0, ...studentGrades.map((g) => (g.assignmentId === cw!.id ? g.score : g.classwork ?? 0)));
    const maxGradeForFinal = Math.max(0, ...studentGrades.map((g) => (g.examinationId === finalExam!.id ? g.score : g.final ?? 0)));

    const items = [
      {
        id: midExam.id,
        name: midExam.title,
        maxMark: midExam.totalMarks,
        type: 'EXAMINATION',
        itemType: 'EXAMINATION',
        field: 'mid',
        fieldKey: 'mid',
        highestGrade: maxGradeForMid,
        highestStudentGrade: maxGradeForMid,
      },
      {
        id: asgn.id,
        name: asgn.title,
        maxMark: asgnMax,
        type: 'ASSIGNMENT',
        itemType: 'ASSIGNMENT',
        field: 'assignment',
        fieldKey: 'assignment',
        highestGrade: maxGradeForAsgn,
        highestStudentGrade: maxGradeForAsgn,
      },
      {
        id: quizExam.id,
        name: quizExam.title,
        maxMark: quizExam.totalMarks,
        type: 'EXAMINATION',
        itemType: 'EXAMINATION',
        field: 'quiz',
        fieldKey: 'quiz',
        highestGrade: maxGradeForQuiz,
        highestStudentGrade: maxGradeForQuiz,
      },
      {
        id: cw.id,
        name: cw.title,
        maxMark: cwMax,
        type: 'ASSIGNMENT',
        itemType: 'ASSIGNMENT',
        field: 'classwork',
        fieldKey: 'classwork',
        highestGrade: maxGradeForCw,
        highestStudentGrade: maxGradeForCw,
      },
      {
        id: finalExam.id,
        name: finalExam.title,
        maxMark: finalExam.totalMarks,
        type: 'EXAMINATION',
        itemType: 'EXAMINATION',
        field: 'final',
        fieldKey: 'final',
        highestGrade: maxGradeForFinal,
        highestStudentGrade: maxGradeForFinal,
      },
    ];

    return {
      classSectionId: dto.classSectionId,
      subjectId: dto.subjectId,
      academicYearId: dto.academicYearId,
      term,
      items,
      totalMaxMarks: items.reduce((sum, item) => sum + item.maxMark, 0),
    };
  }

  async updateGradeItem(
    id: string,
    dto: UpdateGradeItemDto,
    userId: string,
  ) {
    const { isAdmin, teacher } = await this.getTeacherOrAdmin(userId);
    const [teachingAssignment, section] = await Promise.all([
      (this.prisma as any).sectionSubjectTeacher.findFirst({
        where: {
          ...(teacher?.id ? { teacherId: teacher.id } : {}),
          classSectionId: dto.classSectionId,
          subjectId: dto.subjectId,
          academicYearId: dto.academicYearId,
        },
        include: { Subject: true },
      }),
      this.prisma.classSection.findUnique({
        where: { id: dto.classSectionId },
        select: { id: true, teacherId: true },
      }),
    ]);

    if (!isAdmin) {
      const isHomeroom = section?.teacherId === teacher?.id;
      if (!teachingAssignment && !isHomeroom) {
        throw new ForbiddenException('You are not authorized to modify grade items for this class and subject');
      }
    }

    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('Item name is required and cannot be empty');
    }

    const numMax = Number(dto.maxMark);
    if (isNaN(numMax) || numMax <= 0) {
      throw new BadRequestException('Maximum mark must be a valid positive number greater than zero');
    }

    // Find the item: can be Examination or Assignment
    const [examination, assignment] = await Promise.all([
      this.prisma.examination.findUnique({
        where: { id },
        include: { grades: { include: { student: true } }, results: true },
      }),
      this.prisma.assignment.findUnique({
        where: { id },
        include: { grades: { include: { student: true } }, submissions: { include: { grades: true, student: true } } },
      }),
    ]);

    if (!examination && !assignment) {
      throw new NotFoundException('Grade item not found');
    }

    const subject = teachingAssignment?.Subject || await this.prisma.subject.findUnique({ where: { id: dto.subjectId } });
    const subjectName = subject?.name || dto.subjectId;
    const term = dto.term || 'TERM_1';
    const quarter = term.startsWith('TERM_') ? term.replace('TERM_', 'Quarter ') : term;

    // Check existing student grades to ensure numMax >= all existing earned grades
    let highestGrade = 0;
    let offendingStudent: string | null = null;

    // Get active enrolled student IDs
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { classSectionId: dto.classSectionId, academicYearId: dto.academicYearId },
      select: { studentId: true },
    });
    const enrolledStudentIds = enrollments.map((e) => e.studentId);

    if (examination) {
      for (const g of examination.grades) {
        if (g.score > highestGrade) {
          highestGrade = g.score;
          offendingStudent = `${g.student?.firstName || ''} ${g.student?.lastName || ''}`.trim();
        }
      }
      for (const r of examination.results) {
        const score = Math.max(r.score || 0, r.marksObtained || 0);
        if (score > highestGrade) {
          highestGrade = score;
        }
      }
      const attempts = await this.prisma.examAttempt.findMany({ where: { examId: id } });
      for (const att of attempts) {
        if (att.marksObtained > highestGrade) {
          highestGrade = att.marksObtained;
        }
      }
      const componentField = examination.type === 'MIDTERM' ? 'mid' : examination.type === 'QUIZ' ? 'quiz' : 'final';
      const legacyGrades = await this.prisma.grade.findMany({
        where: {
          OR: [
            { student: { classSectionId: dto.classSectionId } },
            ...(enrolledStudentIds.length > 0 ? [{ studentId: { in: enrolledStudentIds } }] : []),
          ],
          subject: subjectName,
          quarter,
        },
        include: { student: true },
      });
      for (const lg of legacyGrades) {
        const val = Number((lg as any)[componentField]) || 0;
        if (val > highestGrade) {
          highestGrade = val;
          offendingStudent = `${lg.student?.firstName || ''} ${lg.student?.lastName || ''}`.trim();
        }
      }
    } else if (assignment) {
      for (const g of assignment.grades) {
        if (g.score > highestGrade) {
          highestGrade = g.score;
          offendingStudent = `${g.student?.firstName || ''} ${g.student?.lastName || ''}`.trim();
        }
      }
      for (const sub of (assignment as any).submissions || []) {
        for (const sg of sub.grades || []) {
          if (sg.score > highestGrade) {
            highestGrade = sg.score;
            offendingStudent = `${sub.student?.firstName || ''} ${sub.student?.lastName || ''}`.trim();
          }
        }
      }
      const componentField = (assignment.description === 'GRADE_ITEM:classwork' || assignment.title.toLowerCase().includes('classwork'))
        ? 'classwork'
        : 'assignment';
      const legacyGrades = await this.prisma.grade.findMany({
        where: {
          OR: [
            { student: { classSectionId: dto.classSectionId } },
            ...(enrolledStudentIds.length > 0 ? [{ studentId: { in: enrolledStudentIds } }] : []),
          ],
          subject: subjectName,
          quarter,
        },
        include: { student: true },
      });
      for (const lg of legacyGrades) {
        const val = Number((lg as any)[componentField]) || 0;
        if (val > highestGrade) {
          highestGrade = val;
          offendingStudent = `${lg.student?.firstName || ''} ${lg.student?.lastName || ''}`.trim();
        }
      }
    }

    if (highestGrade > numMax) {
      const studentInfo = offendingStudent ? `student ${offendingStudent}` : 'a student';
      throw new BadRequestException(
        `Cannot set Maximum Mark to ${numMax} because ${studentInfo} has an existing grade of ${highestGrade} on this item. Please resolve the affected student grades before reducing the maximum mark.`,
      );
    }

    // Save update in place keeping the same record/ID
    if (examination) {
      await this.prisma.examination.update({
        where: { id },
        data: {
          title: dto.name.trim(),
          totalMarks: numMax,
        },
      });
      await this.prisma.grade.updateMany({
        where: { examinationId: id },
        data: {
          maxScore: numMax,
        },
      });
    } else if (assignment) {
      await this.prisma.assignment.update({
        where: { id },
        data: {
          title: dto.name.trim(),
          instructions: `MAX_MARK:${numMax}`,
          maxMark: numMax,
        },
      });
      await this.prisma.grade.updateMany({
        where: { assignmentId: id },
        data: {
          maxScore: numMax,
        },
      });
    }

    return {
      success: true,
      message: `Grade item "${dto.name.trim()}" updated successfully`,
      item: {
        id,
        name: dto.name.trim(),
        maxMark: numMax,
        type: examination ? 'EXAMINATION' : 'ASSIGNMENT',
        itemType: examination ? 'EXAMINATION' : 'ASSIGNMENT',
      },
    };
  }
}
