import { api, downloadFile } from '../lib/api';

export interface RosterStudent {
  id: string;
  enrollmentDate: string;
  status: string;
  student: {
    id: string;
    admissionNo: string;
    firstName: string;
    lastName: string;
    gender: string;
    avatarUrl?: string;
  };
  attendancePercentage: number | null;
  examStatus: string;
}

export interface ClassSummary {
  name: string;
  roomNumber: string;
  capacity: number;
  gradeName: string;
  totalEnrolled: number;
}

export interface EnrolledStudent {
  id: string;
  admissionNo: string | null;
  loginId: string | null;
  firstName: string;
  lastName: string;
  name: string;
}

export const getRoster = (academicYearId: string, classSectionId: string) => {
  return api.get<RosterStudent[]>(`/roster?academicYearId=${academicYearId}&classSectionId=${classSectionId}`);
};

export const getRosterSummary = (academicYearId: string, classSectionId: string) => {
  return api.get<ClassSummary>(`/roster/summary?academicYearId=${academicYearId}&classSectionId=${classSectionId}`);
};

export const getEnrolledStudents = (academicYearId: string, classSectionId: string) => {
  const params = new URLSearchParams({ academicYearId, classSectionId });
  return api.get<EnrolledStudent[]>(`/roster/enrolled-students?${params.toString()}`);
};

export const enrollStudent = (data: { studentId: string; academicYearId: string; gradeLevelId: string; classSectionId: string; enrollmentDate: string; status?: string }) => {
  return api.post<any>('/roster/enroll', data);
};

export const updateStudentConduct = (studentId: string, classSectionId: string, academicYearId: string, conduct: string) => {
  return api.patch<any>(`/roster/students/${studentId}/conduct`, { classSectionId, academicYearId, conduct });
};

/**
 * Download Consolidated Class Roster as vector PDF
 */
export const downloadConsolidatedRosterPdf = (
  classSectionId: string,
  academicYearId: string,
  search?: string,
  fallbackFilename?: string,
) => {
  const query = new URLSearchParams();
  query.set('classSectionId', classSectionId);
  query.set('academicYearId', academicYearId);
  if (search?.trim()) query.set('search', search.trim());
  const qs = query.toString();
  return downloadFile(`/roster/consolidated/pdf?${qs}`, fallbackFilename || 'Class_Roster.pdf');
};

