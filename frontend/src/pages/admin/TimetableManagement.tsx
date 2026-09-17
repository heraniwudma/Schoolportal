import React, { useEffect, useState, useMemo, useRef } from 'react';
import { Calendar, LayoutGrid, AlertCircle, RefreshCw } from 'lucide-react';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useGradeLevels } from '../../hooks/useAcademicStructure';
import {
  useSectionSchedule,
  useTimetablePeriods,
  useSaveDraftSchedule,
  usePublishSchedule,
} from '../../hooks/useTimetable';
import { TimetableToolbar } from '../../components/admin/timetable/TimetableToolbar';
import { WeeklyScheduleGrid } from '../../components/admin/timetable/WeeklyScheduleGrid';
import { LessonEditorDialog } from '../../components/admin/timetable/LessonEditorDialog';
import { TimetablePreviewDialog } from '../../components/admin/timetable/TimetablePreviewDialog';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import { DayOfWeek, ScheduleEntry, SchedulePeriod, PublishSchedulePayload } from '../../api/timetable';
import { toast } from 'sonner';

interface EditorContext {
  isOpen: boolean;
  mode: 'create' | 'edit';
  dayOfWeek: string;
  dayLabel: string;
  period: SchedulePeriod | null;
  entry: ScheduleEntry | null;
}

interface PendingNavigation {
  type: 'academicYear' | 'gradeLevel' | 'classSection';
  targetId: string;
}

// Canonical representation for order-independent dirty checking
interface CanonicalEntry {
  dayOfWeek: string;
  periodId: string;
  subjectId: string;
  teacherId: string;
  roomOverride: string;
}

function normalizeEntry(entry: {
  dayOfWeek?: string;
  periodId?: string;
  subjectId?: string;
  teacherId?: string;
  roomOverride?: string | null;
}): CanonicalEntry {
  return {
    dayOfWeek: (entry.dayOfWeek || '').toUpperCase().trim(),
    periodId: (entry.periodId || '').trim(),
    subjectId: (entry.subjectId || '').trim(),
    teacherId: (entry.teacherId || '').trim(),
    roomOverride: (entry.roomOverride || '').trim(),
  };
}

function sortCanonicalEntries(a: CanonicalEntry, b: CanonicalEntry): number {
  if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek.localeCompare(b.dayOfWeek);
  if (a.periodId !== b.periodId) return a.periodId.localeCompare(b.periodId);
  if (a.subjectId !== b.subjectId) return a.subjectId.localeCompare(b.subjectId);
  if (a.teacherId !== b.teacherId) return a.teacherId.localeCompare(b.teacherId);
  return a.roomOverride.localeCompare(b.roomOverride);
}

function areSchedulesEqual(entriesA: ScheduleEntry[], entriesB: ScheduleEntry[]): boolean {
  if (entriesA.length !== entriesB.length) return false;

  const canonicalA = entriesA.map(normalizeEntry).sort(sortCanonicalEntries);
  const canonicalB = entriesB.map(normalizeEntry).sort(sortCanonicalEntries);

  for (let i = 0; i < canonicalA.length; i++) {
    const a = canonicalA[i];
    const b = canonicalB[i];
    if (
      a.dayOfWeek !== b.dayOfWeek ||
      a.periodId !== b.periodId ||
      a.subjectId !== b.subjectId ||
      a.teacherId !== b.teacherId ||
      a.roomOverride !== b.roomOverride
    ) {
      return false;
    }
  }

  return true;
}

const TimetableManagement: React.FC = () => {
  const {
    academicYears,
    activeAcademicYear,
    activeAcademicYearId,
    isLoading: loadingYears,
    isError: errorYears,
    refetchAcademicYears: refetchYears,
  } = useAcademicYear();

  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>(activeAcademicYearId || '');
  const academicYearId = selectedAcademicYearId || activeAcademicYearId;

  const {
    data: gradeLevels = [],
    isLoading: loadingGrades,
    isError: errorGrades,
    refetch: refetchGrades,
  } = useGradeLevels(academicYearId);

  const [selectedGradeLevelId, setSelectedGradeLevelId] = useState<string>('');
  const [selectedClassSectionId, setSelectedClassSectionId] = useState<string>('');

  // The single unified local intended state
  const [workingEntries, setWorkingEntries] = useState<ScheduleEntry[]>([]);

  // Navigation & Workflow Dialog states
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState<boolean>(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState<boolean>(false);
  const [showConflictDialog, setShowConflictDialog] = useState<boolean>(false);
  const [conflictMessage, setConflictMessage] = useState<string>('');

  // Lesson Editor Dialog state
  const [editorContext, setEditorContext] = useState<EditorContext>({
    isOpen: false,
    mode: 'create',
    dayOfWeek: '',
    dayLabel: '',
    period: null,
    entry: null,
  });

  const lastLoadedContextRef = useRef<string>('');

  const activeGradeLevels = useMemo(() => {
    return gradeLevels.filter((g) => g.ClassSection && g.ClassSection.length > 0);
  }, [gradeLevels]);

  // 1. Default to current academic year when loaded
  useEffect(() => {
    if (!selectedAcademicYearId && activeAcademicYearId) {
      setSelectedAcademicYearId(activeAcademicYearId);
    }
  }, [activeAcademicYearId, selectedAcademicYearId]);

  // 2. Default to first active grade level and first section when grades load
  useEffect(() => {
    if (activeGradeLevels.length > 0) {
      const currentGrade = activeGradeLevels.find((g) => g.id === selectedGradeLevelId) || activeGradeLevels[0];
      if (currentGrade.id !== selectedGradeLevelId) {
        setSelectedGradeLevelId(currentGrade.id);
      }

      const sections = currentGrade.ClassSection || [];
      const currentSection = sections.find((s) => s.id === selectedClassSectionId) || sections[0];
      if (currentSection && currentSection.id !== selectedClassSectionId) {
        setSelectedClassSectionId(currentSection.id);
      } else if (!currentSection) {
        setSelectedClassSectionId('');
      }
    } else {
      setSelectedGradeLevelId('');
      setSelectedClassSectionId('');
    }
  }, [activeGradeLevels, selectedGradeLevelId, selectedClassSectionId]);

  // 3. React Query hooks for periods, schedule, and mutations
  const {
    data: periods = [],
    isLoading: loadingPeriods,
    isError: errorPeriods,
    refetch: refetchPeriods,
  } = useTimetablePeriods(academicYearId);

  const {
    data: scheduleData,
    isLoading: loadingSchedule,
    isError: errorSchedule,
    refetch: refetchSchedule,
  } = useSectionSchedule(selectedClassSectionId, academicYearId);

  const saveDraftMutation = useSaveDraftSchedule();
  const publishMutation = usePublishSchedule();

  const isMutationPending = saveDraftMutation.isPending || publishMutation.isPending;

  const serverEntries = useMemo(() => scheduleData?.entries || [], [scheduleData]);
  const scheduleStatus = scheduleData?.status || 'DRAFT';
  const publishedAt = scheduleData?.publishedAt || null;

  // Canonical, order-independent dirty check
  const isDirty = useMemo(() => {
    return !areSchedulesEqual(workingEntries, serverEntries);
  }, [workingEntries, serverEntries]);

  // Synchronize server schedule with workingEntries when clean or when context changes
  useEffect(() => {
    if (scheduleData) {
      const currentContext = `${selectedAcademicYearId}_${selectedClassSectionId}`;
      const isContextChange = lastLoadedContextRef.current !== currentContext;

      if (isContextChange || !isDirty) {
        setWorkingEntries(scheduleData.entries || []);
        lastLoadedContextRef.current = currentContext;
      }
    }
  }, [scheduleData, selectedAcademicYearId, selectedClassSectionId, isDirty]);

  // beforeunload Protection
  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  // Safe Cascade Handlers with Navigation Protection
  const handleSelectAcademicYear = (yearId: string) => {
    if (isMutationPending) return;
    if (isDirty) {
      setPendingNavigation({ type: 'academicYear', targetId: yearId });
    } else {
      setSelectedAcademicYearId(yearId);
    }
  };

  const handleSelectGradeLevel = (gradeId: string) => {
    if (isMutationPending) return;
    if (isDirty) {
      setPendingNavigation({ type: 'gradeLevel', targetId: gradeId });
    } else {
      setSelectedGradeLevelId(gradeId);
      const grade = gradeLevels.find((g) => g.id === gradeId);
      const sections = grade?.ClassSection || [];
      setSelectedClassSectionId(sections.length > 0 ? sections[0].id : '');
    }
  };

  const handleSelectClassSection = (sectionId: string) => {
    if (isMutationPending) return;
    if (isDirty) {
      setPendingNavigation({ type: 'classSection', targetId: sectionId });
    } else {
      setSelectedClassSectionId(sectionId);
    }
  };

  const handleConfirmPendingNavigation = () => {
    if (!pendingNavigation) return;

    if (pendingNavigation.type === 'academicYear') {
      setSelectedAcademicYearId(pendingNavigation.targetId);
    } else if (pendingNavigation.type === 'gradeLevel') {
      setSelectedGradeLevelId(pendingNavigation.targetId);
      const grade = gradeLevels.find((g) => g.id === pendingNavigation.targetId);
      const sections = grade?.ClassSection || [];
      setSelectedClassSectionId(sections.length > 0 ? sections[0].id : '');
    } else if (pendingNavigation.type === 'classSection') {
      setSelectedClassSectionId(pendingNavigation.targetId);
    }

    setPendingNavigation(null);
  };

  // Discard Changes Handler
  const handleConfirmDiscard = () => {
    setWorkingEntries(serverEntries);
    setShowDiscardConfirm(false);
    toast.info('Unsaved changes discarded.');
  };

  // Save Draft Workflow
  const handleSaveDraft = async () => {
    if (!isDirty || isMutationPending) return;

    const payload = {
      academicYearId: selectedAcademicYearId,
      entries: workingEntries.map((e) => ({
        dayOfWeek: (e.dayOfWeek || '').toUpperCase().trim() as DayOfWeek,
        periodId: e.periodId,
        subjectId: e.subjectId,
        roomOverride: e.roomOverride?.trim() || undefined,
      })),
    };

    try {
      await saveDraftMutation.mutateAsync({
        classSectionId: selectedClassSectionId,
        payload,
      });
      toast.success('Draft schedule saved successfully.');
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      if (err?.status === 409) {
        toast.error(
          'This timetable was changed elsewhere. Your local changes were not overwritten. Refresh the server version before continuing.'
        );
      } else if (err?.status === 400) {
        toast.error(err.message || 'Validation error saving draft.');
      } else if (err?.status === 403) {
        toast.error('You do not have permission to save this timetable.');
      } else {
        toast.error(err.message || 'Unable to save draft schedule. Please try again.');
      }
    }
  };

  // Publish Workflow (Stage 3.6)
  const handlePublishClick = () => {
    if (!isDirty || isMutationPending) return;

    if (workingEntries.length === 0) {
      toast.error('A timetable must contain at least one lesson before it can be published.');
      return;
    }

    setShowPublishConfirm(true);
  };

  const handleConfirmPublish = async () => {
    const payload: PublishSchedulePayload = {
      academicYearId: selectedAcademicYearId,
      entries: workingEntries.map((e) => ({
        dayOfWeek: (e.dayOfWeek || '').toUpperCase().trim() as DayOfWeek,
        periodId: e.periodId,
        subjectId: e.subjectId,
        roomOverride: e.roomOverride?.trim() || undefined,
      })),
      expectedUpdatedAt: scheduleData?.updatedAt || undefined,
    };

    try {
      const res = await publishMutation.mutateAsync({
        classSectionId: selectedClassSectionId,
        payload,
      });

      // Synchronize workingEntries and server state
      setWorkingEntries(res.entries || []);
      setShowPublishConfirm(false);
      toast.success('Timetable published successfully. Live schedules have been updated.');
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string };
      setShowPublishConfirm(false);

      if (err?.status === 409) {
        setConflictMessage(
          err.message ||
            'This timetable was modified by another administrator after you loaded it. Your changes have NOT been published and remain preserved in your workspace.'
        );
        setShowConflictDialog(true);
      } else if (err?.status === 400) {
        toast.error(err.message || 'Validation error publishing timetable.');
      } else if (err?.status === 403) {
        toast.error('You do not have permission to publish this timetable.');
      } else if (err?.status === 404) {
        toast.error('The timetable or class section could not be found.');
      } else {
        toast.error(err.message || 'Unable to publish timetable. Please try again.');
      }
    }
  };

  const handleConfirmConflictDiscard = () => {
    setShowConflictDialog(false);
    refetchSchedule();
    setWorkingEntries(serverEntries);
    toast.info('Server schedule refreshed. Local changes discarded.');
  };

  const handleRetryStructure = () => {
    refetchYears();
    refetchGrades();
  };

  const handleRetrySchedule = () => {
    refetchPeriods();
    refetchSchedule();
  };

  // Selected entities for display
  const currentYear = academicYears.find((y) => y.id === selectedAcademicYearId);
  const currentGrade = gradeLevels.find((g) => g.id === selectedGradeLevelId);
  const currentSection = currentGrade?.ClassSection?.find((s) => s.id === selectedClassSectionId);

  const effectivePeriods = scheduleData?.periods?.length ? scheduleData.periods : periods;
  const isLoadingWorkspace = loadingPeriods || loadingSchedule;
  const isErrorWorkspace = errorPeriods || errorSchedule;

  // Cell click handler
  const handleCellClick = (
    day: { key: string; label: string },
    period: SchedulePeriod,
    existingEntry?: ScheduleEntry | null
  ) => {
    if (period.isBreak || isMutationPending) return;
    setEditorContext({
      isOpen: true,
      mode: existingEntry ? 'edit' : 'create',
      dayOfWeek: day.key,
      dayLabel: day.label,
      period,
      entry: existingEntry || null,
    });
  };

  const handleCloseEditor = () => {
    setEditorContext((prev) => ({ ...prev, isOpen: false }));
  };

  const handleSaveWorkingEntries = (updatedEntries: ScheduleEntry[]) => {
    setWorkingEntries(updatedEntries);
  };

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-900 text-white rounded-2xl shadow-sm">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                Timetable Management
              </h1>
              <p className="text-sm font-medium text-gray-500">
                Create, review, and publish weekly class timetables.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Filter & Workflow Toolbar */}
      <TimetableToolbar
        academicYears={academicYears}
        gradeLevels={activeGradeLevels}
        selectedAcademicYearId={selectedAcademicYearId}
        selectedGradeLevelId={selectedGradeLevelId}
        selectedClassSectionId={selectedClassSectionId}
        onSelectAcademicYear={handleSelectAcademicYear}
        onSelectGradeLevel={handleSelectGradeLevel}
        onSelectClassSection={handleSelectClassSection}
        isLoadingYears={loadingYears}
        isLoadingGrades={loadingGrades}
        isError={errorYears || errorGrades}
        onRetry={handleRetryStructure}
        scheduleStatus={scheduleStatus}
        publishedAt={publishedAt}
        isDirty={isDirty}
        isSavingDraft={saveDraftMutation.isPending}
        isPublishing={publishMutation.isPending}
        onSaveDraft={handleSaveDraft}
        onDiscardChanges={() => setShowDiscardConfirm(true)}
        onOpenPreview={() => setShowPreviewDialog(true)}
        onPublish={handlePublishClick}
      />

      {/* 3. Main Workspace Area */}
      {!selectedClassSectionId ? (
        <div className="bg-white p-12 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 text-blue-900">
            <LayoutGrid className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">Select a Class Section</h3>
          <p className="text-sm text-gray-500 max-w-md">
            Choose an academic year, grade level, and section from the toolbar above to view and manage its weekly class schedule.
          </p>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
          {/* Context Ribbon */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-gray-900">
                  {currentSection?.name || 'Class Section'}
                </h2>
                {currentSection?.displayName && (
                  <span className="text-xs font-bold text-gray-400">
                    ({currentSection.displayName})
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-gray-500 mt-0.5">
                {currentGrade?.name} • Academic Year {currentYear?.year || '—'}
                {scheduleData?.classSection?.roomNumber &&
                  ` • Default Room: ${scheduleData.classSection.roomNumber}`}
              </p>
            </div>
          </div>

          {/* Workspace Body */}
          {isLoadingWorkspace ? (
            /* Loading Skeleton State */
            <div className="space-y-4 animate-pulse">
              <div className="h-10 bg-gray-100 rounded-xl w-full" />
              <div className="h-20 bg-gray-50 rounded-xl w-full" />
              <div className="h-20 bg-gray-50 rounded-xl w-full" />
              <div className="h-12 bg-amber-50/40 rounded-xl w-full" />
              <div className="h-20 bg-gray-50 rounded-xl w-full" />
            </div>
          ) : isErrorWorkspace ? (
            /* Error State */
            <div className="bg-red-50/80 border border-red-200 rounded-2xl p-8 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-red-600 mx-auto" />
              <h3 className="text-sm font-bold text-red-900">Unable to load this timetable.</h3>
              <p className="text-xs text-red-600 max-w-sm mx-auto">
                There was a problem retrieving the schedule entries or period configuration for this class section.
              </p>
              <button
                type="button"
                onClick={handleRetrySchedule}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-red-200 rounded-xl text-xs font-bold text-red-700 hover:bg-red-50 transition-colors shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          ) : (
            /* Interactive Weekly Schedule Grid */
            <div className="space-y-4">
              {workingEntries.length === 0 && (
                <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200/60 flex items-center gap-2 text-blue-900 text-xs font-medium">
                  <Calendar className="w-4 h-4 text-blue-700 flex-shrink-0" />
                  <span>
                    No lessons scheduled yet for this class section. Click any empty period cell below to add a lesson.
                  </span>
                </div>
              )}

              <WeeklyScheduleGrid
                periods={effectivePeriods}
                entries={workingEntries}
                sectionName={currentSection?.name}
                roomNumber={scheduleData?.classSection?.roomNumber}
                onCellClick={isMutationPending ? undefined : handleCellClick}
              />
            </div>
          )}
        </div>
      )}

      {/* 4. Lesson Editor Dialog */}
      <LessonEditorDialog
        isOpen={editorContext.isOpen}
        onClose={handleCloseEditor}
        mode={editorContext.mode}
        dayOfWeek={editorContext.dayOfWeek}
        dayLabel={editorContext.dayLabel}
        period={editorContext.period}
        initialEntry={editorContext.entry}
        academicYearId={selectedAcademicYearId}
        classSectionId={selectedClassSectionId}
        defaultRoomNumber={scheduleData?.classSection?.roomNumber}
        scheduleStatus={scheduleStatus}
        workingEntries={workingEntries}
        onSaveWorkingEntries={handleSaveWorkingEntries}
      />

      {/* 5. Navigation Protection Confirmation Dialog */}
      <ConfirmDialog
        open={pendingNavigation !== null}
        title="Unsaved Changes"
        description="You have unsaved changes on the current timetable. Changing the section or academic year will discard these changes."
        confirmLabel="Discard Changes"
        cancelLabel="Stay on Section"
        variant="warning"
        isLoading={false}
        onConfirm={handleConfirmPendingNavigation}
        onCancel={() => setPendingNavigation(null)}
      />

      {/* 6. Discard Changes Confirmation Dialog */}
      <ConfirmDialog
        open={showDiscardConfirm}
        title="Discard Unsaved Changes?"
        description="Are you sure you want to discard your current timetable edits? All changes made since the last save will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        variant="danger"
        isLoading={false}
        onConfirm={handleConfirmDiscard}
        onCancel={() => setShowDiscardConfirm(false)}
      />

      {/* 7. Publish Changes Confirmation Dialog (Stage 3.6) */}
      <ConfirmDialog
        open={showPublishConfirm}
        title="Publish Timetable?"
        description={`You are about to publish the weekly timetable for ${
          currentSection?.name || 'this class section'
        } (${currentGrade?.name || 'Selected Grade'}, Academic Year ${
          currentYear?.year || '—'
        }). This will make the timetable live. Students, teachers, and parents will see these ${
          workingEntries.length
        } scheduled lessons immediately.`}
        confirmLabel="Publish Timetable"
        cancelLabel="Cancel"
        variant="warning"
        isLoading={publishMutation.isPending}
        onConfirm={handleConfirmPublish}
        onCancel={() => !publishMutation.isPending && setShowPublishConfirm(false)}
      />

      {/* 8. Concurrency Conflict Dialog (409) */}
      <ConfirmDialog
        open={showConflictDialog}
        title="Timetable Changed Elsewhere"
        description={
          conflictMessage ||
          'This timetable was modified by another administrator after you loaded it. Your changes have NOT been published and remain preserved locally. Refresh to discard local changes and load the latest server version.'
        }
        confirmLabel="Refresh & Discard Local Changes"
        cancelLabel="Keep My Changes"
        variant="danger"
        isLoading={false}
        onConfirm={handleConfirmConflictDiscard}
        onCancel={() => setShowConflictDialog(false)}
      />

      {/* 9. Timetable Preview & Comparison Dialog (Stage 3.7) */}
      <TimetablePreviewDialog
        isOpen={showPreviewDialog}
        onClose={() => setShowPreviewDialog(false)}
        sectionName={currentSection?.name}
        sectionDisplayName={currentSection?.displayName}
        gradeName={currentGrade?.name}
        academicYear={currentYear?.year}
        scheduleStatus={scheduleStatus}
        publishedAt={publishedAt}
        defaultRoomNumber={scheduleData?.classSection?.roomNumber}
        periods={effectivePeriods}
        serverEntries={scheduleData?.entries || []}
        workingEntries={workingEntries}
        isDirty={isDirty}
        onProceedToPublish={() => {
          setShowPreviewDialog(false);
          handlePublishClick();
        }}
      />
    </div>
  );
};

export default TimetableManagement;
