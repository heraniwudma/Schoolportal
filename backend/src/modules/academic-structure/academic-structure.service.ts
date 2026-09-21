import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class AcademicStructureService {
  constructor(private readonly prisma: PrismaService) {}

  private cachedYears: any[] | null = null;
  private cachedYearsExpiresAt = 0;
  private readonly YEARS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  // ─── ACADEMIC YEARS ──────────────────────────────────────────────────────────

  async getAcademicYears() {
    const now = Date.now();
    if (this.cachedYears && this.cachedYearsExpiresAt > now) {
      return this.cachedYears;
    }
    const years = await this.prisma.academicYear.findMany({
      orderBy: { startDate: 'desc' },
    });
    this.cachedYears = years;
    this.cachedYearsExpiresAt = now + this.YEARS_CACHE_TTL_MS;
    return years;
  }

  async createAcademicYear(data: { label: string; startDate: Date; endDate: Date }) {
    if (data.endDate <= data.startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    const existing = await this.prisma.academicYear.findUnique({
      where: { year: data.label },
    });
    if (existing) {
      throw new BadRequestException('Academic year label already exists');
    }

    const created = await this.prisma.academicYear.create({
      data: {
        id: crypto.randomUUID(),
        year: data.label,
        startDate: data.startDate,
        endDate: data.endDate,
        isCurrent: false, // Must be activated manually
        updatedAt: new Date(),
      },
    });
    this.cachedYears = null; // Invalidate cache
    return created;
  }

  async activateAcademicYear(id: string) {
    // Check if it exists
    const targetYear = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!targetYear) {
      throw new BadRequestException('Academic year not found');
    }

    // Run transaction to ensure only one is active
    const result = await this.prisma.$transaction(async (tx) => {
      // Deactivate all
      await tx.academicYear.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false },
      });
      // Activate the target
      return tx.academicYear.update({
        where: { id },
        data: { isCurrent: true },
      });
    });
    this.cachedYears = null; // Invalidate cache
    return result;
  }

  async getGradeLevels(academicYearId?: string) {
    let yearId = academicYearId?.trim();
    if (!yearId) {
      const currentYear = await this.prisma.academicYear.findFirst({
        where: { isCurrent: true },
        select: { id: true },
      });
      yearId = currentYear?.id;
    }

    const grades = await this.prisma.gradeLevel.findMany({
      include: {
        ClassSection: {
          where: yearId ? { academicYearId: yearId } : undefined,
          orderBy: { name: 'asc' },
        },
        StudentEnrollment: {
          select: { id: true },
          where: {
            ...(yearId ? { academicYearId: yearId } : { AcademicYear: { isCurrent: true } }),
            status: 'ACTIVE',
          },
        },
      },
      orderBy: { gradeNumber: 'asc' },
    });
    return grades.map((grade) => ({
      ...grade,
      ClassSection: grade.ClassSection.map((section) => ({
        ...section,
        displayName: `${grade.name.startsWith('Grade') ? grade.name : `Grade ${grade.name}`} ${section.name}`,
      })),
    }));
  }

  async createGradeLevel(data: { name: string; gradeNumber?: number; description?: string }) {
    return this.prisma.gradeLevel.create({
      data: {
        name: data.name,
        gradeNumber: data.gradeNumber,
      },
    });
  }

  // ─── SECTIONS ────────────────────────────────────────────────────────────────

  async createSection(data: { gradeLevelId: string; name: string }) {
    const grade = await this.prisma.gradeLevel.findUnique({ where: { id: data.gradeLevelId } });
    if (!grade) {
      throw new BadRequestException('Grade level not found');
    }

    // Store a section code only (A, B, C, ...); grade identity belongs to the
    // GradeLevel relation. This prevents ambiguous values such as "Grade 10A"
    // or "A,B,C" from becoming standalone class names.
    const sectionName = data.name.trim().replace(/^grade\s*\d+\s*/i, '').toUpperCase();
    if (!/^[A-Z][A-Z0-9]{0,3}$/.test(sectionName)) {
      throw new BadRequestException('Section must be one code, for example A, B, or C');
    }

    const currentYear = await this.prisma.academicYear.findFirst({
      where: { isCurrent: true },
      select: { id: true },
    });
    if (!currentYear) {
      throw new BadRequestException('Set the current academic year before creating a class section');
    }

    return this.prisma.classSection.create({
      data: {
        id: crypto.randomUUID(),
        name: sectionName,
        gradeLevelId: data.gradeLevelId,
        academicYearId: currentYear.id,
      },
    });
  }

  // ─── SUBJECTS ────────────────────────────────────────────────────────────────

  async getSubjects() {
    return this.prisma.subject.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async createSubject(data: { name: string; code: string; type?: string; description?: string }) {
    const existing = await this.prisma.subject.findUnique({ where: { code: data.code } });
    if (existing) {
      throw new BadRequestException('Subject code already exists');
    }

    return this.prisma.subject.create({
      data: {
        id: crypto.randomUUID(),
        name: data.name,
        code: data.code,
        type: data.type || 'CORE',
        description: data.description,
      },
    });
  }

  async getGradeSubjects() {
    return this.prisma.gradeSubject.findMany({
      include: { Subject: true, GradeLevel: true },
    });
  }

  async assignSubjectToGrade(data: { gradeLevelId: string; subjectId: string; academicYearId?: string }) {
    const existing = await this.prisma.gradeSubject.findUnique({
      where: {
        academicYearId_gradeLevelId_subjectId: {
          academicYearId: data.academicYearId || '',
          gradeLevelId: data.gradeLevelId,
          subjectId: data.subjectId,
        }
      }
    });

    if (existing) {
      throw new BadRequestException('Subject is already assigned to this grade');
    }

    return this.prisma.gradeSubject.create({
      data: {
        gradeLevelId: data.gradeLevelId,
        subjectId: data.subjectId,
        academicYearId: data.academicYearId || null,
      },
    });
  }

  async unassignSubjectFromGrade(id: string) {
    return this.prisma.gradeSubject.delete({ where: { id } });
  }

  // ─── PROMOTION ───────────────────────────────────────────────────────────────

  async getEligibleStudents(academicYearId: string) {
    return this.prisma.studentEnrollment.findMany({
      where: { academicYearId },
      include: {
        Student: true,
        GradeLevel: true,
        ClassSection: true,
      },
      orderBy: { Student: { firstName: 'asc' } },
    });
  }

  async promoteStudents(data: {
    sourceYearId: string;
    targetYearId: string;
    promotions: Array<{
      studentId: string;
      targetGradeLevelId: string;
      targetSectionId: string;
    }>;
  }) {
    if (data.sourceYearId === data.targetYearId) {
      throw new BadRequestException('Source and target academic years must be different');
    }

    const targetYear = await this.prisma.academicYear.findUnique({ where: { id: data.targetYearId } });
    if (!targetYear) {
      throw new BadRequestException('Target academic year not found');
    }

    return this.prisma.$transaction(async (tx) => {
      let promotedCount = 0;

      for (const promo of data.promotions) {
        // Prevent duplicate enrollment for same year
        const existingEnrollment = await tx.studentEnrollment.findUnique({
          where: {
            studentId_academicYearId: {
              studentId: promo.studentId,
              academicYearId: data.targetYearId,
            }
          }
        });

        if (existingEnrollment) {
          // You could throw or skip. Throwing fails the entire batch.
          throw new BadRequestException(`Student ${promo.studentId} is already enrolled in the target year`);
        }

        // Verify section belongs to target grade
        const section = await tx.classSection.findUnique({
          where: { id: promo.targetSectionId }
        });

        if (!section || section.gradeLevelId !== promo.targetGradeLevelId) {
          throw new BadRequestException(`Invalid section ${promo.targetSectionId} for grade ${promo.targetGradeLevelId}`);
        }

        await tx.studentEnrollment.create({
          data: {
            studentId: promo.studentId,
            academicYearId: data.targetYearId,
            gradeLevelId: promo.targetGradeLevelId,
            classSectionId: promo.targetSectionId,
          }
        });
        
        // Also update the current classSectionId on the student model for legacy support
        await tx.student.update({
          where: { id: promo.studentId },
          data: { classSectionId: promo.targetSectionId }
        });

        promotedCount++;
      }

      return { success: true, promotedCount };
    });
  }
}
