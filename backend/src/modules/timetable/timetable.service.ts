import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePeriodDto } from './dto/create-period.dto';
import { UpdatePeriodDto } from './dto/update-period.dto';
import { BulkSaveScheduleDto } from './dto/bulk-save-schedule.dto';
import { PublishScheduleDto } from './dto/publish-schedule.dto';
import {
  normalizeRoom,
  resolveEffectiveRoom,
  toTitleCaseDay,
} from './helpers/timetable-validator';

@Injectable()
export class TimetableService {
  private readonly logger = new Logger(TimetableService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Academic Year & Period Helpers ─────────────────────────────────────────

  /**
   * Resolves the target academic year.
   * If academicYearId is provided, validates that it exists.
   * If omitted, falls back to the current active AcademicYear (isCurrent === true).
   */
  async resolveAcademicYear(academicYearId?: string) {
    if (academicYearId && academicYearId.trim() !== '') {
      const year = await this.prisma.academicYear.findUnique({
        where: { id: academicYearId.trim() },
      });
      if (!year) {
        throw new NotFoundException(`Academic Year with ID '${academicYearId}' not found`);
      }
      return year;
    }

    const currentYear = await this.prisma.academicYear.findFirst({
      where: { isCurrent: true },
    });
    if (!currentYear) {
      throw new BadRequestException(
        'academicYearId is required when no current academic year is set',
      );
    }
    return currentYear;
  }

  /**
   * Enforces that startTime is strictly earlier than endTime.
   * Naturally rejects cross-midnight and zero-duration periods.
   */
  checkTimeInterval(startTime: string, endTime: string) {
    if (startTime >= endTime) {
      throw new BadRequestException(
        `startTime (${startTime}) must be earlier than endTime (${endTime})`,
      );
    }
  }

  /**
   * Validates that an interval [startTime, endTime) does not overlap with any other
   * active period in the same academic year. Touching boundaries (e.g. 08:45 == 08:45)
   * are explicitly permitted.
   */
  async checkPeriodOverlap(
    academicYearId: string,
    startTime: string,
    endTime: string,
    excludePeriodId?: string,
  ) {
    const activePeriods = await this.prisma.schedulePeriod.findMany({
      where: {
        academicYearId,
        isActive: true,
        ...(excludePeriodId ? { id: { not: excludePeriodId } } : {}),
      },
      select: {
        id: true,
        periodNumber: true,
        name: true,
        startTime: true,
        endTime: true,
      },
    });

    for (const p of activePeriods) {
      if (startTime < p.endTime && endTime > p.startTime) {
        throw new ConflictException(
          `Time ${startTime}–${endTime} overlaps with existing period '${p.name}' (Period ${p.periodNumber}: ${p.startTime}–${p.endTime})`,
        );
      }
    }
  }

  // ─── Period Management Methods ──────────────────────────────────────────────

  /**
   * Returns all periods for the specified (or current) Academic Year.
   * Sorted by displayOrder ASC, then periodNumber ASC.
   */
  async getPeriods(academicYearId?: string, includeInactive = false) {
    const year = await this.resolveAcademicYear(academicYearId);

    return this.prisma.schedulePeriod.findMany({
      where: {
        academicYearId: year.id,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        _count: {
          select: { scheduleEntries: true },
        },
      },
      orderBy: [{ displayOrder: 'asc' }, { periodNumber: 'asc' }],
    });
  }

  /**
   * Creates a new SchedulePeriod for an Academic Year.
   */
  async createPeriod(dto: CreatePeriodDto) {
    const year = await this.resolveAcademicYear(dto.academicYearId);

    this.checkTimeInterval(dto.startTime, dto.endTime);

    const existingPeriodNumber = await this.prisma.schedulePeriod.findUnique({
      where: {
        academicYearId_periodNumber: {
          academicYearId: year.id,
          periodNumber: dto.periodNumber,
        },
      },
    });
    if (existingPeriodNumber) {
      throw new ConflictException(
        `Period number ${dto.periodNumber} already exists for academic year ${year.year}`,
      );
    }

    await this.checkPeriodOverlap(year.id, dto.startTime, dto.endTime);

    return this.prisma.schedulePeriod.create({
      data: {
        academicYearId: year.id,
        periodNumber: dto.periodNumber,
        name: dto.name.trim(),
        startTime: dto.startTime.trim(),
        endTime: dto.endTime.trim(),
        isBreak: dto.isBreak ?? false,
        displayOrder: dto.displayOrder ?? dto.periodNumber,
        isActive: true,
      },
      include: {
        _count: {
          select: { scheduleEntries: true },
        },
      },
    });
  }

  /**
   * Updates an existing SchedulePeriod.
   * academicYearId is immutable.
   */
  async updatePeriod(id: string, dto: UpdatePeriodDto) {
    const period = await this.prisma.schedulePeriod.findUnique({
      where: { id },
    });
    if (!period) {
      throw new NotFoundException(`Schedule period with ID '${id}' not found`);
    }

    const targetStartTime = dto.startTime ?? period.startTime;
    const targetEndTime = dto.endTime ?? period.endTime;
    const willBeActive = dto.isActive ?? period.isActive;

    if (dto.startTime || dto.endTime) {
      this.checkTimeInterval(targetStartTime, targetEndTime);
    }

    if (dto.periodNumber && dto.periodNumber !== period.periodNumber) {
      const existingPeriodNumber = await this.prisma.schedulePeriod.findUnique({
        where: {
          academicYearId_periodNumber: {
            academicYearId: period.academicYearId,
            periodNumber: dto.periodNumber,
          },
        },
      });
      if (existingPeriodNumber) {
        throw new ConflictException(
          `Period number ${dto.periodNumber} already exists for this academic year`,
        );
      }
    }

    if (willBeActive && (dto.startTime || dto.endTime || (!period.isActive && dto.isActive))) {
      await this.checkPeriodOverlap(
        period.academicYearId,
        targetStartTime,
        targetEndTime,
        period.id,
      );
    }

    if (dto.isBreak === true && !period.isBreak) {
      const usageCount = await this.prisma.scheduleEntry.count({
        where: { periodId: id },
      });
      if (usageCount > 0) {
        throw new BadRequestException(
          `Cannot convert period '${period.name}' to a break because it is used by ${usageCount} class timetable entry(ies)`,
        );
      }
    }

    if (dto.isActive === false && period.isActive) {
      const usageCount = await this.prisma.scheduleEntry.count({
        where: { periodId: id },
      });
      if (usageCount > 0) {
        throw new BadRequestException(
          `Cannot deactivate period '${period.name}' because it is used by ${usageCount} class timetable entry(ies)`,
        );
      }
    }

    return this.prisma.schedulePeriod.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.periodNumber !== undefined ? { periodNumber: dto.periodNumber } : {}),
        ...(dto.startTime !== undefined ? { startTime: dto.startTime.trim() } : {}),
        ...(dto.endTime !== undefined ? { endTime: dto.endTime.trim() } : {}),
        ...(dto.isBreak !== undefined ? { isBreak: dto.isBreak } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
      },
      include: {
        _count: {
          select: { scheduleEntries: true },
        },
      },
    });
  }

  /**
   * Deletes a SchedulePeriod.
   * Strictly prevents deletion if any ScheduleEntry references this period.
   */
  async deletePeriod(id: string) {
    const period = await this.prisma.schedulePeriod.findUnique({
      where: { id },
    });
    if (!period) {
      throw new NotFoundException(`Schedule period with ID '${id}' not found`);
    }

    const usageCount = await this.prisma.scheduleEntry.count({
      where: { periodId: id },
    });
    if (usageCount > 0) {
      throw new ConflictException(
        `Cannot delete period '${period.name}' because it is actively used in ${usageCount} class timetable entry(ies). Remove those timetable entries first or deactivate the period.`,
      );
    }

    await this.prisma.schedulePeriod.delete({
      where: { id },
    });

    return {
      success: true,
      message: `Period '${period.name}' deleted successfully`,
    };
  }

  // ─── Schedule Entry Management Methods ──────────────────────────────────────

  /**
   * Retrieves the full weekly timetable grid for a class section.
   * Admins can view both DRAFT and PUBLISHED schedules.
   * Teachers must be authorized (homeroom or assigned subject teacher) and can only view PUBLISHED schedules.
   */
  async getSectionSchedule(
    classSectionId: string,
    user: { id: string; role: string },
    academicYearId?: string,
  ) {
    const section = await this.prisma.classSection.findUnique({
      where: { id: classSectionId },
      include: {
        GradeLevel: { select: { id: true, name: true, gradeNumber: true } },
        AcademicYear: { select: { id: true, year: true, isCurrent: true } },
      },
    });
    if (!section) {
      throw new NotFoundException(`ClassSection with ID '${classSectionId}' not found`);
    }

    // Reuse already-loaded section.AcademicYear whenever possible to eliminate redundant database query
    let year: { id: string; year: string; isCurrent: boolean };
    const requestedYearId = academicYearId?.trim();

    if (requestedYearId) {
      if (section.academicYearId && section.academicYearId !== requestedYearId) {
        const targetYear = await this.resolveAcademicYear(requestedYearId);
        throw new BadRequestException(
          `ClassSection '${section.name}' does not belong to Academic Year '${targetYear.year}'`,
        );
      }
      if (section.AcademicYear && section.AcademicYear.id === requestedYearId) {
        year = section.AcademicYear;
      } else {
        year = await this.resolveAcademicYear(requestedYearId);
      }
    } else if (section.AcademicYear) {
      year = section.AcademicYear;
    } else {
      year = await this.resolveAcademicYear(section.academicYearId || undefined);
    }

    if (user.role === 'TEACHER') {
      const teacher = await this.prisma.teacher.findUnique({
        where: { userId: user.id },
      });
      if (!teacher) {
        throw new ForbiddenException('Teacher profile not found for authenticated user');
      }

      const isHomeroom = section.teacherId === teacher.id;
      const isSubjectTeacher = await this.prisma.sectionSubjectTeacher.findFirst({
        where: {
          classSectionId,
          teacherId: teacher.id,
          academicYearId: year.id,
        },
      });

      if (!isHomeroom && !isSubjectTeacher) {
        throw new ForbiddenException(
          'You do not have permission to view the timetable for this class section',
        );
      }
    }

    // Load periods once for the academic year and use in-memory mapping for entries
    const allPeriods = await this.prisma.schedulePeriod.findMany({
      where: { academicYearId: year.id },
      orderBy: [{ displayOrder: 'asc' }, { periodNumber: 'asc' }],
    });
    const periods = allPeriods.filter((p) => p.isActive);
    const periodMap = new Map(allPeriods.map((p) => [p.id, p]));

    const schedule = await this.prisma.classSchedule.findUnique({
      where: {
        academicYearId_classSectionId: {
          academicYearId: year.id,
          classSectionId,
        },
      },
      include: {
        entries: {
          include: {
            subject: { select: { id: true, name: true, code: true } },
            teacher: { select: { id: true, firstName: true, lastName: true, staffId: true } },
          },
          orderBy: [{ dayOfWeek: 'asc' }, { period: { periodNumber: 'asc' } }],
        },
      },
    });

    if (user.role === 'TEACHER' && (!schedule || schedule.status !== 'PUBLISHED')) {
      return {
        classSection: {
          id: section.id,
          name: section.name,
          roomNumber: section.roomNumber,
          gradeLevel: section.GradeLevel,
        },
        academicYear: year,
        status: 'DRAFT',
        publishedAt: null,
        updatedAt: null,
        periods,
        entries: [],
        message: 'No published timetable is currently available for this section',
      };
    }

    return {
      classSection: {
        id: section.id,
        name: section.name,
        roomNumber: section.roomNumber,
        gradeLevel: section.GradeLevel,
      },
      academicYear: year,
      status: schedule ? schedule.status : 'DRAFT',
      publishedAt: schedule?.publishedAt || null,
      updatedAt: schedule?.updatedAt?.toISOString() ?? null,
      periods,
      entries: (schedule?.entries || []).map((e) => ({
        id: e.id,
        dayOfWeek: toTitleCaseDay(e.dayOfWeek),
        periodId: e.periodId,
        period: periodMap.get(e.periodId) || null,
        subjectId: e.subjectId,
        subject: e.subject,
        teacherId: e.teacherId,
        teacher: e.teacher,
        roomOverride: e.roomOverride,
        effectiveRoom: resolveEffectiveRoom(e.roomOverride, section.roomNumber),
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
    };
  }

  /**
   * Saves a weekly timetable for a class section in DRAFT status.
   * Atomically validates periods, breaks, teacher assignments, double-booking, and room conflicts.
   * Strictly blocked if the schedule is currently PUBLISHED.
   */
  /**
   * Validates the complete schedule payload for a class section.
   * Reused by both saveDraftSchedule and publishSchedule.
   */
  private async validateSchedulePayload(classSectionId: string, dto: BulkSaveScheduleDto) {
    const section = await this.prisma.classSection.findUnique({
      where: { id: classSectionId },
      select: { id: true, name: true, roomNumber: true, academicYearId: true },
    });
    if (!section) {
      throw new NotFoundException(`ClassSection with ID '${classSectionId}' not found`);
    }

    const year = await this.resolveAcademicYear(dto.academicYearId);
    if (section.academicYearId && section.academicYearId !== year.id) {
      throw new BadRequestException(
        `ClassSection '${section.name}' belongs to academic year '${section.academicYearId}', but payload specified '${year.id}'`,
      );
    }

    const existingSchedule = await this.prisma.classSchedule.findUnique({
      where: {
        academicYearId_classSectionId: {
          academicYearId: year.id,
          classSectionId,
        },
      },
    });

    const activePeriods = await this.prisma.schedulePeriod.findMany({
      where: { academicYearId: year.id, isActive: true },
    });
    const periodMap = new Map(activePeriods.map((p) => [p.id, p]));

    const assignments = await this.prisma.sectionSubjectTeacher.findMany({
      where: {
        classSectionId,
        academicYearId: year.id,
      },
      include: {
        Subject: true,
        Teacher: true,
      },
    });
    const assignmentMap = new Map(assignments.map((a) => [a.subjectId, a]));

    const seenClassSlots = new Set<string>();
    const seenTeacherSlots = new Set<string>();
    const seenRoomSlots = new Set<string>();

    for (const entry of dto.entries) {
      const period = periodMap.get(entry.periodId);
      if (!period) {
        throw new BadRequestException(
          `Period with ID '${entry.periodId}' does not exist or is inactive in academic year '${year.year}'`,
        );
      }
      if (period.isBreak) {
        throw new BadRequestException(
          `Cannot schedule instructional lesson during break period: '${period.name}'`,
        );
      }

      const assignment = assignmentMap.get(entry.subjectId);
      if (!assignment) {
        const subject = await this.prisma.subject.findUnique({
          where: { id: entry.subjectId },
        });
        throw new BadRequestException(
          `Subject '${subject?.name || entry.subjectId}' has no assigned teacher for section '${section.name}' in this academic year. Assign a teacher in Teacher Assignments before scheduling.`,
        );
      }
      const teacher = assignment.Teacher;
      const teacherName = `${teacher.firstName} ${teacher.lastName}`.trim();

      const classSlotKey = `${entry.dayOfWeek}_${entry.periodId}`;
      if (seenClassSlots.has(classSlotKey)) {
        throw new ConflictException(
          `Duplicate entry in payload: Class section already has a lesson scheduled on ${entry.dayOfWeek} during ${period.name}`,
        );
      }
      seenClassSlots.add(classSlotKey);

      const teacherSlotKey = `${teacher.id}_${entry.dayOfWeek}_${entry.periodId}`;
      if (seenTeacherSlots.has(teacherSlotKey)) {
        throw new ConflictException(
          `Teacher conflict in payload: Teacher '${teacherName}' is assigned multiple times on ${entry.dayOfWeek} during ${period.name}`,
        );
      }
      seenTeacherSlots.add(teacherSlotKey);

      const effectiveRoom = resolveEffectiveRoom(entry.roomOverride, section.roomNumber);
      if (effectiveRoom) {
        const roomSlotKey = `${effectiveRoom}_${entry.dayOfWeek}_${entry.periodId}`;
        if (seenRoomSlots.has(roomSlotKey)) {
          throw new ConflictException(
            `Room conflict in payload: Room "${effectiveRoom}" is assigned multiple times on ${entry.dayOfWeek} during ${period.name}`,
          );
        }
        seenRoomSlots.add(roomSlotKey);
      }
    }

    if (dto.entries.length > 0) {
      const otherEntries = await this.prisma.scheduleEntry.findMany({
        where: {
          academicYearId: year.id,
          ...(existingSchedule ? { classScheduleId: { not: existingSchedule.id } } : {}),
          OR: dto.entries.map((e) => ({
            dayOfWeek: e.dayOfWeek,
            periodId: e.periodId,
          })),
        },
        include: {
          classSchedule: { include: { ClassSection: true } },
          period: true,
          teacher: true,
        },
      });

      for (const entry of dto.entries) {
        const period = periodMap.get(entry.periodId)!;
        const assignment = assignmentMap.get(entry.subjectId)!;
        const teacher = assignment.Teacher;
        const teacherName = `${teacher.firstName} ${teacher.lastName}`.trim();
        const effectiveRoom = resolveEffectiveRoom(entry.roomOverride, section.roomNumber);

        const matchingOtherEntries = otherEntries.filter(
          (o) => o.dayOfWeek === entry.dayOfWeek && o.periodId === entry.periodId,
        );

        for (const other of matchingOtherEntries) {
          if (other.teacherId === teacher.id) {
            throw new ConflictException(
              `Teacher '${teacherName}' is already scheduled to teach Section '${other.classSchedule.ClassSection.name}' on ${entry.dayOfWeek} during ${period.name}`,
            );
          }

          if (effectiveRoom) {
            const otherEffectiveRoom = resolveEffectiveRoom(
              other.roomOverride,
              other.classSchedule.ClassSection.roomNumber,
            );
            if (otherEffectiveRoom && otherEffectiveRoom === effectiveRoom) {
              throw new ConflictException(
                `Room conflict: Room "${effectiveRoom}" is already occupied by Section "${other.classSchedule.ClassSection.name}" on ${entry.dayOfWeek} during ${period.name}`,
              );
            }
          }
        }
      }
    }

    return {
      section,
      year,
      existingSchedule,
      preparedEntries: dto.entries.map((e) => {
        const assignment = assignmentMap.get(e.subjectId)!;
        return {
          academicYearId: year.id,
          dayOfWeek: e.dayOfWeek,
          periodId: e.periodId,
          subjectId: e.subjectId,
          teacherId: assignment.teacherId,
          roomOverride: e.roomOverride?.trim() ? e.roomOverride.trim() : null,
        };
      }),
    };
  }

  /**
   * Saves a weekly timetable for a class section in DRAFT status.
   * Atomically validates periods, breaks, teacher assignments, double-booking, and room conflicts.
   * Strictly blocked if the schedule is currently PUBLISHED.
   */
  async saveDraftSchedule(classSectionId: string, dto: BulkSaveScheduleDto) {
    const { section, year, existingSchedule, preparedEntries } =
      await this.validateSchedulePayload(classSectionId, dto);

    // Published Protection: Reject draft modification if schedule is already published
    if (existingSchedule?.status === 'PUBLISHED') {
      throw new ConflictException(
        'This timetable is currently PUBLISHED. To prevent accidental disruption to live classes, draft saves are blocked. Use the explicit publish-update workflow or unpublish the timetable first.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Re-verify published protection inside transaction
      const currentCheck = await tx.classSchedule.findUnique({
        where: {
          academicYearId_classSectionId: {
            academicYearId: year.id,
            classSectionId,
          },
        },
      });
      if (currentCheck?.status === 'PUBLISHED') {
        throw new ConflictException(
          'This timetable is currently PUBLISHED. To prevent accidental disruption to live classes, draft saves are blocked.',
        );
      }

      const schedule = await tx.classSchedule.upsert({
        where: {
          academicYearId_classSectionId: {
            academicYearId: year.id,
            classSectionId,
          },
        },
        create: {
          academicYearId: year.id,
          classSectionId,
          status: 'DRAFT',
        },
        update: {},
      });

      await tx.scheduleEntry.deleteMany({
        where: { classScheduleId: schedule.id },
      });

      if (preparedEntries.length > 0) {
        await tx.scheduleEntry.createMany({
          data: preparedEntries.map((e) => ({
            ...e,
            classScheduleId: schedule.id,
          })),
        });
      }

      return tx.classSchedule.findUnique({
        where: { id: schedule.id },
        include: {
          ClassSection: { select: { id: true, name: true, roomNumber: true } },
          AcademicYear: { select: { id: true, year: true, isCurrent: true } },
          entries: {
            include: {
              period: true,
              subject: { select: { id: true, name: true, code: true } },
              teacher: { select: { id: true, firstName: true, lastName: true, staffId: true } },
            },
            orderBy: [{ dayOfWeek: 'asc' }, { period: { periodNumber: 'asc' } }],
          },
        },
      });
    });
  }

  /**
   * Publishes a weekly timetable for a class section.
   * Replaces the schedule atomically, sets status to PUBLISHED, and refreshes publishedAt timestamp.
   * Performs full validation, optimistic concurrency verification, and empty schedule rejection.
   */
  async publishSchedule(classSectionId: string, dto: PublishScheduleDto) {
    if (!dto.entries || dto.entries.length === 0) {
      throw new BadRequestException(
        'Cannot publish an empty timetable. At least one instructional schedule entry is required to publish.',
      );
    }

    const { section, year, existingSchedule, preparedEntries } =
      await this.validateSchedulePayload(classSectionId, dto);

    const now = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      // Optimistic concurrency check
      if (dto.expectedUpdatedAt && existingSchedule) {
        const current = await tx.classSchedule.findUnique({
          where: {
            academicYearId_classSectionId: {
              academicYearId: year.id,
              classSectionId,
            },
          },
        });
        if (current && current.updatedAt.toISOString() !== dto.expectedUpdatedAt) {
          throw new ConflictException(
            'The timetable has been modified by another administrator since you loaded it. Please reload the schedule before publishing.',
          );
        }
      }

      const schedule = await tx.classSchedule.upsert({
        where: {
          academicYearId_classSectionId: {
            academicYearId: year.id,
            classSectionId,
          },
        },
        create: {
          academicYearId: year.id,
          classSectionId,
          status: 'PUBLISHED',
          publishedAt: now,
        },
        update: {
          status: 'PUBLISHED',
          publishedAt: now,
        },
      });

      // Clear previous entries
      await tx.scheduleEntry.deleteMany({
        where: { classScheduleId: schedule.id },
      });

      // Batch insert validated new entries
      await tx.scheduleEntry.createMany({
        data: preparedEntries.map((e) => ({
          ...e,
          classScheduleId: schedule.id,
        })),
      });

      return tx.classSchedule.findUnique({
        where: { id: schedule.id },
        include: {
          ClassSection: { select: { id: true, name: true, roomNumber: true } },
          AcademicYear: { select: { id: true, year: true, isCurrent: true } },
          entries: {
            include: {
              period: true,
              subject: { select: { id: true, name: true, code: true } },
              teacher: { select: { id: true, firstName: true, lastName: true, staffId: true } },
            },
            orderBy: [{ dayOfWeek: 'asc' }, { period: { periodNumber: 'asc' } }],
          },
        },
      });
    });

    return {
      classSection: {
        id: result!.ClassSection.id,
        name: result!.ClassSection.name,
        roomNumber: result!.ClassSection.roomNumber,
      },
      academicYear: {
        id: result!.AcademicYear.id,
        year: result!.AcademicYear.year,
        isCurrent: result!.AcademicYear.isCurrent,
      },
      status: result!.status,
      publishedAt: result!.publishedAt,
      totalEntries: result!.entries.length,
      entries: result!.entries.map((e) => ({
        id: e.id,
        dayOfWeek: toTitleCaseDay(e.dayOfWeek),
        periodId: e.periodId,
        period: {
          id: e.period.id,
          periodNumber: e.period.periodNumber,
          name: e.period.name,
          startTime: e.period.startTime,
          endTime: e.period.endTime,
          isBreak: e.period.isBreak,
        },
        subject: e.subject,
        teacher: {
          id: e.teacher.id,
          firstName: e.teacher.firstName,
          lastName: e.teacher.lastName,
          staffId: e.teacher.staffId,
        },
        roomOverride: e.roomOverride,
        effectiveRoom: resolveEffectiveRoom(e.roomOverride, result!.ClassSection.roomNumber),
      })),
    };
  }

  /**
   * Deletes a single schedule entry from a DRAFT schedule.
   * Strictly blocked if the parent schedule is PUBLISHED.
   */
  async deleteEntry(id: string) {
    const entry = await this.prisma.scheduleEntry.findUnique({
      where: { id },
      include: { classSchedule: true },
    });
    if (!entry) {
      throw new NotFoundException(`Schedule entry with ID '${id}' not found`);
    }

    if (entry.classSchedule.status === 'PUBLISHED') {
      throw new ConflictException(
        'Cannot delete an entry from a PUBLISHED schedule. The timetable must be in DRAFT status to delete individual slots.',
      );
    }

    await this.prisma.scheduleEntry.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Schedule entry deleted successfully',
    };
  }

  // ─── Consumer Schedule Methods (Sub-Stage 2.4) ──────────────────────────────

  /**
   * Retrieves the aggregated teaching schedule for an authenticated teacher.
   * Only includes PUBLISHED schedule entries where the teacher is the resolved instructor.
   */
  async getTeacherSchedule(teacherUserId: string, academicYearId?: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { userId: teacherUserId },
      select: { id: true, firstName: true, lastName: true, staffId: true },
    });
    if (!teacher) {
      throw new NotFoundException('Teacher profile not found for authenticated user');
    }
    return this.getTeacherScheduleById(teacher.id, academicYearId);
  }

  /**
   * Retrieves the aggregated teaching schedule for any teacher by teacherId (Admin inspection).
   * Only includes PUBLISHED schedule entries.
   */
  async getTeacherScheduleById(teacherId: string, academicYearId?: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, firstName: true, lastName: true, staffId: true },
    });
    if (!teacher) {
      throw new NotFoundException(`Teacher with ID '${teacherId}' not found`);
    }

    const year = await this.resolveAcademicYear(academicYearId);

    const entries = await this.prisma.scheduleEntry.findMany({
      where: {
        teacherId: teacher.id,
        academicYearId: year.id,
        classSchedule: { status: 'PUBLISHED' },
      },
      include: {
        period: true,
        subject: { select: { id: true, name: true, code: true } },
        classSchedule: {
          select: {
            ClassSection: {
              select: {
                id: true,
                name: true,
                roomNumber: true,
                GradeLevel: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { period: { periodNumber: 'asc' } }],
    });

    return {
      teacher: {
        id: teacher.id,
        fullName: `${teacher.firstName} ${teacher.lastName}`.trim(),
        staffId: teacher.staffId,
      },
      academicYear: {
        id: year.id,
        year: year.year,
        isCurrent: year.isCurrent,
      },
      totalWeeklyPeriods: entries.length,
      entries: entries.map((e) => {
        const section = e.classSchedule.ClassSection;
        return {
          id: e.id,
          dayOfWeek: toTitleCaseDay(e.dayOfWeek),
          periodId: e.periodId,
          period: {
            id: e.period.id,
            periodNumber: e.period.periodNumber,
            name: e.period.name,
            startTime: e.period.startTime,
            endTime: e.period.endTime,
            isBreak: e.period.isBreak,
          },
          subject: e.subject,
          classSection: {
            id: section.id,
            name: section.name,
            gradeLevel: section.GradeLevel?.name || null,
            effectiveRoom: resolveEffectiveRoom(e.roomOverride, section.roomNumber),
          },
        };
      }),
    };
  }

  /**
   * Retrieves modern structured timetable for an authenticated student.
   * Resolves canonical class assignment strictly from ACTIVE StudentEnrollment for the target AcademicYear.
   * Only returns PUBLISHED schedules.
   */
  async getStudentSchedule(studentUserId: string, academicYearId?: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId: studentUserId },
      select: { id: true, firstName: true, lastName: true, admissionNo: true },
    });
    if (!student) {
      throw new NotFoundException('Student profile not found for authenticated user');
    }

    const year = await this.resolveAcademicYear(academicYearId);

    // Canonical class assignment: strictly ACTIVE StudentEnrollment for target AcademicYear
    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: {
        studentId: student.id,
        academicYearId: year.id,
        status: 'ACTIVE',
      },
      include: {
        ClassSection: {
          select: {
            id: true,
            name: true,
            roomNumber: true,
            GradeLevel: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!enrollment || !enrollment.classSectionId || !enrollment.ClassSection) {
      return {
        student: {
          id: student.id,
          fullName: `${student.firstName} ${student.lastName}`.trim(),
          admissionNo: student.admissionNo,
        },
        academicYear: { id: year.id, year: year.year, isCurrent: year.isCurrent },
        classSection: null,
        periods: [],
        entries: [],
        message: 'No active enrollment or class assignment found for this academic year',
      };
    }

    const section = enrollment.ClassSection;

    const periods = await this.prisma.schedulePeriod.findMany({
      where: { academicYearId: year.id, isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { periodNumber: 'asc' }],
    });

    const schedule = await this.prisma.classSchedule.findUnique({
      where: {
        academicYearId_classSectionId: {
          academicYearId: year.id,
          classSectionId: section.id,
        },
      },
      include: {
        entries: {
          include: {
            period: true,
            subject: { select: { id: true, name: true, code: true } },
            teacher: { select: { id: true, firstName: true, lastName: true, staffId: true } },
          },
          orderBy: [{ dayOfWeek: 'asc' }, { period: { periodNumber: 'asc' } }],
        },
      },
    });

    if (!schedule || schedule.status !== 'PUBLISHED') {
      return {
        student: {
          id: student.id,
          fullName: `${student.firstName} ${student.lastName}`.trim(),
          admissionNo: student.admissionNo,
        },
        academicYear: { id: year.id, year: year.year, isCurrent: year.isCurrent },
        classSection: {
          id: section.id,
          name: section.name,
          gradeLevel: section.GradeLevel?.name || null,
          roomNumber: section.roomNumber,
        },
        periods,
        entries: [],
        message: 'No published timetable is currently available for this class',
      };
    }

    return {
      student: {
        id: student.id,
        fullName: `${student.firstName} ${student.lastName}`.trim(),
        admissionNo: student.admissionNo,
      },
      academicYear: { id: year.id, year: year.year, isCurrent: year.isCurrent },
      classSection: {
        id: section.id,
        name: section.name,
        gradeLevel: section.GradeLevel?.name || null,
        roomNumber: section.roomNumber,
      },
      periods,
      entries: schedule.entries.map((e) => ({
        id: e.id,
        dayOfWeek: toTitleCaseDay(e.dayOfWeek),
        periodId: e.periodId,
        period: {
          id: e.period.id,
          periodNumber: e.period.periodNumber,
          name: e.period.name,
          startTime: e.period.startTime,
          endTime: e.period.endTime,
          isBreak: e.period.isBreak,
        },
        subject: e.subject,
        teacher: {
          id: e.teacher.id,
          firstName: e.teacher.firstName,
          lastName: e.teacher.lastName,
        },
        roomOverride: e.roomOverride,
        effectiveRoom: resolveEffectiveRoom(e.roomOverride, section.roomNumber),
      })),
    };
  }

  /**
   * Shared legacy method used by StudentsService.getMySchedule and ParentsService.getChildSchedule.
   * Resolves active StudentEnrollment for the target AcademicYear and returns the legacy-compatible slot array.
   * Only returns PUBLISHED timetable entries.
   */
  async getLegacyStudentSchedule(studentId: string, academicYearId?: string) {
    const year = await this.resolveAcademicYear(academicYearId);

    // Canonical class assignment: strictly ACTIVE StudentEnrollment for target AcademicYear
    const enrollment = await this.prisma.studentEnrollment.findFirst({
      where: {
        studentId,
        academicYearId: year.id,
        status: 'ACTIVE',
      },
      select: {
        classSectionId: true,
        ClassSection: {
          select: { id: true, name: true, roomNumber: true },
        },
      },
    });

    if (!enrollment || !enrollment.classSectionId || !enrollment.ClassSection) {
      return [];
    }

    const section = enrollment.ClassSection;

    const schedule = await this.prisma.classSchedule.findUnique({
      where: {
        academicYearId_classSectionId: {
          academicYearId: year.id,
          classSectionId: section.id,
        },
      },
      include: {
        entries: {
          include: {
            period: true,
            subject: { select: { id: true, name: true, code: true } },
            teacher: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: [{ dayOfWeek: 'asc' }, { period: { periodNumber: 'asc' } }],
        },
      },
    });

    if (!schedule || schedule.status !== 'PUBLISHED') {
      return [];
    }

    return schedule.entries.map((e) => ({
      id: e.id,
      dayOfWeek: toTitleCaseDay(e.dayOfWeek),
      startTime: e.period.startTime,
      endTime: e.period.endTime,
      ClassSection: {
        name: section.name,
        roomNumber: resolveEffectiveRoom(e.roomOverride, section.roomNumber),
      },
      Subject: {
        id: e.subject.id,
        name: e.subject.name,
        code: e.subject.code,
      },
      Teacher: {
        id: e.teacher.id,
        firstName: e.teacher.firstName,
        lastName: e.teacher.lastName,
      },
    }));
  }
}
