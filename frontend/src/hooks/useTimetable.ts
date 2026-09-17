import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  timetableApi,
  BulkSaveSchedulePayload,
  PublishSchedulePayload,
  SchedulePeriod,
  SectionScheduleResponse,
  TeacherScheduleResponse,
  StudentScheduleResponse,
} from '../api/timetable';

export const TIMETABLE_KEYS = {
  all: ['timetable'] as const,
  periods: (academicYearId?: string) => ['timetable', 'periods', academicYearId] as const,
  section: (classSectionId?: string, academicYearId?: string) =>
    ['timetable', 'section', classSectionId, academicYearId] as const,
  teacher: (academicYearId?: string) => ['timetable', 'teacher', academicYearId] as const,
  student: (academicYearId?: string) => ['timetable', 'student', academicYearId] as const,
};

export function useTimetablePeriods(academicYearId?: string, includeInactive = false) {
  return useQuery<SchedulePeriod[]>({
    queryKey: TIMETABLE_KEYS.periods(academicYearId),
    queryFn: () => timetableApi.getPeriods(academicYearId, includeInactive),
    enabled: !!academicYearId && academicYearId.trim() !== '',
    staleTime: 5 * 60 * 1000,
  });
}

export function useTeacherSchedule(academicYearId?: string) {
  return useQuery<TeacherScheduleResponse>({
    queryKey: TIMETABLE_KEYS.teacher(academicYearId),
    queryFn: () => timetableApi.getTeacherSchedule(academicYearId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useStudentSchedule(academicYearId?: string) {
  return useQuery<StudentScheduleResponse>({
    queryKey: TIMETABLE_KEYS.student(academicYearId),
    queryFn: () => timetableApi.getStudentSchedule(academicYearId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSectionSchedule(
  classSectionId?: string | null,
  academicYearId?: string | null,
) {
  return useQuery<SectionScheduleResponse>({
    queryKey: TIMETABLE_KEYS.section(classSectionId || undefined, academicYearId || undefined),
    queryFn: () => timetableApi.getSectionSchedule(classSectionId!, academicYearId || undefined),
    enabled: !!classSectionId && !!academicYearId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveDraftSchedule() {
  const queryClient = useQueryClient();

  return useMutation<
    SectionScheduleResponse,
    Error,
    { classSectionId: string; payload: BulkSaveSchedulePayload }
  >({
    mutationFn: ({ classSectionId, payload }) =>
      timetableApi.saveDraftSchedule(classSectionId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['timetable', 'section', variables.classSectionId],
      });
    },
  });
}

export function usePublishSchedule() {
  const queryClient = useQueryClient();

  return useMutation<
    SectionScheduleResponse,
    Error,
    { classSectionId: string; payload: PublishSchedulePayload }
  >({
    mutationFn: ({ classSectionId, payload }) =>
      timetableApi.publishSchedule(classSectionId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['timetable', 'section', variables.classSectionId],
      });
    },
  });
}

export function useDeleteTimetableEntry() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error, { entryId: string; classSectionId?: string }>({
    mutationFn: ({ entryId }) => timetableApi.deleteEntry(entryId),
    onSuccess: (_data, variables) => {
      if (variables.classSectionId) {
        queryClient.invalidateQueries({
          queryKey: ['timetable', 'section', variables.classSectionId],
        });
      }
    },
  });
}
