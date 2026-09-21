import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar,
  Clock,
  MapPin,
  Printer,
  Download,
  RefreshCw,
  AlertCircle,
  Coffee,
  BookOpen,
  Layers,
  GraduationCap,
  Sparkles,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { useAcademicYears } from '../../hooks/useAcademicStructure';
import {
  useTeacherSchedule,
  useTimetablePeriods,
  useSectionSchedule,
} from '../../hooks/useTimetable';
import { teachersApi } from '../../api/teachers';
import { WeeklyScheduleGrid } from '../../components/admin/timetable/WeeklyScheduleGrid';
import {
  SchedulePeriod,
  TeacherScheduleLessonEntry,
  downloadTeacherSchedulePdf,
  downloadSectionSchedulePdf,
} from '../../api/timetable';

const DEFAULT_DAYS = [
  { key: 'MONDAY', label: 'Monday' },
  { key: 'TUESDAY', label: 'Tuesday' },
  { key: 'WEDNESDAY', label: 'Wednesday' },
  { key: 'THURSDAY', label: 'Thursday' },
  { key: 'FRIDAY', label: 'Friday' },
];

function normalizeDayKey(day?: string): string {
  return (day || '').toUpperCase().trim();
}

interface TeacherScheduleProps {
  searchQuery?: string;
}

export const TeacherSchedule: React.FC<TeacherScheduleProps> = ({ searchQuery: propSearchQuery = '' }) => {
  const [localSearch, setLocalSearch] = useState('');
  const effectiveSearch = (localSearch || propSearchQuery || '').trim().toLowerCase();

  // 1. View Mode: 'personal' (My Weekly Schedule) vs 'class' (Class Timetables)
  const [viewMode, setViewMode] = useState<'personal' | 'class'>('personal');

  // 2. Academic Year selection
  const {
    data: academicYears = [],
    isLoading: loadingYears,
  } = useAcademicYears();

  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');

  // Default to current academic year once loaded
  React.useEffect(() => {
    if (!selectedAcademicYearId && academicYears.length > 0) {
      const current = academicYears.find((y) => y.isCurrent) || academicYears[0];
      setSelectedAcademicYearId(current.id);
    }
  }, [academicYears, selectedAcademicYearId]);

  const selectedYear = useMemo(() => {
    return academicYears.find((y) => y.id === selectedAcademicYearId);
  }, [academicYears, selectedAcademicYearId]);

  // 3. Teacher Personal Schedule Query
  const {
    data: teacherData,
    isLoading: loadingSchedule,
    isError: errorSchedule,
    refetch: refetchSchedule,
  } = useTeacherSchedule(selectedAcademicYearId || undefined);

  // 4. Instructional & Break Periods Query
  const {
    data: periods = [],
    isLoading: loadingPeriods,
  } = useTimetablePeriods(selectedAcademicYearId || undefined);

  // 5. Teacher Authorized Teaching Assignments Query (for Class Timetables selector)
  const {
    data: assignments = [],
  } = useQuery({
    queryKey: ['teacher-assignments-context'],
    queryFn: teachersApi.getTeachingAssignments,
    staleTime: 5 * 60 * 1000,
  });

  // Extract distinct authorized class sections strictly for the selected Academic Year
  const authorizedSections = useMemo(() => {
    const map = new Map<string, { id: string; name: string; gradeLevel?: string }>();

    // From assignments API (filter strictly by selectedAcademicYearId when provided)
    for (const a of assignments) {
      if (
        a.ClassSection &&
        (!selectedAcademicYearId || a.academicYearId === selectedAcademicYearId)
      ) {
        map.set(a.ClassSection.id, {
          id: a.ClassSection.id,
          name: a.ClassSection.name,
          gradeLevel: a.ClassSection.GradeLevel?.name,
        });
      }
    }

    // Also from teacher schedule entries (which are already filtered by selectedAcademicYearId)
    if (teacherData?.entries) {
      for (const e of teacherData.entries) {
        if (e.classSection) {
          map.set(e.classSection.id, {
            id: e.classSection.id,
            name: e.classSection.name,
            gradeLevel: e.classSection.gradeLevel || undefined,
          });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments, teacherData?.entries, selectedAcademicYearId]);

  // Selected class section for "Class Timetables" view
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');

  React.useEffect(() => {
    if (
      (!selectedSectionId ||
        !authorizedSections.some((s) => s.id === selectedSectionId)) &&
      authorizedSections.length > 0
    ) {
      setSelectedSectionId(authorizedSections[0].id);
    } else if (authorizedSections.length === 0 && selectedSectionId) {
      setSelectedSectionId('');
    }
  }, [authorizedSections, selectedSectionId]);

  // Section schedule query for selected class section
  const {
    data: sectionScheduleData,
    isLoading: loadingSectionSchedule,
    isError: errorSectionSchedule,
    refetch: refetchSectionSchedule,
  } = useSectionSchedule(
    viewMode === 'class' ? selectedSectionId : undefined,
    selectedAcademicYearId || undefined
  );

  // Check for weekend entries in teacher's schedule
  const hasWeekend = useMemo(() => {
    if (!teacherData?.entries) return false;
    return teacherData.entries.some((e) => {
      const d = normalizeDayKey(e.dayOfWeek);
      return d === 'SATURDAY' || d === 'SUNDAY';
    });
  }, [teacherData?.entries]);

  const displayDays = useMemo(() => {
    if (hasWeekend) {
      return [
        ...DEFAULT_DAYS,
        { key: 'SATURDAY', label: 'Saturday' },
        { key: 'SUNDAY', label: 'Sunday' },
      ];
    }
    return DEFAULT_DAYS;
  }, [hasWeekend]);

  // Build indexed map for Teacher Weekly Schedule: `${dayKey}_${periodId}` -> TeacherScheduleLessonEntry
  const teacherEntryMap = useMemo(() => {
    const map = new Map<string, TeacherScheduleLessonEntry>();
    const entries = teacherData?.entries;
    if (!entries) return map;
    for (const entry of entries) {
      if (entry.dayOfWeek && entry.periodId) {
        const key = `${normalizeDayKey(entry.dayOfWeek)}_${entry.periodId}`;
        map.set(key, entry);
      }
    }
    return map;
  }, [teacherData?.entries]);

  // Sorted periods
  const sortedPeriods: SchedulePeriod[] = useMemo(() => {
    return [...periods].sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) {
        return a.displayOrder - b.displayOrder;
      }
      return a.periodNumber - b.periodNumber;
    });
  }, [periods]);

  // Print handler
  const handlePrint = () => {
    window.print();
  };

  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    const hasEntries =
      viewMode === 'personal'
        ? !!teacherData?.entries && teacherData.entries.length > 0
        : !!sectionScheduleData?.entries && sectionScheduleData.entries.length > 0;

    if (!hasEntries) {
      toast.error('No schedule entries available to download as PDF.');
      return;
    }

    setIsDownloadingPdf(true);
    try {
      if (viewMode === 'personal') {
        await downloadTeacherSchedulePdf({
          academicYearId: selectedAcademicYearId || undefined,
          search: effectiveSearch || undefined,
        });
        toast.success('Teaching schedule PDF downloaded successfully.');
      } else {
        if (!selectedSectionId) {
          toast.error('Please select a class section to download.');
          return;
        }
        await downloadSectionSchedulePdf(selectedSectionId, {
          academicYearId: selectedAcademicYearId || undefined,
          search: effectiveSearch || undefined,
        });
        toast.success('Class timetable PDF downloaded successfully.');
      }
    } catch (err: any) {
      console.error('Failed to download schedule PDF:', err);
      toast.error(err.message || 'Failed to download schedule PDF. Please try again.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const isLoading = loadingYears || loadingSchedule || loadingPeriods;

  return (
    <div className="space-y-6">
      {/* ─── 1. Header Section ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-900 text-white rounded-2xl shadow-sm">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
                My Schedule
              </h1>
              <p className="text-xs sm:text-sm font-medium text-gray-500">
                View your complete teaching timetable and class schedules.
              </p>
            </div>
          </div>
        </div>

        {/* Header Controls: Search + Academic Year Selector + Print Action */}
        <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
          {/* Schedule Search Bar */}
          <div className="relative min-w-[200px] sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              aria-label="Search schedule"
              placeholder="Search subject, class, room..."
              value={localSearch || propSearchQuery || ''}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-900 shadow-xs font-medium"
            />
            {effectiveSearch && (
              <button
                type="button"
                onClick={() => setLocalSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full"
                title="Clear search"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Academic Year Selector */}
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-3 py-1.5 shadow-xs">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Year:
            </span>
            <select
              aria-label="Select Academic Year"
              value={selectedAcademicYearId}
              onChange={(e) => setSelectedAcademicYearId(e.target.value)}
              className="bg-transparent text-xs font-bold text-gray-900 focus:outline-none cursor-pointer pr-1"
            >
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.year} {year.isCurrent ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Download PDF Action */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={
              isDownloadingPdf ||
              isLoading ||
              (viewMode === 'personal'
                ? !teacherData?.entries?.length
                : !sectionScheduleData?.entries?.length)
            }
            onClick={handleDownloadPdf}
            className="rounded-2xl text-xs font-bold border-gray-200 text-blue-900 hover:bg-blue-50/50 shadow-xs flex items-center gap-1.5"
            aria-label="Download schedule as PDF"
          >
            {isDownloadingPdf ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-900" />
            ) : (
              <Download className="w-3.5 h-3.5 text-blue-900" />
            )}
            <span>{isDownloadingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
          </Button>

          {/* Print Action */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="rounded-2xl text-xs font-bold border-gray-200 text-gray-700 hover:bg-gray-50 shadow-xs"
            aria-label="Print timetable"
          >
            <Printer className="w-3.5 h-3.5 mr-1.5" />
            Print
          </Button>
        </div>
      </div>

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
          School Portal — Teacher Schedule
        </h1>
        <p className="text-xs text-gray-700 mt-1 font-medium">
          Teacher: {teacherData?.teacher.fullName || 'Teacher'}
          {teacherData?.teacher.staffId && ` • Staff ID: ${teacherData.teacher.staffId}`}
          {selectedYear && ` • Academic Year: ${selectedYear.year}`}
          {` • Total Weekly Periods: ${teacherData?.totalWeeklyPeriods ?? teacherData?.entries?.length ?? 0}`}
        </p>
      </div>

      {/* ─── 2. Status Ribbon & Mode Switcher ─── */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl shadow-xs border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        {/* Teacher Identity Badge & Stats */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-900 font-black text-xs flex items-center justify-center border border-blue-200">
              {teacherData?.teacher.fullName ? teacherData.teacher.fullName.charAt(0) : 'T'}
            </div>
            <div>
              <span className="text-xs font-black text-gray-900 block leading-tight">
                {teacherData?.teacher.fullName || 'Authenticated Teacher'}
              </span>
              {teacherData?.teacher.staffId && (
                <span className="text-[10px] font-bold text-gray-400 block">
                  Staff ID: {teacherData.teacher.staffId}
                </span>
              )}
            </div>
          </div>

          <div className="h-4 w-px bg-gray-200 hidden sm:block" />

          {/* Total Weekly Periods Pill */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-900 border border-blue-200/60">
            <Sparkles className="w-3.5 h-3.5 text-blue-700" />
            {teacherData?.totalWeeklyPeriods ?? teacherData?.entries?.length ?? 0} Weekly Teaching Periods
          </span>
        </div>

        {/* View Mode Toggle: [My Weekly Schedule] [Class Timetables] */}
        <div
          role="tablist"
          aria-label="Schedule View Modes"
          className="inline-flex p-1 bg-gray-100/80 rounded-2xl border border-gray-200/60 self-start sm:self-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'personal'}
            aria-controls="personal-schedule-panel"
            onClick={() => setViewMode('personal')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'personal'
                ? 'bg-white text-blue-900 shadow-xs'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>My Weekly Schedule</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'class'}
            aria-controls="class-schedule-panel"
            onClick={() => setViewMode('class')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'class'
                ? 'bg-white text-blue-900 shadow-xs'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Class Timetables</span>
          </button>
        </div>
      </div>

      {/* ─── 3. Main Timetable Workspace ─── */}
      {viewMode === 'personal' ? (
        /* ═══════════════════════════════════════════════════════════════════════════ */
        /* MODE A: My Weekly Schedule (Unified Teaching View)                        */
        /* ═══════════════════════════════════════════════════════════════════════════ */
        <div id="personal-schedule-panel" role="tabpanel" className="space-y-4">
          {isLoading ? (
            /* Skeleton Loading State */
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-4 animate-pulse">
              <div className="h-12 bg-gray-100 rounded-2xl w-full" />
              <div className="h-20 bg-gray-50 rounded-2xl w-full" />
              <div className="h-20 bg-gray-50 rounded-2xl w-full" />
              <div className="h-10 bg-amber-50/50 rounded-2xl w-full" />
              <div className="h-20 bg-gray-50 rounded-2xl w-full" />
            </div>
          ) : errorSchedule ? (
            /* Error State with Retry */
            <div className="bg-red-50/80 border border-red-200 rounded-3xl p-8 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
              <h3 className="text-sm font-bold text-red-900">Unable to load your schedule.</h3>
              <p className="text-xs text-red-600 max-w-sm mx-auto">
                There was a problem retrieving your published timetable. Please try again.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetchSchedule()}
                className="rounded-xl border-red-200 text-red-800 hover:bg-red-100/50 text-xs font-bold"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Try Again
              </Button>
            </div>
          ) : sortedPeriods.length === 0 ? (
            <div className="bg-gray-50 p-12 rounded-3xl border border-dashed border-gray-200 text-center text-gray-500 text-xs font-medium">
              No schedule periods have been configured for this academic year.
            </div>
          ) : teacherData && teacherData.entries.length === 0 ? (
            /* Teacher Empty State */
            <div className="bg-white p-12 rounded-3xl border border-dashed border-gray-200 text-center space-y-3 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-900 flex items-center justify-center mx-auto">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-gray-900">No published lessons scheduled</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                No published lessons are currently scheduled for you in this academic year. When timetables are published by the administration, your lessons will appear here automatically.
              </p>
            </div>
          ) : (
            /* Weekly Teacher Schedule Grid */
            <>
              {(() => {
                const matchingPersonalLessonsCount = teacherData?.entries?.filter((entry) => {
                  if (!effectiveSearch) return true;
                  return (
                    (entry.subject?.name || '').toLowerCase().includes(effectiveSearch) ||
                    (entry.subject?.code || '').toLowerCase().includes(effectiveSearch) ||
                    (entry.classSection?.name || '').toLowerCase().includes(effectiveSearch) ||
                    (entry.classSection?.gradeLevel || '').toLowerCase().includes(effectiveSearch) ||
                    (entry.classSection?.effectiveRoom || '').toLowerCase().includes(effectiveSearch)
                  );
                }).length ?? 0;

                if (effectiveSearch && matchingPersonalLessonsCount === 0) {
                  return (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex items-center justify-between gap-2 shadow-xs">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>No teaching lessons match &ldquo;{effectiveSearch}&rdquo; in your personal schedule.</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLocalSearch('')}
                        className="text-amber-800 hover:text-amber-950 text-xs font-bold h-7 px-2.5"
                      >
                        Clear search
                      </Button>
                    </div>
                  );
                }

                if (effectiveSearch && matchingPersonalLessonsCount > 0) {
                  return (
                    <div className="text-xs text-blue-900 bg-blue-50 border border-blue-200/80 rounded-xl px-3 py-2 font-medium flex items-center justify-between">
                      <span>Found {matchingPersonalLessonsCount} matching {matchingPersonalLessonsCount === 1 ? 'lesson' : 'lessons'} for &ldquo;{effectiveSearch}&rdquo; (highlighted below)</span>
                      <button type="button" onClick={() => setLocalSearch('')} className="text-blue-700 hover:text-blue-900 text-xs font-bold underline cursor-pointer">
                        Clear
                      </button>
                    </div>
                  );
                }
                return null;
              })()}
              <div className="overflow-x-auto rounded-3xl border border-gray-100 bg-white shadow-sm">
                <table className="w-full text-left border-collapse min-w-[780px]">
                {/* Table Header */}
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    <th
                      scope="col"
                      className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest w-48 min-w-[170px]"
                    >
                      Time / Period
                    </th>
                    {displayDays.map((day) => (
                      <th
                        key={day.key}
                        scope="col"
                        className="px-4 py-4 text-xs font-black text-gray-900 tracking-tight"
                      >
                        {day.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y divide-gray-100">
                  {sortedPeriods.map((period) => {
                    // Case 1: Break Period (Amber Row)
                    if (period.isBreak) {
                      return (
                        <tr
                          key={period.id}
                          className="bg-amber-50/40 border-y border-amber-100/60"
                        >
                          <td className="px-6 py-4 border-r border-amber-100/60">
                            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                              <Coffee className="w-4 h-4 text-amber-700 flex-shrink-0" />
                              <span>{period.name}</span>
                              <span className="text-[10px] text-amber-700/80 font-medium">
                                ({period.startTime} – {period.endTime})
                              </span>
                            </div>
                          </td>
                          <td
                            colSpan={displayDays.length}
                            className="px-6 py-4 text-center text-xs font-bold text-amber-800 tracking-wide uppercase"
                          >
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/70 text-amber-800 text-[11px]">
                              Break • No Classes Scheduled
                            </span>
                          </td>
                        </tr>
                      );
                    }

                    // Case 2: Instructional Period
                    return (
                      <tr key={period.id} className="hover:bg-gray-50/30 transition-colors">
                        {/* Period Info Header Cell */}
                        <th
                          scope="row"
                          className="px-6 py-5 align-top border-r border-gray-50 font-normal bg-gray-50/20"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-black text-gray-900">{period.name}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                                P{period.periodNumber}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] font-medium text-gray-400">
                              <Clock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              <span>
                                {period.startTime} – {period.endTime}
                              </span>
                            </div>
                          </div>
                        </th>

                        {/* Day Cells */}
                        {displayDays.map((day) => {
                          const cellKey = `${day.key}_${period.id}`;
                          const lesson = teacherEntryMap.get(cellKey);

                          return (
                            <td
                              key={cellKey}
                              className="px-3 py-3 align-top border-r border-gray-50 last:border-r-0"
                            >
                              {lesson ? (() => {
                                const lessonMatches = !effectiveSearch || (
                                  (lesson.subject?.name || '').toLowerCase().includes(effectiveSearch) ||
                                  (lesson.subject?.code || '').toLowerCase().includes(effectiveSearch) ||
                                  (lesson.classSection?.name || '').toLowerCase().includes(effectiveSearch) ||
                                  (lesson.classSection?.gradeLevel || '').toLowerCase().includes(effectiveSearch) ||
                                  (lesson.classSection?.effectiveRoom || '').toLowerCase().includes(effectiveSearch)
                                );

                                return (
                                <div className={`w-full text-left bg-blue-900/95 text-white p-3.5 rounded-2xl shadow-sm space-y-2 border-l-4 transition-all ${
                                  effectiveSearch
                                    ? lessonMatches
                                      ? 'border-blue-300 ring-2 ring-blue-400 shadow-lg scale-[1.02]'
                                      : 'border-blue-400 opacity-25 grayscale-[70%]'
                                    : 'border-blue-400'
                                }`}>
                                  {/* Subject Title & Code */}
                                  <div className="flex items-start justify-between gap-1">
                                    <span className="text-xs font-bold leading-tight block line-clamp-2">
                                      {lesson.subject?.name || 'Subject'}
                                    </span>
                                    {lesson.subject?.code && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-800/80 text-blue-200 whitespace-nowrap flex-shrink-0">
                                        {lesson.subject.code}
                                      </span>
                                    )}
                                  </div>

                                  {/* Target Class Section & Grade */}
                                  <div className="flex items-center gap-1.5 text-[11px] text-blue-100 font-bold pt-0.5">
                                    <GraduationCap className="w-3 h-3 text-blue-300 flex-shrink-0" />
                                    <span className="truncate">
                                      {lesson.classSection?.name}
                                      {lesson.classSection?.gradeLevel && ` (${lesson.classSection.gradeLevel})`}
                                    </span>
                                  </div>

                                  {/* Effective Room */}
                                  {lesson.classSection?.effectiveRoom && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-blue-200 font-medium">
                                      <MapPin className="w-3 h-3 text-blue-300 flex-shrink-0" />
                                      <span className="truncate">{lesson.classSection.effectiveRoom}</span>
                                    </div>
                                  )}
                                </div>
                                );
                              })() : (
                                <div className="w-full h-24 bg-gray-50/30 rounded-2xl border border-dashed border-gray-200/50 flex items-center justify-center text-gray-300 text-xs font-medium">
                                  —
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      ) : (
        /* ═══════════════════════════════════════════════════════════════════════════ */
        /* MODE B: Class Timetables Inspector (Authorized Section View)              */
        /* ═══════════════════════════════════════════════════════════════════════════ */
        <div id="class-schedule-panel" role="tabpanel" className="space-y-6">
          {/* Section Selector Bar */}
          <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-900" />
                <span>Authorized Class Timetable</span>
              </h3>
              <p className="text-xs text-gray-500 font-medium">
                Inspect the full published schedule for any class section you are assigned to teach.
              </p>
            </div>

            {/* Section Dropdown */}
            {authorizedSections.length > 0 ? (
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-1.5 self-start sm:self-auto">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Class:
                </span>
                <select
                  aria-label="Select Class Section to view"
                  value={selectedSectionId}
                  onChange={(e) => setSelectedSectionId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-gray-900 focus:outline-none cursor-pointer pr-2"
                >
                  {authorizedSections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name} {sec.gradeLevel ? `(${sec.gradeLevel})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <span className="text-xs text-gray-400 font-medium">
                No teaching sections assigned
              </span>
            )}
          </div>

          {/* Section Schedule Grid View */}
          {loadingSectionSchedule ? (
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-4 animate-pulse">
              <div className="h-10 bg-gray-100 rounded-2xl w-full" />
              <div className="h-20 bg-gray-50 rounded-2xl w-full" />
              <div className="h-20 bg-gray-50 rounded-2xl w-full" />
            </div>
          ) : errorSectionSchedule ? (
            <div className="bg-red-50/80 border border-red-200 rounded-3xl p-8 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
              <h3 className="text-sm font-bold text-red-900">Unable to load this class timetable.</h3>
              <p className="text-xs text-red-600 max-w-sm mx-auto">
                You may not be authorized to view this section or the schedule could not be loaded.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetchSectionSchedule()}
                className="rounded-xl border-red-200 text-red-800 text-xs font-bold"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Try Again
              </Button>
            </div>
          ) : !sectionScheduleData || sectionScheduleData.entries.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-dashed border-gray-200 text-center space-y-2 shadow-sm">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center mx-auto">
                <Calendar className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-gray-900">No published timetable available</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                {sectionScheduleData?.message ||
                  'No published timetable is currently available for this section.'}
              </p>
            </div>
          ) : (
            <>
              {(() => {
                const matchingSectionEntriesCount = sectionScheduleData.entries.filter((entry) => {
                  if (!effectiveSearch) return true;
                  return (
                    (entry.subject?.name || '').toLowerCase().includes(effectiveSearch) ||
                    (entry.subject?.code || '').toLowerCase().includes(effectiveSearch) ||
                    (entry.teacher?.firstName || '').toLowerCase().includes(effectiveSearch) ||
                    (entry.teacher?.lastName || '').toLowerCase().includes(effectiveSearch) ||
                    (entry.effectiveRoom || entry.roomOverride || sectionScheduleData.classSection?.roomNumber || '').toLowerCase().includes(effectiveSearch)
                  );
                }).length;

                if (effectiveSearch && matchingSectionEntriesCount === 0) {
                  return (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex items-center justify-between gap-2 shadow-xs">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>No scheduled lessons match &ldquo;{effectiveSearch}&rdquo; in this class timetable.</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLocalSearch('')}
                        className="text-amber-800 hover:text-amber-950 text-xs font-bold h-7 px-2.5"
                      >
                        Clear search
                      </Button>
                    </div>
                  );
                }

                if (effectiveSearch && matchingSectionEntriesCount > 0) {
                  return (
                    <div className="text-xs text-blue-900 bg-blue-50 border border-blue-200/80 rounded-xl px-3 py-2 font-medium flex items-center justify-between">
                      <span>Found {matchingSectionEntriesCount} matching {matchingSectionEntriesCount === 1 ? 'lesson' : 'lessons'} for &ldquo;{effectiveSearch}&rdquo; (highlighted below)</span>
                      <button type="button" onClick={() => setLocalSearch('')} className="text-blue-700 hover:text-blue-900 text-xs font-bold underline cursor-pointer">
                        Clear
                      </button>
                    </div>
                  );
                }
                return null;
              })()}
              <WeeklyScheduleGrid
                periods={sectionScheduleData.periods || periods}
                entries={sectionScheduleData.entries}
                sectionName={sectionScheduleData.classSection?.name}
                roomNumber={sectionScheduleData.classSection?.roomNumber}
                readOnly={true}
                customCardClass={(day, period, entry) => {
                  if (!effectiveSearch || !entry) return '';
                  const subjectName = (entry.subject?.name || '').toLowerCase();
                  const subjectCode = (entry.subject?.code || '').toLowerCase();
                  const teacherFirst = (entry.teacher?.firstName || '').toLowerCase();
                  const teacherLast = (entry.teacher?.lastName || '').toLowerCase();
                  const room = (entry.effectiveRoom || entry.roomOverride || sectionScheduleData.classSection?.roomNumber || '').toLowerCase();
                  const matches =
                    subjectName.includes(effectiveSearch) ||
                    subjectCode.includes(effectiveSearch) ||
                    teacherFirst.includes(effectiveSearch) ||
                    teacherLast.includes(effectiveSearch) ||
                    room.includes(effectiveSearch);
                  return matches
                    ? 'ring-2 ring-blue-600 bg-blue-50/50 shadow-md font-semibold transition-all scale-[1.01]'
                    : 'opacity-30 grayscale-[60%] transition-opacity';
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default TeacherSchedule;
