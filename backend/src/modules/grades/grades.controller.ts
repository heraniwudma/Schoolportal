import { Controller, Post, Body, Get, Param, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { GradesService } from './grades.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('grades')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TEACHER, Role.ADMIN)
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  @Post()
  async saveGrades(@Body() dto: any) {
    try {
      return await this.gradesService.submitBatchGrades(dto);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Internal server error';
      throw new HttpException(
        { success: false, message: errorMessage },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('exam/:examinationId')
  async getExamGrades(@Param('examinationId') examinationId: string) {
    return this.gradesService.getExamGrades(examinationId);
  }
}
