import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAcademicYears,
  getGradeLevels,
  getSubjects,
  getGradeSubjects,
  createAcademicYear,
  activateAcademicYear,
  createGradeLevel,
  createSection,
  createSubject,
  assignSubjectToGrade,
  unassignSubjectFromGrade,
  AcademicYear,
  GradeLevel,
  Subject,
  GradeSubject,
  ClassSection,
} from '../api/academicStructure';

export const ACADEMIC_KEYS = {
  years: ['academicYears'] as const,
  grades: (academicYearId?: string) => ['gradeLevels', academicYearId ?? 'active'] as const,
  subjects: ['subjects'] as const,
  gradeSubjects: ['grade-subjects'] as const,
};

export function useAcademicYears() {
  return useQuery<AcademicYear[]>({
    queryKey: ACADEMIC_KEYS.years,
    queryFn: async () => {
      const res = await getAcademicYears();
      return Array.isArray(res) ? res : (res as any)?.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useGradeLevels(academicYearId?: string) {
  return useQuery<GradeLevel[]>({
    queryKey: ACADEMIC_KEYS.grades(academicYearId),
    queryFn: async () => {
      const res = await getGradeLevels(academicYearId);
      return Array.isArray(res) ? res : (res as any)?.data || [];
    },
    enabled: !!academicYearId && academicYearId.trim() !== '',
    staleTime: 5 * 60 * 1000,
  });
}

export function useSubjects() {
  return useQuery<Subject[]>({
    queryKey: ACADEMIC_KEYS.subjects,
    queryFn: async () => {
      const res = await getSubjects();
      return Array.isArray(res) ? res : (res as any)?.data || [];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useGradeSubjects() {
  return useQuery<GradeSubject[]>({
    queryKey: ACADEMIC_KEYS.gradeSubjects,
    queryFn: async () => {
      const res = await getGradeSubjects();
      return Array.isArray(res) ? res : (res as any)?.data || [];
    },
    staleTime: 10 * 60 * 1000,
  });
}
