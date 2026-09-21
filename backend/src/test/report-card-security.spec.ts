import { PrismaClient, Role } from '@prisma/client';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../modules/auth/guards/roles.guard';
import { ROLES_KEY } from '../modules/auth/decorators/roles.decorator';
import { ParentsService } from '../modules/parents/parents.service';
import { StudentsService } from '../modules/students/students.service';
import { ReportCardsService } from '../modules/report-cards/report-cards.service';
import { TimetableService } from '../modules/timetable/timetable.service';
import { UsersService } from '../modules/users/users.service';
import { PrismaService } from '../common/prisma/prisma.service';

const prisma = new PrismaClient();
const prismaService = prisma as unknown as PrismaService;
const usersService = new UsersService(prismaService);
const timetableService = new TimetableService(prismaService);
const reportCardsService = new ReportCardsService(prismaService);
const parentsService = new ParentsService(prismaService, reportCardsService, timetableService);
const studentsService = new StudentsService(prismaService, usersService, timetableService);

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[ASSERTION FAILED]: ${message}`);
  }
}

function mockExecutionContext(role: Role): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: { role },
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function checkRolesGuard(userRole: Role, allowedRoles: Role[]): boolean {
  const reflector = new Reflector();
  jestOrReflectorOverride(reflector, allowedRoles);
  const guard = new RolesGuard(reflector);
  try {
    return guard.canActivate(mockExecutionContext(userRole));
  } catch (err) {
    if (err instanceof ForbiddenException) {
      return false;
    }
    throw err;
  }
}

function jestOrReflectorOverride(reflector: Reflector, allowedRoles: Role[]) {
  reflector.getAllAndOverride = () => allowedRoles;
}

async function runSecurityTests() {
  console.log('================================================================');
  console.log('REPORT CARD SECURITY & AUTHORIZATION VERIFICATION TEST');
  console.log('================================================================\n');

  const suffix = Date.now().toString().slice(-6);
  const testYearId = `yr-sec-${suffix}`;
  const testGradeId = `grd-sec-${suffix}`;
  const testSectionId = `sec-sec-${suffix}`;
  const testTermId = `trm-sec-${suffix}`;

  // Parent A and Child A
  const parentAUserId = `usr-par-a-${suffix}`;
  const parentAId = `par-a-${suffix}`;
  const studentAUserId = `usr-stu-a-${suffix}`;
  const studentAId = `stu-a-${suffix}`;
  const admNoA = `ADM-A-${suffix}`;

  // Parent B and Child B
  const parentBUserId = `usr-par-b-${suffix}`;
  const parentBId = `par-b-${suffix}`;
  const studentBUserId = `usr-stu-b-${suffix}`;
  const studentBId = `stu-b-${suffix}`;
  const admNoB = `ADM-B-${suffix}`;

  try {
    console.log('1. Setting up test fixtures with parent-student relationships...');
    await prisma.academicYear.create({
      data: {
        id: testYearId,
        year: `2099/${suffix}`,
        startDate: new Date('2099-09-01'),
        endDate: new Date('2100-06-30'),
        isCurrent: true,
        updatedAt: new Date(),
      },
    });

    await prisma.term.create({
      data: {
        id: testTermId,
        name: `Term 1 - ${suffix}`,
        academicYearId: testYearId,
        startDate: new Date('2099-09-01'),
        endDate: new Date('2099-12-31'),
        updatedAt: new Date(),
      },
    });

    await prisma.gradeLevel.create({
      data: {
        id: testGradeId,
        name: `Grade 9-${suffix}`,
      },
    });

    await prisma.classSection.create({
      data: {
        id: testSectionId,
        name: `Section A-${suffix}`,
        gradeLevelId: testGradeId,
        academicYearId: testYearId,
        updatedAt: new Date(),
      },
    });

    // Create Parent A
    await prisma.user.create({
      data: {
        id: parentAUserId,
        email: `parentA_${suffix}@example.com`,
        loginId: `parentA_${suffix}`,
        name: 'Parent Alpha',
        password: 'dummy-password',
        role: Role.PARENT,
        updatedAt: new Date(),
      },
    });
    await prisma.parent.create({
      data: {
        id: parentAId,
        userId: parentAUserId,
        firstName: 'Parent',
        lastName: 'Alpha',
        updatedAt: new Date(),
      },
    });

    // Create Student A linked to Parent A
    await prisma.user.create({
      data: {
        id: studentAUserId,
        email: `studentA_${suffix}@example.com`,
        loginId: admNoA,
        name: 'Student Alpha',
        password: 'dummy-password',
        role: Role.STUDENT,
        updatedAt: new Date(),
      },
    });
    await prisma.student.create({
      data: {
        id: studentAId,
        userId: studentAUserId,
        admissionNo: admNoA,
        firstName: 'Student',
        lastName: 'Alpha',
        parentId: parentAId,
        classSectionId: testSectionId,
        updatedAt: new Date(),
      },
    });

    // Create Parent B
    await prisma.user.create({
      data: {
        id: parentBUserId,
        email: `parentB_${suffix}@example.com`,
        loginId: `parentB_${suffix}`,
        name: 'Parent Beta',
        password: 'dummy-password',
        role: Role.PARENT,
        updatedAt: new Date(),
      },
    });
    await prisma.parent.create({
      data: {
        id: parentBId,
        userId: parentBUserId,
        firstName: 'Parent',
        lastName: 'Beta',
        updatedAt: new Date(),
      },
    });

    // Create Student B linked to Parent B
    await prisma.user.create({
      data: {
        id: studentBUserId,
        email: `studentB_${suffix}@example.com`,
        loginId: admNoB,
        name: 'Student Beta',
        password: 'dummy-password',
        role: Role.STUDENT,
        updatedAt: new Date(),
      },
    });
    await prisma.student.create({
      data: {
        id: studentBId,
        userId: studentBUserId,
        admissionNo: admNoB,
        firstName: 'Student',
        lastName: 'Beta',
        parentId: parentBId,
        classSectionId: testSectionId,
        updatedAt: new Date(),
      },
    });

    console.log('✓ Fixtures established with two distinct parent-child relationships.\n');

    // ── Test 1: Student Can Access Their Own Results ─────────────────────────
    console.log('2. Testing Student report card retrieval (own data)...');
    const studentAResults = await studentsService.getMyResults(studentAUserId);
    assert(Array.isArray(studentAResults.grades), 'Student results.grades must be an array');
    assert(Array.isArray(studentAResults.subjectResults), 'Student results.subjectResults must be an array');
    console.log('✓ Student A can successfully query their own results endpoint.\n');

    // ── Test 2: Parent Can Access Authorized Child ───────────────────────────
    console.log('3. Testing Parent accessing authorized child report card...');
    const parentAChildAReport = await parentsService.getChildReportCard(parentAUserId, studentAId, testTermId);
    assert(parentAChildAReport.student.id === studentAId, 'Parent A must receive Student A report card');
    console.log('✓ Parent A can successfully retrieve authorized Child A report card.\n');

    // ── Test 3: Parent CANNOT Access Unauthorized Student (ID Tampering) ─────
    console.log('4. Testing Parent attempting to access unauthorized child (ID tampering: studentId=B)...');
    let tamperingBlocked = false;
    try {
      await parentsService.getChildReportCard(parentAUserId, studentBId, testTermId);
    } catch (err: any) {
      if (err instanceof ForbiddenException) {
        tamperingBlocked = true;
        console.log(`✓ Access correctly denied with ForbiddenException: "${err.message}"`);
      } else {
        throw err;
      }
    }
    assert(tamperingBlocked, 'Parent A MUST be forbidden from accessing Student B report card');

    let attendanceTamperingBlocked = false;
    try {
      await parentsService.getChildAttendance(parentAUserId, studentBId);
    } catch (err: any) {
      if (err instanceof ForbiddenException) {
        attendanceTamperingBlocked = true;
      }
    }
    assert(attendanceTamperingBlocked, 'Parent A MUST be forbidden from accessing Student B attendance');

    let resultsTamperingBlocked = false;
    try {
      await parentsService.getChildResults(parentAUserId, studentBId);
    } catch (err: any) {
      if (err instanceof ForbiddenException) {
        resultsTamperingBlocked = true;
      }
    }
    assert(resultsTamperingBlocked, 'Parent A MUST be forbidden from accessing Student B results');
    console.log('✓ All ID tampering attempts across report-card, results, and attendance were strictly blocked.\n');

    // ── Test 4: RolesGuard Enforces Route Authorization ──────────────────────
    console.log('5. Testing RolesGuard route security for report-card endpoints...');

    // /report-cards/* is for ADMIN and TEACHER only
    const reportCardsAllowedRoles = [Role.ADMIN, Role.TEACHER];
    assert(!checkRolesGuard(Role.STUDENT, reportCardsAllowedRoles), 'Student MUST be forbidden from /report-cards/*');
    assert(!checkRolesGuard(Role.PARENT, reportCardsAllowedRoles), 'Parent MUST be forbidden from /report-cards/*');
    assert(checkRolesGuard(Role.TEACHER, reportCardsAllowedRoles), 'Teacher MUST be allowed on /report-cards/*');
    assert(checkRolesGuard(Role.ADMIN, reportCardsAllowedRoles), 'Admin MUST be allowed on /report-cards/*');
    console.log('✓ /report-cards/* endpoints are strictly closed to Students and Parents, accessible only to Teacher and Admin.');

    // /parents/* is for PARENT only
    const parentAllowedRoles = [Role.PARENT];
    assert(!checkRolesGuard(Role.STUDENT, parentAllowedRoles), 'Student MUST be forbidden from /parents/*');
    assert(!checkRolesGuard(Role.TEACHER, parentAllowedRoles), 'Teacher MUST be forbidden from /parents/*');
    assert(checkRolesGuard(Role.PARENT, parentAllowedRoles), 'Parent MUST be allowed on /parents/*');
    console.log('✓ /parents/* endpoints are strictly closed to Students and Teachers, accessible only to Parents.');

    // /students/me/* is for STUDENT only
    const studentAllowedRoles = [Role.STUDENT];
    assert(checkRolesGuard(Role.STUDENT, studentAllowedRoles), 'Student MUST be allowed on /students/me/*');
    assert(!checkRolesGuard(Role.PARENT, studentAllowedRoles), 'Parent MUST be forbidden from /students/me/*');
    assert(!checkRolesGuard(Role.TEACHER, studentAllowedRoles), 'Teacher MUST be forbidden from /students/me/*');
    console.log('✓ /students/me/* endpoints are strictly closed to Parents and Teachers, accessible only to Students.\n');

    console.log('================================================================');
    console.log('ALL REPORT CARD SECURITY TESTS PASSED SUCCESSFULLY! ✓');
    console.log('================================================================\n');
  } finally {
    console.log('Cleaning up test fixtures...');
    await prisma.student.deleteMany({ where: { id: { in: [studentAId, studentBId] } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [studentAUserId, studentBUserId, parentAUserId, parentBUserId] } } }).catch(() => {});
    await prisma.parent.deleteMany({ where: { id: { in: [parentAId, parentBId] } } }).catch(() => {});
    await prisma.classSection.deleteMany({ where: { id: testSectionId } }).catch(() => {});
    await prisma.gradeLevel.deleteMany({ where: { id: testGradeId } }).catch(() => {});
    await prisma.term.deleteMany({ where: { id: testTermId } }).catch(() => {});
    await prisma.academicYear.deleteMany({ where: { id: testYearId } }).catch(() => {});
    await prisma.$disconnect();
    console.log('✓ Test fixtures cleaned up.');
  }
}

runSecurityTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
