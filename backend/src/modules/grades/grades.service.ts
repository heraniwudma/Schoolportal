import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class GradesService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyResults(userId: string) {
    // 1. Find the student linked to this user ID
    const student = await this.prisma.student.findFirst({
      where: { OR: [{ id: userId }, { userId: userId }] },
    });
    
    if (!student) return [];

    // 2. Query the 'grade' table directly, matching how GradesService saves them
    return await this.prisma.grade.findMany({
      where: { studentId: student.id },
      include: {
        // Include relations if you have them configured in schema.prisma, 
        // e.g., Subject: true (adjust based on your actual schema relation name)
      },
    });
  }
  

  async submitBatchGrades(dto: any) {

    // Normalize data: handles both single student payloads and batch arrays automatically
    let itemsToProcess = [];

    if (dto && Array.isArray(dto.grades)) {
      itemsToProcess = dto.grades.map((item: any) => ({
        studentId: item.studentId,
        quarter: dto.quarter || item.quarter,
        subject: dto.subjectId || item.subjectId,
        mid: Number(item.mid) || 0,
        assignment: Number(item.assignment) || 0,
        quiz: Number(item.quiz) || 0,
        classwork: Number(item.classwork) || 0,
        final: Number(item.final) || 0,
        score: Number(item.score) || 0,
      }));
    } else if (dto && dto.studentId) {
      // Handles individual student objects sent from the frontend loop
      itemsToProcess = [{
        studentId: dto.studentId,
        quarter: dto.quarter,
        subject: dto.subjectId,
        mid: Number(dto.mid) || 0,
        assignment: Number(dto.assignment) || 0,
        quiz: Number(dto.quiz) || 0,
        classwork: Number(dto.classwork) || 0,
        final: Number(dto.final) || 0,
        score: Number(dto.score) || 0,
      }];
    } else {
      throw new Error('Invalid payload structure received.');
    }

    const results = [];

    for (const item of itemsToProcess) {
      try {
        // Check if a record already exists for this student, quarter, and subject
        const existing = await this.prisma.grade.findFirst({
          where: {
            studentId: item.studentId,
            quarter: item.quarter,
            subject: item.subject,
          },
        });

        let saved;
        if (existing) {
          // Update existing row
          saved = await this.prisma.grade.update({
            where: { id: existing.id },
            data: {
              mid: item.mid,
              assignment: item.assignment,
              quiz: item.quiz,
              classwork: item.classwork,
              final: item.final,
              score: item.score,
            },
          });
        } else {
          // Create new row in Supabase
          saved = await this.prisma.grade.create({
            data: {
              studentId: item.studentId,
              quarter: item.quarter,
              subject: item.subject,
              mid: item.mid,
              assignment: item.assignment,
              quiz: item.quiz,
              classwork: item.classwork,
              final: item.final,
              score: item.score,
            },
          });
        }
        results.push(saved);
      } catch (dbError: any) {
        console.error(`Failed to save grade for student ${item.studentId}:`, dbError.message);
        throw new Error(`Database save failed: ${dbError.message}`);
      }
    }

    return { success: true, count: results.length, data: results };
  }

  async getExamGrades(examinationId: string) {
    return this.prisma.grade.findMany({
      where: { examinationId },
      include: { student: true },
    });
  }
}
