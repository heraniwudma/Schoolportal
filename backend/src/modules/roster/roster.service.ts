import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CalculationService } from '../results/calculation.service';

@Injectable()
export class RosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculationService: CalculationService,
  ) {}

  /**
   * Resolves the value used by class selectors. Selectors normally send a
   * section ID, but accepting the display value keeps old clients compatible
   * with labels such as "Grade 10 A" while still resolving one exact section.
   */
  private async resolveClassSection(academicYearId: string, identifier: string) {
    const value = identifier.trim();
    const normalized = value.replace(/\s+/g, ' ').toLowerCase();

    const directMatch = await this.prisma.classSection.findFirst({
      where: {
        AND: [
          {
            OR: [
              { id: value },
              { name: { equals: value, mode: 'insensitive' } },
            ],
          },
          {
            academicYearId,
          },
        ],
      },
      include: { GradeLevel: { select: { id: true, name: true } } },
    });

    if (directMatch) return directMatch;

    const sections = await this.prisma.classSection.findMany({
      where: { academicYearId },
      include: { GradeLevel: { select: { id: true, name: true } } },
    });

    return sections.find((section) => {
      const grade = section.GradeLevel?.name?.trim() ?? '';
      const gradeLabel = /^grade\b/i.test(grade) ? grade : `Grade ${grade}`;
      const displayName = `${gradeLabel} ${section.name.trim()}`
        .replace(/\s+/g, ' ')
        .toLowerCase();
      return displayName === normalized;
    }) ?? null;
  }

  /** Active enrollment is the source of truth for grade-entry students. */
  async getEnrolledStudents(academicYearId: string, classSectionIdentifier: string) {
    if (!academicYearId || !classSectionIdentifier) {
      throw new BadRequestException('Academic Year and Class Section are required');
    }

    const section = await this.resolveClassSection(academicYearId, classSectionIdentifier);
    if (!section) {
      throw new NotFoundException('Class Section not found');
    }
    if (section.academicYearId !== academicYearId) {
      throw new BadRequestException('Class Section does not belong to the selected Academic Year');
    }
    if (!section.gradeLevelId || !section.GradeLevel) {
      throw new BadRequestException('Class Section has no associated grade level');
    }
    const gradeName = section.GradeLevel.name;

    // One-way, safe legacy repair: a student whose old profile points at a
    // fully canonical section receives the missing enrollment for this year.
    // Ambiguous legacy sections (no year/grade) are never guessed or moved.
    const legacyStudents = await this.prisma.student.findMany({
      where: {
        classSectionId: section.id,
        StudentEnrollment: { none: { academicYearId } },
      },
      select: { id: true },
    });
    if (legacyStudents.length) {
      await this.prisma.studentEnrollment.createMany({
        data: legacyStudents.map((student) => ({
          studentId: student.id,
          academicYearId,
          gradeLevelId: section.gradeLevelId!,
          classSectionId: section.id,
          status: 'ACTIVE',
        })),
        skipDuplicates: true,
      });
    }

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        academicYearId,
        gradeLevelId: section.gradeLevelId,
        classSectionId: section.id,
        status: 'ACTIVE',
      },
      select: {
        Student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            User: { select: { loginId: true } },
          },
        },
      },
      orderBy: [{ Student: { lastName: 'asc' } }, { Student: { firstName: 'asc' } }],
    });

    return enrollments.map(({ Student }) => ({
      id: Student.id,
      admissionNo: Student.admissionNo,
      loginId: Student.User?.loginId ?? null,
      firstName: Student.firstName,
      lastName: Student.lastName,
      name: `${Student.firstName} ${Student.lastName}`.trim(),
      classSection: {
        id: section.id,
        name: section.name,
        grade: gradeName,
        displayName: `${/^grade\b/i.test(gradeName) ? gradeName : `Grade ${gradeName}`} ${section.name}`,
      },
    }));
  }

  async getConsolidatedRoster(academicYearId: string, classSectionId: string) {
    return this.calculationService.calculateSectionRoster(academicYearId, classSectionId);
  }

  async updateStudentConduct(
    studentId: string,
    classSectionId: string,
    academicYearId: string,
    conduct: string,
  ) {
    const normalizedConduct = (conduct || '').trim().toUpperCase();
    if (!['A', 'B', 'C'].includes(normalizedConduct)) {
      throw new BadRequestException('Conduct must be A, B, or C');
    }

    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: { studentId, classSectionId, academicYearId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!enrollment) {
      throw new NotFoundException('Active student enrollment record not found');
    }

    return this.prisma.studentEnrollment.update({
      where: { id: enrollment.id },
      data: { conduct: normalizedConduct },
    });
  }

  async getRoster(academicYearId: string, classSectionId: string) {
    if (!academicYearId || !classSectionId) {
      throw new BadRequestException('Academic Year and Class Section are required');
    }

    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: {
        academicYearId,
        classSectionId,
      },
      include: {
        Student: {
          include: {
            User: {
              select: { avatarUrl: true }
            },
            StudentAttendance: {
              where: {
                classSectionId
              }
            },
            ExamAttempt: {
              include: {
                Examination: {
                  select: { 
                    classSectionId: true,
                    totalMarks: true,
                    passingMarks: true,
                    examDate: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        Student: {
          firstName: 'asc'
        }
      }
    });

    return enrollments.map(enrollment => {
      const student = enrollment.Student;
      
      // Calculate attendance
      const sectionAttendance = student.StudentAttendance || [];
      const totalDays = sectionAttendance.length;
      const presentDays = sectionAttendance.filter((a:any) => a.status === 'PRESENT' || a.status === 'LATE' || a.status === 'EXCUSED').length;
      const attendancePercentage = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : null;

      // Calculate exam status
      const sectionExams = student.ExamAttempt?.filter(a => a.Examination?.classSectionId === classSectionId) || [];
      let examStatus = 'Not Taken';
      
      if (sectionExams.length > 0) {
        // Sort to prefer the most recent exam
        sectionExams.sort((a, b) => new Date(b.Examination.examDate).getTime() - new Date(a.Examination.examDate).getTime());
        const recentAttempt = sectionExams[0];
        
        if (recentAttempt.Examination.passingMarks != null) {
    if (recentAttempt.marksObtained >= recentAttempt.Examination.passingMarks) {
            examStatus = 'Passed';
          } else {
            examStatus = 'Failed';
          }
        } else {
          examStatus = 'Completed';
        }
      }

      return {
        id: enrollment.id,
        enrollmentDate: enrollment.enrollmentDate,
        status: enrollment.status,
        student: {
          id: student.id,
          admissionNo: student.admissionNo,
          firstName: student.firstName,
          lastName: student.lastName,
          gender: student.gender,
          avatarUrl: student.User?.avatarUrl
        },
        attendancePercentage,
        examStatus,
      };
    });
  }

  async getSummary(academicYearId: string, classSectionId: string) {
    if (!academicYearId || !classSectionId) {
      throw new BadRequestException('Academic Year and Class Section are required');
    }

    const section = await this.prisma.classSection.findUnique({
      where: { id: classSectionId },
      include: { GradeLevel: true }
    });

    if (!section) {
      throw new NotFoundException('Class Section not found');
    }

    const totalEnrolled = await this.prisma.studentEnrollment.count({
      where: { classSectionId, academicYearId }
    });

    return {
      name: section.name,
      roomNumber: section.roomNumber,
      capacity: section.capacity,
      gradeName: section.GradeLevel?.name,
      totalEnrolled
    };
  }

  async enrollStudent(data: { studentId: string; academicYearId: string; gradeLevelId: string; classSectionId: string; enrollmentDate: string; status: string }) {
    const section = await this.prisma.classSection.findUnique({
      where: { id: data.classSectionId }
    });

    if (!section) {
      throw new NotFoundException('Class Section not found');
    }
    if (section.academicYearId !== data.academicYearId || !section.gradeLevelId) {
      throw new BadRequestException('Select a canonical class section for the selected academic year');
    }
    if (section.gradeLevelId !== data.gradeLevelId) {
      throw new BadRequestException('The selected section does not belong to the supplied grade');
    }

    if (section.capacity) {
      const currentEnrollmentCount = await this.prisma.studentEnrollment.count({
        where: { classSectionId: data.classSectionId, status: 'ACTIVE' }
      });

      if (currentEnrollmentCount >= section.capacity) {
        throw new ConflictException('This class section has reached its maximum capacity.');
      }
    }

    const existingEnrollment = await this.prisma.studentEnrollment.findFirst({
      where: {
        studentId: data.studentId,
        academicYearId: data.academicYearId
      }
    });

    if (existingEnrollment) {
      throw new ConflictException('Student is already enrolled in this academic year.');
    }

    return this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.studentEnrollment.create({
        data: {
          studentId: data.studentId,
          academicYearId: data.academicYearId,
          gradeLevelId: section.gradeLevelId!,
          classSectionId: section.id,
          enrollmentDate: new Date(data.enrollmentDate),
          status: data.status,
        },
      });
      // Kept temporarily for legacy profile readers; enrollment is canonical.
      await tx.student.update({ where: { id: data.studentId }, data: { classSectionId: section.id } });
      return enrollment;
    });
  }
}
