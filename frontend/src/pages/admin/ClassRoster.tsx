import React, { useState } from 'react';
import {
  Search,
  RefreshCw,
  ClipboardList,
  Eye,
  AlertCircle,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  Printer,
  RotateCcw,
  X,
  Check,
  Clock,
  Download,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useAcademicYear } from '../../context/AcademicYearContext';
import {
  getAdminSections,
  getAdminFullRoster,
  approveRosterReview,
  rejectRosterReview,
  reopenRosterReview,
  downloadAdminRosterReviewsPdf,
  downloadOfficialPrintRosterPdf,
  AdminSectionSummary,
} from '../../api/adminReports';
import { downloadConsolidatedRosterPdf } from '../../api/roster';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';


const PERIOD_ROWS = [
  { key: 'term1', label: '1st', bg: 'bg-white' },
  { key: 'term2', label: '2nd', bg: 'bg-white' },
  { key: 'sem1Avg', label: 'Ave1', bg: 'bg-blue-50/70 font-semibold text-blue-950' },
  { key: 'term3', label: '3rd', bg: 'bg-white' },
  { key: 'term4', label: '4th', bg: 'bg-white' },
  { key: 'sem2Avg', label: 'Ave2', bg: 'bg-blue-50/70 font-semibold text-blue-950' },
  { key: 'yearlyAverage', label: 'Yearly', bg: 'bg-emerald-50/70 font-bold text-emerald-950' },
] as const;

function fmt(v: number | null | undefined): string {
  return v != null ? (typeof v === 'number' ? v.toFixed(1) : String(v)) : '—';
}

function formatDate(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const ClassRoster = () => {
  const navigate = useNavigate();
  const { searchQuery: globalSearchQuery } = useOutletContext<{ searchQuery: string }>();
  const [localSearch, setLocalSearch] = useState('');
  const { academicYears, activeAcademicYearId, isLoading: isLoadingYears } = useAcademicYear();
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  const [selectedSection, setSelectedSection] = useState<AdminSectionSummary | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [modalStudentSearch, setModalStudentSearch] = useState('');

  // Sub-dialog states
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);

  const [isDownloadingQueue, setIsDownloadingQueue] = useState(false);
  const [isDownloadingSectionRoster, setIsDownloadingSectionRoster] = useState(false);
  const [isDownloadingOfficial, setIsDownloadingOfficial] = useState(false);

  const queryClient = useQueryClient();


  const academicYearId = selectedAcademicYearId || activeAcademicYearId;

  // 1. Fetch section summaries
  const {
    data: sections = [],
    isLoading: isLoadingSections,
    isRefetching: isRefetchingSections,
  } = useQuery({
    queryKey: ['adminSections', academicYearId],
    queryFn: () => getAdminSections(academicYearId),
    enabled: !!academicYearId,
  });

  // 2. Fetch authoritative full 7-row calculation roster for selected section
  const {
    data: fullRosterData,
    isLoading: isLoadingRoster,
    refetch: refetchFullRoster,
  } = useQuery({
    queryKey: ['adminFullRoster', selectedSection?.id, academicYearId],
    queryFn: () => getAdminFullRoster(selectedSection!.id, academicYearId),
    enabled: isReviewModalOpen && !!selectedSection?.id && !!academicYearId,
  });

  const rawSearch = localSearch || globalSearchQuery || '';
  const effectiveSearch = rawSearch.trim().toLowerCase();

  const filteredSections = sections.filter((sec) => {
    const teacherName = (sec.homeroomTeacher || '').toLowerCase();
    const sectionName = (sec.displayName || '').toLowerCase();
    const gradeName = (sec.gradeLevelName || '').toLowerCase();
    const statusText = (sec.status || '').toLowerCase();

    const matchesSearch =
      !effectiveSearch ||
      sectionName.includes(effectiveSearch) ||
      teacherName.includes(effectiveSearch) ||
      gradeName.includes(effectiveSearch) ||
      statusText.includes(effectiveSearch);

    const effectiveStatus = sec.reviewStatus || (
      sec.status === 'Submitted' ? 'SUBMITTED_TO_ADMIN' :
      sec.status === 'Approved' ? 'APPROVED' :
      sec.status === 'Rejected' ? 'REJECTED' : 'DRAFT'
    );

    let matchesStatus = true;
    if (statusFilter === 'SUBMITTED_TO_ADMIN') {
      matchesStatus = effectiveStatus === 'SUBMITTED_TO_ADMIN' || sec.status === 'Submitted';
    } else if (statusFilter === 'APPROVED') {
      matchesStatus = effectiveStatus === 'APPROVED' || sec.status === 'Approved';
    } else if (statusFilter === 'REJECTED') {
      matchesStatus = effectiveStatus === 'REJECTED' || sec.status === 'Rejected';
    } else if (statusFilter === 'DRAFT') {
      matchesStatus = effectiveStatus === 'DRAFT' || sec.status === 'Draft';
    }

    return matchesSearch && matchesStatus;
  });

  const handleReviewClick = (section: AdminSectionSummary) => {
    setSelectedSection(section);
    setModalStudentSearch('');
    setIsReviewModalOpen(true);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['adminSections', academicYearId] });
    if (selectedSection) {
      queryClient.invalidateQueries({ queryKey: ['adminFullRoster', selectedSection.id, academicYearId] });
      refetchFullRoster();
    }
  };

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleApprove = async () => {
    if (!selectedSection?.reviewId) {
      toast.error('Cannot approve: No active review ID found for this section.');
      return;
    }
    setIsActionLoading(true);
    try {
      await approveRosterReview(selectedSection.reviewId);
      toast.success('✓ Class roster approved successfully. Official printing is now unlocked.');
      setIsApproveConfirmOpen(false);
      // Update local section state
      setSelectedSection((prev) =>
        prev ? { ...prev, reviewStatus: 'APPROVED', status: 'Approved' } : null,
      );
      handleRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to approve roster');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedSection?.reviewId) {
      toast.error('Cannot reject: No active review ID found for this section.');
      return;
    }
    if (!rejectionReason.trim()) {
      toast.error('Rejection reason cannot be empty.');
      return;
    }
    setIsActionLoading(true);
    try {
      await rejectRosterReview(selectedSection.reviewId, rejectionReason.trim());
      toast.success('Roster rejected and returned to homeroom teacher with feedback.');
      setIsRejectModalOpen(false);
      setRejectionReason('');
      // Update local section state
      setSelectedSection((prev) =>
        prev
          ? {
              ...prev,
              reviewStatus: 'REJECTED',
              status: 'Rejected',
              rejectionReason: rejectionReason.trim(),
            }
          : null,
      );
      handleRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to reject roster');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReopen = async () => {
    if (!selectedSection?.reviewId) {
      toast.error('Cannot reopen: No active review ID found for this section.');
      return;
    }
    if (!reopenReason.trim()) {
      toast.error('Reopen reason cannot be empty.');
      return;
    }
    setIsActionLoading(true);
    try {
      await reopenRosterReview(selectedSection.reviewId, reopenReason.trim());
      toast.success('Roster successfully reopened to DRAFT status. Official print is locked.');
      setIsReopenModalOpen(false);
      setReopenReason('');
      // Update local section state
      setSelectedSection((prev) =>
        prev
          ? {
              ...prev,
              reviewStatus: 'DRAFT',
              status: 'Draft',
              rejectionReason: `Reopened by admin: ${reopenReason.trim()}`,
            }
          : null,
      );
      handleRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to reopen roster');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDownloadQueuePdf = async () => {
    if (filteredSections.length === 0) {
      toast.warning('No class rosters match the current filters to download.');
      return;
    }
    setIsDownloadingQueue(true);
    try {
      await downloadAdminRosterReviewsPdf(academicYearId, statusFilter, localSearch || globalSearchQuery);
      toast.success('Roster review queue PDF downloaded successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download roster review queue PDF');
    } finally {
      setIsDownloadingQueue(false);
    }
  };

  const handleDownloadSectionRosterPdf = async () => {
    if (!selectedSection) return;
    setIsDownloadingSectionRoster(true);
    try {
      await downloadConsolidatedRosterPdf(
        selectedSection.id,
        academicYearId,
        modalStudentSearch,
        `Roster_${selectedSection.displayName || selectedSection.name}.pdf`,
      );
      toast.success('Class roster PDF downloaded successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download class roster PDF');
    } finally {
      setIsDownloadingSectionRoster(false);
    }
  };

  const handleDownloadOfficialPdf = async (classSectionId: string) => {
    setIsDownloadingOfficial(true);
    try {
      await downloadOfficialPrintRosterPdf(classSectionId, academicYearId);
      toast.success('Official printable roster PDF downloaded successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download official roster PDF');
    } finally {
      setIsDownloadingOfficial(false);
    }
  };

  const currentReviewStatus = selectedSection?.reviewStatus || (

    selectedSection?.status === 'Submitted' ? 'SUBMITTED_TO_ADMIN' :
    selectedSection?.status === 'Approved' ? 'APPROVED' :
    selectedSection?.status === 'Rejected' ? 'REJECTED' : 'DRAFT'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900">Admin Roster Review</h2>
          <p className="text-sm text-gray-500">
            Review, approve, reject, or inspect class rosters submitted by Homeroom Teachers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadQueuePdf}
            disabled={isDownloadingQueue || isLoadingSections}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-900 text-white rounded-2xl text-xs font-bold uppercase tracking-wider hover:bg-blue-800 transition-all shadow-sm disabled:opacity-50"
            title="Download Roster Review Queue PDF"
          >
            {isDownloadingQueue ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download PDF
          </button>
          <button
            onClick={handleRefresh}
            disabled={isLoadingSections || isRefetchingSections}
            className="p-3 bg-gray-50 border border-gray-200 rounded-2xl text-gray-400 hover:text-blue-900 hover:bg-blue-50 transition-all disabled:opacity-50"
            title="Refresh Roster Data"
          >
            <RefreshCw
              className={cn(
                'w-4 h-4',
                (isLoadingSections || isRefetchingSections) && 'animate-spin text-blue-900',
              )}
            />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">
            Academic Year
          </label>
          <select
            value={academicYearId}
            onChange={(e) => setSelectedAcademicYearId(e.target.value)}
            disabled={isLoadingYears}
            className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-900/20 outline-none transition-all font-medium"
          >
            <option value="">Select Academic Year</option>
            {academicYears.map((y: any) => (
              <option key={y.id} value={y.id}>
                {y.year} {y.isCurrent ? '(Current)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">
            Search
          </label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search section, grade, or teacher..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full h-12 pl-11 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:bg-white transition-all font-medium"
            />
            {localSearch && (
              <button
                onClick={() => setLocalSearch('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200/50 transition-colors"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">
            Review Status
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-900/20 outline-none transition-all font-medium"
          >
            <option value="All">All Statuses</option>
            <option value="SUBMITTED_TO_ADMIN">Submitted to Admin</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="DRAFT">Draft</option>
          </select>
        </div>
      </div>

      {/* Review Queue Table */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/70 border-b border-gray-100">
                <th className="px-5 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  Section
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  Academic Year
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  Grade
                </th>
                <th className="px-5 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  Homeroom Teacher
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">
                  Students
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">
                  Subject Completion
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center">
                  Conduct Completion
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  Status
                </th>
                <th className="px-4 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                  Submitted At
                </th>
                <th className="px-5 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoadingSections ? (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-400 gap-2">
                      <RefreshCw className="w-8 h-8 animate-spin text-blue-900" />
                      <p className="text-sm font-semibold">Loading review queue...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredSections.length > 0 ? (
                filteredSections.map((sec) => {
                  const effectiveRevStatus = sec.reviewStatus || (
                    sec.status === 'Submitted' ? 'SUBMITTED_TO_ADMIN' :
                    sec.status === 'Approved' ? 'APPROVED' :
                    sec.status === 'Rejected' ? 'REJECTED' : 'DRAFT'
                  );
                  const isSubmitted = effectiveRevStatus === 'SUBMITTED_TO_ADMIN';
                  const isApproved = effectiveRevStatus === 'APPROVED';
                  const isRejected = effectiveRevStatus === 'REJECTED';

                  return (
                    <tr
                      key={sec.id}
                      className={cn(
                        'hover:bg-gray-50/70 transition-colors',
                        isSubmitted && 'bg-blue-50/30 font-medium',
                      )}
                    >
                      <td className="px-5 py-4 text-sm font-black text-gray-900">
                        {sec.displayName}
                      </td>
                      <td className="px-4 py-4 text-xs font-semibold text-gray-600">
                        {sec.academicYearName || '2025/2026'}
                      </td>
                      <td className="px-4 py-4 text-xs font-medium text-gray-700">
                        {sec.gradeLevelName || '—'}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-800 font-medium">
                        {sec.homeroomTeacher ? (
                          <span className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-blue-700" />
                            {sec.homeroomTeacher}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm font-bold text-center text-gray-900">
                        {sec.enrolledCount}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold',
                            sec.submissionStatus === 'complete'
                              ? 'bg-emerald-100 text-emerald-800'
                              : sec.submissionStatus === 'partial'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {sec.submittedSubjects}/{sec.totalSubjects}{' '}
                          {sec.submissionStatus === 'complete' ? 'Complete' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold',
                            sec.conductStatus === 'complete'
                              ? 'bg-emerald-100 text-emerald-800'
                              : sec.conductStatus === 'partial'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {sec.conductCompleted ?? 0}/{sec.enrolledCount}{' '}
                          {sec.conductStatus === 'complete' ? 'Complete' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            'px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5',
                            isApproved
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : isSubmitted
                              ? 'bg-blue-100 text-blue-800 border border-blue-300 animate-pulse'
                              : isRejected
                              ? 'bg-red-100 text-red-800 border border-red-300'
                              : 'bg-gray-100 text-gray-600 border border-gray-200',
                          )}
                        >
                          {isApproved && <CheckCircle2 className="w-3 h-3 text-emerald-700" />}
                          {isSubmitted && <Clock className="w-3 h-3 text-blue-700" />}
                          {isRejected && <AlertTriangle className="w-3 h-3 text-red-700" />}
                          {effectiveRevStatus === 'SUBMITTED_TO_ADMIN' ? 'Submitted' : effectiveRevStatus}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs font-medium text-gray-500 whitespace-nowrap">
                        {formatDate(sec.submittedAt)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => handleReviewClick(sec)}
                          className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 rounded-xl text-xs font-black uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 shadow-sm"
                        >
                          <Eye className="w-3.5 h-3.5" /> View Roster
                        </button>
                        {isApproved && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/homeroom/roster/paper?sectionId=${sec.id}&academicYearId=${academicYearId}`);
                            }}
                            className="ml-2 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-black uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 shadow-sm"
                            title="Print Official Roster"
                          >
                            <Printer className="w-3.5 h-3.5" /> Print
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-400">
                      <ClipboardList className="w-12 h-12 mb-3 opacity-20" />
                      <p className="text-sm font-bold text-gray-900">
                        {effectiveSearch ? 'No matching rosters found' : 'No rosters found'}
                      </p>
                      <p className="text-xs mt-1 text-gray-500">
                        {effectiveSearch ? (
                          <>
                            No class rosters match &ldquo;<span className="font-semibold text-gray-700">{rawSearch.trim()}</span>&rdquo;.
                          </>
                        ) : academicYearId ? (
                          'No class rosters match the selected filter.'
                        ) : (
                          'Please select an academic year to review rosters.'
                        )}
                      </p>
                      {localSearch && (
                        <button
                          onClick={() => setLocalSearch('')}
                          className="mt-3 px-3.5 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
                        >
                          Clear search
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── FULL ROSTER REVIEW MODAL ────────────────────────────────────────── */}
      {isReviewModalOpen && selectedSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-gray-950/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-7xl max-h-[95vh] shadow-2xl flex flex-col overflow-hidden border border-gray-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/80">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-black text-gray-900">
                    {selectedSection.displayName}
                  </h3>
                  <span
                    className={cn(
                      'px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5',
                      currentReviewStatus === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : currentReviewStatus === 'SUBMITTED_TO_ADMIN'
                        ? 'bg-blue-100 text-blue-800 border border-blue-300'
                        : currentReviewStatus === 'REJECTED'
                        ? 'bg-red-100 text-red-800 border border-red-300'
                        : 'bg-gray-100 text-gray-600 border border-gray-300',
                    )}
                  >
                    {currentReviewStatus === 'APPROVED' && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    {currentReviewStatus === 'SUBMITTED_TO_ADMIN' && (
                      <Clock className="w-3.5 h-3.5 text-blue-600" />
                    )}
                    {currentReviewStatus === 'REJECTED' && (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    )}
                    {currentReviewStatus === 'SUBMITTED_TO_ADMIN'
                      ? 'Submitted to Admin'
                      : currentReviewStatus}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 font-medium">
                  Homeroom: {selectedSection.homeroomTeacher || 'Unassigned'} •{' '}
                  {selectedSection.enrolledCount} Enrolled Students • Year:{' '}
                  {selectedSection.academicYearName || '2025/2026'}
                  {selectedSection.submittedAt && ` • Submitted: ${formatDate(selectedSection.submittedAt)}`}
                  {selectedSection.reviewedAt && ` • Reviewed: ${formatDate(selectedSection.reviewedAt)}`}
                </p>
              </div>

              {/* Top Action Buttons */}
              <div className="flex items-center gap-2.5">
                <button
                  onClick={handleDownloadSectionRosterPdf}
                  disabled={isDownloadingSectionRoster || isLoadingRoster}
                  className="px-3.5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  title="Download Consolidated Class Roster as PDF"
                >
                  {isDownloadingSectionRoster ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Download PDF
                </button>

                {currentReviewStatus === 'SUBMITTED_TO_ADMIN' && (
                  <>
                    <button
                      onClick={() => setIsRejectModalOpen(true)}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" /> Reject Roster
                    </button>
                    <button
                      onClick={() => setIsApproveConfirmOpen(true)}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve Roster
                    </button>
                  </>
                )}

                {currentReviewStatus === 'APPROVED' && (
                  <>
                    <button
                      onClick={() => handleDownloadOfficialPdf(selectedSection.id)}
                      disabled={isDownloadingOfficial}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                      title="Download Official Certified Paper Roster PDF"
                    >
                      {isDownloadingOfficial ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      Official PDF
                    </button>
                    <button
                      onClick={() =>
                        navigate(
                          `/homeroom/roster/paper?sectionId=${selectedSection.id}&academicYearId=${academicYearId}`,
                        )
                      }
                      className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print Official Roster
                    </button>
                    <button
                      onClick={() => setIsReopenModalOpen(true)}
                      className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reopen Roster
                    </button>
                  </>
                )}

                <button
                  onClick={() => setIsReviewModalOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-200/60 transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Rejection / Status Alerts */}
            {currentReviewStatus === 'REJECTED' && selectedSection.rejectionReason && (
              <div className="px-6 py-3.5 bg-red-50 border-b border-red-200 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-red-900 uppercase tracking-wide">
                    Roster Rejected — Active Feedback:
                  </p>
                  <p className="text-sm text-red-800 font-semibold mt-0.5">
                    "{selectedSection.rejectionReason}"
                  </p>
                  <p className="text-xs text-red-600 mt-1">
                    Returned to homeroom teacher for corrections. Homeroom teacher can edit conduct and resubmit.
                  </p>
                </div>
              </div>
            )}

            {currentReviewStatus === 'APPROVED' && (
              <div className="px-6 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-900 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Approved & Locked. Official printing is active.</span>
                </div>
                <span className="text-[11px] text-emerald-700 font-medium">
                  Locked against further grade/conduct edits unless reopened.
                </span>
              </div>
            )}

            {/* Modal Sub-bar with Student Search */}
            {fullRosterData && fullRosterData.students && fullRosterData.students.length > 0 && (
              <div className="px-6 py-3 bg-white border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs font-semibold text-gray-500">
                  Showing{' '}
                  <span className="font-bold text-gray-900">
                    {
                      fullRosterData.students.filter((student: any) => {
                        if (!modalStudentSearch.trim()) return true;
                        const q = modalStudentSearch.trim().toLowerCase();
                        const name = (student.studentName || '').toLowerCase();
                        const adm = (student.admissionNo || '').toLowerCase();
                        return name.includes(q) || adm.includes(q);
                      }).length
                    }
                  </span>{' '}
                  of {fullRosterData.students.length} students
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search student by name or ID..."
                    value={modalStudentSearch}
                    onChange={(e) => setModalStudentSearch(e.target.value)}
                    className="w-full h-9 pl-9.5 pr-8 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:bg-white transition-all font-medium"
                  />
                  {modalStudentSearch && (
                    <button
                      onClick={() => setModalStudentSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full"
                      title="Clear student search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Main Modal Body: Authoritative 7-Row Table */}
            <div className="p-6 overflow-y-auto flex-1">
              {isLoadingRoster ? (
                <div className="py-24 text-center text-gray-400">
                  <RefreshCw className="w-10 h-10 animate-spin mx-auto mb-3 text-indigo-900" />
                  <p className="text-sm font-bold text-gray-700">Loading authoritative 7-row roster...</p>
                </div>
              ) : !fullRosterData || fullRosterData.students.length === 0 ? (
                <div className="border border-gray-200 rounded-2xl p-16 text-center text-gray-500">
                  <AlertCircle className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="font-bold text-gray-900 text-base">No Enrolled Students</p>
                  <p className="text-sm mt-1 text-gray-500">
                    No active students are enrolled in {selectedSection.displayName} for this academic year.
                  </p>
                </div>
              ) : (() => {
                const filteredModalStudents = fullRosterData.students.filter((student: any) => {
                  if (!modalStudentSearch.trim()) return true;
                  const q = modalStudentSearch.trim().toLowerCase();
                  const name = (student.studentName || '').toLowerCase();
                  const adm = (student.admissionNo || '').toLowerCase();
                  return name.includes(q) || adm.includes(q);
                });

                if (filteredModalStudents.length === 0) {
                  return (
                    <div className="border border-gray-200 rounded-2xl p-16 text-center text-gray-500">
                      <Search className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                      <p className="font-bold text-gray-900 text-sm">
                        No students found matching &ldquo;{modalStudentSearch.trim()}&rdquo;
                      </p>
                      <p className="text-xs mt-1 text-gray-500">
                        Check the student name or admission number spelling.
                      </p>
                      <button
                        onClick={() => setModalStudentSearch('')}
                        className="mt-3 px-3.5 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
                      >
                        Clear search
                      </button>
                    </div>
                  );
                }

                return (
                <div className="border border-gray-300 rounded-2xl overflow-x-auto shadow-sm">
                  <table className="min-w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-900 text-white">
                        <th className="border border-gray-700 p-2.5 text-center w-12 font-bold">No</th>
                        <th className="border border-gray-700 p-2.5 text-center w-28 font-bold">Adm No</th>
                        <th className="border border-gray-700 p-2.5 text-left min-w-[170px] font-bold">Student Name</th>
                        <th className="border border-gray-700 p-2.5 text-center w-12 font-bold">Age</th>
                        <th className="border border-gray-700 p-2.5 text-center w-12 font-bold">Sex</th>
                        <th className="border border-gray-700 p-2.5 text-center w-16 bg-gray-800 font-bold">Period</th>

                        {/* Dynamic Subject Columns */}
                        {fullRosterData.subjects.map((subj: any) => (
                          <th
                            key={subj.id}
                            className="border border-gray-700 p-2 text-center min-w-[70px] font-bold"
                          >
                            <div>{subj.name}</div>
                            <div className="text-[10px] text-gray-300 font-normal">{subj.code}</div>
                          </th>
                        ))}

                        {/* Summary Columns Spanned Across 7 Rows */}
                        <th className="border border-gray-700 p-2 text-center w-14 bg-gray-800 font-bold">Sum</th>
                        <th className="border border-gray-700 p-2 text-center w-14 bg-gray-800 font-bold">Avg</th>
                        <th className="border border-gray-700 p-2 text-center w-12 bg-gray-800 font-black">Rank</th>
                        <th className="border border-gray-700 p-2 text-center w-12 font-bold">Abs</th>
                        <th className="border border-gray-700 p-2 text-center w-14 font-bold">Conduct</th>
                      </tr>
                    </thead>

                    {filteredModalStudents.map((student: any, sIdx: number) => {
                      const isStudentComplete = student.isComplete !== false;
                      const subjectScoreMap = new Map(
                        student.subjectScores.map((sc: any) => [sc.subjectId, sc]),
                      );

                      return (
                        <tbody
                          key={student.studentId}
                          className="border-b-2 border-gray-400 hover:bg-gray-50/40 transition-colors"
                        >
                          {PERIOD_ROWS.map((period, pIdx) => {
                            const isFirstRow = pIdx === 0;

                            return (
                              <tr key={`${student.studentId}-${period.key}`} className={period.bg}>
                                {/* Spanned Student Identifiers */}
                                {isFirstRow && (
                                  <>
                                    <td
                                      rowSpan={7}
                                      className="border border-gray-300 p-2.5 text-center font-bold text-gray-900 bg-gray-50/60 align-middle"
                                    >
                                      {sIdx + 1}
                                    </td>
                                    <td
                                      rowSpan={7}
                                      className="border border-gray-300 p-2.5 text-center font-mono text-xs text-gray-700 align-middle"
                                    >
                                      {student.admissionNo || '—'}
                                    </td>
                                    <td
                                      rowSpan={7}
                                      className="border border-gray-300 p-2.5 text-left font-bold text-gray-900 align-middle"
                                    >
                                      <div>{student.studentName}</div>
                                      {!isStudentComplete && (
                                        <div
                                          className="text-[10px] text-red-600 font-bold mt-1 inline-flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded border border-red-200"
                                          title={`Missing: ${student.missingSubjects?.join(', ') || 'Incomplete subject results'}`}
                                        >
                                          ⚠ INCOMPLETE
                                        </div>
                                      )}
                                    </td>
                                    <td
                                      rowSpan={7}
                                      className="border border-gray-300 p-2.5 text-center font-medium text-gray-800 align-middle"
                                    >
                                      {student.age != null ? student.age : '—'}
                                    </td>
                                    <td
                                      rowSpan={7}
                                      className="border border-gray-300 p-2.5 text-center text-gray-700 align-middle"
                                    >
                                      {student.sex || '—'}
                                    </td>
                                  </>
                                )}

                                {/* Period Label */}
                                <td className="border border-gray-200 p-2 text-center font-bold text-[11px] text-gray-700">
                                  {period.label}
                                </td>

                                {/* Dynamic Subject Marks */}
                                {fullRosterData.subjects.map((subj: any) => {
                                  const sc = subjectScoreMap.get(subj.id);
                                  const rawVal = sc ? (sc as any)[period.key] : null;
                                  const displayVal = fmt(rawVal);

                                  return (
                                    <td
                                      key={subj.id}
                                      className={`border border-gray-200 p-2 text-center text-xs ${
                                        period.key === 'yearlyAverage'
                                          ? 'font-bold text-emerald-950'
                                          : period.key.includes('Avg')
                                          ? 'font-semibold text-blue-950'
                                          : 'text-gray-800'
                                      }`}
                                    >
                                      {displayVal}
                                    </td>
                                  );
                                })}

                                {/* Summary Metrics Spanned Across 7 Rows */}
                                {isFirstRow && (
                                  <>
                                    <td
                                      rowSpan={7}
                                      className="border border-gray-300 p-2.5 text-center font-bold text-gray-900 bg-gray-50/60 align-middle"
                                    >
                                      {isStudentComplete && student.sum != null ? student.sum : '—'}
                                    </td>
                                    <td
                                      rowSpan={7}
                                      className="border border-gray-300 p-2.5 text-center font-bold text-gray-900 bg-gray-50/60 align-middle"
                                    >
                                      {isStudentComplete && student.average != null
                                        ? student.average.toFixed(1)
                                        : '—'}
                                    </td>
                                    <td
                                      rowSpan={7}
                                      className="border border-gray-300 p-2.5 text-center font-black text-sm text-indigo-950 bg-indigo-50/40 align-middle"
                                    >
                                      {isStudentComplete && student.rank != null ? `#${student.rank}` : '—'}
                                    </td>
                                    <td
                                      rowSpan={7}
                                      className="border border-gray-300 p-2.5 text-center text-gray-700 align-middle"
                                    >
                                      {student.absentDays}
                                    </td>
                                    <td
                                      rowSpan={7}
                                      className="border border-gray-300 p-2 text-center align-middle font-bold"
                                    >
                                      <span
                                        className={cn(
                                          'inline-block px-3 py-1 rounded-md text-xs font-black border',
                                          student.conduct === 'A'
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                            : student.conduct === 'B'
                                            ? 'bg-blue-50 text-blue-800 border-blue-300'
                                            : student.conduct === 'C'
                                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                                            : 'bg-gray-100 text-gray-400 border-gray-200',
                                        )}
                                        title="Assigned by Homeroom Teacher"
                                      >
                                        {student.conduct || '—'}
                                      </span>
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      );
                    })}
                  </table>
                </div>
              );
            })()}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200 flex justify-between items-center bg-gray-50">
              <span className="text-xs text-gray-500 font-medium">
                {fullRosterData?.students?.length || 0} active students • Authoritative calculation from CalculationService
              </span>
              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── APPROVE CONFIRMATION DIALOG ─────────────────────────────────────── */}
      {isApproveConfirmOpen && selectedSection && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-gray-950/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-200">
            <div className="flex items-center gap-3 text-emerald-700 mb-4">
              <CheckCircle2 className="w-6 h-6" />
              <h4 className="text-lg font-black text-gray-900">Approve Class Roster?</h4>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 text-xs space-y-2 border border-gray-100 text-gray-700">
              <p><strong>Section:</strong> {selectedSection.displayName}</p>
              <p><strong>Academic Year:</strong> {selectedSection.academicYearName || '2025/2026'}</p>
              <p><strong>Homeroom Teacher:</strong> {selectedSection.homeroomTeacher || 'Unassigned'}</p>
              <p><strong>Students:</strong> {selectedSection.enrolledCount}</p>
            </div>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
              <p className="font-bold">Important Notice:</p>
              <p className="mt-0.5">
                Once approved, the roster will be locked and official printing will become available.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsApproveConfirmOpen(false)}
                disabled={isActionLoading}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={isActionLoading}
                className="px-5 py-2 text-xs font-black uppercase tracking-wider bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow transition-colors disabled:opacity-50"
              >
                {isActionLoading ? 'Approving…' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REJECT DIALOG ───────────────────────────────────────────────────── */}
      {isRejectModalOpen && selectedSection && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-gray-950/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-200">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <AlertTriangle className="w-6 h-6" />
              <h4 className="text-lg font-black text-gray-900">Reject Class Roster</h4>
            </div>

            <p className="text-xs text-gray-600 mb-3">
              Please provide clear instructions for the homeroom teacher regarding what needs correction:
            </p>

            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-1">
                Rejection Reason *
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., Please correct the missing Physics mark for Student 002."
                rows={4}
                className="w-full p-3 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all font-medium"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsRejectModalOpen(false);
                  setRejectionReason('');
                }}
                disabled={isActionLoading}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isActionLoading || !rejectionReason.trim()}
                className="px-5 py-2 text-xs font-black uppercase tracking-wider bg-red-600 hover:bg-red-700 text-white rounded-xl shadow transition-colors disabled:opacity-50"
              >
                {isActionLoading ? 'Rejecting…' : 'Reject Roster'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── REOPEN DIALOG ───────────────────────────────────────────────────── */}
      {isReopenModalOpen && selectedSection && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-gray-950/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-200">
            <div className="flex items-center gap-3 text-amber-600 mb-4">
              <RotateCcw className="w-6 h-6" />
              <h4 className="text-lg font-black text-gray-900">Reopen Approved Roster</h4>
            </div>

            <p className="text-xs text-gray-600 mb-3">
              Reopening will transition this roster back to <strong>DRAFT</strong>, re-enable conduct and grade editing, and lock official printing:
            </p>

            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-widest block mb-1">
                Reopen Reason *
              </label>
              <textarea
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="e.g., Correction required after administrative review."
                rows={3}
                className="w-full p-3 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all font-medium"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsReopenModalOpen(false);
                  setReopenReason('');
                }}
                disabled={isActionLoading}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReopen}
                disabled={isActionLoading || !reopenReason.trim()}
                className="px-5 py-2 text-xs font-black uppercase tracking-wider bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow transition-colors disabled:opacity-50"
              >
                {isActionLoading ? 'Reopening…' : 'Reopen Roster'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassRoster;
