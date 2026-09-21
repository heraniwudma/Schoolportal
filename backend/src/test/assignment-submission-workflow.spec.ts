import { PrismaClient } from '@prisma/client';
import { AssignmentsService } from '../modules/assignments/assignments.service';
import { TeachersService } from '../modules/teachers/teachers.service';
import { StudentsService } from '../modules/students/students.service';
import { UsersService } from '../modules/users/users.service';
import { PrismaService } from '../common/prisma/prisma.service';

const prisma = new PrismaClient();
const prismaService = prisma as unknown as PrismaService;
const usersService = new UsersService(prismaService);
const studentsService = new StudentsService(prismaService, usersService, null as any);
const assignmentsService = new AssignmentsService(prismaService);
const teachersService = new TeachersService(prismaService);

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('ASSIGNMENT SUBMISSION & TEACHER REVIEW WORKFLOW TEST');
  console.log('====================================================\n');

  const suffix = Date.now().toString().slice(-6);
  const testYearId = `yr-${suffix}`;
  const testGradeId = `grd-${suffix}`;
  const testSectionId = `sec-${suffix}`;
  const testSubjectId = `sub-${suffix}`;
  const testTeacherUserId = `tch-u-${suffix}`;
  const testTeacherId = `tch-${suffix}`;
  const testStudentUserId = `stu-u-${suffix}`;
  const testStudentId = `stu-${suffix}`;
  const testAdmNo = `ADM${suffix}`;

  try {
    console.log('1. Setting up test fixtures...');
    await prisma.academicYear.create({
      data: {
        id: testYearId,
        year: `2098/${suffix}`,
        startDate: new Date('2098-09-01'),
        endDate: new Date('2099-06-30'),
        isCurrent: true,
        updatedAt: new Date(),
      },
    });

    await prisma.gradeLevel.create({
      data: {
        id: testGradeId,
        name: `Grade 10-${suffix}`,
      },
    });

    // Create Teacher User & Teacher Profile
    await prisma.user.create({
      data: {
        id: testTeacherUserId,
        email: `teacher_${suffix}@test.com`,
        loginId: `TCH${suffix}`,
        name: 'Jane Smith',
        password: 'dummy',
        role: 'TEACHER',
      },
    });

    await prisma.teacher.create({
      data: {
        id: testTeacherId,
        userId: testTeacherUserId,
        firstName: 'Jane',
        lastName: 'Smith',
        staffId: `STAFF-${suffix}`,
        updatedAt: new Date(),
      },
    });

    // Create Class Section
    await prisma.classSection.create({
      data: {
        id: testSectionId,
        name: 'Section A',
        gradeLevelId: testGradeId,
        academicYearId: testYearId,
        teacherId: testTeacherId,
      },
    });

    // Create Subject
    await prisma.subject.create({
      data: {
        id: testSubjectId,
        name: 'Mathematics',
        code: `MATH-${suffix}`,
      },
    });

    // Assign Subject to Section and Teacher
    await prisma.sectionSubjectTeacher.create({
      data: {
        id: `sst-${suffix}`,
        classSectionId: testSectionId,
        subjectId: testSubjectId,
        teacherId: testTeacherId,
        academicYearId: testYearId,
      },
    });

    // Create Student User & Student Profile
    await prisma.user.create({
      data: {
        id: testStudentUserId,
        email: `student_${suffix}@test.com`,
        loginId: testAdmNo,
        name: 'Alex Johnson',
        password: 'dummy',
        role: 'STUDENT',
      },
    });

    await prisma.student.create({
      data: {
        id: testStudentId,
        userId: testStudentUserId,
        firstName: 'Alex',
        lastName: 'Johnson',
        admissionNo: testAdmNo,
        classSectionId: testSectionId,
        status: 'ACTIVE',
        updatedAt: new Date(),
      },
    });

    await prisma.studentEnrollment.create({
      data: {
        id: `enr-${suffix}`,
        studentId: testStudentId,
        classSectionId: testSectionId,
        gradeLevelId: testGradeId,
        academicYearId: testYearId,
        status: 'ACTIVE',
      },
    });

    console.log('✓ Fixtures created successfully.\n');

    // Step 1: Teacher creates an assignment
    console.log('2. Teacher creates an assignment...');
    const createdAssignment = await assignmentsService.create({
      title: 'Quadratic Equations Homework',
      subjectId: testSubjectId,
      classSectionId: testSectionId,
      instructions: 'Solve problems 1-10 on page 42 and show your working.',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }, testTeacherUserId);

    assert(createdAssignment.id !== undefined, 'Assignment should be created');
    console.log(`✓ Assignment created: "${createdAssignment.title}" (ID: ${createdAssignment.id})\n`);

    // Step 2: Student opens assignment
    console.log('3. Student retrieves the assignment...');
    const studentAssignment = await studentsService.getMyAssignment(testStudentUserId, createdAssignment.id);
    assert(studentAssignment.id === createdAssignment.id, 'Student should be able to view assignment');
    assert(studentAssignment.submissions.length === 0, 'No submissions initially');
    console.log('✓ Student successfully retrieved assignment.\n');

    // Step 3 & 4: Student writes answer and submits
    console.log('4. Student submits answer for the assignment...');
    const studentWrittenAnswer = 'Here are my step-by-step solutions for problems 1 through 10:\nProblem 1: x^2 - 5x + 6 = 0 => (x - 2)(x - 3) = 0 => x = 2 or x = 3.\nProblem 2: 2x^2 + 4x - 6 = 0 => 2(x + 3)(x - 1) = 0 => x = -3 or x = 1.';
    
    const submissionResult = await studentsService.submitMyAssignment(
      testStudentUserId,
      createdAssignment.id,
      undefined,
      studentWrittenAnswer,
    );

    assert(submissionResult.id !== undefined, 'Submission should be saved in DB');
    assert(submissionResult.content === studentWrittenAnswer, 'Student answer content must match input');
    console.log(`✓ Submission saved in database (ID: ${submissionResult.id})\n`);

    // Step 5 & 6: Teacher logs in and opens dashboard
    console.log('5. Teacher opens dashboard to check submitted assignments...');
    const dashboard = await teachersService.getDashboard(testTeacherUserId);
    assert(dashboard !== null, 'Dashboard must return data');
    assert(Array.isArray(dashboard.submittedAssignments), 'Dashboard must include submittedAssignments list');
    console.log(`✓ Teacher dashboard loaded with ${dashboard.submittedAssignments.length} submitted assignment(s).\n`);

    // Step 7: Teacher sees the submitted assignment
    console.log('6. Verifying submitted assignment appears in Teacher Dashboard...');
    const foundInDashboard = dashboard.submittedAssignments.find((s: any) => s.id === submissionResult.id);
    assert(foundInDashboard !== undefined, 'Student submission must appear in teacher dashboard submittedAssignments');
    assert(foundInDashboard?.assignmentTitle === 'Quadratic Equations Homework', 'Assignment title must match');
    assert(foundInDashboard?.subject === 'Mathematics', 'Subject must match');
    console.log('✓ Submitted assignment is visible in Teacher Dashboard.\n');

    // Step 8: Teacher sees correct student
    console.log('7. Verifying correct student details appear...');
    assert(foundInDashboard?.studentName === 'Alex Johnson', 'Student name must match Alex Johnson');
    assert(foundInDashboard?.admissionNo === testAdmNo, 'Admission number must match test student');
    console.log(`✓ Student details verified: ${foundInDashboard?.studentName} (${foundInDashboard?.admissionNo})\n`);

    // Step 9 & 10: Teacher opens submission and reads actual answer
    console.log('8. Teacher opens submission and reads actual student answer...');
    assert(foundInDashboard?.content !== null && (foundInDashboard?.content?.length ?? 0) > 0, 'Answer content must not be empty');
    assert(foundInDashboard?.content === studentWrittenAnswer, 'Teacher must see exact written answer submitted by student');
    console.log('✓ Teacher can read student answer:');
    console.log('----------------------------------------------------');
    console.log(foundInDashboard?.content);
    console.log('----------------------------------------------------\n');

    // Step 11: Teacher grades the submission
    console.log('9. Teacher grades the submission...');
    const gradedResult = await assignmentsService.gradeSubmission(
      submissionResult.id,
      { score: 95, maxScore: 100 },
      testTeacherUserId,
    );
    assert(gradedResult.score === 95, 'Grade score must be 95');
    assert(gradedResult.maxScore === 100, 'Grade maxScore must be 100');
    console.log(`✓ Grade assigned successfully: ${gradedResult.score}/${gradedResult.maxScore}\n`);

    // Step 12: Verify dashboard reflects graded status
    console.log('10. Verifying dashboard reflects graded status...');
    const updatedDashboard = await teachersService.getDashboard(testTeacherUserId);
    const updatedSubmission = updatedDashboard.submittedAssignments.find((s: any) => s.id === submissionResult.id);
    assert(updatedSubmission !== undefined && updatedSubmission.isGraded === true, 'Submission should now be marked as graded');
    assert(updatedSubmission?.grade?.score === 95, 'Grade in dashboard must be 95');
    console.log('✓ Submission graded status verified on dashboard.\n');

    console.log('====================================================');
    console.log('ALL WORKFLOW TESTS PASSED SUCCESSFULLY! ✓');
    console.log('====================================================');
  } catch (error: any) {
    console.error('❌ Test failed:', error);
    process.exitCode = 1;
  } finally {
    console.log('\nCleaning up test fixtures...');
    try {
      await prisma.grade.deleteMany({ where: { Submission: { studentId: testStudentId } } }).catch(() => {});
      await prisma.submission.deleteMany({ where: { studentId: testStudentId } }).catch(() => {});
      await prisma.studentAssignment.deleteMany({ where: { studentId: testStudentId } }).catch(() => {});
      await prisma.assignment.deleteMany({ where: { teacherId: testTeacherId } }).catch(() => {});
      await prisma.sectionSubjectTeacher.deleteMany({ where: { teacherId: testTeacherId } }).catch(() => {});
      await prisma.studentEnrollment.deleteMany({ where: { studentId: testStudentId } }).catch(() => {});
      await prisma.student.deleteMany({ where: { id: testStudentId } }).catch(() => {});
      await prisma.classSection.deleteMany({ where: { id: testSectionId } }).catch(() => {});
      await prisma.subject.deleteMany({ where: { id: testSubjectId } }).catch(() => {});
      await prisma.gradeLevel.deleteMany({ where: { id: testGradeId } }).catch(() => {});
      await prisma.academicYear.deleteMany({ where: { id: testYearId } }).catch(() => {});
      await prisma.teacher.deleteMany({ where: { id: testTeacherId } }).catch(() => {});
      await prisma.user.deleteMany({ where: { id: { in: [testTeacherUserId, testStudentUserId] } } }).catch(() => {});
    } catch {
      // Ignore cleanup error
    }
    await prisma.$disconnect();
  }
}

runTests();
