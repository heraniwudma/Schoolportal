import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class ReportCardsService {
  constructor(private prisma: PrismaService) {}



  async getTerms(academicYearId: string) {
    if (!academicYearId) {
      throw new BadRequestException('Academic Year is required');
    }
    return this.prisma.term.findMany({
      where: { academicYearId },
      orderBy: { startDate: 'asc' }
    });
  }

  async getStudents(classSectionId: string, search?: string) {
    if (!classSectionId) {
      throw new BadRequestException('Class Section is required');
    }

    const whereClause: any = {
      classSectionId,
      status: 'ACTIVE'
    };

    if (search) {
      whereClause.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { admissionNo: { contains: search, mode: 'insensitive' } }
      ];
    }

    const students = await this.prisma.student.findMany({
      where: whereClause,
      include: {
        User: {
          select: { avatarUrl: true }
        }
      },
      orderBy: { firstName: 'asc' }
    });

    return students.map(student => ({
      id: student.id,
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender,
      avatarUrl: student.User?.avatarUrl
    }));
  }

 async generateClassRoster(classSectionId: string) {
  const section = await this.prisma.classSection.findUnique({
    where: { id: classSectionId },
    include: {
      GradeLevel: true,
      Teacher: true,
      students: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          gender: true,
          dob: true,
          status: true,
        },
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' },
        ],
      },
    },
  });

  if (!section) {
    throw new NotFoundException('Class section not found');
  }

  return {
    sectionId: section.id,
    sectionName: section.name,
    gradeLevel: section.GradeLevel?.name,
    homeroomTeacher: section.Teacher
      ? `${section.Teacher.firstName} ${section.Teacher.lastName}`
      : 'Unassigned',
    studentCount: section.students.length,
    students: section.students,
  };
}  async getReportCard(studentId: string, classSectionId: string, termId: string) {

    if (!studentId || !classSectionId || !termId) {
      throw new BadRequestException('Student ID, Class Section ID, and Term ID are required');
    }

    // 1. Fetch Student and related basic info
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        User: { select: { avatarUrl: true } },
        ClassSection: {
          include: {
            GradeLevel: true,
            AcademicYear: true
          }
        }
      }
    });

    if (!student) throw new NotFoundException('Student not found');

    const term = await this.prisma.term.findUnique({
      where: { id: termId }
    });
    if (!term) throw new NotFoundException('Term not found');

    // 2. Fetch Grades for this student via Examinations belonging to this term/section
    const grades = await this.prisma.grade.findMany({
      where: {
        studentId,
        Examination: {
          termId,
          classSectionId
        }
      },
      include: {
        Examination: {
          include: {
            Subject: true
          }
        }
      }
    });

    // 3. Aggregate subject performance
    const subjectMap = new Map<string, any>();

    for (const grade of grades) {
      const exam = grade.Examination;
      if (!exam || !exam.Subject) continue;

      const subjectId = exam.Subject.id;
      const score = grade.score || 0;
      const maxScore = grade.maxScore || 0;
      const weight = exam.weightage || 1;

      if (!subjectMap.has(subjectId)) {
        subjectMap.set(subjectId, {
          subjectName: exam.Subject.name,
          subjectCode: exam.Subject.code,
          totalScore: 0,
          totalMaxScore: 0
        });
      }

      const current = subjectMap.get(subjectId);
      current.totalScore += (score * weight);
      current.totalMaxScore += (maxScore * weight);
    }

    const subjects = Array.from(subjectMap.values()).map(sub => {
      let percentage = 0;
      if (sub.totalMaxScore > 0) {
        percentage = (sub.totalScore / sub.totalMaxScore) * 100;
      }
      return {
        name: sub.subjectName,
        code: sub.subjectCode,
        score: Math.round(sub.totalScore * 100) / 100,
        maxScore: Math.round(sub.totalMaxScore * 100) / 100,
        percentage: Math.round(percentage * 10) / 10,
        gradeLetter: this.calculateGradeLetter(percentage)
      };
    });

    // Overall Calculation
    let overallTotalScore = 0;
    let overallTotalMaxScore = 0;
    for (const sub of subjects) {
      overallTotalScore += sub.score;
      overallTotalMaxScore += sub.maxScore;
    }

    let overallPercentage = 0;
    if (overallTotalMaxScore > 0) {
      overallPercentage = (overallTotalScore / overallTotalMaxScore) * 100;
    }
    overallPercentage = Math.round(overallPercentage * 10) / 10;

    // 4. Fetch Attendance
    const attendanceRecords = await this.prisma.studentAttendance.findMany({
      where: {
        studentId,
        classSectionId,
        date: {
          gte: term.startDate,
          lte: term.endDate
        }
      }
    });

    let present = 0;
    let absent = 0;

    for (const record of attendanceRecords) {
      if (['PRESENT', 'LATE', 'EXCUSED'].includes(record.status)) {
        present++;
      } else if (record.status === 'ABSENT') {
        absent++;
      }
    }
    const totalDays = present + absent;
    const attendancePercentage = totalDays > 0 ? Math.round((present / totalDays) * 100) : 0;

    return {
      student: {
        admissionNo: student.admissionNo,
        firstName: student.firstName,
        lastName: student.lastName,
        avatarUrl: student.User?.avatarUrl
      },
      academicInfo: {
        academicYear: student.ClassSection?.AcademicYear?.year || '',
        grade: student.ClassSection?.GradeLevel?.name || '',
        section: student.ClassSection?.name || '',
        term: term.name
      },
      subjects,
      overall: {
        percentage: overallPercentage,
        gradeLetter: this.calculateGradeLetter(overallPercentage)
      },
      attendance: {
        present,
        absent,
        total: totalDays,
        percentage: attendancePercentage
      }
    };
  }

  private calculateGradeLetter(percentage: number): string {
    if (percentage >= 90) return 'A+';
    if (percentage >= 85) return 'A';
    if (percentage >= 80) return 'B+';
    if (percentage >= 75) return 'B';
    if (percentage >= 70) return 'C+';
    if (percentage >= 65) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
  }

  async getCompiledReportCards(classSectionId: string, academicYearId: string) {
    // Fetch all required data concurrently
    const [students, section, sectionSubjects, subjectResults, attendance, rosterReview] = await Promise.all([
      // 1. Students actively enrolled in this section
      this.prisma.student.findMany({
        where: {
          StudentEnrollment: {
            some: { classSectionId, academicYearId, status: 'ACTIVE' },
          },
        },
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          dob: true,
          gender: true,
        },
        orderBy: { lastName: 'asc' },
      }),

      // 2. Section with homeroom teacher name and academic year
      this.prisma.classSection.findUnique({
        where: { id: classSectionId },
        select: {
          id: true,
          name: true,
          GradeLevel:   { select: { name: true } },
          Teacher:      { select: { firstName: true, lastName: true } },
          AcademicYear: { select: { year: true } },
        },
      }),

      // 3. Subjects ASSIGNED to this specific section via SectionSubjectTeacher
      //    This is the key fix: only subjects this class is actually taught,
      //    not a global hardcoded list.
      this.prisma.sectionSubjectTeacher.findMany({
        where:   { classSectionId, academicYearId },
        select:  { subjectId: true, Subject: { select: { id: true, name: true, code: true } } },
        orderBy: { Subject: { name: 'asc' } },
        distinct: ['subjectId'],
      }),

      // 4. Submitted subject results for this section / year
      (this.prisma as any).subjectResult.findMany({
        where: { classSectionId, academicYearId, status: 'SUBMITTED' },
        select: {
          studentId: true,
          subjectId: true,
          marks: true,
          term: true,
          Subject: { select: { name: true } },
        },
      }),

      // 5. Absent-day counts
      this.prisma.studentAttendance.findMany({
        where:  { classSectionId, status: 'ABSENT' },
        select: { studentId: true },
      }),

      // 6. Saved conduct grades from the ClassRosterReview record
      (this.prisma as any).classRosterReview.findUnique({
        where: { classSectionId_academicYearId: { classSectionId, academicYearId } },
        select: { conductData: true },
      }),
    ]);

    if (!section) throw new NotFoundException('Class section not found');

    // Build the ordered subject list from section assignments.
    // Subjects that have submitted results but are NOT in the assignment table
    // are still included (edge case: teacher was reassigned mid-year).
    const subjectMap = new Map<string, { id: string; name: string; code: string }>();
    for (const sa of sectionSubjects) {
      subjectMap.set(sa.subjectId, {
        id:   sa.Subject.id,
        name: sa.Subject.name,
        code: sa.Subject.code ?? '',
      });
    }
    // Merge any result subjects not already in the map
    for (const r of subjectResults as any[]) {
      if (!subjectMap.has(r.subjectId)) {
        subjectMap.set(r.subjectId, { id: r.subjectId, name: r.Subject.name, code: '' });
      }
    }

    // Sort: prefer alpha within the section's own assignments
    const subjects = Array.from(subjectMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const absentDaysByStudent = attendance.reduce((map, rec) => {
      map.set(rec.studentId, (map.get(rec.studentId) || 0) + 1);
      return map;
    }, new Map<string, number>());

    // Extract saved conduct grades from the roster review record.
    // Keys that start with '_' are metadata fields, not student IDs.
    const conductMap: Record<string, string> = {};
    if (rosterReview?.conductData && typeof rosterReview.conductData === 'object') {
      for (const [key, val] of Object.entries(rosterReview.conductData as Record<string, unknown>)) {
        if (!key.startsWith('_') && typeof val === 'string') {
          conductMap[key] = val;
        }
      }
    }

    const homeroomTeacherName = section.Teacher
      ? `${section.Teacher.firstName} ${section.Teacher.lastName}`.trim()
      : 'Unassigned';

    const reportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    // Build per-student compiled cards
    const compiledCards = students.map((student) => {
      const studentResults = (subjectResults as any[]).filter(
        (r) => r.studentId === student.id,
      );

      const subjectResultRows = subjects.map((subj) => {
        const getMarks = (term: string) =>
          studentResults.find((r) => r.subjectId === subj.id && r.term === term)?.marks ?? null;

        const t1 = getMarks('TERM_1');
        const t2 = getMarks('TERM_2');
        const t3 = getMarks('TERM_3');
        const t4 = getMarks('TERM_4');

        const avg = (vals: Array<number | null>) => {
          const present = vals.filter((v): v is number => v !== null);
          return present.length
            ? Math.round((present.reduce((s, v) => s + v, 0) / present.length) * 10) / 10
            : null;
        };

        return {
          subjectName: subj.name,
          subjectCode: subj.code,
          term1:    t1,
          term2:    t2,
          sem1Avg:  avg([t1, t2]),
          term3:    t3,
          term4:    t4,
          sem2Avg:  avg([t3, t4]),
          yearlyAvg: avg([t1, t2, t3, t4]),
        };
      });

      const scored = subjectResultRows.filter((s) => s.yearlyAvg !== null);
      const overallTotal = Math.round(
        scored.reduce((sum, s) => sum + (s.yearlyAvg || 0), 0) * 10,
      ) / 10;
      const overallAverage =
        scored.length > 0
          ? Math.round((overallTotal / scored.length) * 10) / 10
          : 0;

      return {
        studentId:        student.id,
        admissionNo:      student.admissionNo,
        firstName:        student.firstName,
        lastName:         student.lastName,
        age: student.dob
          ? Math.floor(
              (Date.now() - new Date(student.dob).getTime()) /
                (365.25 * 24 * 60 * 60 * 1000),
            )
          : 0,
        gender:           student.gender || 'N/A',
        academicYear:     section.AcademicYear?.year || '',
        gradeLevel:       section.GradeLevel?.name || '',
        classSectionName: section.name,
        promotedToGrade:  '',
        homeroomTeacher:  homeroomTeacherName,
        reportDate,
        subjectResults:   subjectResultRows,
        overallTotal,
        overallAverage,
        overallRank: 0,           // filled after ranking below
        absentDays:       absentDaysByStudent.get(student.id) || 0,
        // Use the conduct grade saved by the homeroom teacher; default 'A'
        conduct:          conductMap[student.id] || 'A',
        behaviourAssessment: {
          academicPotential:        'A',
          uniform:                  'A',
          timeManagement:           'A',
          harmfulActions:           'A',
          responsibilities:         'A',
          clubActivities:           'A',
          classworkHomework:        'A',
          flexibility:              'A',
          hardWork:                 'A',
          positiveThinking:         'A',
          obeyingRules:             'A',
          interpersonalCommunication: 'A',
        },
        homeroomRemarksSem1: '',
        homeroomRemarksSem2: '',
      };
    });

    // Rank by yearly average descending
    const ranked = [...compiledCards].sort(
      (a, b) => b.overallAverage - a.overallAverage,
    );
    ranked.forEach((card, idx) => {
      card.overallRank = card.overallAverage > 0 ? idx + 1 : 0;
    });

    return compiledCards;
  }
}
