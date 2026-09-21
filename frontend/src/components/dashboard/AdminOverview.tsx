import React, { useEffect, useState } from 'react';
import { 
  Users, 
  UserCheck, 
  BookOpen, 
  Calendar,
  Layers,
  GraduationCap,
  Shield,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ClipboardList,
  FileCheck,
  Eye,
  Check,
  X,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Printer,
  Award,
  RefreshCw,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import StatCard from './StatCard';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useGradeLevels } from '../../hooks/useAcademicStructure';
import { useUsers } from '../../hooks/useUsers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAdminSections,
  getAdminFullRoster,
  getAdminSectionReportCards,
  approveRosterReview,
  rejectRosterReview,
  reopenRosterReview,
  AdminSectionSummary,
  AdminReportCardStudent,
} from '../../api/adminReports';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

const AdminOverview: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeAcademicYear, activeAcademicYearId, isLoading: isLoadingYear } = useAcademicYear();
  const { data: gradeLevels = [], isLoading: isLoadingGrades } = useGradeLevels(activeAcademicYearId);
  const { stats, isStatsLoading, fetchStats } = useUsers();

  // Review Queue state
  const [activeTab, setActiveTab] = useState<'roster' | 'reportCards'>('roster');
  const [showPendingOnly, setShowPendingOnly] = useState(false);

  // Review Modals state
  const [selectedRosterSection, setSelectedRosterSection] = useState<AdminSectionSummary | null>(null);
  const [selectedReportCardSection, setSelectedReportCardSection] = useState<AdminSectionSummary | null>(null);

  // Approval / Rejection / Reopen action state
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<'roster' | 'reportCard' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  // Fetch sections and their review statuses for the active academic year
  const {
    data: sections = [],
    isLoading: isLoadingSections,
    isRefetching: isRefetchingSections,
    refetch: refetchSections,
  } = useQuery({
    queryKey: ['adminSections', activeAcademicYearId],
    queryFn: () => getAdminSections(activeAcademicYearId),
    enabled: !!activeAcademicYearId,
  });

  // Query full 7-row calculation roster when a roster section is selected
  const {
    data: fullRosterData,
    isLoading: isLoadingRoster,
  } = useQuery({
    queryKey: ['adminFullRoster', selectedRosterSection?.id, activeAcademicYearId],
    queryFn: () => getAdminFullRoster(selectedRosterSection!.id, activeAcademicYearId),
    enabled: !!selectedRosterSection?.id && !!activeAcademicYearId,
  });

  // Query compiled report cards when a report card section is selected
  const {
    data: reportCards = [],
    isLoading: isLoadingReportCards,
  } = useQuery({
    queryKey: ['adminSectionReportCards', selectedReportCardSection?.id, activeAcademicYearId],
    queryFn: () => getAdminSectionReportCards(selectedReportCardSection!.id, activeAcademicYearId),
    enabled: !!selectedReportCardSection?.id && !!activeAcademicYearId,
  });

  // Roster Submissions filter & pending count
  const rosterSections = sections.filter((s) => {
    if (showPendingOnly) {
      return s.reviewStatus === 'SUBMITTED_TO_ADMIN' || (s.status === 'Submitted' && s.reviewStatus !== 'APPROVED' && s.reviewStatus !== 'REJECTED');
    }
    return true;
  });
  const pendingRosterCount = sections.filter(
    (s) => s.reviewStatus === 'SUBMITTED_TO_ADMIN' || (s.status === 'Submitted' && s.reviewStatus !== 'APPROVED' && s.reviewStatus !== 'REJECTED'),
  ).length;

  // Report Card Submissions filter & pending count
  const reportCardSections = sections.filter((s) => {
    if (showPendingOnly) {
      return (s.isReportCardSubmitted && s.reviewStatus === 'SUBMITTED_TO_ADMIN') ||
        (s.reviewStatus === 'SUBMITTED_TO_ADMIN' && (s.submissionType === 'report-cards' || s.submissionType === 'both'));
    }
    return true;
  });
  const pendingReportCardCount = sections.filter(
    (s) => (s.isReportCardSubmitted && s.reviewStatus === 'SUBMITTED_TO_ADMIN') ||
      (s.reviewStatus === 'SUBMITTED_TO_ADMIN' && (s.submissionType === 'report-cards' || s.submissionType === 'both')),
  ).length;

  const totalPendingReviews = pendingRosterCount + pendingReportCardCount;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    await refetchSections();
    toast.success('Review queue refreshed');
  };

  const handleApprove = async () => {
    const section = actionTarget === 'roster' ? selectedRosterSection : selectedReportCardSection;
    if (!section?.reviewId) {
      toast.error('No review ID found for this section');
      return;
    }
    setIsActionLoading(true);
    try {
      await approveRosterReview(section.reviewId);
      toast.success(
        actionTarget === 'roster'
          ? '✓ Roster approved successfully!'
          : '✓ Report cards approved successfully!',
      );
      setIsApproveConfirmOpen(false);
      if (actionTarget === 'roster') setSelectedRosterSection(null);
      if (actionTarget === 'reportCard') setSelectedReportCardSection(null);
      queryClient.invalidateQueries({ queryKey: ['adminSections', activeAcademicYearId] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to approve review');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReject = async () => {
    const section = actionTarget === 'roster' ? selectedRosterSection : selectedReportCardSection;
    if (!section?.reviewId) {
      toast.error('No review ID found for this section');
      return;
    }
    if (!rejectionReason.trim()) {
      toast.error('Please enter a rejection reason for the teacher');
      return;
    }
    setIsActionLoading(true);
    try {
      await rejectRosterReview(section.reviewId, rejectionReason.trim());
      toast.success(
        actionTarget === 'roster'
          ? 'Roster returned to Homeroom teacher with feedback.'
          : 'Report cards returned to Homeroom teacher with feedback.',
      );
      setIsRejectModalOpen(false);
      setRejectionReason('');
      if (actionTarget === 'roster') setSelectedRosterSection(null);
      if (actionTarget === 'reportCard') setSelectedReportCardSection(null);
      queryClient.invalidateQueries({ queryKey: ['adminSections', activeAcademicYearId] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to reject review');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleReopen = async () => {
    const section = actionTarget === 'roster' ? selectedRosterSection : selectedReportCardSection;
    if (!section?.reviewId) {
      toast.error('No review ID found for this section');
      return;
    }
    if (!reopenReason.trim()) {
      toast.error('Please enter a reason for reopening');
      return;
    }
    setIsActionLoading(true);
    try {
      await reopenRosterReview(section.reviewId, reopenReason.trim());
      toast.success('Review reopened to DRAFT status.');
      setIsReopenModalOpen(false);
      setReopenReason('');
      if (actionTarget === 'roster') setSelectedRosterSection(null);
      if (actionTarget === 'reportCard') setSelectedReportCardSection(null);
      queryClient.invalidateQueries({ queryKey: ['adminSections', activeAcademicYearId] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to reopen review');
    } finally {
      setIsActionLoading(false);
    }
  };

  const activeGradeLevels = gradeLevels.filter((g) => g.ClassSection && g.ClassSection.length > 0);
  const totalSections = activeGradeLevels.reduce((acc, g) => acc + (g.ClassSection?.length || 0), 0);
  const totalEnrollments = activeGradeLevels.reduce((acc, g) => acc + (g.StudentEnrollment?.length || g._count?.StudentEnrollment || 0), 0);

  const reportCardClassAvg = reportCards.length > 0
    ? (reportCards.reduce((sum, r) => sum + r.overallAverage, 0) / reportCards.length).toFixed(1)
    : '0.0';
  const reportCardTopStudent = reportCards.find((r) => r.overallRank === 1);

  return (
    <div className="space-y-6">
      {/* ── Top Stat Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Students" 
          value={isStatsLoading ? '...' : (stats?.students ?? 0)} 
          icon={GraduationCap} 
          iconClassName="bg-blue-50 text-blue-600"
        />
        <StatCard 
          title="Total Teachers" 
          value={isStatsLoading ? '...' : (stats?.teachers ?? 0)} 
          icon={UserCheck} 
          iconClassName="bg-indigo-50 text-indigo-600"
        />
        <StatCard 
          title="Active Class Sections" 
          value={isLoadingGrades ? '...' : totalSections} 
          icon={BookOpen} 
          iconClassName="bg-amber-50 text-amber-600"
        />
        <StatCard 
          title="Active Academic Year" 
          value={isLoadingYear ? '...' : (activeAcademicYear?.year || 'Not Set')} 
          icon={Calendar} 
          iconClassName="bg-emerald-50 text-emerald-600"
        />
      </div>

      {/* ── Awaiting Admin Review Queue ── */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-100">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-700 shrink-0">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-black text-gray-900">Awaiting Admin Review</h3>
                {totalPendingReviews > 0 ? (
                  <span className="px-3 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1.5 animate-pulse">
                    <Clock className="w-3.5 h-3.5" />
                    {totalPendingReviews} Pending
                  </span>
                ) : (
                  <span className="px-3 py-0.5 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    All Reviewed
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                Homeroom roster and report card submissions awaiting administrative review &amp; verification.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isLoadingSections || isRefetchingSections}
              className="p-2.5 border border-gray-200 rounded-xl text-gray-500 hover:text-blue-900 hover:bg-gray-50 transition-colors disabled:opacity-50"
              title="Refresh Review Queue"
            >
              <RefreshCw className={cn("w-4 h-4", (isLoadingSections || isRefetchingSections) && "animate-spin text-blue-900")} />
            </button>
            <Link
              to="/admin/class-roster"
              className="text-xs font-bold text-blue-900 bg-blue-50 px-3.5 py-2.5 rounded-xl hover:bg-blue-100 transition-colors inline-flex items-center gap-1.5"
            >
              Roster Manager
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              to="/report-cards"
              className="text-xs font-bold text-indigo-900 bg-indigo-50 px-3.5 py-2.5 rounded-xl hover:bg-indigo-100 transition-colors inline-flex items-center gap-1.5"
            >
              Report Cards Manager
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Tab switcher & filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-6 pb-4">
          <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-2xl w-fit">
            <button
              onClick={() => setActiveTab('roster')}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2',
                activeTab === 'roster'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900',
              )}
            >
              <ClipboardList className="w-4 h-4" />
              Roster Submissions
              {pendingRosterCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800">
                  {pendingRosterCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('reportCards')}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2',
                activeTab === 'reportCards'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900',
              )}
            >
              <FileCheck className="w-4 h-4" />
              Report Card Submissions
              {pendingReportCardCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-100 text-indigo-800">
                  {pendingReportCardCount}
                </span>
              )}
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPendingOnly}
              onChange={(e) => setShowPendingOnly(e.target.checked)}
              className="rounded border-gray-300 text-blue-900 focus:ring-blue-900"
            />
            Show Pending Only
          </label>
        </div>

        {/* Tab 1: Roster Submissions Table */}
        {activeTab === 'roster' && (
          <div className="border border-gray-100 rounded-2xl overflow-hidden mt-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <th className="px-5 py-3.5">Section &amp; Grade</th>
                    <th className="px-4 py-3.5">Homeroom Teacher</th>
                    <th className="px-4 py-3.5 text-center">Enrolled</th>
                    <th className="px-4 py-3.5 text-center">Subjects Submitted</th>
                    <th className="px-4 py-3.5">Roster Submitted At</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {isLoadingSections ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-400 font-semibold">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-900" />
                        Loading submitted rosters...
                      </td>
                    </tr>
                  ) : rosterSections.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-400 font-medium">
                        {showPendingOnly
                          ? 'No roster submissions currently pending review.'
                          : 'No class sections found for the active academic year.'}
                      </td>
                    </tr>
                  ) : (
                    rosterSections.map((sec) => {
                      const effectiveStatus = sec.reviewStatus || (
                        sec.status === 'Submitted' ? 'SUBMITTED_TO_ADMIN' :
                        sec.status === 'Approved' ? 'APPROVED' :
                        sec.status === 'Rejected' ? 'REJECTED' : 'DRAFT'
                      );
                      const isSubmitted = effectiveStatus === 'SUBMITTED_TO_ADMIN';
                      const isApproved = effectiveStatus === 'APPROVED';
                      const isRejected = effectiveStatus === 'REJECTED';

                      return (
                        <tr
                          key={sec.id}
                          className={cn(
                            'hover:bg-gray-50/70 transition-colors',
                            isSubmitted && 'bg-blue-50/20 font-medium',
                          )}
                        >
                          <td className="px-5 py-4">
                            <span className="font-bold text-gray-900 text-sm">{sec.displayName}</span>
                            <span className="text-[11px] text-gray-400 block">{sec.gradeLevelName}</span>
                          </td>
                          <td className="px-4 py-4 text-gray-700">
                            {sec.homeroomTeacher || <span className="text-gray-400 italic">Unassigned</span>}
                          </td>
                          <td className="px-4 py-4 text-center font-semibold text-gray-800">
                            {sec.enrolledCount}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className={cn(
                              'px-2 py-0.5 rounded-full text-[11px] font-bold',
                              sec.submittedSubjects === sec.totalSubjects && sec.totalSubjects > 0
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-600',
                            )}>
                              {sec.submittedSubjects} / {sec.totalSubjects}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-gray-600">
                            {formatDate(sec.rosterSubmittedAt || sec.submittedAt)}
                          </td>
                          <td className="px-4 py-4">
                            <span className={cn(
                              'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1',
                              isApproved && 'bg-emerald-100 text-emerald-800 border border-emerald-300',
                              isSubmitted && 'bg-blue-100 text-blue-800 border border-blue-300',
                              isRejected && 'bg-red-100 text-red-800 border border-red-300',
                              !isApproved && !isSubmitted && !isRejected && 'bg-gray-100 text-gray-600 border border-gray-200',
                            )}>
                              {isApproved && <CheckCircle2 className="w-3 h-3" />}
                              {isSubmitted && <Clock className="w-3 h-3" />}
                              {isRejected && <AlertCircle className="w-3 h-3" />}
                              {isApproved ? 'Approved' : isSubmitted ? 'Awaiting Review' : isRejected ? 'Rejected' : 'Draft'}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setSelectedRosterSection(sec)}
                                className={cn(
                                  'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-sm',
                                  isSubmitted
                                    ? 'bg-blue-900 text-white hover:bg-blue-800'
                                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
                                )}
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Review Roster
                              </button>
                              {isApproved && (
                                <button
                                  onClick={() => navigate(`/admin/roster/paper?sectionId=${sec.id}&academicYearId=${activeAcademicYearId}`)}
                                  className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-indigo-900 hover:bg-indigo-50"
                                  title="Official Paper Print"
                                >
                                  <Printer className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Report Card Submissions Table */}
        {activeTab === 'reportCards' && (
          <div className="border border-gray-100 rounded-2xl overflow-hidden mt-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <th className="px-5 py-3.5">Section &amp; Grade</th>
                    <th className="px-4 py-3.5">Homeroom Teacher</th>
                    <th className="px-4 py-3.5 text-center">Students</th>
                    <th className="px-4 py-3.5 text-center">Conduct Completed</th>
                    <th className="px-4 py-3.5">Report Cards Submitted At</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {isLoadingSections ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-400 font-semibold">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-900" />
                        Loading report card submissions...
                      </td>
                    </tr>
                  ) : reportCardSections.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-400 font-medium">
                        {showPendingOnly
                          ? 'No report card submissions currently pending review.'
                          : 'No class sections found for the active academic year.'}
                      </td>
                    </tr>
                  ) : (
                    reportCardSections.map((sec) => {
                      const effectiveStatus = sec.reviewStatus || (
                        sec.status === 'Submitted' ? 'SUBMITTED_TO_ADMIN' :
                        sec.status === 'Approved' ? 'APPROVED' :
                        sec.status === 'Rejected' ? 'REJECTED' : 'DRAFT'
                      );
                      const isSubmitted = sec.isReportCardSubmitted && effectiveStatus === 'SUBMITTED_TO_ADMIN';
                      const isApproved = sec.isReportCardSubmitted && effectiveStatus === 'APPROVED';
                      const isRejected = effectiveStatus === 'REJECTED';

                      return (
                        <tr
                          key={sec.id}
                          className={cn(
                            'hover:bg-gray-50/70 transition-colors',
                            isSubmitted && 'bg-indigo-50/20 font-medium',
                          )}
                        >
                          <td className="px-5 py-4">
                            <span className="font-bold text-gray-900 text-sm">{sec.displayName}</span>
                            <span className="text-[11px] text-gray-400 block">{sec.gradeLevelName}</span>
                          </td>
                          <td className="px-4 py-4 text-gray-700">
                            {sec.homeroomTeacher || <span className="text-gray-400 italic">Unassigned</span>}
                          </td>
                          <td className="px-4 py-4 text-center font-semibold text-gray-800">
                            {sec.enrolledCount}
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className={cn(
                              'px-2 py-0.5 rounded-full text-[11px] font-bold',
                              sec.conductCompleted === sec.enrolledCount && sec.enrolledCount > 0
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-600',
                            )}>
                              {sec.conductCompleted ?? sec.enrolledCount} / {sec.enrolledCount}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-gray-600">
                            {formatDate(sec.reportCardSubmittedAt || sec.submittedAt)}
                          </td>
                          <td className="px-4 py-4">
                            <span className={cn(
                              'px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1',
                              isApproved && 'bg-emerald-100 text-emerald-800 border border-emerald-300',
                              isSubmitted && 'bg-blue-100 text-blue-800 border border-blue-300',
                              isRejected && 'bg-red-100 text-red-800 border border-red-300',
                              !isApproved && !isSubmitted && !isRejected && 'bg-gray-100 text-gray-600 border border-gray-200',
                            )}>
                              {isApproved && <CheckCircle2 className="w-3 h-3" />}
                              {isSubmitted && <Clock className="w-3 h-3" />}
                              {isRejected && <AlertCircle className="w-3 h-3" />}
                              {isApproved ? 'Approved' : isSubmitted ? 'Awaiting Review' : isRejected ? 'Rejected' : 'Draft'}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              onClick={() => setSelectedReportCardSection(sec)}
                              className={cn(
                                'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-sm',
                                isSubmitted
                                  ? 'bg-indigo-900 text-white hover:bg-indigo-800'
                                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
                              )}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Review Report Cards
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Academic Structure & Year Scope */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-100">
              <div>
                <h3 className="text-xl font-black text-gray-900">Academic Structure Breakdown</h3>
                <p className="text-sm text-gray-500">
                  Active academic year: <span className="font-semibold text-blue-900">{activeAcademicYear?.year || 'None'}</span> ({totalEnrollments} active enrollments)
                </p>
              </div>
              <Link
                to="/admin/academic-structure"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-900 bg-blue-50 px-4 py-2 rounded-xl hover:bg-blue-100 transition-colors"
              >
                Manage Structure
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {isLoadingGrades ? (
              <div className="py-12 text-center text-gray-400 text-sm">Loading structure data...</div>
            ) : activeGradeLevels.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">No active grade levels found for the active academic year.</div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {activeGradeLevels.map((grade) => {
                    const sectionCount = grade.ClassSection?.length || 0;
                    const enrollmentCount = grade.StudentEnrollment?.length || grade._count?.StudentEnrollment || 0;
                    return (
                      <div key={grade.id} className="p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:border-gray-200 transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-gray-900">{grade.name}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                            {grade.gradeNumber != null ? `Grade ${grade.gradeNumber}` : 'Level'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 flex items-center justify-between">
                          <span>{sectionCount} {sectionCount === 1 ? 'Section' : 'Sections'}</span>
                          <span className="font-medium text-gray-700">{enrollmentCount} Enrolled</span>
                        </div>
                        {sectionCount > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-1">
                            {grade.ClassSection?.map((sec) => (
                              <span key={sec.id} className="text-[10px] bg-white border border-gray-200 rounded-md px-1.5 py-0.5 font-medium text-gray-600">
                                {sec.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* User Distribution Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                  <Users className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Total
                </span>
              </div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Users</h4>
              <p className="text-2xl font-black text-gray-900 mt-1">{stats?.total ?? 0}</p>
            </div>

            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-black text-green-600 bg-green-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Active
                </span>
              </div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Active Accounts</h4>
              <p className="text-2xl font-black text-gray-900 mt-1">{stats?.active ?? 0}</p>
            </div>

            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
                  <Shield className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-black text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Parents
                </span>
              </div>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Parents Registered</h4>
              <p className="text-2xl font-black text-gray-900 mt-1">{stats?.parents ?? 0}</p>
            </div>
          </div>
        </div>

        {/* Right Col: Quick Admin Actions / Navigation */}
        <div className="space-y-6">
          <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden p-6">
            <h3 className="text-base font-black text-gray-900 mb-4 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-900" />
              Quick Navigation
            </h3>
            <div className="space-y-2">
              {[
                { title: 'Academic Structure', desc: 'Manage years, grade levels & sections', path: '/admin/academic-structure' },
                { title: 'Teacher Assignments', desc: 'Assign subjects and homerooms', path: '/admin/teacher-assignments' },
                { title: 'Timetable Management', desc: 'Configure periods & weekly schedules', path: '/admin/timetable' },
                { title: 'Class Roster', desc: 'Review submitted rosters & enrollments', path: '/admin/class-roster' },
                { title: 'Report Cards Review', desc: 'Inspect compiled student report cards', path: '/report-cards' },
                { title: 'User Management', desc: 'Create and manage student & staff accounts', path: '/users' },
              ].map((item, idx) => (
                <Link
                  key={idx}
                  to={item.path}
                  className="flex items-center justify-between p-3.5 rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all group"
                >
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 group-hover:text-blue-900 transition-colors">{item.title}</h4>
                    <p className="text-[11px] text-gray-400">{item.desc}</p>
                  </div>
                  <ArrowUpRight className="w-4 h-4 text-gray-300 group-hover:text-blue-900 transition-colors" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL 1: Roster Review Modal ── */}
      {selectedRosterSection && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between gap-4 bg-gray-50/50">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-black text-gray-900">
                    {selectedRosterSection.displayName} — Consolidated Roster
                  </h3>
                  <span className={cn(
                    'px-3 py-0.5 rounded-full text-xs font-black uppercase tracking-wider',
                    selectedRosterSection.reviewStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                    selectedRosterSection.reviewStatus === 'SUBMITTED_TO_ADMIN' ? 'bg-blue-100 text-blue-800' :
                    selectedRosterSection.reviewStatus === 'REJECTED' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-600',
                  )}>
                    {selectedRosterSection.reviewStatus || selectedRosterSection.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Homeroom: {selectedRosterSection.homeroomTeacher || 'Unassigned'} • {selectedRosterSection.enrolledCount} Enrolled • Submitted: {formatDate(selectedRosterSection.rosterSubmittedAt || selectedRosterSection.submittedAt)}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {selectedRosterSection.reviewStatus === 'SUBMITTED_TO_ADMIN' && (
                  <>
                    <button
                      onClick={() => {
                        setActionTarget('roster');
                        setIsRejectModalOpen(true);
                      }}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" /> Reject Roster
                    </button>
                    <button
                      onClick={() => {
                        setActionTarget('roster');
                        setIsApproveConfirmOpen(true);
                      }}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve Roster
                    </button>
                  </>
                )}

                {selectedRosterSection.reviewStatus === 'APPROVED' && (
                  <>
                    <button
                      onClick={() => navigate(`/admin/roster/paper?sectionId=${selectedRosterSection.id}&academicYearId=${activeAcademicYearId}`)}
                      className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Printer className="w-3.5 h-3.5" /> Print Official
                    </button>
                    <button
                      onClick={() => {
                        setActionTarget('roster');
                        setIsReopenModalOpen(true);
                      }}
                      className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reopen Roster
                    </button>
                  </>
                )}

                <button
                  onClick={() => setSelectedRosterSection(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Rejection notice banner if active */}
            {selectedRosterSection.reviewStatus === 'REJECTED' && selectedRosterSection.rejectionReason && (
              <div className="px-8 py-3 bg-red-50 border-b border-red-200 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-red-900 uppercase tracking-wide">Roster Rejected Reason:</p>
                  <p className="text-xs text-red-700 font-semibold mt-0.5">"{selectedRosterSection.rejectionReason}"</p>
                </div>
              </div>
            )}

            {/* Modal Body: Authoritative 7-Row Calculation Table */}
            <div className="p-6 overflow-y-auto flex-1">
              {isLoadingRoster ? (
                <div className="py-20 text-center text-gray-400">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-900" />
                  <p className="text-sm font-semibold">Loading 7-period calculation roster...</p>
                </div>
              ) : !fullRosterData || !fullRosterData.students?.length ? (
                <div className="p-12 text-center text-gray-400">
                  <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="font-semibold text-gray-700">No calculation data available for this section.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-2xl">
                  <table className="min-w-[900px] w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-blue-900 text-white border-b border-blue-950 text-[10px] font-black uppercase tracking-wider">
                        <th className="p-3 w-10 text-center">#</th>
                        <th className="p-3">Student Name</th>
                        <th className="p-3 w-14 text-center">Sex</th>
                        <th className="p-3 w-16 text-center">Period</th>
                        {fullRosterData.subjects.map((sub: any) => (
                          <th key={sub.id} className="p-3 text-center min-w-[70px]">
                            {sub.name}
                            <span className="text-[9px] text-blue-200 block font-normal">{sub.code}</span>
                          </th>
                        ))}
                        <th className="p-3 w-16 text-center">Sum</th>
                        <th className="p-3 w-16 text-center">Avg</th>
                        <th className="p-3 w-14 text-center">Rank</th>
                        <th className="p-3 w-14 text-center">Abs D</th>
                        <th className="p-3 w-16 text-center">Conduct</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {fullRosterData.students.map((student: any, sIdx: number) => {
                        const subMap = new Map(student.subjectScores?.map((sc: any) => [sc.subjectId, sc]));
                        return PERIOD_ROWS.map((p, pIdx) => {
                          const isFirst = pIdx === 0;
                          return (
                            <tr key={`${student.studentId}-${p.key}`} className={cn(p.bg, 'hover:bg-blue-50/40')}>
                              {isFirst && (
                                <>
                                  <td rowSpan={7} className="p-3 text-center font-bold bg-gray-50 border-r border-gray-200">
                                    {sIdx + 1}
                                  </td>
                                  <td rowSpan={7} className="p-3 font-black text-gray-900 bg-white border-r border-gray-200">
                                    {student.studentName}
                                    <span className="text-[10px] text-gray-400 block font-normal">{student.admissionNo}</span>
                                  </td>
                                  <td rowSpan={7} className="p-3 text-center text-gray-600 bg-white border-r border-gray-200 font-semibold">
                                    {student.sex || '—'}
                                  </td>
                                </>
                              )}
                              <td className="p-2 text-center text-[11px] font-bold border-r border-gray-200">
                                {p.label}
                              </td>
                              {fullRosterData.subjects.map((subj: any) => {
                                const sc = subMap.get(subj.id);
                                const raw = sc ? (sc as any)[p.key] : null;
                                return (
                                  <td key={subj.id} className="p-2 text-center border-r border-gray-200">
                                    {fmt(raw)}
                                  </td>
                                );
                              })}
                              {isFirst && (
                                <>
                                  <td rowSpan={7} className="p-3 text-center font-black bg-blue-50/40 border-r border-gray-200 text-blue-950">
                                    {fmt(student.sum)}
                                  </td>
                                  <td rowSpan={7} className="p-3 text-center font-black bg-emerald-50/50 border-r border-gray-200 text-emerald-950 text-sm">
                                    {fmt(student.average)}
                                  </td>
                                  <td rowSpan={7} className="p-3 text-center font-black bg-amber-50/50 border-r border-gray-200 text-amber-950">
                                    {student.rank ? `#${student.rank}` : '—'}
                                  </td>
                                  <td rowSpan={7} className="p-3 text-center font-semibold bg-white border-r border-gray-200 text-gray-600">
                                    {student.absentDays ?? 0}
                                  </td>
                                  <td rowSpan={7} className="p-3 text-center font-black bg-purple-50/50 text-purple-900 text-sm">
                                    {student.conduct || 'A'}
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Report Card Review Modal ── */}
      {selectedReportCardSection && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-6xl max-h-[92vh] rounded-[2rem] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between gap-4 bg-gray-50/50">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-black text-gray-900">
                    {selectedReportCardSection.displayName} — Compiled Report Cards
                  </h3>
                  <span className={cn(
                    'px-3 py-0.5 rounded-full text-xs font-black uppercase tracking-wider',
                    selectedReportCardSection.reviewStatus === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                    selectedReportCardSection.reviewStatus === 'SUBMITTED_TO_ADMIN' ? 'bg-blue-100 text-blue-800' :
                    selectedReportCardSection.reviewStatus === 'REJECTED' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-600',
                  )}>
                    {selectedReportCardSection.reviewStatus || selectedReportCardSection.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Homeroom: {selectedReportCardSection.homeroomTeacher || 'Unassigned'} • {selectedReportCardSection.enrolledCount} Enrolled • Submitted: {formatDate(selectedReportCardSection.reportCardSubmittedAt || selectedReportCardSection.submittedAt)}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {selectedReportCardSection.reviewStatus === 'SUBMITTED_TO_ADMIN' && (
                  <>
                    <button
                      onClick={() => {
                        setActionTarget('reportCard');
                        setIsRejectModalOpen(true);
                      }}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" /> Reject Report Cards
                    </button>
                    <button
                      onClick={() => {
                        setActionTarget('reportCard');
                        setIsApproveConfirmOpen(true);
                      }}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve Report Cards
                    </button>
                  </>
                )}

                {selectedReportCardSection.reviewStatus === 'APPROVED' && (
                  <button
                    onClick={() => {
                      setActionTarget('reportCard');
                      setIsReopenModalOpen(true);
                    }}
                    className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Reopen Report Cards
                  </button>
                )}

                <button
                  onClick={() => setSelectedReportCardSection(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick KPI stats row */}
            {reportCards.length > 0 && (
              <div className="grid grid-cols-3 gap-4 px-8 py-3.5 bg-gray-50/50 border-b border-gray-100 text-xs">
                <div className="bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center shrink-0">
                    <FileCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Compiled Cards</p>
                    <p className="text-base font-black text-gray-900">{reportCards.length} Students</p>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3">
                  <div className="w-8 h-8 bg-emerald-50 text-emerald-700 rounded-lg flex items-center justify-center shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Class Average</p>
                    <p className="text-base font-black text-emerald-700">{reportCardClassAvg}%</p>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-gray-100 flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-50 text-amber-700 rounded-lg flex items-center justify-center shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Top Student</p>
                    <p className="text-xs font-black text-gray-900 truncate">
                      {reportCardTopStudent ? `${reportCardTopStudent.firstName} ${reportCardTopStudent.lastName} (${reportCardTopStudent.overallAverage}%)` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Body: Student Report Cards List */}
            <div className="p-6 overflow-y-auto flex-1">
              {isLoadingReportCards ? (
                <div className="py-20 text-center text-gray-400">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-indigo-900" />
                  <p className="text-sm font-semibold">Loading student report cards...</p>
                </div>
              ) : reportCards.length === 0 ? (
                <div className="p-12 text-center text-gray-400">
                  <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="font-semibold text-gray-700">No report cards compiled for this section.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-2xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        <th className="px-4 py-3 w-16">Rank</th>
                        <th className="px-4 py-3">Admission No</th>
                        <th className="px-4 py-3">Student Name</th>
                        <th className="px-4 py-3 text-center">Gender</th>
                        <th className="px-4 py-3 text-right">Total Marks</th>
                        <th className="px-4 py-3 text-right">Yearly Average</th>
                        <th className="px-4 py-3 text-center">Absences</th>
                        <th className="px-4 py-3 text-center">Conduct</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {reportCards.map((student: AdminReportCardStudent) => (
                        <tr key={student.studentId} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3 font-black text-gray-900">
                            {student.overallRank === 1 ? (
                              <span className="flex items-center gap-1 text-amber-600">
                                <Award className="w-3.5 h-3.5" /> #{student.overallRank}
                              </span>
                            ) : (
                              `#${student.overallRank || '—'}`
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-500">
                            {student.admissionNo || '—'}
                          </td>
                          <td className="px-4 py-3 font-black text-gray-900">
                            {student.firstName} {student.lastName}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">
                            {student.gender || '—'}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-gray-700">
                            {student.overallTotal.toFixed(1)}
                          </td>
                          <td className="px-4 py-3 text-right font-black text-emerald-700 text-sm">
                            {student.overallAverage.toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600 font-semibold">
                            {student.absentDays}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-100 text-purple-800">
                              {student.conduct || 'A'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SUB-MODAL: Approve Confirmation ── */}
      {isApproveConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h4 className="text-lg font-black text-gray-900">
                Confirm Approval
              </h4>
              <p className="text-xs text-gray-500 mt-1">
                Are you sure you want to approve this {actionTarget === 'roster' ? 'class roster' : 'report card submission'}? Once approved, it will be locked and official records will be generated.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setIsApproveConfirmOpen(false)}
                disabled={isActionLoading}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={isActionLoading}
                className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
              >
                {isActionLoading ? 'Approving...' : 'Confirm Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SUB-MODAL: Reject Reason Prompt ── */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h4 className="text-lg font-black text-gray-900">
                Reject &amp; Return to Homeroom Teacher
              </h4>
              <p className="text-xs text-gray-500 mt-1">
                Provide specific feedback so the homeroom teacher can make necessary corrections and resubmit.
              </p>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                Feedback / Rejection Reason *
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Please verify conduct grade for John Doe and recalculate absences."
                className="w-full border border-gray-200 rounded-xl p-3 text-xs outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 resize-none"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setIsRejectModalOpen(false);
                  setRejectionReason('');
                }}
                disabled={isActionLoading}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={isActionLoading || !rejectionReason.trim()}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
              >
                {isActionLoading ? 'Rejecting...' : 'Submit Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SUB-MODAL: Reopen Reason Prompt ── */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
              <RotateCcw className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h4 className="text-lg font-black text-gray-900">
                Reopen to DRAFT
              </h4>
              <p className="text-xs text-gray-500 mt-1">
                This will unlock the record and allow the homeroom teacher to make further changes.
              </p>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5">
                Reason for Reopening *
              </label>
              <textarea
                rows={3}
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="e.g. Late grade correction needed for 2nd semester."
                className="w-full border border-gray-200 rounded-xl p-3 text-xs outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100 resize-none"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setIsReopenModalOpen(false);
                  setReopenReason('');
                }}
                disabled={isActionLoading}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReopen}
                disabled={isActionLoading || !reopenReason.trim()}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
              >
                {isActionLoading ? 'Reopening...' : 'Confirm Reopen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOverview;
