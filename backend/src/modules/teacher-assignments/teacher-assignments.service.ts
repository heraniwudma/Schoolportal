import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class TeacherAssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getHomeRoomAssignments(academicYearId?: string) {
    let yearId = academicYearId;
    if (!yearId) {
      const currentYear = await this.prisma.academicYear.findFirst({ where: { isCurrent: true } });
      if (currentYear) yearId = currentYear.id;
    }

    if (!yearId) return [];

    const sections = await this.prisma.classSection.findMany({
      where: { academicYearId: yearId },
      include: {
        GradeLevel: true,
        // "GeneralTeacher" is the homeroom teacher — stored as ClassSection.teacherId
        Teacher: true,
      },
      orderBy: [
        { GradeLevel: { gradeNumber: 'asc' } },
        { name: 'asc' }
      ]
    });

    return sections.map(sec => ({
      id: sec.id,
      classSectionId: sec.id,
      grade: sec.GradeLevel?.name || 'Unknown Grade',
      section: sec.name,
      teacher: sec.Teacher ? {
        id: sec.Teacher.id,
        name: `${sec.Teacher.firstName} ${sec.Teacher.lastName}`,
        staffId: sec.Teacher.staffId
      } : null,
      academicYearId: sec.academicYearId
    }));
  }

  async getAssignedTeachersCount(academicYearId: string) {
    return this.prisma.classSection.count({
      where: {
        academicYearId: academicYearId,
        teacherId: { not: null },
      },
    });
  }

  async assignHomeRoomTeacher(classSectionId: string, teacherId: string | null, academicYearId: string) {
    return this.prisma.classSection.update({
      where: { id: classSectionId },
      data: { 
        teacherId: teacherId,
        academicYearId: academicYearId,
      },
    });
  }

  async getSubjectAssignments(academicYearId?: string) {
    let yearId = academicYearId;

    if (!yearId || yearId === 'undefined' || yearId === 'null') {
      const currentYear = await this.prisma.academicYear.findFirst({ where: { isCurrent: true } });
      if (currentYear) yearId = currentYear.id;
    }

    if (!yearId) return [];

    const model = (this.prisma as any).sectionSubjectTeacher || (this.prisma as any).SectionSubjectTeacher;
    if (!model) return [];

    const assignments = await model.findMany({
      where: { academicYearId: yearId },
      include: {
        ClassSection: { include: { GradeLevel: true } },
        Subject: true,
        Teacher: true,
        AcademicYear: true,
      },
      orderBy: [
        { ClassSection: { GradeLevel: { gradeNumber: 'asc' } } },
        { ClassSection: { name: 'asc' } },
        { Subject: { name: 'asc' } }
      ]
    });

    return assignments.map((a: any) => ({
      id: a.id,
      classSectionId: a.classSectionId,
      grade: a.ClassSection?.GradeLevel?.name || 'Unknown Grade',
      section: a.ClassSection?.name,
      subject: {
        id: a.Subject?.id,
        name: a.Subject?.name,
        code: a.Subject?.code
      },
      teacher: {
        id: a.Teacher?.id,
        name: `${a.Teacher?.firstName} ${a.Teacher?.lastName}`,
        staffId: a.Teacher?.staffId
      },
      academicYear: {
        id: a.AcademicYear?.id,
        year: a.AcademicYear?.year
      }
    }));
  }

  async assignSubjectTeacher(classSectionId: string, subjectId: string, teacherId: string, academicYearId: string) {
    const section = await this.prisma.classSection.findUnique({ 
      where: { id: classSectionId },
      include: { GradeLevel: true }
    });
    if (!section) throw new NotFoundException('Section not found');
    
    if (section.academicYearId && section.academicYearId !== academicYearId) {
      throw new BadRequestException('Section does not belong to the supplied Academic Year');
    }

    const teacher = await this.prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) throw new NotFoundException('Teacher not found');

    const subject = await this.prisma.subject.findUnique({ where: { id: subjectId } });
    if (!subject) throw new NotFoundException('Subject not found');

    if (!section.gradeLevelId) throw new BadRequestException('Section has no associated grade level');

    const gradeSubject = await this.prisma.gradeSubject.findUnique({
      where: {
        academicYearId_gradeLevelId_subjectId: {
          academicYearId: academicYearId,
          gradeLevelId: section.gradeLevelId,
          subjectId: subjectId
        }
      }
    });

    if (!gradeSubject) {
      const globalGradeSubject = await this.prisma.gradeSubject.findFirst({
        where: {
          gradeLevelId: section.gradeLevelId,
          subjectId: subjectId,
          academicYearId: null
        }
      });
      if (!globalGradeSubject) {
        throw new BadRequestException('Subject is not assigned to this Grade in the curriculum');
      }
    }

    const existing = await (this.prisma as any).sectionSubjectTeacher.findUnique({
      where: {
        classSectionId_subjectId_academicYearId: {
          classSectionId,
          subjectId,
          academicYearId
        }
      }
    });

    if (existing) {
      return (this.prisma as any).sectionSubjectTeacher.update({
        where: { id: existing.id },
        data: { teacherId }
      });
    }

    return (this.prisma as any).sectionSubjectTeacher.create({
      data: {
        classSectionId,
        subjectId,
        teacherId,
        academicYearId
      }
    });
  }

  async getTeacherPermissions(userId: string) {
    // Resolve current year (fall back to most recent) so we never expose a
    // stale homeroom section from a previous academic year.
    const currentYear = await (async () => {
      const y = await this.prisma.academicYear.findFirst({
        where: { isCurrent: true },
        select: { id: true },
      });
      if (y) return y;
      return this.prisma.academicYear.findFirst({
        orderBy: { startDate: 'desc' },
        select: { id: true },
      });
    })();

    const teacher = await this.prisma.teacher.findUnique({
      where: { userId },
      include: {
        // ClassSection[] via "GeneralTeacher" relation = homeroom sections
        ClassSection: {
          where: currentYear ? { academicYearId: currentYear.id } : undefined,
          include: {
            GradeLevel: true,
            students: {
              where: { status: 'ACTIVE' },
              select: { id: true },
            },
          },
        },
      },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher profile not found');
    }

    const isHomeroomTeacher = teacher.ClassSection.length > 0;
    const section = isHomeroomTeacher ? teacher.ClassSection[0] : null;

    return {
      isHomeroomTeacher,
      assignedSection: section ? {
        id: section.id,
        name: section.name,
        grade: section.GradeLevel?.name,
        studentCount: section.students.length,
      } : null,
    };
  }

  async removeSubjectTeacher(id: string) {
    return (this.prisma as any).sectionSubjectTeacher.delete({
      where: { id }
    });
  }
}