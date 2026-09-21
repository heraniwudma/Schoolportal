import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface SubjectScoreCalculation {
  subjectId: string;
  subject: string;
  code: string;
  term1: number | null;
  term2: number | null;
  term3: number | null;
  term4: number | null;
  sem1Avg: number | null;
  sem2Avg: number | null;
  yearlyAverage: number | null;
  isComplete: boolean;
  terms: Array<number | null>;
  semesterAverages: Array<number | null>;
}

export interface StudentCalculationResult {
  studentId: string;
  admissionNo: string;
  studentName: string;
  sex: string;
  age: number | null;
  isComplete: boolean;
  requiredSubjectCount: number;
  completedSubjectCount: number;
  missingSubjects: string[];
  subjectScores: SubjectScoreCalculation[];
  sum: number | null;
  average: number | null;
  rank: number | null;
  absentDays: number;
  conduct: string | null;
  status: 'COMPLETE' | 'INCOMPLETE';
}

export interface RosterCalculationResult {
  section: {
    id: string;
    name: string;
    grade?: string;
    homeroomTeacher: string | null;
  };
  terms: string[];
  subjects: Array<{ id: string; name: string; code: string }>;
  students: StudentCalculationResult[];
  statistics: {
    totalEnrolled: number;
    completeCount: number;
    incompleteCount: number;
    classAverage: number | null;
  };
}

@Injectable()
export class CalculationService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Pure Calculation Primitives ───────────────────────────────────────────

  /**
   * Authoritative completed-years age calculation from student DOB.
   * Preserves calendar date (year, month, day) without timezone skew.
   * age = currentYear - birthYear
   * if today's month/day is before student's birth month/day: age = age - 1
   */
  calculateAge(
    dateOfBirth?: Date | string | null,
    referenceDate: Date | string = new Date(),
  ): number | null {
    if (!dateOfBirth) return null;

    const parseCalendarDate = (
      d: Date | string,
    ): { year: number; month: number; day: number } | null => {
      if (!d) return null;
      if (typeof d === 'string') {
        const trimmed = d.trim();
        const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
          return {
            year: parseInt(match[1], 10),
            month: parseInt(match[2], 10) - 1,
            day: parseInt(match[3], 10),
          };
        }
      }

      const dateObj = typeof d === 'string' ? new Date(d) : d;
      if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return null;

      // When dateObj is UTC midnight (standard for database date/DOB and ISO date strings)
      if (
        dateObj.getUTCHours() === 0 &&
        dateObj.getUTCMinutes() === 0 &&
        dateObj.getUTCSeconds() === 0 &&
        dateObj.getUTCMilliseconds() === 0
      ) {
        return {
          year: dateObj.getUTCFullYear(),
          month: dateObj.getUTCMonth(),
          day: dateObj.getUTCDate(),
        };
      }

      // Otherwise, use local calendar date components
      return {
        year: dateObj.getFullYear(),
        month: dateObj.getMonth(),
        day: dateObj.getDate(),
      };
    };

    const birth = parseCalendarDate(dateOfBirth);
    const ref = parseCalendarDate(referenceDate);

    if (!birth || !ref) return null;

    let age = ref.year - birth.year;
    const monthDiff = ref.month - birth.month;

    if (monthDiff < 0 || (monthDiff === 0 && ref.day < birth.day)) {
      age--;
    }

    return age >= 0 ? age : 0;
  }

  /**
   * Ave1 = (Term 1 + Term 2) / 2
   */
  calculateAve1(term1: number, term2: number): number {
    return Number(((term1 + term2) / 2).toFixed(2));
  }

  /**
   * Ave2 = (Term 3 + Term 4) / 2
   */
  calculateAve2(term3: number, term4: number): number {
    return Number(((term3 + term4) / 2).toFixed(2));
  }

  /**
   * YearlyAverage = (Ave1 + Ave2) / 2
   */
  calculateYearlyAverage(ave1: number, ave2: number): number {
    return Number(((ave1 + ave2) / 2).toFixed(2));
  }

  /**
   * Evaluates subject scores for a single student.
   * If any required term is missing, subject is incomplete and yearlyAverage is null.
   */
  calculateSubjectScores(
    term1?: number | null,
    term2?: number | null,
    term3?: number | null,
    term4?: number | null,
  ): {
    term1: number | null;
    term2: number | null;
    term3: number | null;
    term4: number | null;
    sem1Avg: number | null;
    sem2Avg: number | null;
    yearlyAverage: number | null;
    isComplete: boolean;
    terms: Array<number | null>;
    semesterAverages: Array<number | null>;
  } {
    const t1 = typeof term1 === 'number' && !isNaN(term1) ? term1 : null;
    const t2 = typeof term2 === 'number' && !isNaN(term2) ? term2 : null;
    const t3 = typeof term3 === 'number' && !isNaN(term3) ? term3 : null;
    const t4 = typeof term4 === 'number' && !isNaN(term4) ? term4 : null;

    const sem1Avg = t1 !== null && t2 !== null ? this.calculateAve1(t1, t2) : null;
    const sem2Avg = t3 !== null && t4 !== null ? this.calculateAve2(t3, t4) : null;

    const isComplete = sem1Avg !== null && sem2Avg !== null;
    const yearlyAverage = isComplete ? this.calculateYearlyAverage(sem1Avg!, sem2Avg!) : null;

    return {
      term1: t1,
      term2: t2,
      term3: t3,
      term4: t4,
      sem1Avg,
      sem2Avg,
      yearlyAverage,
      isComplete,
      terms: [t1, t2, t3, t4],
      semesterAverages: [sem1Avg, sem2Avg],
    };
  }

  /**
   * Sum of all applicable required subject yearly averages.
   */
  calculateClassSum(yearlyAverages: number[]): number {
    const sum = yearlyAverages.reduce((acc, val) => acc + val, 0);
    return Number(sum.toFixed(2));
  }

  /**
   * Class Average = Sum / NumberOfRequiredSubjects.
   * Denominator is dynamically determined by the count of required subjects.
   */
  calculateClassAverage(sum: number, requiredSubjectCount: number): number {
    if (requiredSubjectCount <= 0) return 0;
    return Number((sum / requiredSubjectCount).toFixed(2));
  }

  /**
   * Competition ranking (1, 1, 3, 4, 4, 6...).
   * Ties receive the same rank; subsequent rank skips positions.
   * Incomplete students receive rank: null.
   */
  assignCompetitionRanks<T extends { average: number | null; isComplete: boolean }>(
    items: T[],
  ): Array<T & { rank: number | null }> {
    // Separate complete vs incomplete
    const completeItems: Array<{ item: T; originalIndex: number }> = [];
    const incompleteItems: Array<{ item: T; originalIndex: number }> = [];

    items.forEach((item, index) => {
      if (item.isComplete && item.average !== null) {
        completeItems.push({ item, originalIndex: index });
      } else {
        incompleteItems.push({ item, originalIndex: index });
      }
    });

    // Sort complete items descending by average
    completeItems.sort((a, b) => (b.item.average ?? 0) - (a.item.average ?? 0));

    // Assign competition ranks
    const rankedComplete: Array<{ item: T & { rank: number | null }; originalIndex: number }> = [];
    for (let i = 0; i < completeItems.length; i++) {
      const current = completeItems[i];
      let rank = i + 1;

      if (i > 0) {
        const prev = completeItems[i - 1];
        if (current.item.average === prev.item.average) {
          rank = rankedComplete[i - 1].item.rank!;
        }
      }

      rankedComplete.push({
        item: { ...current.item, rank },
        originalIndex: current.originalIndex,
      });
    }

    // Incomplete items have rank = null
    const rankedIncomplete = incompleteItems.map(({ item, originalIndex }) => ({
      item: { ...item, rank: null },
      originalIndex,
    }));

    // Reassemble in original order or sorted complete-first
    const combined = [...rankedComplete, ...rankedIncomplete];
    combined.sort((a, b) => a.originalIndex - b.originalIndex);

    return combined.map((c) => c.item);
  }

  // ─── Dynamic Required Subject Discovery ────────────────────────────────────

  /**
   * Dynamically determines required subjects for a given class section and academic year.
   * NEVER hardcodes subjects.
   * Order of authoritative sources:
   *  1. SectionSubjectTeacher assignments for (classSectionId, academicYearId)
   *  2. GradeSubject curriculum for the section's gradeLevelId and academicYearId
   *  3. Distinct subjects from existing SubjectResult records
   */
  async getRequiredSubjects(
    classSectionId: string,
    academicYearId: string,
    gradeLevelId?: string | null,
  ): Promise<Array<{ id: string; name: string; code: string }>> {
    // 1. Primary source: SectionSubjectTeacher
    const sst = await (this.prisma as any).sectionSubjectTeacher.findMany({
      where: { classSectionId, academicYearId },
      select: {
        Subject: { select: { id: true, name: true, code: true } },
      },
    });

    const subjectMap = new Map<string, { id: string; name: string; code: string }>();
    sst.forEach((s: any) => {
      if (s?.Subject) subjectMap.set(s.Subject.id, s.Subject);
    });

    // 2. Fallback source: GradeSubject curriculum
    if (subjectMap.size === 0 && gradeLevelId) {
      const gs = await this.prisma.gradeSubject.findMany({
        where: {
          gradeLevelId,
          OR: [{ academicYearId }, { academicYearId: null }],
        },
        include: { Subject: { select: { id: true, name: true, code: true } } },
      });
      gs.forEach((g: any) => {
        if (g?.Subject) subjectMap.set(g.Subject.id, g.Subject);
      });
    }

    // 3. Fallback source: distinct subjects from SubjectResult
    if (subjectMap.size === 0) {
      const results = await (this.prisma as any).subjectResult.findMany({
        where: {
          classSectionId,
          academicYearId,
          status: { in: ['SUBMITTED', 'PUBLISHED'] },
        },
        select: {
          Subject: { select: { id: true, name: true, code: true } },
        },
      });
      results.forEach((r: any) => {
        if (r?.Subject) subjectMap.set(r.Subject.id, r.Subject);
      });
    }

    // Deterministic sort by subject name
    return Array.from(subjectMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  // ─── Read-Only Section Calculation ─────────────────────────────────────────

  /**
   * Calculates the full class roster metrics, completeness, averages, and competition ranks.
   * Completely read-only: does not modify SubjectResult, ClassRosterReview, or ClassSection.
   */
  async calculateSectionRoster(
    academicYearId: string,
    classSectionId: string,
  ): Promise<RosterCalculationResult> {
    if (!academicYearId || !classSectionId) {
      throw new BadRequestException('Academic Year and Class Section IDs are required');
    }

    // 1. Fetch section metadata
    const section = await this.prisma.classSection.findUnique({
      where: { id: classSectionId },
      include: {
        GradeLevel: { select: { id: true, name: true } },
        // Homeroom teacher stored via ClassSection.teacherId ("GeneralTeacher")
        Teacher: { select: { firstName: true, lastName: true } },
      },
    });
    if (!section) {
      throw new NotFoundException(`Class section ${classSectionId} not found`);
    }

    if (section.academicYearId && section.academicYearId !== academicYearId) {
      throw new BadRequestException('Academic year mismatch for selected class section');
    }

    // 2. Dynamically determine required subjects
    const requiredSubjects = await this.getRequiredSubjects(
      classSectionId,
      academicYearId,
      section.gradeLevelId,
    );

    // 3. Fetch enrolled students (isolated to classSectionId, academicYearId, ACTIVE)
    const enrollments = await this.prisma.studentEnrollment.findMany({
      where: { academicYearId, classSectionId, status: 'ACTIVE' },
      include: {
        Student: {
          select: { id: true, admissionNo: true, firstName: true, lastName: true, gender: true, dob: true },
        },
      },
      orderBy: [
        { Student: { lastName: 'asc' } },
        { Student: { firstName: 'asc' } },
        { Student: { admissionNo: 'asc' } },
      ],
    });

    // 4. Fetch finalized results (strictly SUBMITTED and PUBLISHED, excluding DRAFT and RETURNED_FOR_CORRECTION)
    const results = await (this.prisma as any).subjectResult.findMany({
      where: {
        academicYearId,
        classSectionId,
        status: { in: ['SUBMITTED', 'PUBLISHED'] },
      },
      select: {
        studentId: true,
        subjectId: true,
        term: true,
        marks: true,
        status: true,
      },
    });

    // 5. Fetch student absences and roster review conduct
    const absences = await this.prisma.studentAttendance.findMany({
      where: { classSectionId, status: 'ABSENT' },
      select: { studentId: true },
    });
    const absenceMap = new Map<string, number>();
    absences.forEach((a) => {
      absenceMap.set(a.studentId, (absenceMap.get(a.studentId) || 0) + 1);
    });

    const review = await (this.prisma as any).classRosterReview.findUnique({
      where: { classSectionId_academicYearId: { classSectionId, academicYearId } },
      select: { conductData: true },
    });
    const conductMap = (review?.conductData as Record<string, string>) || {};

    // Term normalization helper
    const normalizeTerm = (term: string): 'TERM_1' | 'TERM_2' | 'TERM_3' | 'TERM_4' | null => {
      const match = term.match(/[1-4]/);
      if (!match) return null;
      return `TERM_${match[0]}` as any;
    };

    // Index results: studentId -> subjectId -> termKey -> marks
    const studentResultMap = new Map<string, Map<string, Map<string, number>>>();
    for (const res of results) {
      const termKey = normalizeTerm(res.term);
      if (!termKey) continue;

      if (!studentResultMap.has(res.studentId)) {
        studentResultMap.set(res.studentId, new Map());
      }
      const subjectMap = studentResultMap.get(res.studentId)!;

      if (!subjectMap.has(res.subjectId)) {
        subjectMap.set(res.subjectId, new Map());
      }
      subjectMap.get(res.subjectId)!.set(termKey, res.marks);
    }

    const requiredSubjectCount = requiredSubjects.length;

    // 6. Calculate for each student
    const studentRows: Array<Omit<StudentCalculationResult, 'rank'>> = enrollments.map((enr) => {
      const student = enr.Student;
      const studentSubMap = studentResultMap.get(student.id);

      const missingSubjects: string[] = [];
      let completedSubjectCount = 0;
      const yearlyAverages: number[] = [];

      const subjectScores: SubjectScoreCalculation[] = requiredSubjects.map((subj) => {
        const termsMap = studentSubMap?.get(subj.id);

        const t1 = termsMap?.get('TERM_1') ?? null;
        const t2 = termsMap?.get('TERM_2') ?? null;
        const t3 = termsMap?.get('TERM_3') ?? null;
        const t4 = termsMap?.get('TERM_4') ?? null;

        const calculated = this.calculateSubjectScores(t1, t2, t3, t4);

        if (calculated.isComplete && calculated.yearlyAverage !== null) {
          completedSubjectCount++;
          yearlyAverages.push(calculated.yearlyAverage);
        } else {
          missingSubjects.push(subj.name);
        }

        return {
          subjectId: subj.id,
          subject: subj.name,
          code: subj.code,
          ...calculated,
        };
      });

      const isComplete =
        requiredSubjectCount > 0 && completedSubjectCount === requiredSubjectCount;

      let sum: number | null = null;
      let average: number | null = null;

      if (isComplete) {
        sum = this.calculateClassSum(yearlyAverages);
        average = this.calculateClassAverage(sum, requiredSubjectCount);
      }

      return {
        studentId: student.id,
        admissionNo: student.admissionNo,
        studentName: `${student.firstName} ${student.lastName}`.trim(),
        sex: student.gender || '',
        age: this.calculateAge(student.dob),
        isComplete,
        requiredSubjectCount,
        completedSubjectCount,
        missingSubjects,
        subjectScores,
        sum,
        average,
        absentDays: absenceMap.get(student.id) || 0,
        conduct: conductMap[student.id] || null,
        status: isComplete ? 'COMPLETE' : 'INCOMPLETE',
      };
    });

    // 7. Assign Competition Ranks
    const rankedStudents = this.assignCompetitionRanks(studentRows);

    // 8. Compute Class Statistics
    const completeStudents = rankedStudents.filter((s) => s.isComplete && s.average !== null);
    const classAverage =
      completeStudents.length > 0
        ? Number(
            (
              completeStudents.reduce((acc, s) => acc + (s.average ?? 0), 0) /
              completeStudents.length
            ).toFixed(2),
          )
        : null;

    return {
      section: {
        id: section.id,
        name: section.name,
        grade: section.GradeLevel?.name,
        homeroomTeacher: section.Teacher
          ? `${section.Teacher.firstName} ${section.Teacher.lastName}`.trim()
          : null,
      },
      terms: ['TERM_1', 'TERM_2', 'TERM_3', 'TERM_4'],
      subjects: requiredSubjects,
      students: rankedStudents,
      statistics: {
        totalEnrolled: enrollments.length,
        completeCount: completeStudents.length,
        incompleteCount: enrollments.length - completeStudents.length,
        classAverage,
      },
    };
  }

  /**
   * Transforms calculated students into the 7-row academic representation.
   * For each student, exactly 7 academic period rows are produced:
   * 1st, 2nd, Ave1, 3rd, 4th, Ave2, Yearly.
   */
  generatePaperRosterRows(students: StudentCalculationResult[]): Array<{
    studentId: string;
    admissionNo: string;
    studentName: string;
    sex: string;
    age: number | null;
    isComplete: boolean;
    missingSubjects: string[];
    sum: number | null;
    average: number | null;
    rank: number | null;
    absentDays: number;
    conduct: string | null;
    status: 'COMPLETE' | 'INCOMPLETE';
    periods: Array<{
      period: '1st' | '2nd' | 'Ave1' | '3rd' | '4th' | 'Ave2' | 'Yearly';
      scores: Record<string, number | null>;
    }>;
  }> {
    return students.map((student) => {
      const p1: Record<string, number | null> = {};
      const p2: Record<string, number | null> = {};
      const pAve1: Record<string, number | null> = {};
      const p3: Record<string, number | null> = {};
      const p4: Record<string, number | null> = {};
      const pAve2: Record<string, number | null> = {};
      const pYear: Record<string, number | null> = {};

      student.subjectScores.forEach((sc) => {
        p1[sc.subjectId] = sc.term1;
        p2[sc.subjectId] = sc.term2;
        pAve1[sc.subjectId] = sc.sem1Avg;
        p3[sc.subjectId] = sc.term3;
        p4[sc.subjectId] = sc.term4;
        pAve2[sc.subjectId] = sc.sem2Avg;
        pYear[sc.subjectId] = sc.yearlyAverage;
      });

      return {
        studentId: student.studentId,
        admissionNo: student.admissionNo,
        studentName: student.studentName,
        sex: student.sex,
        age: student.age ?? null,
        isComplete: student.isComplete,
        missingSubjects: student.missingSubjects,
        sum: student.sum,
        average: student.average,
        rank: student.rank,
        absentDays: student.absentDays,
        conduct: student.conduct,
        status: student.status,
        periods: [
          { period: '1st', scores: p1 },
          { period: '2nd', scores: p2 },
          { period: 'Ave1', scores: pAve1 },
          { period: '3rd', scores: p3 },
          { period: '4th', scores: p4 },
          { period: 'Ave2', scores: pAve2 },
          { period: 'Yearly', scores: pYear },
        ],
      };
    });
  }
}
