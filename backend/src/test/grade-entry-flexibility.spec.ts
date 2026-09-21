import { PrismaClient } from '@prisma/client';
import { ResultsService } from '../modules/results/results.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

const prisma = new PrismaClient();
const prismaService = prisma as unknown as PrismaService;
const resultsService = new ResultsService(prismaService);

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runGradeEntryFlexibilityTests() {
  console.log('===========================================================');
  console.log('FLEXIBLE GRADE ENTRY: EDIT ITEMS & MAXIMUM MARKS TEST SUITE');
  console.log('===========================================================\n');

  const suffix = Date.now().toString().slice(-6);
  const testYearId = `yr-flx-${suffix}`;
  const testGradeId = `grd-flx-${suffix}`;
  const testSectionId = `sec-flx-${suffix}`;

  const assignedTeacherUserId = `u-tchr-${suffix}`;
  const assignedTeacherId = `t-tchr-${suffix}`;

  const unauthorizedTeacherUserId = `u-unauth-${suffix}`;
  const unauthorizedTeacherId = `t-unauth-${suffix}`;

  const studentUserId = `u-stu-${suffix}`;
  const studentId = `stu-${suffix}`;

  const subjectId = `sub-phy-${suffix}`;

  try {
    // ── Setup Fixtures ──────────────────────────────────────────────────────────
    console.log('[Setup] Creating test fixtures...');

    await prisma.academicYear.create({
      data: {
        id: testYearId,
        year: `2026-2027-FLX-${suffix}`,
        startDate: new Date('2026-09-01'),
        endDate: new Date('2027-06-30'),
        isCurrent: true,
        updatedAt: new Date(),
      },
    });

    await prisma.gradeLevel.create({
      data: {
        id: testGradeId,
        name: `Grade 10-FLX-${suffix}`,
        gradeNumber: 10,
      },
    });

    // Create ClassSection
    await prisma.classSection.create({
      data: {
        id: testSectionId,
        name: `Section A-FLX-${suffix}`,
        gradeLevelId: testGradeId,
        academicYearId: testYearId,
        updatedAt: new Date(),
      },
    });

    // Create Subject
    await prisma.subject.create({
      data: {
        id: subjectId,
        name: `Physics-FLX-${suffix}`,
        code: `PHY-FLX-${suffix}`,
      },
    });

    // Create Authorized Teacher User & Teacher record
    await prisma.user.create({
      data: {
        id: assignedTeacherUserId,
        loginId: `tchr_flx_${suffix}`,
        password: 'hashedpassword',
        role: 'TEACHER',
        email: `tchr_flx_${suffix}@example.com`,
      },
    });
    await prisma.teacher.create({
      data: {
        id: assignedTeacherId,
        userId: assignedTeacherUserId,
        firstName: 'Authorized',
        lastName: 'Teacher',
        staffId: `STF-AUT-${suffix}`,
        updatedAt: new Date(),
      },
    });

    // Create Unauthorized Teacher User & Teacher record
    await prisma.user.create({
      data: {
        id: unauthorizedTeacherUserId,
        loginId: `unauth_flx_${suffix}`,
        password: 'hashedpassword',
        role: 'TEACHER',
        email: `unauth_flx_${suffix}@example.com`,
      },
    });
    await prisma.teacher.create({
      data: {
        id: unauthorizedTeacherId,
        userId: unauthorizedTeacherUserId,
        firstName: 'Unauthorized',
        lastName: 'Teacher',
        staffId: `STF-UNA-${suffix}`,
        updatedAt: new Date(),
      },
    });

    // Assign Authorized Teacher to Section & Subject
    await (prisma as any).sectionSubjectTeacher.create({
      data: {
        classSectionId: testSectionId,
        subjectId,
        teacherId: assignedTeacherId,
        academicYearId: testYearId,
      },
    });

    // Create Student & Enrollment
    await prisma.user.create({
      data: {
        id: studentUserId,
        loginId: `stu_flx_${suffix}`,
        password: 'hashedpassword',
        role: 'STUDENT',
        email: `stu_flx_${suffix}@example.com`,
      },
    });
    await prisma.student.create({
      data: {
        id: studentId,
        userId: studentUserId,
        admissionNo: `ADM-FLX-${suffix}`,
        firstName: 'John',
        lastName: 'Doe',
        classSectionId: testSectionId,
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    });
    await prisma.studentEnrollment.create({
      data: {
        studentId,
        classSectionId: testSectionId,
        academicYearId: testYearId,
        gradeLevelId: testGradeId,
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    });

    console.log('[Setup] Test fixtures successfully created.\n');

    // ── Test 1: Get Grade Items provisions default items ────────────────────────
    try {
      const itemsRes = await resultsService.getGradeItems(
        {
          classSectionId: testSectionId,
          subjectId,
          academicYearId: testYearId,
          term: 'TERM_1',
        },
        assignedTeacherUserId,
      );

      assert(itemsRes.items && itemsRes.items.length === 5, 'Should return 5 standard grade items');
      assert(itemsRes.items.some((i: any) => i.fieldKey === 'assignment' && i.maxMark === 20), 'Assignment 1 should default to 20 pts');
      assert(itemsRes.items.some((i: any) => i.fieldKey === 'mid' && i.maxMark === 20), 'Midterm Exam should default to 20 pts');
      testResults.push({ name: 'Test 1: Default Grade Items provisioned with persistent identities', passed: true });
    } catch (err: any) {
      testResults.push({ name: 'Test 1: Default Grade Items provisioned with persistent identities', passed: false, error: err.message });
    }

    // ── Test 2: Teacher Edits Item Name ──────────────────────────────────────────
    let asgnItemId = '';
    try {
      const itemsRes = await resultsService.getGradeItems(
        { classSectionId: testSectionId, subjectId, academicYearId: testYearId, term: 'TERM_1' },
        assignedTeacherUserId,
      );
      const asgnItem = itemsRes.items.find((i: any) => i.fieldKey === 'assignment');
      assert(Boolean(asgnItem), 'Assignment item should exist');
      asgnItemId = asgnItem!.id;

      const updateRes = await resultsService.updateGradeItem(
        asgnItemId,
        {
          name: 'Assignment 1 - Chapter 1 Vectors',
          maxMark: 20,
          classSectionId: testSectionId,
          subjectId,
          academicYearId: testYearId,
          term: 'TERM_1',
        },
        assignedTeacherUserId,
      );

      assert(updateRes.success === true, 'Update should succeed');
      assert(updateRes.item.name === 'Assignment 1 - Chapter 1 Vectors', 'Item name in response should match');

      const dbAsgn = await prisma.assignment.findUnique({ where: { id: asgnItemId } });
      assert(dbAsgn?.title === 'Assignment 1 - Chapter 1 Vectors', 'DB assignment title should be updated');
      testResults.push({ name: 'Test 2: Teacher can edit grade item name in place', passed: true });
    } catch (err: any) {
      testResults.push({ name: 'Test 2: Teacher can edit grade item name in place', passed: false, error: err.message });
    }

    // ── Test 3: Teacher Edits Maximum Mark (20 -> 25) ───────────────────────────
    try {
      const updateRes = await resultsService.updateGradeItem(
        asgnItemId,
        {
          name: 'Assignment 1 - Chapter 1 Vectors',
          maxMark: 25,
          classSectionId: testSectionId,
          subjectId,
          academicYearId: testYearId,
          term: 'TERM_1',
        },
        assignedTeacherUserId,
      );

      assert(updateRes.item.maxMark === 25, 'Item maxMark in response should be 25');

      const itemsRes = await resultsService.getGradeItems(
        { classSectionId: testSectionId, subjectId, academicYearId: testYearId, term: 'TERM_1' },
        assignedTeacherUserId,
      );
      const updatedItem = itemsRes.items.find((i: any) => i.id === asgnItemId);
      assert(updatedItem?.maxMark === 25, 'Subsequent getGradeItems should reflect maxMark of 25');
      testResults.push({ name: 'Test 3: Teacher can edit Maximum Mark (20 -> 25)', passed: true });
    } catch (err: any) {
      testResults.push({ name: 'Test 3: Teacher can edit Maximum Mark (20 -> 25)', passed: false, error: err.message });
    }

    // ── Test 4: Teacher Enters Student Grade under new Maximum Mark ─────────────
    try {
      const draftRes = await resultsService.saveGradesDraft(
        {
          classSectionId: testSectionId,
          subjectId,
          academicYearId: testYearId,
          term: 'TERM_1',
          grades: [
            {
              studentId,
              marks: 22,
              assignment: 22,
              mid: 0,
              quiz: 0,
              classwork: 0,
              final: 0,
            },
          ],
        },
        assignedTeacherUserId,
      );

      assert(draftRes.savedCount === 1, 'Draft should save 1 student result');

      const statusRes = await resultsService.getSubjectStatus(
        { classSectionId: testSectionId, subjectId, academicYearId: testYearId, term: 'TERM_1' },
        assignedTeacherUserId,
      );
      assert(statusRes.grades[0].components?.assignment === 22, 'Persisted component assignment score should be 22');
      testResults.push({ name: 'Test 4: Teacher enters valid grade (22/25) under new Maximum Mark', passed: true });
    } catch (err: any) {
      testResults.push({ name: 'Test 4: Teacher enters valid grade (22/25) under new Maximum Mark', passed: false, error: err.message });
    }

    // ── Test 5: Existing Student Grades Remain Valid (Preservation) ──────────────
    try {
      const itemsRes = await resultsService.getGradeItems(
        { classSectionId: testSectionId, subjectId, academicYearId: testYearId, term: 'TERM_1' },
        assignedTeacherUserId,
      );
      const item = itemsRes.items.find((i: any) => i.id === asgnItemId);
      assert(item?.highestStudentGrade === 22, 'Highest student grade should be reported as 22');

      const statusRes = await resultsService.getSubjectStatus(
        { classSectionId: testSectionId, subjectId, academicYearId: testYearId, term: 'TERM_1' },
        assignedTeacherUserId,
      );
      assert(statusRes.grades[0].components?.assignment === 22, 'Student grade of 22 remains unchanged and intact');
      testResults.push({ name: 'Test 5: Existing student earned grades are preserved without scaling', passed: true });
    } catch (err: any) {
      testResults.push({ name: 'Test 5: Existing student earned grades are preserved without scaling', passed: false, error: err.message });
    }

    // ── Test 6: Strict Rejection when Max Mark is reduced below earned grade ─────
    try {
      let threw = false;
      try {
        await resultsService.updateGradeItem(
          asgnItemId,
          {
            name: 'Assignment 1 - Chapter 1 Vectors',
            maxMark: 18, // Student has 22!
            classSectionId: testSectionId,
            subjectId,
            academicYearId: testYearId,
            term: 'TERM_1',
          },
          assignedTeacherUserId,
        );
      } catch (err: any) {
        threw = true;
        assert(err instanceof BadRequestException, 'Should throw BadRequestException');
        assert(err.message.includes('22'), 'Error message should explicitly mention offending grade of 22');
      }
      assert(threw, 'Should strictly reject reducing Maximum Mark below student earned mark (18 < 22)');

      // Verify DB was NOT updated
      const itemsRes = await resultsService.getGradeItems(
        { classSectionId: testSectionId, subjectId, academicYearId: testYearId, term: 'TERM_1' },
        assignedTeacherUserId,
      );
      const item = itemsRes.items.find((i: any) => i.id === asgnItemId);
      assert(item?.maxMark === 25, 'Max mark should still be 25 after rejection');
      testResults.push({ name: 'Test 6: Strict rejection when Max Mark is lower than existing student grades', passed: true });
    } catch (err: any) {
      testResults.push({ name: 'Test 6: Strict rejection when Max Mark is lower than existing student grades', passed: false, error: err.message });
    }

    // ── Test 7: Strict Validation of Non-positive / Zero / Empty Name ────────────
    try {
      // Zero max mark
      let threwZero = false;
      try {
        await resultsService.updateGradeItem(
          asgnItemId,
          {
            name: 'Valid Name',
            maxMark: 0,
            classSectionId: testSectionId,
            subjectId,
            academicYearId: testYearId,
          },
          assignedTeacherUserId,
        );
      } catch (err: any) {
        threwZero = true;
        assert(err instanceof BadRequestException, 'Should reject 0 max mark');
      }
      assert(threwZero, 'Zero max mark should be rejected');

      // Negative max mark
      let threwNegative = false;
      try {
        await resultsService.updateGradeItem(
          asgnItemId,
          {
            name: 'Valid Name',
            maxMark: -10,
            classSectionId: testSectionId,
            subjectId,
            academicYearId: testYearId,
          },
          assignedTeacherUserId,
        );
      } catch (err: any) {
        threwNegative = true;
        assert(err instanceof BadRequestException, 'Should reject negative max mark');
      }
      assert(threwNegative, 'Negative max mark should be rejected');

      // Empty name
      let threwEmptyName = false;
      try {
        await resultsService.updateGradeItem(
          asgnItemId,
          {
            name: '   ',
            maxMark: 30,
            classSectionId: testSectionId,
            subjectId,
            academicYearId: testYearId,
          },
          assignedTeacherUserId,
        );
      } catch (err: any) {
        threwEmptyName = true;
        assert(err instanceof BadRequestException, 'Should reject empty item name');
      }
      assert(threwEmptyName, 'Empty item name should be rejected');

      testResults.push({ name: 'Test 7: Validation correctly rejects 0, negative max marks and empty names', passed: true });
    } catch (err: any) {
      testResults.push({ name: 'Test 7: Validation correctly rejects 0, negative max marks and empty names', passed: false, error: err.message });
    }

    // ── Test 8: Unauthorized Teacher Security ───────────────────────────────────
    try {
      let threwUnauth = false;
      try {
        await resultsService.updateGradeItem(
          asgnItemId,
          {
            name: 'Hacked Name',
            maxMark: 50,
            classSectionId: testSectionId,
            subjectId,
            academicYearId: testYearId,
          },
          unauthorizedTeacherUserId,
        );
      } catch (err: any) {
        threwUnauth = true;
        assert(err instanceof ForbiddenException, 'Should throw ForbiddenException for unauthorized teacher');
      }
      assert(threwUnauth, 'Unauthorized teacher must receive ForbiddenException (403)');
      testResults.push({ name: 'Test 8: Unauthorized teacher cannot modify grade items (403 Forbidden)', passed: true });
    } catch (err: any) {
      testResults.push({ name: 'Test 8: Unauthorized teacher cannot modify grade items (403 Forbidden)', passed: false, error: err.message });
    }

    // ── Test 9: Examination Item Rename and Max Mark Flexibility ────────────────
    try {
      const itemsRes = await resultsService.getGradeItems(
        { classSectionId: testSectionId, subjectId, academicYearId: testYearId, term: 'TERM_1' },
        assignedTeacherUserId,
      );
      const midItem = itemsRes.items.find((i: any) => i.fieldKey === 'mid');
      assert(Boolean(midItem), 'Midterm exam item should exist');

      const updateRes = await resultsService.updateGradeItem(
        midItem!.id,
        {
          name: 'Midterm Exam - Mechanics & Waves',
          maxMark: 30,
          classSectionId: testSectionId,
          subjectId,
          academicYearId: testYearId,
          term: 'TERM_1',
        },
        assignedTeacherUserId,
      );

      assert(updateRes.item.name === 'Midterm Exam - Mechanics & Waves', 'Exam name updated');
      assert(updateRes.item.maxMark === 30, 'Exam totalMarks updated to 30');

      const dbExam = await prisma.examination.findUnique({ where: { id: midItem!.id } });
      assert(dbExam?.title === 'Midterm Exam - Mechanics & Waves', 'DB examination title updated');
      assert(dbExam?.totalMarks === 30, 'DB examination totalMarks updated to 30');
      testResults.push({ name: 'Test 9: Examination grade items support in-place renaming and maxMark edits', passed: true });
    } catch (err: any) {
      testResults.push({ name: 'Test 9: Examination grade items support in-place renaming and maxMark edits', passed: false, error: err.message });
    }

    // ── Test 10: Persistent Identity Across Multiple Queries & Renames ──────────
    try {
      // Query items again
      const itemsRes = await resultsService.getGradeItems(
        { classSectionId: testSectionId, subjectId, academicYearId: testYearId, term: 'TERM_1' },
        assignedTeacherUserId,
      );

      const asgnItemAfter = itemsRes.items.find((i: any) => i.fieldKey === 'assignment');
      const midItemAfter = itemsRes.items.find((i: any) => i.fieldKey === 'mid');

      assert(asgnItemAfter?.id === asgnItemId, 'Assignment ID must remain strictly identical');
      assert(asgnItemAfter?.name === 'Assignment 1 - Chapter 1 Vectors', 'Assignment name preserved');
      assert(asgnItemAfter?.maxMark === 25, 'Assignment maxMark 25 preserved');

      assert(midItemAfter?.name === 'Midterm Exam - Mechanics & Waves', 'Exam name preserved');
      assert(midItemAfter?.maxMark === 30, 'Exam maxMark 30 preserved');

      testResults.push({ name: 'Test 10: System-wide persistent identity & consistency verified', passed: true });
    } catch (err: any) {
      testResults.push({ name: 'Test 10: System-wide persistent identity & consistency verified', passed: false, error: err.message });
    }

  } finally {
    // ── Clean Up Test Fixtures ──────────────────────────────────────────────────
    console.log('\n[Cleanup] Cleaning up test fixtures...');
    try {
      await (prisma as any).subjectResult.deleteMany({ where: { classSectionId: testSectionId } });
      await prisma.grade.deleteMany({ where: { studentId } });
      await prisma.studentEnrollment.deleteMany({ where: { classSectionId: testSectionId } });
      await (prisma as any).sectionSubjectTeacher.deleteMany({ where: { classSectionId: testSectionId } });
      await prisma.examination.deleteMany({ where: { classSectionId: testSectionId } });
      await prisma.assignment.deleteMany({ where: { classSectionId: testSectionId } });
      await prisma.student.deleteMany({ where: { id: studentId } });
      await prisma.teacher.deleteMany({ where: { id: { in: [assignedTeacherId, unauthorizedTeacherId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [assignedTeacherUserId, unauthorizedTeacherUserId, studentUserId] } } });
      await prisma.classSection.deleteMany({ where: { id: testSectionId } });
      await prisma.gradeLevel.deleteMany({ where: { id: testGradeId } });
      await prisma.subject.deleteMany({ where: { id: subjectId } });
      await prisma.academicYear.deleteMany({ where: { id: testYearId } });
      console.log('[Cleanup] Cleanup complete.\n');
    } catch (cleanupErr) {
      console.error('[Cleanup Error]', cleanupErr);
    }
  }

  // ── Print Summary ─────────────────────────────────────────────────────────────
  console.log('===========================================================');
  console.log('TEST SUMMARY');
  console.log('===========================================================');
  let allPassed = true;
  for (const r of testResults) {
    if (r.passed) {
      console.log(`✅ PASS: ${r.name}`);
    } else {
      allPassed = false;
      console.log(`❌ FAIL: ${r.name}`);
      console.log(`   Error: ${r.error}`);
    }
  }
  console.log('===========================================================');
  if (!allPassed) {
    process.exit(1);
  }
}

runGradeEntryFlexibilityTests()
  .catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
