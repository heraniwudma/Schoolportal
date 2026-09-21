import { Injectable, NotFoundException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly teacherIdCache = new Map<string, { id: string; expiresAt: number }>();
  private readonly TEACHER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private cachedCurrentYearId: { id: string | null; expiresAt: number } | null = null;

  /**
   * Helper to resolve the Teacher entity ID whether passed a Teacher ID or Auth User ID
   */
  private async resolveTeacherId(idOrUserId: string): Promise<string> {
    const now = Date.now();
    const cached = this.teacherIdCache.get(idOrUserId);
    if (cached && cached.expiresAt > now) {
      return cached.id;
    }

    const teacher = await this.prisma.teacher.findFirst({
      where: {
        OR: [
          { id: idOrUserId },
          { userId: idOrUserId },
        ],
      },
      select: { id: true },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher profile not found');
    }

    this.teacherIdCache.set(idOrUserId, { id: teacher.id, expiresAt: now + this.TEACHER_CACHE_TTL_MS });
    return teacher.id;
  }

  async getAllTeachers() {
    return this.prisma.teacher.findMany({
      select: {
        id: true,
        userId: true,
        firstName: true,
        lastName: true,
        staffId: true,
        phoneNumber: true,
        qualification: true,
      },
      orderBy: { lastName: 'asc' },
      take: 100,
    });
  }

  async getTeacherDashboardStats(idOrUserId: string) {
    try {
      const teacherId = await this.resolveTeacherId(idOrUserId);

      const sectionCount = await this.prisma.classSection.count({
        where: { teacherId },
      });

      return { sectionCount };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Teacher profile not found');
      }
      throw error;
    }
  }

  async getAssignedClasses(idOrUserId: string) {
    try {
      const teacherId = await this.resolveTeacherId(idOrUserId);

      return this.prisma.classSection.findMany({
        where: { teacherId },
        select: {
          id: true,
          name: true,
          roomNumber: true,
          capacity: true,
          gradeLevelId: true,
          academicYearId: true,
          GradeLevel: { select: { id: true, name: true } },
          students: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              admissionNo: true,
              status: true,
            },
          },
          _count: { select: { students: true } },
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Teacher profile not found');
      }
      throw error;
    }
  }

  async getTeachingAssignments(userId: string) {
    try {
      const teacherId = await this.resolveTeacherId(userId);
      return this.prisma.sectionSubjectTeacher.findMany({
        // Grade entry must only expose current, active class-subject work.
        // A teacher profile or homeroom assignment is not a subject assignment.
        where: {
          teacherId,
          AcademicYear: { isCurrent: true },
          ClassSection: { status: 'ACTIVE' },
        },
        select: {
          id: true,
          subjectId: true,
          classSectionId: true,
          academicYearId: true,
          Subject: { select: { id: true, name: true, code: true } },
          ClassSection: { select: { id: true, name: true, GradeLevel: { select: { name: true } } } },
        },
        orderBy: [{ ClassSection: { name: 'asc' } }, { Subject: { name: 'asc' } }],
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Teacher profile not found');
      }
      throw error;
    }
  }

  async getDashboard(userId: string) {
    try {
      const teacher = await this.prisma.teacher.findFirst({
        where: {
          OR: [
            { id: userId },
            { userId },
          ],
        },
        select: {
          id: true,
          subjectSections: {
            select: {
              subjectId: true,
              classSectionId: true,
              academicYearId: true,
              ClassSection: {
                select: {
                  id: true,
                  name: true,
                  academicYearId: true,
                  GradeLevel: { select: { name: true } },
                },
              },
            },
          },
          // Also load homeroom sections so pure homeroom teachers get student counts
          ClassSection: {
            select: {
              id: true,
              name: true,
              academicYearId: true,
              GradeLevel: { select: { name: true } },
            },
          },
        },
      });

      if (!teacher) {
        throw new NotFoundException('Teacher profile not found. Please contact your administrator.');
      }

      const teacherId = teacher.id;
      const assignments = teacher.subjectSections;
      // Subject-teaching sections
      const subjectSectionIds = [...new Set(assignments.map((a) => a.classSectionId))];
      // Homeroom sections (may overlap with subject sections)
      const homeroomSectionIds = teacher.ClassSection.map((s) => s.id);
      // Combined unique section IDs for attendance and student count
      const allSectionIds = [...new Set([...subjectSectionIds, ...homeroomSectionIds])];

      // Build unique assigned sections list for attendance sessions & display
      const assignedSectionsMap = new Map<string, { id: string; name: string; gradeName?: string; academicYearId?: string }>();
      for (const cs of teacher.ClassSection) {
        if (cs.id && !assignedSectionsMap.has(cs.id)) {
          assignedSectionsMap.set(cs.id, {
            id: cs.id,
            name: cs.name,
            gradeName: cs.GradeLevel?.name,
            academicYearId: cs.academicYearId || undefined,
          });
        }
      }
      for (const ss of teacher.subjectSections) {
        if (ss.ClassSection && !assignedSectionsMap.has(ss.ClassSection.id)) {
          assignedSectionsMap.set(ss.ClassSection.id, {
            id: ss.ClassSection.id,
            name: ss.ClassSection.name,
            gradeName: ss.ClassSection.GradeLevel?.name,
            academicYearId: ss.ClassSection.academicYearId || ss.academicYearId || undefined,
          });
        }
      }
      const uniqueAssignedSections = Array.from(assignedSectionsMap.values());

      const [assignmentCount, pendingExamCount, activeStudentCount, attendanceRecords, recentAssignments, recentExams, submittedAssignmentsList] = await Promise.all([
        this.prisma.assignment.count({ where: { teacherId } }),
        this.prisma.examination.count({ where: { teacherId, status: 'PENDING' } }),
        allSectionIds.length ? this.prisma.student.count({ where: { classSectionId: { in: allSectionIds }, status: 'ACTIVE' } }) : 0,
        allSectionIds.length ? this.prisma.studentAttendance.findMany({
          where: { classSectionId: { in: allSectionIds } },
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
          take: 20,
        }) : [],
        this.prisma.assignment.findMany({ where: { teacherId }, select: { id: true, title: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 3 }),
        this.prisma.examination.findMany({ where: { teacherId }, select: { id: true, title: true, status: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 3 }),
        this.prisma.submission.findMany({
          where: {
            assignment: {
              OR: [
                { teacherId },
                ...(allSectionIds.length ? [{ classSectionId: { in: allSectionIds } }] : []),
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
              },
            },
            grades: {
              select: {
                score: true,
                maxScore: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
      ]);

      const presentCount = attendanceRecords.filter((record) => record.status === 'PRESENT' || record.status === 'LATE').length;
      const submissionActions = submittedAssignmentsList.slice(0, 3).map((sub) => ({
        id: `submission-${sub.id}`,
        type: 'submission',
        text: `${sub.student.firstName} ${sub.student.lastName} submitted ${sub.assignment.title}`,
        at: sub.createdAt,
      }));

      const actions = [
        ...submissionActions,
        ...recentAssignments.map((item) => ({ id: `assignment-${item.id}`, type: 'assignment', text: `Published assignment: ${item.title}`, at: item.createdAt })),
        ...recentExams.map((item) => ({ id: `exam-${item.id}`, type: 'exam', text: `${item.status === 'DRAFT' ? 'Saved draft' : 'Updated exam'}: ${item.title}`, at: item.updatedAt })),
      ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 5);

      return {
        assignedSubjectsCount: new Set(assignments.map((assignment) => assignment.subjectId)).size,
        activeStudentsCount: activeStudentCount,
        assignmentsPublishedCount: assignmentCount,
        pendingExamsCount: pendingExamCount,
        attendance: {
          recordsReviewed: attendanceRecords.length,
          presentCount,
          absentCount: attendanceRecords.length - presentCount,
          records: attendanceRecords.map((rec) => ({
            id: rec.id,
            studentId: rec.studentId,
            studentName: `${rec.Student?.firstName || ''} ${rec.Student?.lastName || ''}`.trim() || 'Unnamed Student',
            admissionNo: rec.Student?.admissionNo || null,
            classSectionId: rec.classSectionId,
            className: rec.ClassSection
              ? `${rec.ClassSection.GradeLevel?.name ? `Grade ${rec.ClassSection.GradeLevel.name} - ` : ''}${rec.ClassSection.name}`
              : 'Assigned Class',
            date: rec.date.toISOString(),
            period: rec.period ?? 1,
            status: rec.status,
            remarks: rec.remarks || '',
          })),
          assignedSections: uniqueAssignedSections,
        },
        recentActions: actions,
        submittedAssignments: submittedAssignmentsList.map((sub) => ({
          id: sub.id,
          assignmentId: sub.assignmentId,
          assignmentTitle: sub.assignment.title,
          subject: sub.assignment.subject || '',
          targetClass: sub.assignment.targetClass || '',
          instructions: sub.assignment.instructions || sub.assignment.description || '',
          studentId: sub.student.id,
          studentName: `${sub.student.firstName} ${sub.student.lastName}`.trim(),
          admissionNo: sub.student.admissionNo,
          submittedAt: sub.createdAt.toISOString(),
          content: sub.content || '',
          fileName: sub.fileName || null,
          fileUrl: sub.fileUrl || null,
          fileSize: sub.fileSize || null,
          feedback: (sub as any).feedback || null,
          isGraded: sub.grades.length > 0,
          grade: sub.grades[0] ? { score: sub.grades[0].score, maxScore: sub.grades[0].maxScore } : null,
        })),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new NotFoundException('Teacher profile not found. Please contact your administrator.');
      }
      console.error('Error loading dashboard:', error);
      throw new InternalServerErrorException('Failed to load teacher dashboard');
    }
  }

  async getMyHomeroomContext(userId: string) {
    const now = Date.now();

    // 1. Concurrently resolve active academic year and teacher sections
    let yearPromise: Promise<{ id: string } | null>;
    if (this.cachedCurrentYearId && this.cachedCurrentYearId.expiresAt > now) {
      yearPromise = Promise.resolve(this.cachedCurrentYearId.id ? { id: this.cachedCurrentYearId.id } : null);
    } else {
      yearPromise = this.prisma.academicYear
        .findFirst({
          where: { isCurrent: true },
          select: { id: true },
        })
        .then(async (currentYear) => {
          if (currentYear) {
            this.cachedCurrentYearId = { id: currentYear.id, expiresAt: now + 5 * 60 * 1000 };
            return currentYear;
          }
          const latestYear = await this.prisma.academicYear.findFirst({
            orderBy: { startDate: 'desc' },
            select: { id: true },
          });
          this.cachedCurrentYearId = { id: latestYear?.id ?? null, expiresAt: now + 5 * 60 * 1000 };
          return latestYear;
        });
    }

    const teacherPromise = this.prisma.teacher.findFirst({
      where: { userId },
      select: {
        id: true,
        // ClassSection[] via "GeneralTeacher" relation = homeroom sections
        ClassSection: {
          select: {
            id: true,
            name: true,
            academicYearId: true,
            AcademicYear: { select: { id: true, isCurrent: true, startDate: true } },
            GradeLevel: { select: { name: true } },
            _count: { select: { students: true } },
          },
        },
      },
    });

    const [resolvedYear, teacher] = await Promise.all([yearPromise, teacherPromise]);
    const currentYearId = resolvedYear?.id;

    if (!teacher) {
      return {
        teacherId: null,
        isHomeroomTeacher: false,
        assignedSection: null,
        academicYearId: currentYearId ?? null,
      };
    }

    const sections = teacher.ClassSection;
    const homeroomSection =
      (currentYearId ? sections.find((s) => s.academicYearId === currentYearId) : null) ||
      sections.find((s) => s.AcademicYear?.isCurrent) ||
      [...sections].sort((a, b) => {
        const dateA = a.AcademicYear?.startDate ? new Date(a.AcademicYear.startDate).getTime() : 0;
        const dateB = b.AcademicYear?.startDate ? new Date(b.AcademicYear.startDate).getTime() : 0;
        return dateB - dateA;
      })[0] ||
      null;

    return {
      teacherId: teacher.id,
      isHomeroomTeacher: !!homeroomSection,
      // The academicYearId the frontend must use for all subsequent homeroom
      // queries — taken from the section itself so it always matches.
      academicYearId: homeroomSection?.academicYearId ?? currentYearId ?? null,
      assignedSection: homeroomSection
        ? {
            id: homeroomSection.id,
            name: homeroomSection.name,
            grade: homeroomSection.GradeLevel?.name,
            gradeLevel: homeroomSection.GradeLevel?.name,
            studentCount: homeroomSection._count.students,
            enrolledCount: homeroomSection._count.students,
            academicYearId: homeroomSection.academicYearId,
          }
        : null,
    };
  }

  async verifyHomeroomAccess(userId: string, classSectionId: string) {
    // Homeroom teacher is stored as ClassSection.teacherId ("GeneralTeacher" relation)
    const teacher = await this.prisma.teacher.findFirst({ where: { userId }, select: { id: true } });
    const isHomeroom = teacher
      ? await this.prisma.classSection.findFirst({
          where: { id: classSectionId, teacherId: teacher.id },
          select: { id: true },
        })
      : null;
    if (!isHomeroom) {
      throw new ForbiddenException('You are not authorized as the homeroom teacher for this section.');
    }
  }
}
