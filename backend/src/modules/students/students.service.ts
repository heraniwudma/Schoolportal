import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { TimetableService } from '../timetable/timetable.service';

@Injectable()
export class StudentsService {
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly timetableService: TimetableService,
  ) {}

  // --- Attendance Method ---
  async getMyAttendance(userId: string) {
    const student = await this.prisma.student.findFirst({
      where: {
        OR: [
          { id: userId },
          { userId },
        ],
      },
      select: {
        StudentAttendance: {
          take: 100,
          select: {
            id: true,
            date: true,
            period: true,
            status: true,
            remarks: true,
            ClassSection: { select: { id: true, name: true } },
          },
          orderBy: {
            date: 'desc',
          },
        },
      },
    });

    if (!student) {
      return [];
    }

    return student.StudentAttendance;
  }

  // --- Assignments Method ---
  async getMyAssignments(userId: string) {
    const student = await this.prisma.student.findFirst({
      where: {
        OR: [{ id: userId }, { userId }],
      },
      include: {
        StudentEnrollment: {
          where: { status: 'ACTIVE' },
          orderBy: { enrollmentDate: 'desc' },
          take: 1,
          include: { ClassSection: { select: { id: true, name: true } } },
        },
      },
    });

    if (!student) return [];
    const activeEnrollment = student.StudentEnrollment[0];
    const sectionId = activeEnrollment?.classSectionId || student.classSectionId;
    const sectionName = activeEnrollment?.ClassSection?.name;

    if (!sectionId && !sectionName) {
      return [];
    }
    return this.prisma.assignment.findMany({
      where: {
        OR: [
          ...(sectionId ? [{ classSectionId: sectionId }] : []),
          ...(sectionName ? [{ classSectionId: null, targetClass: sectionName }] : []),
          { classSectionId: null, targetClass: null },
        ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        instructions: true,
        subject: true,
        targetClass: true,
        dueDate: true,
        attachmentUrl: true,
        createdAt: true,
        ClassSection: { select: { id: true, name: true } },
        Teacher: {
          select: { firstName: true, lastName: true },
        },
        submissions: {
          where: { studentId: student.id },
          select: { id: true, createdAt: true, updatedAt: true, fileName: true, grades: { select: { id: true } } },
        },
      },
      orderBy: {
        dueDate: 'asc',
      },
      take: 50,
    });
  }

  async getMyAssignment(userId: string, assignmentId: string) {
    const student = await this.prisma.student.findFirst({
      where: { OR: [{ id: userId }, { userId }] },
      include: {
        StudentEnrollment: {
          where: { status: 'ACTIVE' },
          orderBy: { enrollmentDate: 'desc' },
          take: 1,
          include: { ClassSection: { select: { id: true, name: true } } },
        },
      },
    });
    if (!student) throw new NotFoundException('Student profile not found');
    const activeEnrollment = student.StudentEnrollment[0];
    const sectionId = activeEnrollment?.classSectionId || student.classSectionId;
    const sectionName = activeEnrollment?.ClassSection?.name;

    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        OR: [
          ...(sectionId ? [{ classSectionId: sectionId }] : []),
          ...(sectionName ? [{ classSectionId: null, targetClass: sectionName }] : []),
          { classSectionId: null, targetClass: null },
        ],
      },
      include: {
        ClassSection: { select: { name: true } },
        Teacher: { select: { firstName: true, lastName: true } },
        submissions: {
          where: { studentId: student.id },
          select: { id: true, createdAt: true, updatedAt: true, content: true, fileName: true, fileType: true, fileSize: true, grades: { select: { id: true } } },
        },
      },
    });
    if (!assignment) throw new NotFoundException('Assignment not found or you do not have access to it');
    return assignment;
  }

  async getAssignmentResourceUrl(userId: string, assignmentId: string) {
    const assignment = await this.getMyAssignment(userId, assignmentId);
    if (!assignment.attachmentUrl) {
      throw new NotFoundException('This assignment does not have an attached resource file');
    }

    const rawUrl = assignment.attachmentUrl.trim();
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      return { 
        url: rawUrl, 
        downloadUrl: rawUrl, 
        fileName: rawUrl.split('/').pop() || 'resource' 
      };
    }

    if (rawUrl.startsWith('/uploads/') || rawUrl.startsWith('uploads/') || rawUrl.startsWith('/')) {
      const cleanPath = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
      const serverUrl = process.env.BACKEND_URL || 'http://localhost:3000';
      const fullUrl = `${serverUrl}${cleanPath}`;
      return {
        url: fullUrl,
        downloadUrl: fullUrl,
        fileName: rawUrl.split('/').pop() || 'resource',
      };
    }

    const fileName = rawUrl.split('/').pop() || rawUrl;
    let pathInBucket = rawUrl;
    const match = rawUrl.match(/materials\/(.*)$/);
    if (match) {
      pathInBucket = match[1];
    }

    try {
      // 1. Try direct signed URL for pathInBucket
      const { data, error } = await this.supabase.storage.from('materials').createSignedUrl(pathInBucket, 300, {
        download: fileName,
      });

      if (!error && data?.signedUrl) {
        return { 
          url: data.signedUrl, 
          downloadUrl: data.signedUrl, 
          fileName 
        };
      }

      // 2. If not found by exact path, try matching by clean filename in the materials bucket
      const { data: allFiles } = await this.supabase.storage.from('materials').list();
      if (allFiles && allFiles.length > 0) {
        const normalizedTarget = fileName.toLowerCase().replace(/[^a-z0-9.]/g, '');
        const matched = allFiles.find((f) => {
          const clean = f.name.toLowerCase().replace(/[^a-z0-9.]/g, '');
          return clean.includes(normalizedTarget) || f.name.toLowerCase().includes(fileName.toLowerCase());
        });

        if (matched) {
          const { data: signed } = await this.supabase.storage.from('materials').createSignedUrl(matched.name, 300, {
            download: fileName,
          });
          if (signed?.signedUrl) {
            return { 
              url: signed.signedUrl, 
              downloadUrl: signed.signedUrl, 
              fileName 
            };
          }
        }
      }

      // 3. Fallback to public URL
      const { data: publicData } = this.supabase.storage.from('materials').getPublicUrl(pathInBucket, {
        download: fileName,
      });
      return { 
        url: publicData.publicUrl, 
        downloadUrl: publicData.publicUrl, 
        fileName 
      };
    } catch (err: any) {
      const { data: publicData } = this.supabase.storage.from('materials').getPublicUrl(pathInBucket, {
        download: fileName,
      });
      return { 
        url: publicData.publicUrl, 
        downloadUrl: publicData.publicUrl, 
        fileName 
      };
    }
  }

  async submitMyAssignment(
    userId: string,
    assignmentId: string,
    file?: Express.Multer.File,
    content?: string,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { OR: [{ id: userId }, { userId }] },
      include: {
        StudentEnrollment: {
          where: { status: 'ACTIVE' },
          orderBy: { enrollmentDate: 'desc' },
          take: 1,
          include: { ClassSection: { select: { id: true, name: true } } },
        },
      },
    });
    if (!student) throw new NotFoundException('Student profile not found');
    const activeEnrollment = student.StudentEnrollment[0];
    const sectionId = activeEnrollment?.classSectionId || student.classSectionId;
    const sectionName = activeEnrollment?.ClassSection?.name;

    const assignment = await this.prisma.assignment.findFirst({
      where: {
        id: assignmentId,
        OR: [
          ...(sectionId ? [{ classSectionId: sectionId }] : []),
          ...(sectionName ? [{ classSectionId: null, targetClass: sectionName }] : []),
          { classSectionId: null, targetClass: null },
        ],
      },
      select: { id: true, dueDate: true },
    });
    if (!assignment) throw new NotFoundException('Assignment not found or you do not have access to it');
    if (assignment.dueDate < new Date()) throw new BadRequestException('The submission deadline has passed');
    if (!file && !content?.trim()) throw new BadRequestException('Attach a file or enter a response before submitting');

    const existing = await this.prisma.submission.findFirst({
      where: { assignmentId, studentId: student.id },
      orderBy: { createdAt: 'desc' },
    });
    let uploadedPath: string | undefined;
    try {
      if (file) {
        const uploaded = await this.usersService.uploadSubmissionFile(student.id, assignmentId, file);
        uploadedPath = uploaded.path;
      }

      const data = {
        ...(content !== undefined ? { content: content.trim() || null } : {}),
        ...(file ? { fileUrl: uploadedPath!, fileName: file.originalname, fileType: file.mimetype, fileSize: file.size } : {}),
      };
      const submission = existing
        ? await this.prisma.submission.update({ where: { id: existing.id }, data, include: { grades: { select: { id: true } } } })
        : await this.prisma.submission.create({ data: { assignmentId, studentId: student.id, ...data }, include: { grades: { select: { id: true } } } });

      if (file && existing?.fileUrl && existing.fileUrl !== uploadedPath) {
        await this.usersService.removeSubmissionFile(existing.fileUrl);
      }
      try {
        const studentAssignment = await this.prisma.studentAssignment.findFirst({
          where: {
            assignmentId,
            OR: [{ studentId: student.id }, { studentLoginId: student.admissionNo }],
          },
        });
        if (studentAssignment) {
          await this.prisma.studentAssignment.update({
            where: { id: studentAssignment.id },
            data: { status: 'SUBMITTED' },
          });
        }
      } catch {
        // Ignore if StudentAssignment record is absent
      }
      return submission;
    } catch (error) {
      if (uploadedPath) await this.usersService.removeSubmissionFile(uploadedPath);
      throw error;
    }
  }

  async getStudentsByClass(classSectionId: string) {
    return await this.prisma.student.findMany({
      where: {
        classSectionId: classSectionId,
      },
    });
  }

  async getMyCourses(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: {
        id: true,
        StudentEnrollment: {
          where: { status: 'ACTIVE' },
          orderBy: { enrollmentDate: 'desc' },
          take: 1,
          select: { academicYearId: true, gradeLevelId: true, GradeLevel: { select: { name: true } } },
        },
      },
    });
    const enrollment = student?.StudentEnrollment[0];
    if (!enrollment) return [];

    const gradeSubjects = await this.prisma.gradeSubject.findMany({
      where: {
        gradeLevelId: enrollment.gradeLevelId,
        OR: [
          { academicYearId: enrollment.academicYearId },
          { academicYearId: null },
        ],
      },
      include: { Subject: true },
      orderBy: { Subject: { name: 'asc' } },
    });

    // Deduplicate subjects by subjectId / code to prevent redundant UI cards
    const uniqueMap = new Map<string, typeof gradeSubjects[0]>();
    for (const item of gradeSubjects) {
      const key = item.Subject.code || item.Subject.id;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, item);
      }
    }

    return Array.from(uniqueMap.values()).map(({ id, Subject }) => ({
      id,
      code: Subject.code,
      name: Subject.name,
      description: Subject.description,
      type: Subject.type,
      grade: enrollment.GradeLevel.name,
    }));
  }

  async getMySchedule(userId: string, academicYearId?: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!student) return [];

    return this.timetableService.getLegacyStudentSchedule(student.id, academicYearId);
  }

  async getMyResults(userId: string) {
    const student = await this.prisma.student.findFirst({
      where: { OR: [{ id: userId }, { userId }] },
      select: {
        id: true,
        classSectionId: true,
        StudentEnrollment: {
          where: { status: 'ACTIVE' },
          orderBy: { enrollmentDate: 'desc' },
          take: 1,
          select: { academicYearId: true },
        },
      },
    });
    if (!student) return { grades: [], subjectResults: [] };

    // ── 1. Legacy Grade rows (component scores: mid/quiz/final etc.) ──────────
    const grades = await this.prisma.grade.findMany({
      where: { studentId: student.id },
      select: {
        id: true,
        subject: true,
        quarter: true,
        mid: true,
        assignment: true,
        quiz: true,
        classwork: true,
        final: true,
        score: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // ── 2. Homeroom-finalized SubjectResult rows (SUBMITTED only) ─────────────
    const academicYearId = student.StudentEnrollment[0]?.academicYearId;
    const subjectResults = academicYearId
      ? await (this.prisma as any).subjectResult.findMany({
          where: {
            studentId: student.id,
            status: 'SUBMITTED',
            ...(student.classSectionId ? { classSectionId: student.classSectionId } : {}),
          },
          include: { Subject: { select: { id: true, name: true, code: true } } },
          orderBy: [{ term: 'asc' }, { Subject: { name: 'asc' } }],
          take: 100,
        })
      : [];

    return {
      grades: grades.map((g) => ({
        id: g.id,
        subject: g.subject ?? '—',
        quarter: g.quarter ?? '—',
        mid: g.mid ?? 0,
        assignment: g.assignment ?? 0,
        quiz: g.quiz ?? 0,
        classwork: g.classwork ?? 0,
        final: g.final ?? 0,
        score: Number(g.score) || 0,
        createdAt: g.createdAt,
      })),
      subjectResults: subjectResults.map((r: any) => ({
        id: r.id,
        subjectId: r.subjectId,
        subjectName: r.Subject?.name ?? '—',
        subjectCode: r.Subject?.code ?? '—',
        term: r.term,
        marks: r.marks,
        status: r.status,
        updatedAt: r.updatedAt,
      })),
    };
  }

  // --- Heran's Method ---
  async getStudentsBySection(sectionIdentifier: string) {
    const decodedIdentifier = decodeURIComponent(sectionIdentifier).trim();

    const section = await this.prisma.classSection.findFirst({
      where: {
        OR: [
          { id: decodedIdentifier },
          { name: decodedIdentifier },
        ],
      },
      select: { id: true },
    });

    if (!section) {
      return [];
    }

    return this.prisma.student.findMany({
      where: { classSectionId: section.id },
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        gender: true,
        status: true,
        User: {
          select: {
            id: true,
            loginId: true,
            email: true,
          },
        },
      },
      orderBy: { firstName: 'asc' },
    });
  }
}