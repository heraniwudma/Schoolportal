import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParent } from '../../context/ParentContext';
import { getChildAssignments } from '../../api/parents';
import { 
  ClipboardList, 
  Calendar, 
  Paperclip, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Users, 
  AlertCircle, 
  RefreshCw, 
  Search, 
  X,
  ExternalLink,
  BookOpen,
  User,
  GraduationCap
} from 'lucide-react';
import { ChildSelector } from '../../components/parent/ChildSelector';
import StatCard from '../../components/dashboard/StatCard';
import { Link, useOutletContext } from 'react-router-dom';
import { useTranslation } from '../../i18n/LanguageContext';

function getDueStatus(dueDateStr: string, status: string, t: (key: string, params?: Record<string, string | number>) => string): { label: string; isOverdue: boolean; color: string } {
  if (status === 'SUBMITTED' || status === 'GRADED') {
    return { label: t('parent.assignments.statusCompleted'), isOverdue: false, color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  }

  const now = new Date();
  const due = new Date(dueDateStr);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: t('parent.assignments.statusOverdue'), isOverdue: true, color: 'text-rose-700 bg-rose-50 border-rose-200' };
  }
  if (diffDays === 0) {
    return { label: t('parent.assignments.statusDueToday'), isOverdue: false, color: 'text-amber-700 bg-amber-50 border-amber-200' };
  }
  if (diffDays === 1) {
    return { label: t('parent.assignments.statusDueTomorrow'), isOverdue: false, color: 'text-amber-700 bg-amber-50 border-amber-200' };
  }
  return { label: t('parent.assignments.statusDueInDays', { days: diffDays }), isOverdue: false, color: 'text-blue-700 bg-blue-50 border-blue-200' };
}

const ParentAssignments: React.FC = () => {
  const { 
    childrenList, 
    selectedChild, 
    selectedChildId, 
    isLoading: parentLoading, 
    error: parentError, 
    refetchChildren 
  } = useParent();
  const { t } = useTranslation();

  const outletCtx = useOutletContext<{ searchQuery?: string } | null>();
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'SUBMITTED' | 'GRADED' | 'OVERDUE'>('ALL');
  const [subjectFilter, setSubjectFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const effectiveSearch = (searchQuery || outletCtx?.searchQuery || '').trim().toLowerCase();

  // Query child assignments
  const {
    data: assignmentsResponse,
    isLoading: assignmentsLoading,
    isError: assignmentsError,
    error: fetchError,
    refetch: refetchAssignments,
  } = useQuery({
    queryKey: ['parent-child-assignments-page', selectedChildId],
    queryFn: () => (selectedChildId ? getChildAssignments(selectedChildId) : null),
    enabled: !!selectedChildId,
  });

  const rawAssignments = useMemo(() => assignmentsResponse?.assignments || [], [assignmentsResponse?.assignments]);

  // Extract unique subjects
  const availableSubjects = useMemo(() => {
    const subs = new Set<string>();
    rawAssignments.forEach((a) => {
      if (a.subject) subs.add(a.subject);
    });
    return Array.from(subs);
  }, [rawAssignments]);

  // Filtered assignments
  const filteredAssignments = useMemo(() => {
    let list = [...rawAssignments];

    // Status filter
    if (statusFilter === 'PENDING') {
      list = list.filter((a) => a.submissionStatus === 'PENDING');
    } else if (statusFilter === 'SUBMITTED') {
      list = list.filter((a) => a.submissionStatus === 'SUBMITTED');
    } else if (statusFilter === 'GRADED') {
      list = list.filter((a) => a.submissionStatus === 'GRADED');
    } else if (statusFilter === 'OVERDUE') {
      const now = new Date();
      list = list.filter((a) => a.submissionStatus === 'PENDING' && new Date(a.dueDate) < now);
    }

    // Subject filter
    if (subjectFilter !== 'ALL') {
      list = list.filter((a) => a.subject?.toLowerCase() === subjectFilter.toLowerCase());
    }

    // Search query
    if (effectiveSearch) {
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(effectiveSearch) ||
          (a.subject || '').toLowerCase().includes(effectiveSearch) ||
          (a.description || '').toLowerCase().includes(effectiveSearch) ||
          (a.instructions || '').toLowerCase().includes(effectiveSearch) ||
          (a.teacherName || '').toLowerCase().includes(effectiveSearch),
      );
    }

    return list;
  }, [rawAssignments, statusFilter, subjectFilter, effectiveSearch]);

  if (parentLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-900 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-gray-500">{t('parent.assignments.loading')}</span>
        </div>
      </div>
    );
  }

  if (parentError) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="p-6 bg-red-50 border border-red-200 rounded-3xl text-red-700 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-bold text-red-900">{t('parent.assignments.loadError')}</h3>
            <p className="text-sm text-red-700">{parentError}</p>
            <button
              onClick={() => void refetchChildren()}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('common.actions.tryAgain')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Case 0: Zero linked children
  if (childrenList.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="p-10 bg-white rounded-3xl shadow-sm border border-gray-100 space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-900 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
            <Users className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{t('parent.assignments.emptyTitle')}</h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
            {t('parent.assignments.emptyDesc')}
          </p>
          <div className="pt-2">
            <Link
              to="/account"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors"
            >
              {t('common.nav.myAccount')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const childName = selectedChild?.fullName || 'Student';
  const gradeLevel = selectedChild?.classSection?.gradeLevel || selectedChild?.currentEnrollment?.gradeLevel;
  const sectionName = selectedChild?.classSection?.name || selectedChild?.currentEnrollment?.classSection || t('common.childSelector.enrolled');
  const academicYear = selectedChild?.currentEnrollment?.academicYear || 'Current Year';

  const totalCount = assignmentsResponse?.totalAssignments ?? 0;
  const pendingCount = assignmentsResponse?.pendingCount ?? 0;
  const submittedCount = assignmentsResponse?.submittedCount ?? 0;
  const completionRate = totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : 100;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Top Banner / Student Information Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-900 to-blue-800 text-white flex items-center justify-center font-bold text-2xl shadow-sm flex-shrink-0">
            {selectedChild?.avatarUrl ? (
              <img src={selectedChild.avatarUrl} alt={childName} className="w-full h-full object-cover rounded-2xl" />
            ) : (
              selectedChild?.firstName?.charAt(0) || 'S'
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-black text-gray-900">{childName}</h1>
              <span className="px-2.5 py-0.5 bg-blue-50 text-blue-800 border border-blue-200/60 font-bold text-xs rounded-md">
                {gradeLevel ? `${gradeLevel} • ` : ''}{sectionName}
              </span>
            </div>
            <p className="text-xs text-gray-500 font-medium">
              {t('parent.attendance.admissionId')} <span className="font-mono font-semibold text-gray-700">{selectedChild?.admissionNo}</span> • {t('parent.attendance.academicYear')} <span className="text-gray-700">{academicYear}</span>
            </p>
          </div>
        </div>

        {/* Child Selector if parent has multiple children */}
        {childrenList.length > 1 && (
          <div className="flex items-center gap-3 self-start md:self-auto bg-gray-50 p-2 rounded-2xl border border-gray-200/70">
            <span className="text-xs font-semibold text-gray-500 pl-2">{t('common.childSelector.switchStudent')}</span>
            <ChildSelector />
          </div>
        )}
      </div>

      {/* API Error State */}
      {assignmentsError && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 flex items-start gap-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-red-900">{t('parent.assignments.apiError')}</h4>
            <p className="text-xs text-red-700">{(fetchError as Error)?.message || 'Network error occurred.'}</p>
            <button
              onClick={() => void refetchAssignments()}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> {t('common.actions.retry')}
            </button>
          </div>
        </div>
      )}

      {/* Summary StatCards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          title={t('parent.assignments.statTotal')}
          value={assignmentsLoading ? '…' : totalCount}
          icon={ClipboardList}
          iconClassName="bg-blue-50 text-blue-600"
        />
        <StatCard
          title={t('parent.assignments.statPending')}
          value={assignmentsLoading ? '…' : pendingCount}
          icon={Clock}
          iconClassName="bg-amber-50 text-amber-600"
        />
        <StatCard
          title={t('parent.assignments.statSubmitted')}
          value={assignmentsLoading ? '…' : submittedCount}
          icon={CheckCircle2}
          iconClassName="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          title={t('parent.assignments.statCompletionRate')}
          value={assignmentsLoading ? '…' : `${completionRate}%`}
          icon={GraduationCap}
          iconClassName="bg-purple-50 text-purple-600"
        />
      </div>

      {/* Filter and Search Bar Card */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex bg-gray-100/80 p-1 rounded-2xl text-xs font-semibold text-gray-600 overflow-x-auto">
          {(['ALL', 'PENDING', 'SUBMITTED', 'OVERDUE'] as const).map((tab) => {
            const tabLabel =
              tab === 'ALL'
                ? t('parent.assignments.tabAll')
                : tab === 'PENDING'
                ? t('parent.assignments.tabPending')
                : tab === 'SUBMITTED'
                ? t('parent.assignments.tabSubmitted')
                : t('parent.assignments.tabOverdue');

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-4 py-2 rounded-xl transition-all whitespace-nowrap ${
                  statusFilter === tab
                    ? 'bg-white text-gray-900 shadow-xs font-bold'
                    : 'hover:text-gray-900'
                }`}
              >
                {tabLabel}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Subject Filter Dropdown */}
          {availableSubjects.length > 0 && (
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:ring-2 focus:ring-blue-900/20"
            >
              <option value="ALL">{t('parent.assignments.allSubjects')}</option>
              {availableSubjects.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          )}

          {/* Search Input */}
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t('parent.assignments.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-8 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-900/20 focus:bg-white transition-all text-gray-800 placeholder-gray-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Loading Skeleton */}
      {assignmentsLoading && (
        <div className="bg-white rounded-3xl p-12 shadow-sm border border-gray-100 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-medium text-gray-500">{t('parent.assignments.loadingAssignments', { name: childName })}</p>
        </div>
      )}

      {/* Empty State: Zero Assignments for student */}
      {!assignmentsLoading && !assignmentsError && rawAssignments.length === 0 && (
        <div className="bg-white rounded-3xl p-12 shadow-sm border border-gray-100 text-center space-y-4 max-w-md mx-auto">
          <div className="w-16 h-16 bg-blue-50 text-blue-900 rounded-2xl flex items-center justify-center mx-auto">
            <ClipboardList className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">{t('parent.assignments.noAssignmentsAssigned')}</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            {t('parent.assignments.noAssignmentsDesc', { name: childName })}
          </p>
        </div>
      )}

      {/* Empty State: Filter Returned 0 Results */}
      {!assignmentsLoading && !assignmentsError && rawAssignments.length > 0 && filteredAssignments.length === 0 && (
        <div className="bg-white rounded-3xl p-10 shadow-sm border border-gray-100 text-center space-y-3">
          <ClipboardList className="w-8 h-8 text-gray-300 mx-auto" />
          <h4 className="text-sm font-bold text-gray-700">{t('parent.assignments.noMatchingAssignments')}</h4>
          <p className="text-xs text-gray-400">
            {t('parent.assignments.noMatchingDesc')}
          </p>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('ALL');
              setSubjectFilter('ALL');
              setSearchQuery('');
            }}
            className="text-xs text-blue-900 font-bold hover:underline"
          >
            {t('parent.assignments.clearFilters')}
          </button>
        </div>
      )}

      {/* Assignment Cards List */}
      {!assignmentsLoading && !assignmentsError && filteredAssignments.length > 0 && (
        <div className="space-y-4">
          {filteredAssignments.map((assignment) => {
            const status = assignment.submissionStatus;
            const dueInfo = getDueStatus(assignment.dueDate, status, t);

            return (
              <div
                key={assignment.id}
                className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:border-blue-200 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                <div className="flex items-start gap-4 flex-1">
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                      status === 'SUBMITTED' || status === 'GRADED'
                        ? 'bg-emerald-50 text-emerald-600'
                        : dueInfo.isOverdue
                        ? 'bg-rose-50 text-rose-600'
                        : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    {status === 'SUBMITTED' || status === 'GRADED' ? (
                      <CheckCircle2 className="w-6 h-6" />
                    ) : dueInfo.isOverdue ? (
                      <AlertTriangle className="w-6 h-6" />
                    ) : (
                      <Clock className="w-6 h-6" />
                    )}
                  </div>

                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-bold text-gray-900 text-base">{assignment.title}</h3>
                      {assignment.subject && (
                        <span className="px-2.5 py-0.5 bg-blue-50 text-blue-900 border border-blue-200/60 font-bold text-xs rounded-md">
                          {assignment.subject}
                        </span>
                      )}
                      <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${dueInfo.color}`}>
                        {status === 'PENDING' ? dueInfo.label : (status === 'SUBMITTED' ? t('common.status.submitted') : status === 'GRADED' ? t('common.status.graded') : status)}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                      {assignment.teacherName && (
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          {t('parent.assignments.teacherLabel', { teacher: assignment.teacherName })}
                        </span>
                      )}
                      {assignment.classSection && (
                        <span className="inline-flex items-center gap-1">
                          <BookOpen className="w-3.5 h-3.5 text-gray-400" />
                          {t('parent.assignments.classLabel', { class: assignment.classSection })}
                        </span>
                      )}
                    </div>

                    {(assignment.instructions || assignment.description) && (
                      <p className="text-xs text-gray-600 leading-relaxed max-w-3xl line-clamp-2">
                        {assignment.instructions || assignment.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right Side: Due Date and Attachment */}
                <div className="flex flex-col sm:flex-row md:flex-col items-start sm:items-center md:items-end justify-between gap-4 pt-4 md:pt-0 border-t md:border-t-0 border-gray-100 flex-shrink-0">
                  <div className="text-left md:text-right">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">{t('parent.assignments.dueDateLabel')}</span>
                    <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5 mt-0.5">
                      <Calendar className="w-3.5 h-3.5 text-gray-400" />
                      {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      }) : '—'}
                    </span>
                    {assignment.submittedAt && (
                      <span className="text-[11px] text-emerald-700 font-medium block mt-1">
                        {t('parent.assignments.submittedOn', { date: new Date(assignment.submittedAt).toLocaleDateString() })}
                      </span>
                    )}
                  </div>

                  {assignment.attachmentUrl && assignment.attachmentUrl.startsWith('http') && (
                    <a
                      href={assignment.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-900 hover:bg-blue-100 rounded-xl text-xs font-bold transition-colors"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      {t('parent.assignments.viewMaterials')}
                      <ExternalLink className="w-3 h-3 ml-0.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ParentAssignments;
