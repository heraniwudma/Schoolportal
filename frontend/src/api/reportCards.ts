import { api, downloadFile } from '../lib/api';

export interface ClassSection {
  id: string;
  name: string;
}

export interface Term {
  id: string;
  name: string;
}

export interface StudentBasicInfo {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  gender: string;
  avatarUrl: string | null;
}

export interface ReportCardSubject {
  name: string;
  code: string;
  score: number;
  maxScore: number;
  percentage: number;
  gradeLetter: string;
}

export interface ReportCardResponse {
  student: {
    admissionNo: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  };
  academicInfo: {
    academicYear: string;
    grade: string;
    section: string;
    term: string;
  };
  subjects: ReportCardSubject[];
  overall: {
    percentage: number;
    gradeLetter: string;
  };
  attendance: {
    present: number;
    absent: number;
    total: number;
    percentage: number;
  };
}

export const getTermsForReportCards = (academicYearId: string) => 
  api.get<Term[]>(`/report-cards/filters/terms?academicYearId=${academicYearId}`);

export const getStudentsForReportCards = (classSectionId: string, search?: string) => {
  let url = `/report-cards/students?classSectionId=${classSectionId}`;
  if (search) url += `&search=${encodeURIComponent(search)}`;
  return api.get<StudentBasicInfo[]>(url);
};

export const getReportCard = (studentId: string, classSectionId: string, termId: string) => 
  api.get<ReportCardResponse>(`/report-cards/student/${studentId}?classSectionId=${classSectionId}&termId=${termId}`);

/**
 * Download Compiled Report Cards as vector PDF
 */
export const downloadCompiledReportCardsPdf = (
  classSectionId: string,
  academicYearId: string,
  search?: string,
  studentIds?: string[],
  fallbackFilename?: string,
) => {
  const query = new URLSearchParams();
  query.set('classSectionId', classSectionId);
  query.set('academicYearId', academicYearId);
  if (search?.trim()) query.set('search', search.trim());
  if (studentIds && studentIds.length > 0) query.set('studentIds', studentIds.join(','));
  const qs = query.toString();
  return downloadFile(`/report-cards/compiled/pdf?${qs}`, fallbackFilename || 'Student_Report_Cards.pdf');
};

