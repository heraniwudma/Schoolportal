import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParent } from '../../context/ParentContext';
import { getChildAttendance } from '../../api/parents';
import { 
  CheckSquare, 
  Calendar, 
  Clock, 
  Users, 
  AlertCircle, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  FileText,
  ArrowUpDown,
  Search,
  X
} from 'lucide-react';
import { ChildSelector } from '../../components/parent/ChildSelector';
import StatCard from '../../components/dashboard/StatCard';
import { Link, useOutletContext } from 'react-router-dom';
import { useTranslation } from '../../i18n/LanguageContext';

const ParentAttendance: React.FC = () => {
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
  const [localSearch, setLocalSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'>('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const effectiveSearch = (localSearch || outletCtx?.searchQuery || '').trim().toLowerCase();

  // Query child attendance for active selected child
  const {
    data: attendanceData,
    isLoading: attendanceLoading,
    isError: attendanceError,
    error: fetchError,
    refetch: refetchAttendance,
  } = useQuery({
    queryKey: ['parent-child-attendance-page', selectedChildId],
    queryFn: () => (selectedChildId ? getChildAttendance(selectedChildId) : null),
    enabled: !!selectedChildId,
  });

  // Filter & sort records
  const records = useMemo(() => {
    if (!attendanceData?.records) return [];
    let list = [...attendanceData.records];

    if (statusFilter !== 'ALL') {
      list = list.filter((r) => r.status === statusFilter);
    }

    if (effectiveSearch) {
      list = list.filter((r: any) => {
        const dateStr = r.date ? new Date(r.date).toLocaleDateString().toLowerCase() : '';
        const rawDateStr = (r.date || '').toLowerCase();
        const periodStr = `period ${r.period || 1}`.toLowerCase();
        const subjectStr = (r.subject || r.classSection || r.className || '').toLowerCase();
        const statusStr = (r.status || '').toLowerCase();
        const remarksStr = (r.remarks || '').toLowerCase();
        return (
          dateStr.includes(effectiveSearch) ||
          rawDateStr.includes(effectiveSearch) ||
          periodStr.includes(effectiveSearch) ||
          subjectStr.includes(effectiveSearch) ||
          statusStr.includes(effectiveSearch) ||
          remarksStr.includes(effectiveSearch)
        );
      });
    }

    list.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    return list;
  }, [attendanceData?.records, statusFilter, sortOrder, effectiveSearch]);

  if (parentLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-900 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-gray-500">{t('parent.attendance.loading')}</span>
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
            <h3 className="font-bold text-red-900">{t('parent.attendance.loadError')}</h3>
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
          <h2 className="text-2xl font-bold text-gray-900">{t('parent.attendance.emptyTitle')}</h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
            {t('parent.attendance.emptyDesc')}
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
  const summary = attendanceData?.summary;
  const attendanceRate = summary?.attendancePercentage ?? 100;
  const gradeLevel = selectedChild?.classSection?.gradeLevel || selectedChild?.currentEnrollment?.gradeLevel;
  const sectionName = selectedChild?.classSection?.name || selectedChild?.currentEnrollment?.classSection || t('common.childSelector.enrolled');
  const academicYear = selectedChild?.currentEnrollment?.academicYear || 'Current Year';

  const tabLabels: Record<typeof statusFilter, string> = {
    ALL: t('parent.attendance.tabAll'),
    PRESENT: t('parent.attendance.tabPresent'),
    ABSENT: t('parent.attendance.tabAbsent'),
    LATE: t('parent.attendance.tabLate'),
    EXCUSED: t('parent.attendance.tabExcused'),
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
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

        {/* Child Selector on top right if parent has multiple children */}
        {childrenList.length > 1 && (
          <div className="flex items-center gap-3 self-start md:self-auto bg-gray-50 p-2 rounded-2xl border border-gray-200/70">
            <span className="text-xs font-semibold text-gray-500 pl-2">{t('common.childSelector.switchStudent')}</span>
            <ChildSelector />
          </div>
        )}
      </div>

      {/* API Error State */}
      {attendanceError && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 flex items-start gap-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-red-900">{t('parent.attendance.apiError')}</h4>
            <p className="text-xs text-red-700">{(fetchError as Error)?.message || 'Network error occurred.'}</p>
            <button
              onClick={() => void refetchAttendance()}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> {t('common.actions.retry')}
            </button>
          </div>
        </div>
      )}

      {/* Summary Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Attendance Rate */}
        <div className="p-5 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-400 uppercase">{t('parent.attendance.statRate')}</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-black text-gray-900">
              {attendanceLoading ? '…' : `${attendanceRate}%`}
            </h3>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-1 ${
              attendanceRate >= 90 ? 'bg-emerald-50 text-emerald-700' :
              attendanceRate >= 75 ? 'bg-amber-50 text-amber-700' :
              'bg-rose-50 text-rose-700'
            }`}>
              {attendanceRate >= 90 ? t('parent.attendance.excellent') : attendanceRate >= 75 ? t('parent.attendance.moderate') : t('parent.attendance.low')}
            </span>
          </div>
        </div>

        {/* Total Days */}
        <StatCard
          title={t('parent.attendance.statTotalDays')}
          value={attendanceLoading ? '…' : summary?.totalDays ?? 0}
          icon={Calendar}
          iconClassName="bg-blue-50 text-blue-600"
          className="p-5"
        />

        {/* Present */}
        <StatCard
          title={t('parent.attendance.statPresent')}
          value={attendanceLoading ? '…' : summary?.present ?? 0}
          icon={CheckCircle2}
          iconClassName="bg-green-50 text-green-600"
          className="p-5"
        />

        {/* Absent */}
        <StatCard
          title={t('parent.attendance.statAbsent')}
          value={attendanceLoading ? '…' : summary?.absent ?? 0}
          icon={XCircle}
          iconClassName="bg-red-50 text-red-600"
          className="p-5"
        />

        {/* Late */}
        <StatCard
          title={t('parent.attendance.statLate')}
          value={attendanceLoading ? '…' : summary?.late ?? 0}
          icon={Clock}
          iconClassName="bg-amber-50 text-amber-600"
          className="p-5"
        />

        {/* Excused */}
        <StatCard
          title={t('parent.attendance.statExcused')}
          value={attendanceLoading ? '…' : summary?.excused ?? 0}
          icon={FileText}
          iconClassName="bg-purple-50 text-purple-600"
          className="p-5"
        />
      </div>

      {/* Attendance History Table Card */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Table Filters & Header */}
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-blue-600" />
              {t('parent.attendance.title')}
            </h3>
            <span className="text-xs bg-gray-100 text-gray-600 font-bold px-2.5 py-1 rounded-full">
              {attendanceLoading ? '…' : (records.length === 1 ? t('parent.attendance.recordsCountSingular') : t('parent.attendance.recordsCount', { count: records.length }))}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search date, subject, status..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-8 pr-7 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-900/20 focus:bg-white transition-all text-gray-800 placeholder-gray-400"
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={() => setLocalSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter Tabs */}
            <div className="flex bg-gray-100/80 p-1 rounded-xl text-xs font-semibold text-gray-600">
              {(['ALL', 'PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    statusFilter === tab
                      ? 'bg-white text-gray-900 shadow-xs font-bold'
                      : 'hover:text-gray-900'
                  }`}
                >
                  {tabLabels[tab]}
                </button>
              ))}
            </div>

            {/* Sort Toggle */}
            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-gray-300 rounded-xl text-xs font-semibold text-gray-700 shadow-xs transition-colors"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-gray-500" />
              {sortOrder === 'desc' ? t('parent.attendance.sortNewest') : t('parent.attendance.sortOldest')}
            </button>
          </div>
        </div>

        {/* Table Body */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/80 text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
                <th className="px-6 py-4">{t('parent.attendance.colDate')}</th>
                <th className="px-6 py-4">{t('parent.attendance.colPeriod')}</th>
                <th className="px-6 py-4">{t('parent.attendance.colClassSection')}</th>
                <th className="px-6 py-4">{t('parent.attendance.colStatus')}</th>
                <th className="px-6 py-4">{t('parent.attendance.colRemarks')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {attendanceLoading && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-900 border-t-transparent rounded-full animate-spin"></div>
                      <span>{t('parent.attendance.loadingHistory', { name: childName })}</span>
                    </div>
                  </td>
                </tr>
              )}

              {!attendanceLoading && !attendanceError && attendanceData?.records && attendanceData.records.length > 0 && records.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                    <div className="flex flex-col items-center gap-2 max-w-sm mx-auto">
                      <Search className="w-8 h-8 text-gray-300" />
                      <span className="font-bold text-gray-700">No matching attendance records</span>
                      <p className="text-xs text-gray-400">
                        {effectiveSearch
                          ? `No records found matching "${localSearch || outletCtx?.searchQuery}".`
                          : `No records found with status "${tabLabels[statusFilter]}".`}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setLocalSearch('');
                          setStatusFilter('ALL');
                        }}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Clear search
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {!attendanceLoading && !attendanceError && (!attendanceData?.records || attendanceData.records.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                    <div className="flex flex-col items-center gap-2 max-w-sm mx-auto">
                      <Calendar className="w-8 h-8 text-gray-300" />
                      <span className="font-bold text-gray-700">{t('parent.attendance.noEntries')}</span>
                      <p className="text-xs text-gray-400">
                        {statusFilter !== 'ALL'
                          ? t('parent.attendance.noEntriesFilter', { filter: tabLabels[statusFilter] || statusFilter })
                          : t('parent.attendance.noEntriesGeneral', { name: childName })}
                      </p>
                    </div>
                  </td>
                </tr>
              )}

              {!attendanceLoading &&
                records.map((record) => {
                  const status = record.status;
                  return (
                    <tr key={record.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">
                        {new Date(record.date).toLocaleDateString(undefined, {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                        {record.period ? t('parent.attendance.periodLabel', { period: record.period }) : t('parent.attendance.dailySession')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {record.classSection || sectionName}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                            status === 'PRESENT'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : status === 'ABSENT'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : status === 'LATE'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-purple-50 text-purple-700 border-purple-200'
                          }`}
                        >
                          {status === 'PRESENT' && <CheckCircle2 className="w-3.5 h-3.5" />}
                          {status === 'ABSENT' && <XCircle className="w-3.5 h-3.5" />}
                          {status === 'LATE' && <Clock className="w-3.5 h-3.5" />}
                          {status === 'EXCUSED' && <FileText className="w-3.5 h-3.5" />}
                          {status === 'PRESENT' ? t('common.status.present') : status === 'ABSENT' ? t('common.status.absent') : status === 'LATE' ? t('common.status.late') : status === 'EXCUSED' ? t('common.status.excused') : status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-gray-500 italic max-w-xs truncate">
                        {record.remarks || '—'}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ParentAttendance;
