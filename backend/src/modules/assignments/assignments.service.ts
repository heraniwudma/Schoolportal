import { Injectable, BadRequestException, UnauthorizedException, NotFoundException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ResultsService } from '../results/results.service';
import { Role } from '@prisma/client';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

export function parseInstructionsMaxMark(instructions: string | null | undefined): number | null {
  if (!instructions) return null;
  const match = instructions.match(/MAX_MARK:([0-9]+(\.[0-9]+)?)/);
  if (match && match[1]) {
    const val = parseFloat(match[1]);
    if (!isNaN(val) && val > 0) return val;
  }
  return null;
}

export function cleanInstructionsText(instructions: string | null | undefined): string {
  if (!instructions) return '';
  return instructions.replace(/\s*MAX_MARK:[0-9]+(\.[0-9]+)?/g, '').trim();
}

export function formatInstructionsWithMaxMark(instructions: string | null | undefined, maxMark: number): string {
  const clean = cleanInstructionsText(instructions);
  return clean ? `${clean}\nMAX_MARK:${maxMark}` : `MAX_MARK:${maxMark}`;
}

@Injectable()
export class AssignmentsService {
  private supabase = createClient(
    process.env.SUPABASE_URL || this.extractSupabaseUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'fake-key-for-now',
    { auth: { persistSession: false } }
  );

  private extractSupabaseUrl() {
    const dbUrl = process.env.DATABASE_URL || '';
    const userMatch = dbUrl.match(/postgres\.(.*?):/);
    if (userMatch) {
      return `https://${userMatch[1]}.supabase.co`;
    }
    return '';
  }

  private readonly teacherCache = new Map<string, { teacher: any; expiresAt: number }>();
  private readonly TEACHER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ResultsService))
    private readonly resultsService: ResultsService,
  ) {}

  private async resolveTeacher(userId?: string) {
    if (!userId) throw new UnauthorizedException('User unauthenticated');
    const now = Date.now();
    const cached = this.teacherCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.teacher;
    }

    const teacher = await this.prisma.teacher.findFirst({
      where: {
        OR: [{ id: userId }, { userId }],
      },
    });
    if (!teacher) throw new UnauthorizedException('Teacher profile not found');

    this.teacherCache.set(userId, { teacher, expiresAt: now + this.TEACHER_CACHE_TTL_MS });
    return teacher;
  }

  async findAll() {
    return this.prisma.assignment.findMany();
  }
  
  async findTeacherAssignments(userId: string) {
    const teacher = await this.resolveTeacher(userId);
    const assignments = await this.prisma.assignment.findMany({
      where: {
        OR: [
          { teacherId: teacher.id },
          { ClassSection: { teacherId: teacher.id } },
          { ClassSection: { subjectTeachers: { some: { teacherId: teacher.id } } } },
        ],
      },
      include: {
        ClassSection: true,
        submissions: {
          select: {
            id: true,
            studentId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return assignments.map((item) => {
      const maxMark = (item as any).maxMark ?? parseInstructionsMaxMark(item.instructions) ?? 20;
      return {
        ...item,
        maxMark,
        cleanInstructions: cleanInstructionsText(item.instructions),
      };
    });
  }
  
  async findSubmissions(id: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { Teacher: true },
    });
    const isAdmin = user?.role === Role.ADMIN;
    const teacher = user?.Teacher || (await this.resolveTeacher(userId).catch(() => null));

    if (!isAdmin && !teacher) {
      throw new UnauthorizedException('User unauthenticated');
    }

    const rawAssignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: {
        ClassSection: {
          include: {
            subjectTeachers: true,
          },
        },
      },
    });

    if (!rawAssignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (!isAdmin) {
      const isOwner = rawAssignment.teacherId === teacher.id;
      const isHomeroom = rawAssignment.ClassSection?.teacherId === teacher.id;
      const isSubjectTeacher = rawAssignment.ClassSection?.subjectTeachers?.some(
        (st) => st.teacherId === teacher.id,
      );

      if (!isOwner && !isHomeroom && !isSubjectTeacher) {
        throw new ForbiddenException('You cannot view submissions for this assignment');
      }
    }

    const submissions = await (this.prisma as any).submission.findMany({
      where: { assignmentId: id },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
            User: { select: { loginId: true, email: true } },
          },
        },
        assignment: {
          select: {
            id: true,
            title: true,
            subject: true,
            targetClass: true,
            dueDate: true,
            instructions: true,
            description: true,
            maxMark: true,
            classSectionId: true,
            ClassSection: { select: { id: true, name: true } },
          },
        },
        grades: {
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const parsedAssignmentMaxMark = (rawAssignment as any).maxMark ?? parseInstructionsMaxMark(rawAssignment.instructions) ?? 20;

    return submissions.map((sub: any) => {
      const latestGrade = sub.grades?.[0] || null;
      const isGraded = Boolean(latestGrade);
      const studentName = `${sub.student?.firstName || ''} ${sub.student?.lastName || ''}`.trim();
      const maxMark = sub.assignment?.maxMark ?? parsedAssignmentMaxMark;

      return {
        id: sub.id,
        assignmentId: sub.assignmentId,
        assignmentTitle: sub.assignment?.title || rawAssignment.title,
        subject: sub.assignment?.subject || rawAssignment.subject || '',
        targetClass:
          sub.assignment?.ClassSection?.name ||
          sub.assignment?.targetClass ||
          rawAssignment.ClassSection?.name ||
          rawAssignment.targetClass ||
          '',
        instructions:
          sub.assignment?.instructions ||
          sub.assignment?.description ||
          rawAssignment.instructions ||
          rawAssignment.description ||
          '',
        dueDate: sub.assignment?.dueDate || rawAssignment.dueDate,
        maxMark,
        studentId: sub.student?.id,
        studentName,
        admissionNo: sub.student?.admissionNo || '',
        loginId: sub.student?.User?.loginId || sub.student?.admissionNo || '',
        submittedAt: sub.createdAt,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
        content: sub.content || '',
        fileName: sub.fileName || null,
        fileUrl: sub.fileUrl || null,
        fileSize: sub.fileSize || null,
        fileType: sub.fileType || null,
        feedback: latestGrade?.feedback || sub.feedback || null,
        status: sub.status || (isGraded ? 'GRADED' : 'SUBMITTED'),
        isGraded,
        grade: latestGrade
          ? { id: latestGrade.id, score: latestGrade.score, maxScore: latestGrade.maxScore }
          : null,
        grades: sub.grades || [],
        student: sub.student,
        assignment: sub.assignment || rawAssignment,
      };
    });
  }

  async findAllTeacherSubmissions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { Teacher: true },
    });
    const isAdmin = user?.role === Role.ADMIN;
    const teacher = user?.Teacher || (await this.resolveTeacher(userId).catch(() => null));

    if (!isAdmin && !teacher) {
      throw new UnauthorizedException('User unauthenticated');
    }

    return (this.prisma as any).submission.findMany({
      where: isAdmin
        ? {}
        : {
            assignment: {
              OR: [
                { teacherId: teacher.id },
                { ClassSection: { teacherId: teacher.id } },
                { ClassSection: { subjectTeachers: { some: { teacherId: teacher.id } } } },
              ],
            },
          },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
            User: { select: { loginId: true } },
          },
        },
        assignment: {
          select: {
            id: true,
            title: true,
            subject: true,
            targetClass: true,
            dueDate: true,
            instructions: true,
            description: true,
            classSectionId: true,
          },
        },
        grades: {
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findHomeroomSubmissions(userId: string) {
    const teacher = await this.resolveTeacher(userId);

    const homeroomSection = await this.prisma.classSection.findFirst({
      where: { teacherId: teacher.id },
      select: { id: true, name: true },
    });

    if (!homeroomSection) return [];

    return (this.prisma as any).submission.findMany({
      where: {
        assignment: {
          classSectionId: homeroomSection.id,
        },
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
            User: { select: { loginId: true } },
          },
        },
        assignment: { select: { id: true, title: true, subject: true, dueDate: true, classSectionId: true } },
        grades: {
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: any, userId?: string) {
    const teacher = await this.resolveTeacher(userId);

    const subjectId = data.subjectId;
    const classSectionId = data.classSectionId;
    if (!subjectId || !classSectionId) {
      throw new BadRequestException('Subject and assigned section are required');
    }

    const teachingAssignment = await this.prisma.sectionSubjectTeacher.findFirst({
      where: { teacherId: teacher.id, subjectId, classSectionId },
      include: { Subject: true, ClassSection: true },
    });
    if (!teachingAssignment) {
      throw new BadRequestException('You are not assigned to this subject and section');
    }

    const numMax = data.maxMark !== undefined && data.maxMark !== null ? Number(data.maxMark) : 20;
    const maxMark = !isNaN(numMax) && numMax > 0 ? numMax : 20;
    const rawInstructions = data.instructions || data.description || '';
    const formattedInstructions = formatInstructionsWithMaxMark(rawInstructions, maxMark);

    return this.prisma.assignment.create({
      data: {
        title: data.title,
        subject: teachingAssignment.Subject.name,
        targetClass: teachingAssignment.ClassSection.name,
        classSectionId,
        classId: data.classId || null,
        description: data.description || data.instructions,
        instructions: formattedInstructions,
        dueDate: data.dueDate ? new Date(data.dueDate) : new Date(),
        attachmentUrl: data.attachmentUrl || null,
        teacherId: teacher.id,
        maxMark,
      },
    });
  }

  async update(id: string, data: UpdateAssignmentDto, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { Teacher: true },
    });
    const isAdmin = user?.role === Role.ADMIN;
    const teacher = user?.Teacher || (await this.resolveTeacher(userId).catch(() => null));

    if (!isAdmin && !teacher) {
      throw new UnauthorizedException('User unauthenticated');
    }

    const assignment = await this.prisma.assignment.findUnique({
      where: { id },
      include: { ClassSection: true },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    // Teacher authorization check
    if (!isAdmin && teacher) {
      const isOwner = assignment.teacherId === teacher.id;
      const isHomeroom = assignment.ClassSection?.teacherId === teacher.id;
      const isAssignedSubject = assignment.classSectionId
        ? await this.prisma.sectionSubjectTeacher.findFirst({
            where: {
              teacherId: teacher.id,
              classSectionId: assignment.classSectionId,
            },
          })
        : false;

      if (!isOwner && !isHomeroom && !isAssignedSubject) {
        throw new ForbiddenException('You are not authorized to edit this assignment');
      }
    }

    let targetSubjectName = assignment.subject;
    let targetClassName = assignment.targetClass;
    let targetClassSectionId = assignment.classSectionId;

    if (data.subjectId || data.classSectionId) {
      const newSubjectId = data.subjectId;
      const newClassSectionId = data.classSectionId || assignment.classSectionId;

      if (!isAdmin && teacher) {
        if (newSubjectId && newClassSectionId) {
          const teachingAssignment = await this.prisma.sectionSubjectTeacher.findFirst({
            where: {
              teacherId: teacher.id,
              subjectId: newSubjectId,
              classSectionId: newClassSectionId,
            },
            include: { Subject: true, ClassSection: true },
          });
          if (!teachingAssignment) {
            throw new BadRequestException('You are not assigned to teach this subject and section');
          }
          targetSubjectName = teachingAssignment.Subject.name;
          targetClassName = teachingAssignment.ClassSection.name;
          targetClassSectionId = teachingAssignment.classSectionId;
        } else if (newClassSectionId) {
          const section = await this.prisma.classSection.findUnique({
            where: { id: newClassSectionId },
          });
          if (!section) throw new BadRequestException('Class section not found');
          targetClassName = section.name;
          targetClassSectionId = section.id;
        } else if (newSubjectId) {
          const subject = await this.prisma.subject.findUnique({
            where: { id: newSubjectId },
          });
          if (!subject) throw new BadRequestException('Subject not found');
          targetSubjectName = subject.name;
        }
      } else {
        if (newSubjectId) {
          const subject = await this.prisma.subject.findUnique({ where: { id: newSubjectId } });
          if (subject) targetSubjectName = subject.name;
        }
        if (newClassSectionId) {
          const section = await this.prisma.classSection.findUnique({ where: { id: newClassSectionId } });
          if (section) {
            targetClassName = section.name;
            targetClassSectionId = section.id;
          }
        }
      }
    }

    let currentMaxMark = (assignment as any).maxMark ?? parseInstructionsMaxMark(assignment.instructions) ?? 20;
    let newMaxMark = currentMaxMark;

    if (data.maxMark !== undefined) {
      const numMax = Number(data.maxMark);
      if (isNaN(numMax) || numMax <= 0) {
        throw new BadRequestException('Maximum mark must be a valid positive number greater than zero');
      }

      // Audit against existing student grades
      const highestGrade = await this.prisma.grade.findFirst({
        where: { assignmentId: id },
        orderBy: { score: 'desc' },
        include: { student: true },
      });

      if (highestGrade && highestGrade.score > numMax) {
        const studentName = highestGrade.student
          ? `${highestGrade.student.firstName} ${highestGrade.student.lastName}`
          : 'a student';
        throw new BadRequestException(
          `Cannot set Maximum Mark to ${numMax} because student ${studentName} has already earned a grade of ${highestGrade.score} on this assignment. Please adjust student grades before reducing the maximum mark.`
        );
      }

      newMaxMark = numMax;

      // Synchronize Grade rows in-place
      await this.prisma.grade.updateMany({
        where: { assignmentId: id },
        data: { maxScore: numMax },
      });
    }

    const rawInstructions = data.instructions !== undefined ? data.instructions : assignment.instructions;
    const cleanInstructions = cleanInstructionsText(rawInstructions);
    const finalInstructions = formatInstructionsWithMaxMark(rawInstructions, newMaxMark);
    const finalDescription = data.description !== undefined ? data.description : (cleanInstructions || assignment.description);

    const updated = await this.prisma.assignment.update({
      where: { id },
      data: {
        title: data.title !== undefined ? data.title.trim() : assignment.title,
        description: finalDescription,
        instructions: finalInstructions,
        dueDate: data.dueDate !== undefined ? new Date(data.dueDate) : assignment.dueDate,
        subject: targetSubjectName,
        targetClass: targetClassName,
        classSectionId: targetClassSectionId,
        maxMark: newMaxMark,
        attachmentUrl: data.attachmentUrl !== undefined ? data.attachmentUrl : assignment.attachmentUrl,
      },
      include: {
        ClassSection: true,
        submissions: {
          select: { id: true, studentId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    return {
      ...updated,
      maxMark: (updated as any).maxMark ?? newMaxMark,
      cleanInstructions,
    };
  }

  /**
   * Helper: Resolves authoritative Grade Item binding from Grade Entry system
   */
  async resolveGradeItemForAssignment(
    assignment: {
      id: string;
      title: string;
      subject: string | null;
      classSectionId: string | null;
      instructions: string | null;
      description: string | null;
    },
    student: {
      id: string;
      classSectionId?: string | null;
    },
    userId: string,
  ) {
    // 1. Determine classSectionId
    let classSectionId = assignment.classSectionId;
    if (!classSectionId && student.classSectionId) {
      classSectionId = student.classSectionId;
    }
    if (!classSectionId) {
      const enrollment = await this.prisma.studentEnrollment.findFirst({
        where: { studentId: student.id, status: 'ACTIVE' },
        select: { classSectionId: true },
      });
      classSectionId = enrollment?.classSectionId || null;
    }

    // 2. Determine academicYearId
    let academicYearId: string | null = null;
    if (classSectionId) {
      const section = await this.prisma.classSection.findUnique({
        where: { id: classSectionId },
        select: { academicYearId: true },
      });
      academicYearId = section?.academicYearId || null;
    }
    if (!academicYearId) {
      const currentYear = await this.prisma.academicYear.findFirst({
        where: { isCurrent: true },
        select: { id: true },
      });
      academicYearId = currentYear?.id || (await this.prisma.academicYear.findFirst())?.id || null;
    }

    // 3. Determine subject record
    let subjectRecord: any = null;
    if (assignment.subject) {
      subjectRecord = await this.prisma.subject.findFirst({
        where: {
          OR: [
            { name: { equals: assignment.subject, mode: 'insensitive' } },
            { code: { equals: assignment.subject, mode: 'insensitive' } },
            { id: assignment.subject },
          ],
        },
      });
    }
    if (!subjectRecord && classSectionId) {
      const teacherAssigned = await this.prisma.sectionSubjectTeacher.findFirst({
        where: { classSectionId },
        include: { Subject: true },
      });
      subjectRecord = teacherAssigned?.Subject || null;
    }
    if (!subjectRecord) {
      subjectRecord = await this.prisma.subject.findFirst();
    }

    const term = 'TERM_1';
    const quarter = 'Quarter 1';

    // 4. Query Grade Items from Grade Entry via ResultsService
    if (classSectionId && academicYearId && subjectRecord) {
      try {
        const gradeItemsRes = await this.resultsService.getGradeItems(
          {
            classSectionId,
            subjectId: subjectRecord.id,
            academicYearId,
            term,
          },
          userId,
        );

        if (gradeItemsRes?.items?.length) {
          // Direct ID match
          const directMatch = gradeItemsRes.items.find((item) => item.id === assignment.id);
          if (directMatch) {
            return {
              gradeItem: directMatch,
              classSectionId,
              academicYearId,
              subjectRecord,
              term,
              quarter,
            };
          }

          // Component field match
          const isClasswork =
            assignment.description === 'GRADE_ITEM:classwork' ||
            assignment.title.toLowerCase().includes('classwork');
          const fieldKey = isClasswork ? 'classwork' : 'assignment';
          const componentMatch = gradeItemsRes.items.find((item) => item.fieldKey === fieldKey);
          if (componentMatch) {
            return {
              gradeItem: componentMatch,
              classSectionId,
              academicYearId,
              subjectRecord,
              term,
              quarter,
            };
          }
        }
      } catch {
        // Fallback below
      }
    }

    // Fallback: derive max mark from instructions or existing Grade row or default (20)
    let maxMark = 20;
    if (assignment.instructions) {
      const match = assignment.instructions.match(/MAX_MARK:([0-9]+(\.[0-9]+)?)/);
      if (match && match[1]) {
        const val = parseFloat(match[1]);
        if (!isNaN(val) && val > 0) maxMark = val;
      }
    }
    const isCw = assignment.title.toLowerCase().includes('classwork');
    return {
      gradeItem: {
        id: assignment.id,
        name: assignment.title,
        maxMark,
        fieldKey: isCw ? 'classwork' : 'assignment',
        itemType: 'ASSIGNMENT',
      },
      classSectionId,
      academicYearId,
      subjectRecord,
      term,
      quarter,
    };
  }

  /**
   * Authoritative submission details for View Response & Edit Response review
   */
  async getSubmissionDetails(submissionId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { Teacher: true },
    });
    const isAdmin = user?.role === Role.ADMIN;
    const teacher = user?.Teacher || (await this.resolveTeacher(userId).catch(() => null));

    const submission = await (this.prisma as any).submission.findUnique({
      where: { id: submissionId },
      include: {
        student: {
          include: {
            User: { select: { loginId: true, email: true } },
            ClassSection: { select: { id: true, name: true } },
          },
        },
        assignment: {
          include: {
            ClassSection: { select: { id: true, name: true, teacherId: true } },
          },
        },
        grades: {
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    // Security check: teacher identity and authorization
    if (!isAdmin) {
      if (!teacher) throw new UnauthorizedException('Teacher profile not found');
      const isAssignmentOwner = submission.assignment.teacherId === teacher.id;
      const isHomeroomTeacher = submission.assignment.ClassSection?.teacherId === teacher.id;

      let isSubjectTeacher = false;
      if (submission.assignment.classSectionId) {
        const teachingAssignment = await this.prisma.sectionSubjectTeacher.findFirst({
          where: {
            teacherId: teacher.id,
            classSectionId: submission.assignment.classSectionId,
          },
        });
        if (teachingAssignment) isSubjectTeacher = true;
      }

      if (!isAssignmentOwner && !isHomeroomTeacher && !isSubjectTeacher) {
        throw new ForbiddenException('You are not authorized to view this student submission');
      }
    }

    // Resolve authoritative Grade Item binding
    const resolved = await this.resolveGradeItemForAssignment(
      submission.assignment,
      submission.student,
      userId,
    );

    const latestGrade = submission.grades?.[0] || null;
    const isGraded = Boolean(latestGrade);

    return {
      id: submission.id,
      assignmentId: submission.assignmentId,
      assignmentTitle: submission.assignment.title,
      subject: submission.assignment.subject || resolved.subjectRecord?.name || 'Subject',
      targetClass:
        submission.assignment.ClassSection?.name ||
        submission.assignment.targetClass ||
        submission.student.ClassSection?.name ||
        'Class',
      instructions: submission.assignment.instructions || submission.assignment.description || '',
      dueDate: submission.assignment.dueDate,
      studentId: submission.student.id,
      studentName: `${submission.student.firstName} ${submission.student.lastName}`.trim(),
      admissionNo: submission.student.admissionNo,
      loginId: submission.student.User?.loginId || submission.student.admissionNo,
      submittedAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      content: submission.content || '',
      fileName: submission.fileName || null,
      fileUrl: submission.fileUrl || null,
      fileSize: submission.fileSize || null,
      fileType: submission.fileType || null,
      feedback: submission.feedback || '',
      isGraded,
      status: isGraded ? 'GRADED' : 'SUBMITTED',
      grade: latestGrade
        ? {
            id: latestGrade.id,
            score: latestGrade.score,
            maxScore: latestGrade.maxScore || resolved.gradeItem.maxMark,
            updatedAt: latestGrade.updatedAt,
          }
        : null,
      gradeItem: {
        id: resolved.gradeItem.id,
        name: resolved.gradeItem.name,
        maxMark: resolved.gradeItem.maxMark,
        fieldKey: resolved.gradeItem.fieldKey,
        itemType: resolved.gradeItem.itemType || 'ASSIGNMENT',
      },
    };
  }

  /**
   * Unified grading of a student response
   */
  async gradeSubmission(
    submissionId: string,
    data: { score: number; feedback?: string; maxScore?: number },
    userId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { Teacher: true },
    });
    const isAdmin = user?.role === Role.ADMIN;
    const teacher = user?.Teacher || (await this.resolveTeacher(userId).catch(() => null));

    const submission = await (this.prisma as any).submission.findUnique({
      where: { id: submissionId },
      include: {
        student: {
          include: {
            User: { select: { loginId: true } },
            ClassSection: true,
          },
        },
        assignment: {
          include: {
            ClassSection: true,
          },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    // Security check: teacher identity and authorization
    if (!isAdmin) {
      if (!teacher) throw new UnauthorizedException('Teacher profile not found');
      const isAssignmentOwner = submission.assignment.teacherId === teacher.id;
      const isHomeroomTeacher = submission.assignment.ClassSection?.teacherId === teacher.id;

      let isSubjectTeacher = false;
      if (submission.assignment.classSectionId) {
        const teachingAssignment = await this.prisma.sectionSubjectTeacher.findFirst({
          where: {
            teacherId: teacher.id,
            classSectionId: submission.assignment.classSectionId,
          },
        });
        if (teachingAssignment) isSubjectTeacher = true;
      }

      if (!isAssignmentOwner && !isHomeroomTeacher && !isSubjectTeacher) {
        throw new ForbiddenException('You are not authorized to grade this student submission');
      }
    }

    // Strict Score Validation
    if (
      data.score === undefined ||
      data.score === null ||
      (typeof data.score === 'string' && (data.score as string).trim() === '')
    ) {
      throw new BadRequestException('Grade is required and cannot be empty');
    }
    const score = Number(data.score);
    if (isNaN(score)) {
      throw new BadRequestException('Grade must be a valid numeric value');
    }
    if (score < 0) {
      throw new BadRequestException('Grade cannot be negative');
    }

    // Resolve authoritative Grade Item binding from Grade Entry
    const resolved = await this.resolveGradeItemForAssignment(
      submission.assignment,
      submission.student,
      userId,
    );
    const { gradeItem, classSectionId, academicYearId, subjectRecord, quarter, term } = resolved;

    if (score > gradeItem.maxMark) {
      throw new BadRequestException(
        `Grade of ${score} exceeds the maximum mark of ${gradeItem.maxMark} for ${gradeItem.name}`,
      );
    }

    // 1. Save or update Grade record for this submission
    const existingGrade = await this.prisma.grade.findFirst({
      where: { submissionId },
    });

    const subjectName = subjectRecord?.name || submission.assignment.subject || 'Subject';

    const gradeData: any = {
      score,
      maxScore: gradeItem.maxMark,
      submissionId: submission.id,
      assignmentId: submission.assignmentId,
      studentId: submission.studentId,
      subject: subjectName,
      quarter,
      [gradeItem.fieldKey]: score,
    };

    const savedGrade = existingGrade
      ? await this.prisma.grade.update({
          where: { id: existingGrade.id },
          data: {
            score,
            maxScore: gradeItem.maxMark,
            [gradeItem.fieldKey]: score,
            subject: subjectName,
            quarter,
          },
        })
      : await this.prisma.grade.create({ data: gradeData });

    // 2. Also update student summary Grade breakdown row (where submissionId is null or primary quarter row)
    const quarterGrade = await this.prisma.grade.findFirst({
      where: {
        studentId: submission.studentId,
        subject: subjectName,
        quarter,
        submissionId: null,
      },
    });

    let finalMid = 0;
    let finalAsgn = 0;
    let finalQuiz = 0;
    let finalCw = 0;
    let finalExam = 0;

    if (quarterGrade) {
      const updatedQuarterGrade = await this.prisma.grade.update({
        where: { id: quarterGrade.id },
        data: {
          [gradeItem.fieldKey]: score,
        },
      });
      finalMid = updatedQuarterGrade.mid || 0;
      finalAsgn = updatedQuarterGrade.assignment || 0;
      finalQuiz = updatedQuarterGrade.quiz || 0;
      finalCw = updatedQuarterGrade.classwork || 0;
      finalExam = updatedQuarterGrade.final || 0;
    } else {
      finalMid = savedGrade.mid || 0;
      finalAsgn = gradeItem.fieldKey === 'assignment' ? score : (savedGrade.assignment || 0);
      finalQuiz = savedGrade.quiz || 0;
      finalCw = gradeItem.fieldKey === 'classwork' ? score : (savedGrade.classwork || 0);
      finalExam = savedGrade.final || 0;
    }

    const totalMarks = Number((finalMid + finalAsgn + finalQuiz + finalCw + finalExam).toFixed(2));

    // 3. Upsert SubjectResult so Grade Entry and Report Cards reflect the updated score immediately
    if (classSectionId && academicYearId && subjectRecord) {
      await (this.prisma as any).subjectResult.upsert({
        where: {
          studentId_subjectId_classSectionId_academicYearId_term: {
            studentId: submission.studentId,
            subjectId: subjectRecord.id,
            classSectionId,
            academicYearId,
            term,
          },
        },
        update: {
          marks: totalMarks,
          status: 'DRAFT',
        },
        create: {
          studentId: submission.studentId,
          subjectId: subjectRecord.id,
          classSectionId,
          academicYearId,
          term,
          marks: totalMarks,
          status: 'DRAFT',
        },
      });
    }

    // 4. Update StudentAssignment status to GRADED
    try {
      const sa = await this.prisma.studentAssignment.findFirst({
        where: {
          assignmentId: submission.assignmentId,
          OR: [
            { studentId: submission.studentId },
            { studentLoginId: submission.student.admissionNo },
          ],
        },
      });
      if (sa) {
        await this.prisma.studentAssignment.update({
          where: { id: sa.id },
          data: { status: 'GRADED' },
        });
      }
    } catch {
      // Ignore if studentAssignment not present
    }

    // 5. Save teacher feedback and update timestamp on Submission
    const trimmedFeedback = data.feedback !== undefined ? (data.feedback?.trim() || null) : undefined;
    await (this.prisma as any).submission.update({
      where: { id: submission.id },
      data: {
        ...(trimmedFeedback !== undefined ? { feedback: trimmedFeedback } : {}),
        updatedAt: new Date(),
      },
    });

    return {
      success: true,
      message: 'Grade and review submitted successfully',
      grade: {
        id: savedGrade.id,
        score,
        maxScore: gradeItem.maxMark,
        itemName: gradeItem.name,
        fieldKey: gradeItem.fieldKey,
      },
      feedback: trimmedFeedback !== undefined ? trimmedFeedback : (submission.feedback || null),
      status: 'GRADED',
    };
  }

  async getSubmissionFileUrl(submissionId: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { Teacher: true },
    });
    const isAdmin = user?.role === Role.ADMIN;
    const teacher = user?.Teacher || (await this.resolveTeacher(userId).catch(() => null));

    const submission = await (this.prisma as any).submission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: true,
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (!submission.fileUrl) throw new NotFoundException('No file attached to this submission');

    if (!isAdmin) {
      if (!teacher) throw new UnauthorizedException('Teacher profile not found');
      if (submission.assignment.teacherId !== teacher.id) {
        const section = await this.prisma.classSection.findFirst({
          where: {
            id: submission.assignment.classSectionId || undefined,
            OR: [
              { teacherId: teacher.id },
              { subjectTeachers: { some: { teacherId: teacher.id } } },
            ],
          },
        });
        if (!section) {
          throw new ForbiddenException('You are not authorized to access this file');
        }
      }
    }

    if (submission.fileUrl.startsWith('http://') || submission.fileUrl.startsWith('https://')) {
      return { url: submission.fileUrl, fileName: submission.fileName || 'submission-file' };
    }

    try {
      const { data, error } = await this.supabase.storage.from('submissions').createSignedUrl(submission.fileUrl, 3600, {
        download: submission.fileName || 'submission-file',
      });
      if (!error && data?.signedUrl) {
        return { url: data.signedUrl, fileName: submission.fileName || 'submission-file' };
      }
    } catch {
      // Fallback
    }

    const publicUrl = this.supabase.storage.from('submissions').getPublicUrl(submission.fileUrl).data.publicUrl;
    return { url: publicUrl, fileName: submission.fileName || 'submission-file' };
  }

  async findOne(id: string) {
    return this.prisma.assignment.findUnique({ where: { id } });
  }

  async delete(id: string) {
    return this.prisma.assignment.delete({ where: { id } });
  }
}