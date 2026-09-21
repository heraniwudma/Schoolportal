import { Body, Controller, Get, Patch, Post, Req, UseGuards, Param, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ResultsService } from './results.service';
import { ReturnSubjectDto, GetSubjectStatusDto } from './dto/correction-request.dto';
import { CalculationService } from './calculation.service';
import { GetGradeItemsDto, UpdateGradeItemDto } from './dto/grade-items.dto';

@Controller('results')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.TEACHER)
export class ResultsController {
  constructor(
    private readonly resultsService: ResultsService,
    private readonly calculationService: CalculationService,
  ) {}

  @Get('roster-calculation')
  getRosterCalculation(
    @Query('classSectionId') classSectionId: string,
    @Query('academicYearId') academicYearId: string,
  ) {
    return this.calculationService.calculateSectionRoster(academicYearId, classSectionId);
  }

  @Post('draft')
  saveDraft(@Body() body: any, @Req() req: any) {
    return this.resultsService.saveGradesDraft(body, req.user.id);
  }

  @Post('submit-to-homeroom')
  submitToHomeroom(@Body() body: any, @Req() req: any) {
    return this.resultsService.submitToHomeroom(body, req.user.id);
  }

  @Post('return-to-teacher')
  returnToTeacher(@Body() dto: ReturnSubjectDto, @Req() req: any) {
    return this.resultsService.returnSubjectResultToTeacher(dto, req.user.id);
  }

  @Get('subject-status')
  getSubjectStatus(
    @Req() req: any,
    @Query('classSectionId') classSectionId: string,
    @Query('academicYearId') academicYearId: string,
    @Query('subjectId') subjectId: string,
    @Query('term') term: string,
  ) {
    return this.resultsService.getSubjectStatus(
      { classSectionId, academicYearId, subjectId, term },
      req.user.id,
    );
  }

  @Post('publish-student')
  publishStudent(@Body() body: any, @Req() req: any) {
    return this.resultsService.publishStudentResult(body, req.user.id);
  }

  @Get('homeroom-teachers/:classSectionId/:academicYearId')
  getHomeroomTeachers(
    @Param('classSectionId') classSectionId: string,
    @Param('academicYearId') academicYearId: string
  ) {
    return this.resultsService.getHomeroomTeachers(classSectionId, academicYearId);
  }

  @Get('homeroom-matrix')
  getHomeroomMatrix(
    @Req() req: any,
    @Query('classSectionId') classSectionId: string,
    @Query('academicYearId') academicYearId: string,
    @Query('term') term: string,
  ) {
    return this.resultsService.getHomeroomSubmissionMatrix(
      classSectionId,
      academicYearId,
      term,
      req.user.id,
    );
  }

  @Get('student-results')
  getStudentResults(
    @Req() req: any,
    @Query('classSectionId') classSectionId: string,
    @Query('academicYearId') academicYearId: string,
    @Query('term') term: string
  ) {
    return this.resultsService.getStudentResults(classSectionId, academicYearId, term, req.user.id);
  }

  @Get('grade-items')
  @Roles(Role.TEACHER, Role.ADMIN)
  getGradeItems(
    @Req() req: any,
    @Query() dto: GetGradeItemsDto,
  ) {
    return this.resultsService.getGradeItems(dto, req.user.id);
  }

  @Patch('grade-items/:id')
  @Roles(Role.TEACHER, Role.ADMIN)
  updateGradeItem(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateGradeItemDto,
  ) {
    return this.resultsService.updateGradeItem(id, dto, req.user.id);
  }
}

