/**
 * HomeroomReportCards — Report Card Preparation Panel
 *
 * Teachers use this page to:
 *  1. Track subject submission status per term
 *  2. Set per-student competency grades (A/B/C/D), conduct, and homeroom remarks
 *  3. Select students and print their full report cards
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  RefreshCw, Printer, Download, CheckCircle2, AlertCircle,
  Clock, ChevronDown, ChevronUp, FileText, Search, Save, Send, X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useAcademicYears } from '../../hooks/useAcademicStructure';
import {
  useHomeroomContext,
  useHomeroomSubmissionMatrix,
  useCompiledReportCards,
  useRosterReviewStatus,
  ReportCardData,
} from '../../hooks/useHomeroom';
import { saveHomeroomConduct, submitReportCardsToAdmin } from '../../api/adminReports';
import { downloadCompiledReportCardsPdf } from '../../api/reportCards';


// ─── Types ────────────────────────────────────────────────────────────────────

type Grade = 'A' | 'B' | 'C' | 'D';

interface BehaviourOverride {
  academicPotential:         Grade;
  uniform:                   Grade;
  timeManagement:            Grade;
  harmfulActions:            Grade;
  responsibilities:          Grade;
  clubActivities:            Grade;
  classworkHomework:         Grade;
  flexibility:               Grade;
  hardWork:                  Grade;
  positiveThinking:          Grade;
  obeyingRules:              Grade;
  interpersonalCommunication: Grade;
}

interface StudentOverride {
  conduct:            Grade;
  homeroomRemarksSem1: string;
  homeroomRemarksSem2: string;
  behaviourAssessment: BehaviourOverride;
}

const DEFAULT_BEHAVIOUR: BehaviourOverride = {
  academicPotential: 'A', uniform: 'A', timeManagement: 'A',
  harmfulActions: 'A', responsibilities: 'A', clubActivities: 'A',
  classworkHomework: 'A', flexibility: 'A', hardWork: 'A',
  positiveThinking: 'A', obeyingRules: 'A', interpersonalCommunication: 'A',
};

const defaultOverride = (): StudentOverride => ({
  conduct: 'A',
  homeroomRemarksSem1: '',
  homeroomRemarksSem2: '',
  behaviourAssessment: { ...DEFAULT_BEHAVIOUR },
});

// All 12 competency labels in order
const COMPETENCY_KEYS: Array<{ key: keyof BehaviourOverride; label: string }> = [
  { key: 'academicPotential',         label: 'Academic Potential' },
  { key: 'uniform',                   label: 'Uniform' },
  { key: 'timeManagement',            label: 'Time Management' },
  { key: 'harmfulActions',            label: 'Harmful Actions' },
  { key: 'responsibilities',          label: 'Responsibilities' },
  { key: 'clubActivities',            label: 'Club Activities' },
  { key: 'classworkHomework',         label: 'Classwork/Homework' },
  { key: 'flexibility',               label: 'Flexibility' },
  { key: 'hardWork',                  label: 'Hard Work' },
  { key: 'positiveThinking',          label: 'Positive Thinking' },
  { key: 'obeyingRules',              label: 'Obeying Rules' },
  { key: 'interpersonalCommunication', label: 'Interpersonal Communication' },
];

const STATIC_TERMS = [
  { code: 'TERM_1', label: 'Term 1' },
  { code: 'TERM_2', label: 'Term 2' },
  { code: 'TERM_3', label: 'Term 3' },
  { code: 'TERM_4', label: 'Term 4' },
];

// ─── Small helpers ────────────────────────────────────────────────────────────

function GradeSelect({
  value,
  onChange,
  className = '',
}: {
  value: Grade;
  onChange: (v: Grade) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Grade)}
      className={cn(
        'h-7 w-14 rounded border border-gray-300 text-xs font-bold text-center focus:ring-1 focus:ring-blue-500 outline-none bg-white',
        value === 'A' && 'text-green-700 border-green-300',
        value === 'B' && 'text-blue-700 border-blue-300',
        value === 'C' && 'text-amber-700 border-amber-300',
        value === 'D' && 'text-red-700 border-red-300',
        className,
      )}
    >
      {(['A', 'B', 'C', 'D'] as Grade[]).map((g) => (
        <option key={g} value={g}>{g}</option>
      ))}
    </select>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HomeroomReportCards() {
  const [selectedTerm, setSelectedTerm] = useState('TERM_1');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [overrides, setOverrides] = useState<Record<string, StudentOverride>>({});
  const [expandedStudents, setExpandedStudents] = useState<Record<string, boolean>>({});
  const [showPrint, setShowPrint] = useState(false);

  // React Query hooks
  const { data: homeroomContext, isLoading: contextLoading, error: contextError } = useHomeroomContext();
  const { data: years = [], isLoading: yearsLoading } = useAcademicYears();

  // Always derive yearId from the section's own academicYearId so all queries
  // match the section's year exactly. Fall back to the active/first year only
  // when context hasn't resolved yet.
  const currentYear = years.find((y) => y.isCurrent) || years[0];
  const sectionId = homeroomContext?.assignedSection?.id;
  const yearId =
    homeroomContext?.assignedSection?.academicYearId ??
    homeroomContext?.academicYearId ??
    currentYear?.id;

  const {
    data: matrix,
    isLoading: matrixLoading,
    isFetching: matrixFetching,
    error: matrixError,
    refetch: refetchMatrix,
  } = useHomeroomSubmissionMatrix(sectionId, yearId, selectedTerm);

  const {
    data: compiledStudents = [],
    isLoading: cardsLoading,
    isFetching: cardsFetching,
    error: cardsError,
    refetch: refetchCards,
  } = useCompiledReportCards(sectionId, yearId);

  const [savingConduct, setSavingConduct] = useState(false);
  const [submittingCards, setSubmittingCards] = useState(false);

  const {
    data: reviewStatusData,
    refetch: refetchReviewStatus,
  } = useRosterReviewStatus(sectionId, yearId);

  const reviewStatus = reviewStatusData?.status || 'DRAFT';
  const isReportCardSubmitted = reviewStatusData?.isReportCardSubmitted ?? (reviewStatus === 'SUBMITTED_TO_ADMIN' || reviewStatus === 'APPROVED');
  const isReportCardApproved = reviewStatus === 'APPROVED';

  const loading   = contextLoading || (yearsLoading && !yearId) || ((matrixLoading || cardsLoading) && !compiledStudents.length);
  const refreshing = (matrixFetching || cardsFetching) && !loading;

  const error =
    (contextError as any)?.message ||
    (!contextLoading && !homeroomContext?.assignedSection ? 'No homeroom section assigned to your account' : '') ||
    (matrixError as any)?.message ||
    (cardsError as any)?.message ||
    '';

  // ── Overrides helpers ─────────────────────────────────────────────────────

  const getOverride = useCallback(
    (studentId: string): StudentOverride =>
      overrides[studentId] ?? defaultOverride(),
    [overrides],
  );

  const patchOverride = useCallback(
    (studentId: string, patch: Partial<StudentOverride>) => {
      setOverrides((prev) => ({
        ...prev,
        [studentId]: { ...getOverride(studentId), ...patch },
      }));
    },
    [getOverride],
  );

  const patchBehaviour = useCallback(
    (studentId: string, key: keyof BehaviourOverride, value: Grade) => {
      setOverrides((prev) => {
        const curr = prev[studentId] ?? defaultOverride();
        return {
          ...prev,
          [studentId]: {
            ...curr,
            behaviourAssessment: { ...curr.behaviourAssessment, [key]: value },
          },
        };
      });
    },
    [],
  );

  // ── Build final cards (compiled data + teacher overrides) ─────────────────

  const buildFinalCard = useCallback(
    (student: ReportCardData): ReportCardData => {
      const ov = getOverride(student.studentId);
      return {
        ...student,
        conduct:             ov.conduct,
        homeroomRemarksSem1: ov.homeroomRemarksSem1,
        homeroomRemarksSem2: ov.homeroomRemarksSem2,
        behaviourAssessment: ov.behaviourAssessment,
      };
    },
    [getOverride],
  );

  // ── Print ─────────────────────────────────────────────────────────────────

  const handlePrint = () => {
    if (!selectedStudents.length) {
      toast.error('Select at least one student to print');
      return;
    }
    setShowPrint(true);
    // Defer print dialog until overlay renders
    setTimeout(() => window.print(), 200);
  };

  // ── CSV export (summary only) ─────────────────────────────────────────────

  const handleExportCsv = () => {
    const selected = compiledStudents.filter((s) => selectedStudents.includes(s.studentId));
    if (!selected.length) { toast.error('Select at least one student'); return; }
    const rows = selected.map((s) => [
      s.admissionNo, `${s.firstName} ${s.lastName}`,
      s.overallAverage ?? '', s.overallRank || '',
      getOverride(s.studentId).conduct,
    ]);
    const csv = [['Admission No', 'Student', 'Yearly Average', 'Rank', 'Conduct'], ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `report-cards-${selectedTerm}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleRefresh = async () => {
    try {
      await Promise.all([refetchMatrix(), refetchCards(), refetchReviewStatus()]);
      toast.success('Refreshed');
    } catch (err: any) {
      toast.error(err?.message ?? 'Refresh failed');
    }
  };

  const handleSaveConduct = async () => {
    if (!sectionId || !yearId) return;
    setSavingConduct(true);
    try {
      const conductMap: Record<string, string> = {};
      compiledStudents.forEach((s) => {
        const ov = getOverride(s.studentId);
        conductMap[s.studentId] = ov.conduct || 'A';
      });
      await saveHomeroomConduct(sectionId, yearId, conductMap);
      toast.success('Conduct saved successfully');
      await Promise.all([refetchCards(), refetchReviewStatus()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save conduct');
    } finally {
      setSavingConduct(false);
    }
  };

  const handleSubmitToAdmin = async () => {
    if (!sectionId || !yearId) return;
    if (compiledStudents.length === 0) {
      toast.error('No students enrolled to submit');
      return;
    }

    setSubmittingCards(true);
    try {
      const conductMap: Record<string, string> = {};
      compiledStudents.forEach((s) => {
        const ov = getOverride(s.studentId);
        conductMap[s.studentId] = ov.conduct || 'A';
      });
      await saveHomeroomConduct(sectionId, yearId, conductMap);

      await submitReportCardsToAdmin(sectionId, yearId);
      toast.success('✓ Report cards successfully submitted to Admin for review!');
      await Promise.all([refetchCards(), refetchReviewStatus(), refetchMatrix()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit report cards');
    } finally {
      setSubmittingCards(false);
    }
  };

  // ── Render states ─────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <Clock className="w-10 h-10 text-blue-900 mx-auto mb-3 animate-spin" />
        <p className="text-gray-500">Loading report cards…</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-red-900">Error</p>
        <p className="text-red-700 text-sm mt-1">{error}</p>
        <button onClick={handleRefresh} className="mt-3 text-sm font-semibold text-red-800 underline">
          Try again
        </button>
      </div>
    </div>
  );

  const subjectRows = matrix?.matrix ?? matrix?.subjects ?? [];
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleStudents = normalizedSearch
    ? compiledStudents.filter((student) =>
        `${student.firstName} ${student.lastName} ${student.admissionNo}`.toLowerCase().includes(normalizedSearch),
      )
    : compiledStudents;
  const allSelected = visibleStudents.length > 0 && visibleStudents.every((student) => selectedStudents.includes(student.studentId));

  // Students to put into the print overlay
  const printStudents = compiledStudents
    .filter((s) => selectedStudents.includes(s.studentId))
    .map(buildFinalCard);

  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!sectionId || !yearId) {
      toast.error('No homeroom section or academic year selected.');
      return;
    }
    if (compiledStudents.length === 0) {
      toast.warning('No report card data available to download.');
      return;
    }
    setIsDownloadingPdf(true);
    try {
      const targetIds = selectedStudents.length > 0 ? selectedStudents : undefined;
      await downloadCompiledReportCardsPdf(
        sectionId,
        yearId,
        searchQuery,
        targetIds,
        `Student_Report_${homeroomContext?.assignedSection?.name || 'Class'}.pdf`,
      );
      toast.success('Report cards PDF downloaded successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download report cards PDF');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Print overlay — only visible during window.print() ── */}
      {showPrint && (
        <PrintOverlay
          students={printStudents}
          onClose={() => setShowPrint(false)}
        />
      )}

      <div className={cn('max-w-5xl space-y-6', showPrint && 'hidden print:hidden')}>

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Report Card Preparation</h1>
              <span
                className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5 ${
                  isReportCardApproved
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : isReportCardSubmitted
                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                    : reviewStatus === 'REJECTED'
                    ? 'bg-red-100 text-red-800 border border-red-300'
                    : 'bg-gray-100 text-gray-700 border border-gray-300'
                }`}
              >
                {isReportCardApproved && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                {isReportCardSubmitted && !isReportCardApproved && <Clock className="w-3.5 h-3.5 text-blue-600" />}
                {reviewStatus === 'REJECTED' && <AlertCircle className="w-3.5 h-3.5 text-red-600" />}
                {!isReportCardSubmitted && reviewStatus !== 'REJECTED' && <FileText className="w-3.5 h-3.5 text-gray-500" />}
                {isReportCardApproved
                  ? 'Approved'
                  : isReportCardSubmitted
                  ? 'Submitted to Admin'
                  : reviewStatus === 'REJECTED'
                  ? 'Returned / Rejected'
                  : 'Draft'}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              Set competency grades and remarks, then submit to Admin for review or print selected cards.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button onClick={handleRefresh} disabled={refreshing}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button onClick={handleExportCsv}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200">
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf || cardsLoading || compiledStudents.length === 0}
              className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-900 border border-blue-200 rounded-lg text-sm font-semibold hover:bg-blue-100 disabled:opacity-50 transition-colors shadow-sm"
              title="Download Report Cards as PDF"
            >
              {isDownloadingPdf ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Download PDF
            </button>
            {!isReportCardApproved && (
              <button
                onClick={handleSaveConduct}
                disabled={savingConduct}
                className="flex items-center gap-2 px-3 py-2 border border-blue-600 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-50 disabled:opacity-50 transition-colors"
                title="Save conduct grades for all students"
              >
                <Save className="w-4 h-4" />
                {savingConduct ? 'Saving…' : 'Save Conduct'}
              </button>
            )}
            {!isReportCardApproved && (
              <button
                onClick={handleSubmitToAdmin}
                disabled={submittingCards || isReportCardSubmitted}
                className="flex items-center gap-2 px-3.5 py-2 bg-indigo-900 text-white rounded-lg text-sm font-semibold hover:bg-indigo-950 disabled:opacity-50 transition-colors shadow-sm"
                title={isReportCardSubmitted ? 'Already submitted to Admin' : 'Submit report cards to Admin for review'}
              >
                <Send className="w-4 h-4" />
                {submittingCards ? 'Submitting…' : isReportCardSubmitted ? 'Submitted to Admin' : 'Submit to Admin'}
              </button>
            )}
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 shadow-sm shadow-blue-900/20">
              <Printer className="w-4 h-4" /> Print Selected ({selectedStudents.length})
            </button>
          </div>
        </div>

        {/* ── Rejection notice if rejected by admin ── */}
        {reviewStatus === 'REJECTED' && reviewStatusData?.rejectionReason && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900 text-sm">Report Cards Returned by Admin</p>
              <p className="text-red-700 text-xs mt-1">{reviewStatusData.rejectionReason}</p>
            </div>
          </div>
        )}

        {/* ── Term selector ── */}
        <div className="bg-white border rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Select Term</p>
          <div className="flex gap-2 flex-wrap">
            {STATIC_TERMS.map((t) => (
              <button key={t.code} onClick={() => setSelectedTerm(t.code)}
                className={cn('px-4 py-2 rounded-lg text-sm font-semibold border transition-colors',
                  selectedTerm === t.code
                    ? 'bg-blue-900 text-white border-blue-900'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50')}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Subject submission status ── */}
        <div className="bg-white border rounded-xl p-5">
          {matrix?.allSubmitted ? (
            <div className="flex items-center gap-3 text-green-700">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <p className="font-semibold">
                All subjects submitted for {STATIC_TERMS.find((t) => t.code === selectedTerm)?.label}.
                Cards are ready to compile.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 text-amber-700">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  Waiting for subject teachers to submit results for{' '}
                  {STATIC_TERMS.find((t) => t.code === selectedTerm)?.label}.
                </p>
                <p className="text-sm mt-0.5 text-amber-600">
                  Press <strong>Refresh</strong> after they submit.
                </p>
              </div>
            </div>
          )}

          {subjectRows.length > 0 && (
            <div className="mt-3 divide-y border rounded-lg overflow-hidden">
              {subjectRows.map((item: any) => (
                <div key={item.subjectName} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span className="text-gray-800">
                    {item.subjectName} <span className="text-gray-400 font-normal">({item.teacherName})</span>
                  </span>
                  {item.isSubmitted
                    ? <span className="flex items-center gap-1 text-green-700 text-xs font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Submitted</span>
                    : <span className="flex items-center gap-1 text-amber-600 text-xs font-semibold"><AlertCircle className="w-3.5 h-3.5" /> Pending</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Grading method reference ── */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-black text-blue-900 uppercase tracking-widest mb-2">Method of Grading Reference</p>
          <div className="grid grid-cols-5 gap-1 text-center text-xs">
            {[
              { range: '90–100', grade: 'A', color: 'bg-green-100 text-green-800' },
              { range: '80–89',  grade: 'B', color: 'bg-blue-100 text-blue-800' },
              { range: '70–79',  grade: 'C', color: 'bg-amber-100 text-amber-800' },
              { range: '60–69',  grade: 'D', color: 'bg-orange-100 text-orange-800' },
              { range: 'Below 60', grade: 'F', color: 'bg-red-100 text-red-800' },
            ].map(({ range, grade, color }) => (
              <div key={grade} className={cn('rounded-lg p-2 font-semibold', color)}>
                <p className="text-base font-black">{grade}</p>
                <p className="text-[10px] font-normal">{range}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Student list with per-student competency panel ── */}
        <div className="bg-white border rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input type="checkbox" checked={allSelected}
                  onChange={(e) => setSelectedStudents((current) => e.target.checked
                    ? [...new Set([...current, ...visibleStudents.map((student) => student.studentId)])]
                    : current.filter((id) => !visibleStudents.some((student) => student.studentId === id)))} />
                <span className="font-semibold text-gray-700">
                  Select all ({visibleStudents.length} students)
                </span>
              </label>
              <div className="relative ml-auto w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search name or student ID..."
                  className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <span className="text-xs text-gray-400 font-semibold">
              Expand a student row to edit competency grades and remarks
            </span>
          </div>

          {compiledStudents.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="font-semibold">No students enrolled in this section.</p>
            </div>
          ) : visibleStudents.length === 0 ? (
            <div className="p-12 text-center">
              <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-center">
                <Search className="w-10 h-10 text-gray-300 mb-3" />
                <h4 className="text-sm font-semibold text-gray-900 mb-1">No matching students found</h4>
                <p className="text-xs text-gray-500 mb-4">
                  No students in this section match "{searchQuery}". Check the spelling or clear your search.
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Clear Search
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y">
              {visibleStudents.map((student) => {
                const ov = getOverride(student.studentId);
                const expanded = !!expandedStudents[student.studentId];
                const isSelected = selectedStudents.includes(student.studentId);

                return (
                  <div key={student.studentId}
                    className={cn('transition-colors', isSelected ? 'bg-blue-50/30' : 'bg-white')}>

                    {/* Summary row */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <input type="checkbox" checked={isSelected}
                        onChange={(e) =>
                          setSelectedStudents((prev) =>
                            e.target.checked
                              ? [...prev, student.studentId]
                              : prev.filter((id) => id !== student.studentId))
                        }
                        className="shrink-0" />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">
                            {student.firstName} {student.lastName}
                          </span>
                          <span className="text-xs text-gray-400">{student.admissionNo}</span>
                        </div>
                        <div className="flex items-center gap-4 mt-0.5 text-xs text-gray-500">
                          <span>Avg: <strong className={cn(
                            student.overallAverage >= 80 ? 'text-green-700' :
                            student.overallAverage >= 60 ? 'text-blue-700' : 'text-amber-700')}>
                            {student.overallAverage?.toFixed(1) ?? '—'}
                          </strong></span>
                          <span>Rank: <strong>{student.overallRank || '—'}</strong></span>
                          <span>Absent: <strong>{student.absentDays}</strong></span>
                          <span>Conduct: <strong>{ov.conduct}</strong></span>
                        </div>
                      </div>

                      <button
                        onClick={() => setExpandedStudents((prev) => ({ ...prev, [student.studentId]: !prev[student.studentId] }))}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shrink-0">
                        {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Collapse</> : <><ChevronDown className="w-3.5 h-3.5" /> Edit Grades</>}
                      </button>
                    </div>

                    {/* Expanded competency panel */}
                    {expanded && (
                      <div className="px-4 pb-5 pt-1 bg-gray-50/60 border-t border-gray-100 space-y-5">

                        {/* Conduct + remarks */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                              Conduct Grade
                            </label>
                            <GradeSelect
                              value={ov.conduct}
                              onChange={(v) => patchOverride(student.studentId, { conduct: v })}
                              className="w-20" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                              Homeroom Remarks — 1st Semester
                            </label>
                            <textarea
                              rows={2}
                              placeholder="e.g. Excellent result — keep it up!"
                              value={ov.homeroomRemarksSem1}
                              onChange={(e) => patchOverride(student.studentId, { homeroomRemarksSem1: e.target.value })}
                              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none placeholder:text-gray-300" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">
                              Homeroom Remarks — 2nd Semester
                            </label>
                            <textarea
                              rows={2}
                              placeholder="e.g. Good progress, needs support in Maths."
                              value={ov.homeroomRemarksSem2}
                              onChange={(e) => patchOverride(student.studentId, { homeroomRemarksSem2: e.target.value })}
                              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none resize-none placeholder:text-gray-300" />
                          </div>
                        </div>

                        {/* Basic Skills competency grid */}
                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                            Basic Skills &amp; Personal Development — select A / B / C / D
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {COMPETENCY_KEYS.map(({ key, label }) => (
                              <div key={key} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                                <span className="text-xs text-gray-700 mr-2 leading-tight">{label}</span>
                                <GradeSelect
                                  value={ov.behaviourAssessment[key]}
                                  onChange={(v) => patchBehaviour(student.studentId, key, v)} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!visibleStudents.length && <p className="p-8 text-center text-sm text-gray-500">No students match that name or student ID.</p>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Print Overlay ────────────────────────────────────────────────────────────
// Rendered on top of the prep panel; only printed pages are visible when printing.

function PrintOverlay({
  students,
  onClose,
}: {
  students: ReportCardData[];
  onClose: () => void;
}) {
  return (
    <>
      {/* Screen overlay (hidden when printing) */}
      <div className="fixed inset-0 z-50 bg-white overflow-y-auto print:hidden">
        <div className="max-w-4xl mx-auto p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Print Preview — {students.length} card(s)</h2>
            <button onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200">
              ← Back to Prep
            </button>
          </div>
          <p className="text-sm text-gray-500">
            Each card prints front + back per student. Use your browser's Print dialog
            (Ctrl+P / ⌘+P) and choose "A4 Portrait" paper.
          </p>
          {students.map((student) => (
            <div key={student.studentId} className="shadow-lg border rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 border-b">
                {student.firstName} {student.lastName} — Front
              </div>
              <div className="p-4" style={{ fontFamily: 'Arial, sans-serif' }}>
                <FrontPage student={student} />
              </div>
              <div className="bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 border-t border-b">
                {student.firstName} {student.lastName} — Back
              </div>
              <div className="p-4" style={{ fontFamily: 'Arial, sans-serif' }}>
                <BackPage student={student} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actual print pages (only these render on paper) */}
      <div className="hidden print:block">
        {students.map((student) => (
          <React.Fragment key={student.studentId}>
            {/* Front page */}
            <div className="print-page" style={{ pageBreakAfter: 'always' }}>
              <FrontPage student={student} />
            </div>
            {/* Back page */}
            <div className="print-page" style={{ pageBreakAfter: 'always' }}>
              <BackPage student={student} />
            </div>
          </React.Fragment>
        ))}
      </div>

      <style>{`
        @media print {
          body > *:not(.print\\:block) { display: none !important; }
          .print-page {
            width: 8.5in;
            min-height: 11in;
            padding: 0.5in;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
            font-size: 10px;
          }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </>
  );
}

// ─── Front Page ───────────────────────────────────────────────────────────────

function FrontPage({ student }: { student: ReportCardData }) {
  return (
    <div className="h-full flex flex-col space-y-3 text-xs" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div className="text-center border-b-2 border-gray-800 pb-2">
        <h1 className="text-lg font-bold">Mentor Academy, from Kindergarten - High School</h1>
        <p className="text-xs font-semibold">STUDENT REPORT CARD</p>
      </div>

      {/* Student info */}
      <div className="grid grid-cols-2 gap-4 border-b pb-3">
        <div className="space-y-0.5">
          <p><strong>Student's Name:</strong> {student.firstName} {student.lastName}</p>
          <p><strong>Grade:</strong> {student.gradeLevel}</p>
          <p><strong>Age:</strong> {student.age}</p>
        </div>
        <div className="space-y-0.5">
          <p><strong>Sex:</strong> {student.gender}</p>
          <p><strong>Academic Year:</strong> {student.academicYear}</p>
          <p><strong>Promoted to Grade:</strong> {student.promotedToGrade || 'Pending'}</p>
        </div>
      </div>

      {/* Grading method */}
      <div>
        <p className="font-bold text-center mb-1">METHOD OF GRADING</p>
        <table className="w-full border border-gray-800 text-center text-xs">
          <tbody>
            <tr className="border-b border-gray-800">
              {['Marks 90-100','Marks 80-89','Marks 70-79','Marks 60-69','Below 60'].map((r, i) => (
                <td key={i} className={i < 4 ? 'border-r border-gray-800 p-1' : 'p-1'}>{r}</td>
              ))}
            </tr>
            <tr>
              {['A','B','C','D','F'].map((g, i) => (
                <td key={i} className={cn('p-1 font-bold', i < 4 && 'border-r border-gray-800')}>{g}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Basic Skills & Personal Development */}
      <div>
        <p className="font-bold text-center mb-1">BASIC SKILLS &amp; PERSONAL DEVELOPMENT</p>
        <table className="w-full border border-gray-800 text-xs">
          <thead>
            <tr className="bg-gray-100">
              <th className="border-r border-gray-800 p-1 text-left">Competency</th>
              {(['A','B','C','D'] as Grade[]).map((g) => (
                <th key={g} className="border-r border-gray-800 p-1 text-center w-8 last:border-r-0">{g}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPETENCY_KEYS.map(({ key, label }, idx) => {
              const grade = student.behaviourAssessment[key];
              return (
                <tr key={key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="border-r border-gray-800 p-1">{label}</td>
                  {(['A','B','C','D'] as Grade[]).map((g, gi) => (
                    <td key={g} className={cn('p-1 text-center font-bold', gi < 3 && 'border-r border-gray-800')}>
                      {grade === g ? '✓' : ''}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex-grow" />
      <p className="text-center text-gray-600 text-[10px]">Assessment grades: A, B, C, D</p>
    </div>
  );
}

// ─── Back Page ────────────────────────────────────────────────────────────────

function BackPage({ student }: { student: ReportCardData }) {
  const today = student.reportDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="h-full flex flex-col space-y-2 text-xs" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div className="text-center border-b-2 border-gray-800 pb-1">
        <h1 className="text-sm font-bold">{student.firstName} {student.lastName} — Academic Results</h1>
      </div>

      {/* Academic performance table */}
      <div>
        <p className="font-bold text-center mb-1">ACADEMIC PERFORMANCE</p>
        <table className="w-full border border-gray-800 text-center" style={{ fontSize: '9px' }}>
          <thead>
            <tr className="bg-gray-100 border-b border-gray-800">
              <th className="border-r border-gray-800 p-1 text-left">Subject</th>
              <th colSpan={3} className="border-r border-gray-800 p-1">1st Semester</th>
              <th colSpan={3} className="border-r border-gray-800 p-1">2nd Semester</th>
              <th className="p-1">Yearly Avg</th>
            </tr>
            <tr className="border-b border-gray-800">
              <th className="border-r border-gray-800 p-1 text-left">Subject</th>
              <th className="border-r border-gray-800 p-1">1st Qtr</th>
              <th className="border-r border-gray-800 p-1">2nd Qtr</th>
              <th className="border-r border-gray-800 p-1">Average</th>
              <th className="border-r border-gray-800 p-1">3rd Qtr</th>
              <th className="border-r border-gray-800 p-1">4th Qtr</th>
              <th className="border-r border-gray-800 p-1">Average</th>
              <th className="p-1">Average</th>
            </tr>
          </thead>
          <tbody>
            {student.subjectResults.map((sub, idx) => (
              <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="border-r border-gray-800 p-1 text-left font-semibold">{sub.subjectName}</td>
                <td className="border-r border-gray-800 p-1">{sub.term1 ?? '-'}</td>
                <td className="border-r border-gray-800 p-1">{sub.term2 ?? '-'}</td>
                <td className="border-r border-gray-800 p-1 font-semibold">{sub.sem1Avg?.toFixed(1) ?? '-'}</td>
                <td className="border-r border-gray-800 p-1">{sub.term3 ?? '-'}</td>
                <td className="border-r border-gray-800 p-1">{sub.term4 ?? '-'}</td>
                <td className="border-r border-gray-800 p-1 font-semibold">{sub.sem2Avg?.toFixed(1) ?? '-'}</td>
                <td className="p-1 font-bold">{sub.yearlyAvg?.toFixed(1) ?? '-'}</td>
              </tr>
            ))}
            <tr className="bg-gray-200 font-bold border-t-2 border-gray-800">
              <td className="border-r border-gray-800 p-1">TOTALS &amp; AVERAGES</td>
              <td colSpan={6} className="border-r border-gray-800 p-1 text-center">Total: {student.overallTotal.toFixed(1)}</td>
              <td className="p-1 text-center">{student.overallAverage.toFixed(1)}</td>
            </tr>
            <tr className="border-b border-gray-800">
              <td className="border-r border-gray-800 p-1">Rank</td>
              <td colSpan={6} className="border-r border-gray-800 p-1 text-center">{student.overallRank || '-'}</td>
              <td className="p-1" />
            </tr>
            <tr>
              <td className="border-r border-gray-800 p-1">Absent Days</td>
              <td colSpan={6} className="border-r border-gray-800 p-1 text-center">{student.absentDays}</td>
              <td className="p-1" />
            </tr>
            <tr>
              <td className="border-r border-gray-800 p-1">Conduct</td>
              <td colSpan={6} className="border-r border-gray-800 p-1 text-center">{student.conduct}</td>
              <td className="p-1" />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Homeroom remarks */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Homeroom Teacher Remark (1st Semester)', value: student.homeroomRemarksSem1 },
          { label: 'Homeroom Teacher Remark (2nd Semester)', value: student.homeroomRemarksSem2 },
        ].map(({ label, value }) => (
          <div key={label}>
            <p className="font-bold text-xs mb-0.5">{label}</p>
            <div className="border border-gray-800 p-1.5 min-h-[3rem] text-xs whitespace-pre-wrap">
              {value || '☐ Excellent result   ☐ Good academic performance   ☐ Needs support'}
            </div>
            <div className="flex gap-4 mt-1 text-[10px]">
              <span>Teacher: <strong>{student.homeroomTeacher || '_________'}</strong></span>
              <span>Date: <strong>{today}</strong></span>
            </div>
          </div>
        ))}
      </div>

      {/* Promotion policy + director */}
      <div className="text-xs">
        <p className="font-bold">School Promotion Policy</p>
        <p>Students are promoted if they achieve an average of 60% or higher and satisfy attendance requirements.</p>
        <div className="flex justify-between mt-3">
          <div className="text-center">
            <p className="font-bold text-xs">Director</p>
            <div className="border-t border-gray-800 w-28 mt-3" />
            <p className="text-[10px] mt-0.5">Name &amp; Signature</p>
          </div>
          <div className="text-center">
            <p className="font-bold text-xs">Official Seal</p>
            <div className="border border-gray-800 w-24 h-14 mt-1" />
          </div>
        </div>
      </div>
    </div>
  );
}
