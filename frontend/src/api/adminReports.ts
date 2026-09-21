import { api, downloadFile } from '../lib/api';

// ─── Types matching backend ReportsService responses ─────────────────────────

export type SectionSubmissionStatus = 'complete' | 'partial' | 'none';

export interface AdminSectionSummary {
  id: string;
  name: string;
  displayName: string;
  gradeLevelName: string;
  academicYearId: string | null;
  academicYearName?: string | null;
  homeroomTeacher: string | null;
  enrolledCount: number;
  totalSubjects: number;
  submittedSubjects: number;
  submissionStatus: SectionSubmissionStatus;
  conductCompleted?: number;
  conductStatus?: 'complete' | 'partial' | 'none';
  reviewStatus?: string | null;
  reviewId?: string | null;
  rejectionReason?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  /** UI-friendly label: 'Submitted' | 'Pending Review' | 'Draft' */
  status: string;
  submissionType?: 'roster' | 'report-cards' | 'both' | null;
  rosterSubmittedAt?: string | null;
  reportCardSubmittedAt?: string | null;
  isReportCardSubmitted?: boolean;
  isRosterSubmitted?: boolean;
}

export interface AdminRosterReview {
  id: string;
  classSectionId: string;
  academicYearId: string;
  homeroomTeacherId: string;
  status: 'DRAFT' | 'SUBMITTED_TO_ADMIN' | 'APPROVED' | 'REJECTED';
  submittedAt?: string | null;
  submittedById?: string | null;
  reviewedAt?: string | null;
  reviewedById?: string | null;
  rejectionReason?: string | null;
  conductData?: Record<string, any>;
  classSection?: {
    id: string;
    name: string;
    gradeLevel?: {
      id: string;
      name: string;
    };
  };
  academicYear?: {
    id: string;
    name: string;
  };
  homeroomTeacher?: {
    id: string;
    firstName: string;
    lastName: string;
    staffId?: string;
  };
  submittedBy?: {
    id: string;
    name: string;
    role: string;
  };
  reviewedBy?: {
    id: string;
    name: string;
    role: string;
  };
  submissionType?: 'roster' | 'report-cards' | 'both' | null;
  rosterSubmittedAt?: string | null;
  reportCardSubmittedAt?: string | null;
  isRosterSubmitted?: boolean;
  isReportCardSubmitted?: boolean;
}

export interface AdminReportCardStudent {
  studentId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  gender: string;
  age: number;
  academicYear: string;
  gradeLevel: string;
  classSectionName: string;
  homeroomTeacher: string;
  subjectResults: Array<{
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    term1: number | null;
    term2: number | null;
    term3: number | null;
    term4: number | null;
    sem1Avg: number | null;
    sem2Avg: number | null;
    yearlyAvg: number | null;
  }>;
  overallTotal: number;
  overallAverage: number;
  overallRank: number;
  absentDays: number;
  conduct: string;
}

export interface AdminRosterEntry {
  rank: number;
  studentId: string;
  admissionNo?: string;
  studentName: string;
  subjectScores: Record<string, number>;
  totalMarks: number;
  average: number;
  conduct?: string | null;
}

export interface SaveConductReceipt {
  success: boolean;
  reviewId: string;
  status: string;
  conductData: Record<string, string>;
}

export interface AdminSubmitReceipt {
  success: boolean;
  submittedAt: string;
  submittedBy: string;
  classSectionId: string;
  classSectionName: string;
  academicYear: string;
  type: 'roster' | 'report-cards' | 'both';
  enrolledStudents: number;
  submittedSubjects: number;
  message: string;
}

// ─── API calls ────────────────────────────────────────────────────────────────

export const getAdminSections = (academicYearId?: string) =>
  api.get<AdminSectionSummary[]>(
    `/admin/reports/sections${academicYearId ? `?academicYearId=${academicYearId}` : ''}`,
  );

export const getAdminSectionReportCards = (classSectionId: string, academicYearId: string) =>
  api.get<AdminReportCardStudent[]>(
    `/admin/reports/sections/${classSectionId}/report-cards?academicYearId=${academicYearId}`,
  );

export const getAdminSectionRoster = (classSectionId: string, academicYearId: string, term = 'TERM_1') =>
  api.get<AdminRosterEntry[]>(
    `/admin/reports/sections/${classSectionId}/roster?academicYearId=${academicYearId}&term=${term}`,
  );

/**
 * Homeroom teacher dispatches their section's report cards to admin.
 * Backend validates homeroom ownership + all subjects submitted.
 */
export const submitReportCardsToAdmin = (
  classSectionId: string,
  academicYearId: string,
) =>
  api.post<AdminSubmitReceipt>('/admin/reports/homeroom/submit-to-admin', {
    classSectionId,
    academicYearId,
    type: 'report-cards',
  });

/**
 * Homeroom teacher dispatches their section's consolidated roster to admin.
 * Backend validates homeroom ownership + all subjects submitted.
 */
export const submitRosterToAdmin = (
  classSectionId: string,
  academicYearId: string,
) =>
  api.post<AdminSubmitReceipt>('/admin/reports/homeroom/submit-to-admin', {
    classSectionId,
    academicYearId,
    type: 'roster',
  });

/**
 * Dispatch both roster and report cards in a single call.
 */
export const submitBothToAdmin = (
  classSectionId: string,
  academicYearId: string,
) =>
  api.post<AdminSubmitReceipt>('/admin/reports/homeroom/submit-to-admin', {
    classSectionId,
    academicYearId,
    type: 'both',
  });

/**
 * Homeroom teacher saves conduct grades for active students in section.
 */
export const saveHomeroomConduct = (
  classSectionId: string,
  academicYearId: string,
  conductData: Record<string, string>,
) =>
  api.post<SaveConductReceipt>('/admin/reports/homeroom/save-conduct', {
    classSectionId,
    academicYearId,
    conductData,
  });

/**
 * Admin approves a submitted class roster.
 */
export const approveRosterReview = (reviewId: string) =>
  api.post<{ success: boolean; message: string; review: any }>(
    `/admin/reports/roster-reviews/${reviewId}/approve`,
    {},
  );

/**
 * Admin rejects a submitted class roster with a required reason.
 */
export const rejectRosterReview = (reviewId: string, reason: string) =>
  api.post<{ success: boolean; message: string; review: any }>(
    `/admin/reports/roster-reviews/${reviewId}/reject`,
    { reason },
  );

/**
 * Admin reopens an approved class roster back to DRAFT with a reason.
 */
export const reopenRosterReview = (reviewId: string, reason: string) =>
  api.post<{ success: boolean; message: string; review: any }>(
    `/admin/reports/roster-reviews/${reviewId}/reopen`,
    { reason },
  );

/**
 * Admin gets the authoritative full 7-row calculation roster for review.
 */
export const getAdminFullRoster = (classSectionId: string, academicYearId: string) =>
  api.get<any>(
    `/admin/reports/sections/${classSectionId}/full-roster?academicYearId=${academicYearId}`,
  );

/**
 * Admin reviews queue query with optional filters.
 */
export const getAdminRosterReviews = (params?: {
  status?: string;
  academicYearId?: string;
  classSectionId?: string;
}) => {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.academicYearId) query.set('academicYearId', params.academicYearId);
  if (params?.classSectionId) query.set('classSectionId', params.classSectionId);
  const qs = query.toString();
  return api.get<any[]>(`/admin/reports/roster-reviews${qs ? `?${qs}` : ''}`);
};

/**
 * Download Admin Sections Summary PDF with active filters
 */
export const downloadAdminSectionsSummaryPdf = (
  academicYearId?: string,
  status?: string,
  search?: string,
) => {
  const query = new URLSearchParams();
  if (academicYearId) query.set('academicYearId', academicYearId);
  if (status && status !== 'All') query.set('status', status);
  if (search?.trim()) query.set('search', search.trim());
  const qs = query.toString();
  return downloadFile(`/admin/reports/sections/pdf${qs ? `?${qs}` : ''}`, 'Report_Summary.pdf');
};

/**
 * Download Section Compiled Report Cards PDF with optional search filter
 */
export const downloadAdminSectionReportCardsPdf = (
  classSectionId: string,
  academicYearId: string,
  search?: string,
  fallbackFilename?: string,
) => {
  const query = new URLSearchParams();
  query.set('academicYearId', academicYearId);
  if (search?.trim()) query.set('search', search.trim());
  const qs = query.toString();
  return downloadFile(
    `/admin/reports/sections/${classSectionId}/report-cards/pdf?${qs}`,
    fallbackFilename || 'Section_Report_Cards.pdf',
  );
};

/**
 * Download Admin Roster Review Queue Table as PDF
 */
export const downloadAdminRosterReviewsPdf = (
  academicYearId?: string,
  status?: string,
  search?: string,
) => {
  const query = new URLSearchParams();
  if (academicYearId) query.set('academicYearId', academicYearId);
  if (status && status !== 'All') query.set('status', status);
  if (search?.trim()) query.set('search', search.trim());
  const qs = query.toString();
  return downloadFile(`/admin/reports/roster-reviews/pdf${qs ? `?${qs}` : ''}`, 'Roster_Review_Queue.pdf');
};

/**
 * Download Official Approved Printable Roster as PDF
 */
export const downloadOfficialPrintRosterPdf = (
  classSectionId: string,
  academicYearId: string,
  fallbackFilename?: string,
) => {
  return downloadFile(
    `/admin/reports/roster/${classSectionId}/print/pdf?academicYearId=${academicYearId}`,
    fallbackFilename || 'Official_Roster.pdf',
  );
};

