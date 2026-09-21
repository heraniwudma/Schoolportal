import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParent } from '../../context/ParentContext';
import { getChildSchedule } from '../../api/parents';
import { useAcademicYears } from '../../hooks/useAcademicStructure';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  User, 
  BookOpen, 
  Users, 
  AlertCircle, 
  RefreshCw, 
  Layers,
  LayoutGrid,
  ListFilter,
  Printer,
  Search,
  X
} from 'lucide-react';
import { ChildSelector } from '../../components/parent/ChildSelector';
import StatCard from '../../components/dashboard/StatCard';
import { Button } from '../../components/ui/button';
import { Link, useOutletContext } from 'react-router-dom';
import { useTranslation } from '../../i18n/LanguageContext';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

function normalizeDay(day: number | string): string {
  if (typeof day === 'number') {
    if (day === 1) return 'Monday';
    if (day === 2) return 'Tuesday';
    if (day === 3) return 'Wednesday';
    if (day === 4) return 'Thursday';
    if (day === 5) return 'Friday';
  }
  const str = String(day).toUpperCase().trim();
  if (str.startsWith('MON') || str === '1') return 'Monday';
  if (str.startsWith('TUE') || str === '2') return 'Tuesday';
  if (str.startsWith('WED') || str === '3') return 'Wednesday';
  if (str.startsWith('THU') || str === '4') return 'Thursday';
  if (str.startsWith('FRI') || str === '5') return 'Friday';
  return String(day);
}

export const ParentClassSchedule: React.FC = () => {
  const { 
    childrenList, 
    selectedChild, 
    selectedChildId, 
    isLoading: parentLoading, 
    error: parentError, 
    refetchChildren 
  } = useParent();
  const { t } = useTranslation();

  const getDayLabel = (day: string) => {
    const d = day.toLowerCase();
    if (d === 'monday') return t('common.days.monday');
    if (d === 'tuesday') return t('common.days.tuesday');
    if (d === 'wednesday') return t('common.days.wednesday');
    if (d === 'thursday') return t('common.days.thursday');
    if (d === 'friday') return t('common.days.friday');
    return day;
  };

  const outletCtx = useOutletContext<{ searchQuery?: string } | null>();
  const [localSearch, setLocalSearch] = useState('');
  const [activeDayTab, setActiveDayTab] = useState<string>('Monday');
  const [viewMode, setViewMode] = useState<'grid' | 'cards'>('grid');

  const effectiveSearch = (localSearch || outletCtx?.searchQuery || '').trim().toLowerCase();

  // Academic Year selection
  const {
    data: academicYears = [],
    isLoading: loadingYears,
  } = useAcademicYears();

  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');

  // Default to current academic year once loaded
  useEffect(() => {
    if (!selectedAcademicYearId && academicYears.length > 0) {
      const current = academicYears.find((y) => y.isCurrent) || academicYears[0];
      setSelectedAcademicYearId(current.id);
    }
  }, [academicYears, selectedAcademicYearId]);

  const selectedYear = useMemo(() => {
    return academicYears.find((y) => y.id === selectedAcademicYearId);
  }, [academicYears, selectedAcademicYearId]);

  // Query child schedule with cache isolation by child ID and academic year
  const {
    data: scheduleResponse,
    isLoading: scheduleLoading,
    isError: scheduleError,
    error: fetchError,
    refetch: refetchSchedule,
  } = useQuery({
    queryKey: ['parent-child-schedule-page', selectedChildId, selectedAcademicYearId],
    queryFn: () => (selectedChildId ? getChildSchedule(selectedChildId, selectedAcademicYearId || undefined) : null),
    enabled: !!selectedChildId,
    staleTime: 5 * 60 * 1000,
  });

  const rawSchedule = useMemo(() => scheduleResponse?.schedule || [], [scheduleResponse?.schedule]);

  // Group and sort schedule slots
  const { timeSlots, normalizedSlots, uniqueSubjectsCount } = useMemo(() => {
    const slots = rawSchedule.map((s) => ({
      ...s,
      normalizedDay: normalizeDay(s.dayOfWeek),
      timeLabel: `${s.startTime} - ${s.endTime}`,
    }));

    // Extract unique time intervals sorted by startTime
    const times = Array.from(new Set(slots.map((s) => s.timeLabel))).sort((a, b) => {
      const timeA = a.split(' - ')[0] || '';
      const timeB = b.split(' - ')[0] || '';
      return timeA.localeCompare(timeB);
    });

    const subjects = new Set(slots.map((s) => s.subjectName).filter(Boolean));

    return {
      timeSlots: times,
      normalizedSlots: slots,
      uniqueSubjectsCount: subjects.size,
    };
  }, [rawSchedule]);

  // Day-filtered slots for cards view
  const activeDaySlots = useMemo(() => {
    let list = normalizedSlots.filter((s) => s.normalizedDay.toLowerCase() === activeDayTab.toLowerCase());
    if (effectiveSearch) {
      list = list.filter(
        (s) =>
          (s.subjectName || '').toLowerCase().includes(effectiveSearch) ||
          (s.subjectCode || '').toLowerCase().includes(effectiveSearch) ||
          (s.teacherName || '').toLowerCase().includes(effectiveSearch) ||
          (s.roomNumber || '').toLowerCase().includes(effectiveSearch),
      );
    }
    return list.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [normalizedSlots, activeDayTab, effectiveSearch]);

  const handlePrint = () => {
    window.print();
  };

  if (parentLoading || loadingYears) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-900 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-gray-500">{t('parent.classSchedule.loading')}</span>
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
            <h3 className="font-bold text-red-900">{t('parent.classSchedule.loadError')}</h3>
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
          <h2 className="text-2xl font-bold text-gray-900">{t('parent.classSchedule.emptyTitle')}</h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
            {t('parent.classSchedule.emptyDesc')}
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
  const sectionName = selectedChild?.classSection?.name || selectedChild?.currentEnrollment?.classSection || t('parent.classSchedule.statClassSection');
  const roomNo = selectedChild?.classSection?.roomNumber || t('parent.classSchedule.statAssignedRoom');
  const academicYear = selectedYear?.year || selectedChild?.currentEnrollment?.academicYear || 'Current Year';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ─── Print Specific Styles ─── */}
      <style>{`
        @media print {
          @page {
            size: landscape;
            margin: 8mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background: white !important;
          }
          nav, aside, header, .fixed, .print\\:hidden {
            display: none !important;
          }
          main {
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* ─── Printable Header (Visible only when printing) ─── */}
      <div className="hidden print:block mb-6 border-b border-gray-300 pb-4">
        <h1 className="text-xl font-black text-gray-900">
          {t('parent.classSchedule.printTitle')}
        </h1>
        <p className="text-xs text-gray-700 mt-1 font-medium">
          {t('common.childSelector.studentLabel')} {childName}
          {selectedChild?.admissionNo && ` • ${t('parent.attendance.admissionId')} ${selectedChild.admissionNo}`}
          {sectionName && ` • Section: ${sectionName}`}
          {gradeLevel && ` (${gradeLevel})`}
          {` • ${t('parent.attendance.academicYear')} ${academicYear}`}
          {` • ${t('parent.classSchedule.printTotalLessons', { count: rawSchedule.length })}`}
        </p>
      </div>

      {/* Top Banner / Student Information Header */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6 print:hidden">
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

        {/* Controls: Child Selector + Academic Year Selector + Print Button */}
        <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
          {/* Child Selector if parent has multiple children */}
          {childrenList.length > 1 && (
            <div className="flex items-center gap-2 bg-gray-50 p-1.5 px-3 rounded-2xl border border-gray-200/70">
              <span className="text-xs font-bold text-gray-500">{t('common.childSelector.studentLabel')}</span>
              <ChildSelector />
            </div>
          )}

          {/* Academic Year Selector */}
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-1.5 shadow-xs">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              {t('parent.classSchedule.yearLabel')}
            </span>
            <select
              aria-label="Select Academic Year"
              value={selectedAcademicYearId}
              onChange={(e) => setSelectedAcademicYearId(e.target.value)}
              className="bg-transparent text-xs font-bold text-gray-900 focus:outline-none cursor-pointer pr-1"
            >
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.year} {year.isCurrent ? t('parent.classSchedule.currentTag') : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Print Action */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="rounded-2xl text-xs font-bold border-gray-200 text-gray-700 hover:bg-gray-50 shadow-xs"
            aria-label={t('parent.classSchedule.printTimetableAria')}
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            {t('parent.classSchedule.printButton')}
          </Button>
        </div>
      </div>

      {/* API Error State */}
      {scheduleError && (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 flex items-start gap-4 print:hidden">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-red-900">{t('parent.classSchedule.apiError')}</h4>
            <p className="text-xs text-red-700">{(fetchError as Error)?.message || 'Network error occurred.'}</p>
            <button
              onClick={() => void refetchSchedule()}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> {t('common.actions.retry')}
            </button>
          </div>
        </div>
      )}

      {/* Quick Summary StatCards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <StatCard
          title={t('parent.classSchedule.statWeeklyPeriods')}
          value={scheduleLoading ? '…' : rawSchedule.length}
          icon={Calendar}
          iconClassName="bg-blue-50 text-blue-600"
        />
        <StatCard
          title={t('parent.classSchedule.statActiveSubjects')}
          value={scheduleLoading ? '…' : uniqueSubjectsCount}
          icon={BookOpen}
          iconClassName="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          title={t('parent.classSchedule.statClassSection')}
          value={sectionName}
          icon={Layers}
          iconClassName="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          title={t('parent.classSchedule.statAssignedRoom')}
          value={roomNo}
          icon={MapPin}
          iconClassName="bg-purple-50 text-purple-600"
        />
      </div>

      {/* Main Timetable Card */}
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header with View Mode Switcher */}
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              {t('parent.classSchedule.title')}
            </h3>
            <span className="text-xs bg-gray-100 text-gray-600 font-bold px-2.5 py-1 rounded-full">
              {scheduleLoading ? '…' : t('parent.classSchedule.sessionsCount', { count: rawSchedule.length })}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search subject, teacher, room..."
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

            {/* View Mode Toggle */}
            <div className="flex bg-gray-100/80 p-1 rounded-xl text-xs font-semibold text-gray-600">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'grid'
                    ? 'bg-white text-gray-900 shadow-xs font-bold'
                    : 'hover:text-gray-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                {t('parent.classSchedule.viewGrid')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  viewMode === 'cards'
                    ? 'bg-white text-gray-900 shadow-xs font-bold'
                    : 'hover:text-gray-900'
                }`}
              >
                <ListFilter className="w-3.5 h-3.5" />
                {t('parent.classSchedule.viewDay')}
              </button>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {scheduleLoading && (
          <div className="p-12 text-center text-sm text-gray-500">
            <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
              <div className="w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin"></div>
              <span>{t('parent.classSchedule.loadingTimetable', { name: childName })}</span>
            </div>
          </div>
        )}

        {/* Empty Timetable State */}
        {!scheduleLoading && !scheduleError && rawSchedule.length === 0 && (
          <div className="p-12 text-center text-sm text-gray-500 max-w-md mx-auto space-y-3">
            <div className="w-14 h-14 bg-gray-50 text-gray-400 rounded-2xl flex items-center justify-center mx-auto">
              <Calendar className="w-7 h-7" />
            </div>
            <h4 className="text-base font-bold text-gray-800">{t('parent.classSchedule.noTimetableTitle')}</h4>
            <p className="text-xs text-gray-400 leading-relaxed">
              {t('parent.classSchedule.noTimetableDesc', { name: childName, year: academicYear })}
            </p>
          </div>
        )}

        {/* View Mode 1: Weekly Grid View */}
        {!scheduleLoading && !scheduleError && rawSchedule.length > 0 && viewMode === 'grid' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-gray-50/80 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                  <th className="px-6 py-4 w-40">{t('parent.classSchedule.colTimePeriod')}</th>
                  {DAYS.map((day) => (
                    <th key={day} className="px-6 py-4 font-bold text-gray-900">
                      {getDayLabel(day)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {timeSlots.map((time) => (
                  <tr key={time} className="hover:bg-gray-50/40 transition-colors">
                    <td className="px-6 py-6 align-top">
                      <span className="text-xs font-bold text-blue-900 bg-blue-50 px-3 py-1.5 rounded-xl whitespace-nowrap inline-flex items-center gap-1.5 border border-blue-200/60">
                        <Clock className="w-3 h-3 text-blue-700" />
                        {time}
                      </span>
                    </td>
                    {DAYS.map((day) => {
                      const session = normalizedSlots.find(
                        (s) => s.normalizedDay.toLowerCase() === day.toLowerCase() && s.timeLabel === time,
                      );

                      const isMatch = session && effectiveSearch
                        ? (
                            (session.subjectName || '').toLowerCase().includes(effectiveSearch) ||
                            (session.subjectCode || '').toLowerCase().includes(effectiveSearch) ||
                            (session.teacherName || '').toLowerCase().includes(effectiveSearch) ||
                            (session.roomNumber || '').toLowerCase().includes(effectiveSearch)
                          )
                        : true;

                      return (
                        <td key={`${day}-${time}`} className="px-4 py-4 align-top min-w-[180px]">
                          {session ? (
                            <div className={`bg-gradient-to-br from-blue-900 to-indigo-900 text-white p-4 rounded-2xl shadow-xs space-y-2 border-l-4 border-blue-400 transition-all ${effectiveSearch && !isMatch ? 'opacity-25' : effectiveSearch && isMatch ? 'ring-2 ring-blue-400 shadow-md scale-[1.02]' : 'hover:-translate-y-0.5'}`}>
                              <div className="flex items-start justify-between gap-1">
                                <h4 className="font-bold text-sm leading-snug">{session.subjectName}</h4>
                                {session.subjectCode && session.subjectCode !== '—' && (
                                  <span className="px-1.5 py-0.5 bg-white/20 text-[10px] font-mono rounded">
                                    {session.subjectCode}
                                  </span>
                                )}
                              </div>
                              <div className="space-y-1 pt-1 border-t border-white/10 text-[11px] text-blue-100">
                                <div className="flex items-center gap-1.5 truncate">
                                  <User className="w-3.5 h-3.5 text-blue-300 flex-shrink-0" />
                                  <span className="truncate">{session.teacherName}</span>
                                </div>
                                <div className="flex items-center gap-1.5 truncate">
                                  <MapPin className="w-3.5 h-3.5 text-blue-300 flex-shrink-0" />
                                  <span className="truncate">{t('parent.classSchedule.roomLabel', { room: session.roomNumber || roomNo })}</span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="h-24 bg-gray-50/70 rounded-2xl border-2 border-dashed border-gray-100 flex items-center justify-center text-xs text-gray-400 font-medium">
                              {t('parent.classSchedule.freePeriod')}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* View Mode 2: Day-by-Day Cards View (Optimized for Mobile/Detail) */}
        {!scheduleLoading && !scheduleError && rawSchedule.length > 0 && viewMode === 'cards' && (
          <div className="p-6 space-y-6">
            {/* Day Selector Pills */}
            <div className="flex gap-2 overflow-x-auto pb-2">
              {DAYS.map((day) => {
                const isSelected = activeDayTab.toLowerCase() === day.toLowerCase();
                const dayCount = normalizedSlots.filter(
                  (s) => s.normalizedDay.toLowerCase() === day.toLowerCase(),
                ).length;

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setActiveDayTab(day)}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                      isSelected
                        ? 'bg-blue-900 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <span>{getDayLabel(day)}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {dayCount}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Day Timeline Cards */}
            <div className="space-y-3">
              {activeDaySlots.length === 0 && (
                <div className="p-8 text-center text-gray-400 text-xs bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                  <p>
                    {effectiveSearch
                      ? `No classes matching "${localSearch || outletCtx?.searchQuery}" on ${getDayLabel(activeDayTab)}.`
                      : t('parent.classSchedule.noClassesForDay', { day: getDayLabel(activeDayTab) })}
                  </p>
                  {effectiveSearch && (
                    <button
                      type="button"
                      onClick={() => setLocalSearch('')}
                      className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Clear search
                    </button>
                  )}
                </div>
              )}

              {activeDaySlots.map((session, index) => (
                <div
                  key={session.id || index}
                  className="p-5 bg-white rounded-2xl border border-gray-100 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-blue-200 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center font-bold text-sm flex-shrink-0">
                      #{index + 1}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-gray-900 text-base">{session.subjectName}</h4>
                        {session.subjectCode && session.subjectCode !== '—' && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-mono font-semibold rounded">
                            {session.subjectCode}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-500 pt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-gray-400" />
                          {session.teacherName}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-gray-400" />
                          {t('parent.classSchedule.roomLabel', { room: session.roomNumber || roomNo })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="self-end sm:self-auto">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-900 rounded-xl text-xs font-bold border border-blue-200/60">
                      <Clock className="w-3.5 h-3.5 text-blue-700" />
                      {session.timeLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParentClassSchedule;
