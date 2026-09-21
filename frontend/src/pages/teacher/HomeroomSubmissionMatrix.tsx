
import React, { useState, useMemo } from 'react';
import { CheckCircle2, AlertCircle, Clock, Users, Download, Printer, RefreshCw, RotateCcw, AlertTriangle, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { useAcademicYears } from '../../hooks/useAcademicStructure';
import {
  useHomeroomContext,
  useHomeroomSubmissionMatrix,
  useHomeroomStudentResults,
} from '../../hooks/useHomeroom';

// ─── Types ────────────────────────────────────────────────────────────────────

type SubmissionStatus = {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  teacherName: string;
  teacherId: string;
  isSubmitted: boolean;
  submittedAt: string | null;
  submittedCount: number;
  enrolledCount: number;
  completionPercentage: number;
  isReturnedForCorrection?: boolean;
  correctionRequired?: boolean;
  correctionReason?: string | null;
  returnedAt?: string | null;
  canReturn?: boolean;
  status?: string;
};

type SubmissionMatrix = {
  classSectionName: string;
  academicYear: string;
  term: string;
  allSubmitted: boolean;
  subjects: SubmissionStatus[];
  totalSubmitted: number;
  totalSubjects: number;
  isRosterLocked?: boolean;
  rosterReviewStatus?: string;
};

type StudentResult = {
  studentId: string;
  admissionNo: string;
  studentName: string;
  marks: number;
  subjectId: string;
  term: string;
  status: 'DRAFT' | 'SUBMITTED' | string;
};

// Static term definitions — we don't rely on Term DB rows because the
// SubjectResult model uses plain TERM_1…4 strings, not Term IDs.
const STATIC_TERMS = [
  { code: 'TERM_1', label: 'Term 1' },
  { code: 'TERM_2', label: 'Term 2' },
  { code: 'TERM_3', label: 'Term 3' },
  { code: 'TERM_4', label: 'Term 4' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeroomSubmissionMatrix() {
  const [localSearch, setLocalSearch] = useState('');
  const effectiveSearch = localSearch.trim().toLowerCase();

  const [selectedTerm, setSelectedTerm] = useState('TERM_1');
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  // Return to teacher modal state
  const [returnModalSubject, setReturnModalSubject] = useState<SubmissionStatus | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [submittingReturn, setSubmittingReturn] = useState(false);

  // 1. Homeroom Context & Academic Years (Shared React Query Cache)
  const { data: homeroomContext, isLoading: contextLoading, error: contextError } = useHomeroomContext();
  const { data: years = [], isLoading: yearsLoading } = useAcademicYears();

  const currentYear = years.find((y) => y.isCurrent) || years[0];
  const sectionId = homeroomContext?.assignedSection?.id;
  const yearId =
    homeroomContext?.assignedSection?.academicYearId ??
    homeroomContext?.academicYearId ??
    currentYear?.id;

  // 2. Page Data Queries (React Query)
  const {
    data: matrix,
    isLoading: matrixLoading,
    isFetching: matrixFetching,
    error: matrixError,
    refetch: refetchMatrix,
  } = useHomeroomSubmissionMatrix(sectionId, yearId, selectedTerm);

  const {
    data: studentResults = [],
    isFetching: resultsFetching,
    refetch: refetchResults,
  } = useHomeroomStudentResults(sectionId, yearId, selectedTerm);

  const loading = contextLoading || (yearsLoading && !yearId) || (matrixLoading && !matrix);
  const refreshing = (matrixFetching || resultsFetching) && !matrixLoading;

  const error =
    (contextError as any)?.message ||
    (!contextLoading && !homeroomContext?.assignedSection ? 'No homeroom section assigned to your account' : '') ||
    (matrixError as any)?.message ||
    '';

  const handleTermChange = (newTerm: string) => {
    setSelectedTerm(newTerm);
  };

  const filteredSubjects = useMemo(() => {
    if (!effectiveSearch || !matrix?.subjects) return matrix?.subjects || [];
    return matrix.subjects.filter((s) => {
      const subjectName = (s.subjectName || '').toLowerCase();
      const subjectCode = (s.subjectCode || '').toLowerCase();
      const teacherName = (s.teacherName || '').toLowerCase();
      const status = (s.isSubmitted ? 'submitted' : 'pending').toLowerCase();
      return (
        subjectName.includes(effectiveSearch) ||
        subjectCode.includes(effectiveSearch) ||
        teacherName.includes(effectiveSearch) ||
        status.includes(effectiveSearch)
      );
    });
  }, [matrix?.subjects, effectiveSearch]);

  const handleRefresh = async () => {
    try {
      await Promise.all([refetchMatrix(), refetchResults()]);
      toast.success('Submission matrix refreshed');
    } catch (err: any) {
      toast.error(err?.message ?? 'Refresh failed');
    }
  };

  const handleReturnToTeacher = async () => {
    if (!returnModalSubject || !sectionId || !yearId) return;
    const trimmedReason = returnReason.trim();
    if (!trimmedReason) {
      toast.error('Please enter a correction reason for the teacher');
      return;
    }

    setSubmittingReturn(true);
    try {
      await api.post('/results/return-to-teacher', {
        classSectionId: sectionId,
        academicYearId: yearId,
        subjectId: returnModalSubject.subjectId,
        term: selectedTerm,
        reason: trimmedReason,
      });
      toast.success(`${returnModalSubject.subjectName} returned to teacher for correction`);
      setReturnModalSubject(null);
      setReturnReason('');
      await handleRefresh();
    } catch (err: any) {
      const msg = err?.message || 'Failed to return subject';
      toast.error(msg);
    } finally {
      setSubmittingReturn(false);
    }
  };

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExportCsv = () => {
    if (!matrix) return;
    const headers = ['Subject', 'Teacher', 'Status', 'Submitted', 'Total', 'Completion %'];
    const rows = matrix.subjects.map((s) => [
      s.subjectName, s.teacherName,
      s.isSubmitted ? 'Submitted' : 'Pending',
      s.submittedCount, s.enrolledCount, `${s.completionPercentage}%`,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `submission-matrix-${selectedTerm}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ── Render states ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Clock className="w-12 h-12 text-blue-900 mx-auto mb-3 animate-spin" />
          <p className="text-gray-600">Loading submission matrix…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-6 h-6 text-red-600 shrink-0" />
          <div>
            <h3 className="font-bold text-red-900">Could Not Load Matrix</h3>
            <p className="text-red-700 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!matrix) return <div className="text-gray-500 p-6">No submission data available</div>;

  const completionPct = matrix.totalSubjects
    ? Math.round((matrix.totalSubmitted / matrix.totalSubjects) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Subject Results Submission Matrix</h1>
          <p className="text-sm text-gray-600 mt-1">
            {matrix.classSectionName} &bull; {matrix.academicYear} &bull;{' '}
            {STATIC_TERMS.find((t) => t.code === selectedTerm)?.label ?? selectedTerm}
          </p>
        </div>
        <div className="flex gap-2 no-print shrink-0">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
            title="Refresh matrix"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-lg text-sm font-semibold hover:bg-blue-800"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      {/* ── Term Selector & Search Toolbar ── */}
      <div className="bg-white border rounded-2xl p-4 no-print flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-gray-500">Select Term</label>
          <div className="flex gap-2 flex-wrap">
            {STATIC_TERMS.map((t) => (
              <button
                key={t.code}
                onClick={() => handleTermChange(t.code)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-colors ${selectedTerm === t.code
                    ? 'bg-blue-900 text-white border-blue-900 shadow-xs'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input Toolbar */}
        <div className="relative w-full md:w-72 self-end">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            aria-label="Search subjects"
            placeholder="Search subject, code, teacher..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 focus:bg-white transition-colors"
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
      </div>

      {/* ── Overall status banner ── */}
      <div
        className={`rounded-lg p-6 text-white ${matrix.allSubmitted
            ? 'bg-gradient-to-r from-green-600 to-green-500'
            : 'bg-gradient-to-r from-amber-600 to-amber-500'
          }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              {matrix.allSubmitted ? 'All Submissions Complete' : 'Submissions Pending'}
            </h2>
            <p className="text-white/80 mt-1">
              {matrix.totalSubmitted} of {matrix.totalSubjects} subjects submitted ({completionPct}%)
            </p>
            {!matrix.allSubmitted && (
              <p className="text-white/70 text-sm mt-1">
                Press <strong>Refresh</strong> after subject teachers submit to update this view.
              </p>
            )}
          </div>
          <div className="text-5xl font-black text-white/20">{completionPct}%</div>
        </div>
      </div>

      {/* ── Submission table ── */}
      <div className="bg-white border rounded-lg overflow-hidden shadow-sm">
        {matrix.subjects.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="font-semibold">No subject assignments found for this section.</p>
            <p className="text-sm mt-1">Ask your admin to assign subjects to this class section.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900 text-white text-sm">
                <th className="px-6 py-3 text-left font-bold">Subject</th>
                <th className="px-6 py-3 text-left font-bold">Teacher</th>
                <th className="px-6 py-3 text-center font-bold">Status</th>
                <th className="px-6 py-3 text-center font-bold">Submitted</th>
                <th className="px-6 py-3 text-center font-bold">Total</th>
                <th className="px-6 py-3 text-center font-bold">Completion</th>
                <th className="px-6 py-3 text-center font-bold no-print">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredSubjects.length === 0 && matrix.subjects.length > 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    <div className="max-w-sm mx-auto space-y-2">
                      <p className="text-sm font-bold text-gray-800">No subjects match &ldquo;{effectiveSearch}&rdquo;</p>
                      <p className="text-xs text-gray-400">Try adjusting your keyword or reset your search.</p>
                      <button
                        type="button"
                        onClick={() => setLocalSearch('')}
                        className="mt-2 inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 text-blue-900 hover:bg-blue-100 transition-colors"
                      >
                        Clear search
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredSubjects.map((subject, idx) => (
                <React.Fragment key={subject.subjectId}>
                  <tr className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-900">{subject.subjectName}</p>
                      <p className="text-xs text-gray-400">{subject.subjectCode}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="text-sm">{subject.teacherName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {subject.isReturnedForCorrection ? (
                        <div className="inline-flex flex-col items-center">
                          <span className="inline-flex items-center gap-1 text-amber-800 font-bold text-xs bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" /> Correction Required
                          </span>
                          {subject.correctionReason && (
                            <span className="text-[11px] text-gray-500 italic mt-1 max-w-[170px] truncate" title={subject.correctionReason}>
                              "{subject.correctionReason}"
                            </span>
                          )}
                        </div>
                      ) : subject.isSubmitted ? (
                        <span className="inline-flex items-center gap-1.5 text-green-700 font-semibold text-xs">
                          <CheckCircle2 className="w-4 h-4" /> Submitted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-amber-600 font-semibold text-xs">
                          <AlertCircle className="w-4 h-4" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-gray-900">
                      {subject.submittedCount}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-gray-900">
                      {subject.enrolledCount}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${subject.isSubmitted ? 'bg-green-500' : 'bg-amber-400'
                              }`}
                            style={{ width: `${subject.completionPercentage}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold w-10 text-right">
                          {subject.completionPercentage}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center no-print">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() =>
                            setSelectedSubject(
                              selectedSubject === subject.subjectId ? null : subject.subjectId,
                            )
                          }
                          className="text-blue-700 hover:text-blue-900 text-xs font-semibold hover:underline"
                        >
                          {selectedSubject === subject.subjectId ? 'Hide' : 'View'}
                        </button>
                        {subject.canReturn && (
                          <button
                            onClick={() => {
                              setReturnModalSubject(subject);
                              setReturnReason('');
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border border-amber-300 text-amber-900 bg-amber-50 hover:bg-amber-100 transition-colors shadow-sm"
                            title="Return this subject to teacher for correction"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-amber-700" /> Return to Teacher
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* ── Expandable student results ── */}
                  {selectedSubject === subject.subjectId && (
                    <tr className="bg-blue-50">
                      <td colSpan={7} className="px-6 py-4">
                        <h4 className="font-bold text-sm mb-3 text-gray-800">
                          Student Results — {subject.subjectName}
                        </h4>
                        {(() => {
                          const rows = studentResults.filter(
                            (r) => r.subjectId === subject.subjectId && r.term === selectedTerm,
                          );
                          return rows.length === 0 ? (
                            <p className="text-sm text-gray-500 italic">
                              No submitted results for this subject and term yet.
                            </p>
                          ) : (
                            <div className="max-h-80 overflow-y-auto">
                              <table className="w-full text-xs border border-gray-300 rounded">
                                <thead>
                                  <tr className="bg-blue-100">
                                    <th className="border border-gray-300 p-2 text-left">Student</th>
                                    <th className="border border-gray-300 p-2 text-center">Marks</th>
                                    <th className="border border-gray-300 p-2 text-center">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((r, ri) => (
                                    <tr
                                      key={r.studentId}
                                      className={ri % 2 === 0 ? 'bg-white' : 'bg-blue-50'}
                                    >
                                      <td className="border border-gray-300 p-2">
                                        {r.admissionNo} {r.studentName}
                                      </td>
                                      <td className="border border-gray-300 p-2 text-center font-semibold">
                                        {r.marks}
                                      </td>
                                      <td className="border border-gray-300 p-2 text-center">
                                        <span
                                          className={`px-2 py-0.5 rounded text-xs font-semibold ${r.status === 'SUBMITTED'
                                              ? 'bg-green-100 text-green-800'
                                              : 'bg-yellow-100 text-yellow-800'
                                            }`}
                                        >
                                          {r.status}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Return to Teacher Modal ── */}
      {returnModalSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 no-print">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b">
              <div className="flex items-center gap-2 text-amber-900 font-bold">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3>Return Subject for Correction</h3>
              </div>
              <button
                onClick={() => setReturnModalSubject(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm font-bold text-gray-900">{returnModalSubject.subjectName}</p>
                <p className="text-xs text-gray-500">
                  Teacher: {returnModalSubject.teacherName} &bull; Term:{' '}
                  {STATIC_TERMS.find((t) => t.code === selectedTerm)?.label ?? selectedTerm}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Correction Reason / Note <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="e.g. Please correct the student's final mark or verify test scores."
                  rows={4}
                  className="w-full text-sm border border-gray-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  This note will be visible to the subject teacher when they open their grade entry sheet.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReturnModalSubject(null)}
                disabled={submittingReturn}
                className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReturnToTeacher}
                disabled={submittingReturn || !returnReason.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-xl disabled:opacity-50 transition-colors shadow-lg shadow-amber-600/20"
              >
                {submittingReturn ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Returning…
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" /> Confirm Return
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
    </div>
  );
}
