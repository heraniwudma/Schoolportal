import { api, downloadFile } from '../lib/api';

export type DayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export type ScheduleStatus = 'DRAFT' | 'PUBLISHED';

export interface SchedulePeriod {
  id: string;
  academicYearId: string;
  periodNumber: number;
  name: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  _count?: {
    scheduleEntries: number;
  };
}

export interface TimetableSubject {
  id: string;
  name: string;
  code: string;
}

export interface TimetableTeacher {
  id: string;
  firstName: string;
  lastName: string;
  staffId: string | null;
}

export interface ScheduleEntry {
  id: string;
  dayOfWeek: string;
  periodId: string;
  period:
    | SchedulePeriod
    | {
        id: string;
        periodNumber: number;
        name: string;
        startTime: string;
        endTime: string;
        isBreak: boolean;
      };
  subjectId: string;
  subject: TimetableSubject;
  teacherId: string;
  teacher: TimetableTeacher;
  roomOverride: string | null;
  effectiveRoom: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SectionScheduleResponse {
  classSection: {
    id: string;
    name: string;
    roomNumber: string | null;
    gradeLevel?: {
      id: string;
      name: string;
      gradeNumber: number | null;
    };
  };
  academicYear: {
    id: string;
    year: string;
    isCurrent: boolean;
  };
  status: ScheduleStatus;
  publishedAt: string | null;
  updatedAt: string | null;
  periods: SchedulePeriod[];
  entries: ScheduleEntry[];
  totalEntries?: number;
  message?: string;
}

export interface ScheduleEntryItemPayload {
  dayOfWeek: DayOfWeek;
  periodId: string;
  subjectId: string;
  roomOverride?: string | null;
}

export interface BulkSaveSchedulePayload {
  academicYearId: string;
  entries: ScheduleEntryItemPayload[];
}

export interface PublishSchedulePayload extends BulkSaveSchedulePayload {
  expectedUpdatedAt?: string | null;
}

export interface TeacherSchedulePeriod {
  id: string;
  periodNumber: number;
  name: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
}

export interface TeacherScheduleSection {
  id: string;
  name: string;
  gradeLevel: string | null;
  effectiveRoom: string | null;
}

export interface TeacherScheduleLessonEntry {
  id: string;
  dayOfWeek: string;
  periodId: string;
  period: TeacherSchedulePeriod;
  subject: TimetableSubject;
  classSection: TeacherScheduleSection;
}

export interface TeacherScheduleResponse {
  teacher: {
    id: string;
    fullName: string;
    staffId: string | null;
  };
  academicYear: {
    id: string;
    year: string;
    isCurrent: boolean;
  };
  totalWeeklyPeriods: number;
  entries: TeacherScheduleLessonEntry[];
}

export interface StudentScheduleResponse {
  student: {
    id: string;
    fullName: string;
    admissionNo: string;
  };
  academicYear: {
    id: string;
    year: string;
    isCurrent: boolean;
  };
  classSection: {
    id: string;
    name: string;
    gradeLevel: string | null;
    roomNumber: string | null;
  } | null;
  periods: SchedulePeriod[];
  entries: ScheduleEntry[];
  message?: string;
}

export const timetableApi = {
  getPeriods: (academicYearId?: string, includeInactive = false): Promise<SchedulePeriod[]> => {
    const params = new URLSearchParams();
    if (academicYearId) params.append('academicYearId', academicYearId);
    if (includeInactive) params.append('includeInactive', 'true');
    const qs = params.toString();
    return api.get<SchedulePeriod[]>(`/timetable/periods${qs ? `?${qs}` : ''}`);
  },

  getSectionSchedule: (
    classSectionId: string,
    academicYearId?: string,
  ): Promise<SectionScheduleResponse> => {
    const qs = academicYearId ? `?academicYearId=${encodeURIComponent(academicYearId)}` : '';
    return api.get<SectionScheduleResponse>(
      `/timetable/section/${encodeURIComponent(classSectionId)}${qs}`,
    );
  },

  getTeacherSchedule: (academicYearId?: string): Promise<TeacherScheduleResponse> => {
    const qs = academicYearId ? `?academicYearId=${encodeURIComponent(academicYearId)}` : '';
    return api.get<TeacherScheduleResponse>(`/timetable/me/teacher${qs}`);
  },

  getStudentSchedule: (academicYearId?: string): Promise<StudentScheduleResponse> => {
    const qs = academicYearId ? `?academicYearId=${encodeURIComponent(academicYearId)}` : '';
    return api.get<StudentScheduleResponse>(`/timetable/me/student${qs}`);
  },

  saveDraftSchedule: (
    classSectionId: string,
    payload: BulkSaveSchedulePayload,
  ): Promise<SectionScheduleResponse> => {
    return api.put<SectionScheduleResponse>(
      `/timetable/section/${encodeURIComponent(classSectionId)}/draft`,
      payload,
    );
  },

  publishSchedule: (
    classSectionId: string,
    payload: PublishSchedulePayload,
  ): Promise<SectionScheduleResponse> => {
    return api.put<SectionScheduleResponse>(
      `/timetable/section/${encodeURIComponent(classSectionId)}/publish`,
      payload,
    );
  },

  deleteEntry: (entryId: string): Promise<{ message: string }> => {
    return api.delete<{ message: string }>(`/timetable/entries/${encodeURIComponent(entryId)}`);
  },

  downloadTeacherSchedulePdf: (params?: {
    academicYearId?: string;
    search?: string;
    day?: string;
  }): Promise<void> => {
    const qs = new URLSearchParams();
    if (params?.academicYearId) qs.append('academicYearId', params.academicYearId);
    if (params?.search) qs.append('search', params.search);
    if (params?.day) qs.append('day', params.day);
    const qStr = qs.toString();
    return downloadFile(`/timetable/me/teacher/pdf${qStr ? `?${qStr}` : ''}`, 'Teacher_Schedule.pdf');
  },

  downloadSectionSchedulePdf: (
    classSectionId: string,
    params?: {
      academicYearId?: string;
      search?: string;
      day?: string;
    },
  ): Promise<void> => {
    const qs = new URLSearchParams();
    if (params?.academicYearId) qs.append('academicYearId', params.academicYearId);
    if (params?.search) qs.append('search', params.search);
    if (params?.day) qs.append('day', params.day);
    const qStr = qs.toString();
    return downloadFile(
      `/timetable/section/${encodeURIComponent(classSectionId)}/pdf${qStr ? `?${qStr}` : ''}`,
      'Class_Schedule.pdf',
    );
  },

  downloadStudentSchedulePdf: (params?: {
    academicYearId?: string;
    search?: string;
  }): Promise<void> => {
    const qs = new URLSearchParams();
    if (params?.academicYearId) qs.append('academicYearId', params.academicYearId);
    if (params?.search) qs.append('search', params.search);
    const qStr = qs.toString();
    return downloadFile(`/timetable/me/student/pdf${qStr ? `?${qStr}` : ''}`, 'Student_Schedule.pdf');
  },
};

export const downloadTeacherSchedulePdf = timetableApi.downloadTeacherSchedulePdf;
export const downloadSectionSchedulePdf = timetableApi.downloadSectionSchedulePdf;
export const downloadStudentSchedulePdf = timetableApi.downloadStudentSchedulePdf;
