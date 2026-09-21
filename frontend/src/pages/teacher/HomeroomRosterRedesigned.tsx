import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  Printer,
  RefreshCw,
  AlertCircle,
  Clock,
  FileText,
  Save,
  Send,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Check,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAcademicYears } from '../../hooks/useAcademicStructure';
import {
  useHomeroomContext,
  useConsolidatedRoster,
  useRosterReviewStatus,
  ConsolidatedRosterData,
} from '../../hooks/useHomeroom';
import { saveHomeroomConduct, submitRosterToAdmin } from '../../api/adminReports';
import { downloadConsolidatedRosterPdf } from '../../api/roster';


// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined): string {
  return v != null ? (typeof v === 'number' ? v.toFixed(1) : String(v)) : '—';
}

const PERIOD_ROWS = [
  { key: 'term1', label: '1st', bg: 'bg-white' },
  { key: 'term2', label: '2nd', bg: 'bg-white' },
  { key: 'sem1Avg', label: 'Ave1', bg: 'bg-blue-50/70 font-semibold text-blue-950' },
  { key: 'term3', label: '3rd', bg: 'bg-white' },
  { key: 'term4', label: '4th', bg: 'bg-white' },
  { key: 'sem2Avg', label: 'Ave2', bg: 'bg-blue-50/70 font-semibold text-blue-950' },
  { key: 'yearlyAverage', label: 'Yearly', bg: 'bg-emerald-50/70 font-bold text-emerald-950' },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeroomRosterRedesigned() {
  const navigate = useNavigate();
  // 1. Shared Homeroom Context & Academic Years (from Cache)
  const { data: homeroomContext, isLoading: contextLoading, error: contextError } = useHomeroomContext();
  const { data: years = [], isLoading: yearsLoading } = useAcademicYears();

  // Always use the section's own academic year ID so all downstream queries
  // (roster, review status, conduct, submit) match the section's year exactly.
  // Falls back to the current/first year from the years list only when the
  // context hasn't loaded yet or the section carries no year.
  const currentYear = years.find((y) => y.isCurrent) || years[0];
  const sectionId = homeroomContext?.assignedSection?.id;
  const yearId =
    homeroomContext?.assignedSection?.academicYearId ??
    homeroomContext?.academicYearId ??
    currentYear?.id;

  // 2. Consolidated Roster Query
  const {
    data,
    isLoading: rosterLoading,
    isFetching: refreshing,
    error: rosterError,
    refetch,
  } = useConsolidatedRoster(sectionId, yearId);

  // 3. Review Status Query
  const {
    data: reviewStatusData,
    refetch: refetchReviewStatus,
  } = useRosterReviewStatus(sectionId, yearId);

  const reviewStatus = reviewStatusData?.status || 'DRAFT';
  const isConductEditable = reviewStatus === 'DRAFT' || reviewStatus === 'REJECTED';

  const [conductState, setConductState] = React.useState<Record<string, string>>({});
  const [savingConduct, setSavingConduct] = React.useState(false);
  const [submittingRoster, setSubmittingRoster] = React.useState(false);
  const [conductDirty, setConductDirty] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isDownloadingPdf, setIsDownloadingPdf] = React.useState(false);


  const filteredStudents = React.useMemo(() => {
    if (!data?.students) return [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return data.students;
    return data.students.filter((s) =>
      (s.studentName || '').toLowerCase().includes(q) ||
      (s.admissionNo || '').toLowerCase().includes(q) ||
      (s.sex || '').toLowerCase() === q
    );
  }, [data?.students, searchQuery]);

  React.useEffect(() => {
    if (data?.students) {
      const initial: Record<string, string> = {};
      data.students.forEach((s) => {
        if (s.conduct) initial[s.studentId] = s.conduct;
      });
      setConductState(initial);
      setConductDirty(false);
    }
  }, [data]);

  const loading = contextLoading || (yearsLoading && !yearId) || (rosterLoading && !data);
  const error =
    (contextError as any)?.message ||
    (!contextLoading && !homeroomContext?.assignedSection ? 'No homeroom section assigned to your account' : '') ||
    (rosterError as any)?.message ||
    '';

  // ── Refresh ───────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    try {
      await Promise.all([refetch(), refetchReviewStatus()]);
      toast.success('Roster refreshed');
    } catch (err: any) {
      toast.error(err?.message ?? 'Refresh failed');
    }
  };

  const handleConductChange = (studentId: string, val: string) => {
    setConductState((prev) => ({
      ...prev,
      [studentId]: val,
    }));
    setConductDirty(true);
  };

  const handleSaveConduct = async () => {
    if (!sectionId || !yearId) return;
    setSavingConduct(true);
    try {
      await saveHomeroomConduct(sectionId, yearId, conductState);
      toast.success('✓ Conduct saved successfully');
      setConductDirty(false);
      await Promise.all([refetch(), refetchReviewStatus()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save conduct');
    } finally {
      setSavingConduct(false);
    }
  };

  const handleSubmitToAdmin = async () => {
    if (!sectionId || !yearId || !data) return;

    // 1. Subject completeness validation
    const incompleteStudents = data.students.filter((s) => s.isComplete === false);
    if (incompleteStudents.length > 0) {
      toast.error(
        `Cannot submit roster: ${incompleteStudents.length} student(s) have incomplete subject results.`,
      );
      return;
    }

    // 2. Conduct completeness validation
    const missingConduct = data.students.filter(
      (s) => !conductState[s.studentId] || !['A', 'B', 'C'].includes(conductState[s.studentId]),
    );
    if (missingConduct.length > 0) {
      toast.error(
        `Cannot submit roster. Conduct is missing for: ${missingConduct.map((s) => s.studentName).join(', ')}`,
      );
      return;
    }

    // Auto-save conduct first if dirty
    if (conductDirty) {
      try {
        await saveHomeroomConduct(sectionId, yearId, conductState);
        setConductDirty(false);
      } catch (err: any) {
        toast.error('Failed to save conduct before submission: ' + (err?.message || 'Unknown error'));
        return;
      }
    }

    setSubmittingRoster(true);
    try {
      await submitRosterToAdmin(sectionId, yearId);
      toast.success('✓ Roster successfully submitted to Admin for review!');
      await Promise.all([refetch(), refetchReviewStatus()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit roster to admin');
    } finally {
      setSubmittingRoster(false);
    }
  };

  // ── Export ────────────────────────────────────────────────────────────────

  const handleExportCsv = () => {
    if (!data) return;

    const headers = [
      'No',
      'Admission No',
      'Name',
      'Age',
      'Sex',
      'Period',
      ...data.subjects.map((s) => `${s.name} (${s.code})`),
      'Sum',
      'Avg',
      'Rank',
      'Abs D',
      'Conduct',
    ];

    const rows: any[] = [];
    data.students.forEach((student, idx) => {
      const isComplete = student.isComplete !== false;
      const subMap = new Map(student.subjectScores.map((sc) => [sc.subjectId, sc]));

      PERIOD_ROWS.forEach((p, pIdx) => {
        const isFirst = pIdx === 0;
        const subjectCols = data.subjects.map((subj) => {
          const sc = subMap.get(subj.id);
          const raw = sc ? (sc as any)[p.key] : null;
          return raw != null
            ? typeof raw === 'number'
              ? p.key.includes('Avg') || p.key === 'yearlyAverage'
                ? raw.toFixed(1)
                : raw
              : raw
            : '';
        });

        rows.push([
          isFirst ? idx + 1 : '',
          isFirst ? student.admissionNo : '',
          isFirst ? student.studentName : '',
          isFirst ? (student.age != null ? student.age : '—') : '',
          isFirst ? student.sex || '' : '',
          p.label,
          ...subjectCols,
          isFirst && isComplete && student.sum != null ? student.sum : '',
          isFirst && isComplete && student.average != null ? student.average.toFixed(1) : '',
          isFirst && isComplete && student.rank != null ? student.rank : '',
          isFirst ? student.absentDays : '',
          isFirst ? conductState[student.studentId] || student.conduct || '' : '',
        ]);
      });
    });

    const csv = [headers, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${data.section.name}-Consolidated-Roster.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleDownloadPdf = async () => {
    if (!sectionId || !yearId) {
      toast.error('No homeroom section or academic year selected.');
      return;
    }
    if (!data || !data.students || data.students.length === 0) {
      toast.warning('No class roster data available to download.');
      return;
    }
    setIsDownloadingPdf(true);
    try {
      await downloadConsolidatedRosterPdf(
        sectionId,
        yearId,
        searchQuery,
        `Roster_${data.section?.name || 'Class'}.pdf`,
      );
      toast.success('Class roster PDF downloaded successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download class roster PDF');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // ── Render states ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Clock className="w-10 h-10 text-blue-900 mx-auto mb-3 animate-spin" />
          <p className="text-gray-500">Loading consolidated roster…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-red-900">Could Not Load Roster</p>
          <p className="text-red-700 text-sm mt-1">{error}</p>
          <button
            onClick={handleRefresh}
            className="mt-3 text-sm font-semibold text-red-800 underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!data) return <div className="text-gray-500 p-6">No roster data available</div>;

  // Determine whether any subject results have been submitted yet
  const hasSubmittedResults = data.students.some((s) =>
    s.subjectScores.some(
      (sc) =>
        sc.term1 != null || sc.term2 != null || sc.term3 != null || sc.term4 != null,
    ),
  );

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">Class Consolidated Roster</h1>
            <span
              className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider inline-flex items-center gap-1.5 ${
                reviewStatus === 'APPROVED'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : reviewStatus === 'SUBMITTED_TO_ADMIN'
                  ? 'bg-blue-100 text-blue-800 border border-blue-300'
                  : reviewStatus === 'REJECTED'
                  ? 'bg-red-100 text-red-800 border border-red-300'
                  : 'bg-gray-100 text-gray-700 border border-gray-300'
              }`}
            >
              {reviewStatus === 'APPROVED' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              {reviewStatus === 'SUBMITTED_TO_ADMIN' && <Clock className="w-3.5 h-3.5 text-blue-600" />}
              {reviewStatus === 'REJECTED' && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
              {reviewStatus === 'DRAFT' && <FileText className="w-3.5 h-3.5 text-gray-500" />}
              {reviewStatus === 'SUBMITTED_TO_ADMIN' ? 'Submitted to Admin' : reviewStatus}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {data.section.grade ? `${data.section.grade} ` : ''}
            {data.section.name}
            {data.section.homeroomTeacher && ` • Homeroom: ${data.section.homeroomTeacher}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 no-print shrink-0">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
            title="Reload submitted results and review status"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf || rosterLoading || !data?.students?.length}
            className="flex items-center gap-2 px-3 py-2 bg-blue-900 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 transition-colors shadow-sm"
            title="Download Consolidated Class Roster as PDF"
          >
            {isDownloadingPdf ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download PDF
          </button>
          {isConductEditable && (
            <button
              onClick={handleSaveConduct}
              disabled={savingConduct}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm ${
                conductDirty
                  ? 'bg-blue-600 text-white hover:bg-blue-700 animate-pulse'
                  : 'bg-white border border-blue-600 text-blue-700 hover:bg-blue-50'
              } disabled:opacity-50`}
              title="Save conduct grades for all students"
            >
              <Save className="w-4 h-4" />
              {savingConduct ? 'Saving…' : conductDirty ? 'Save Conduct *' : 'Save Conduct'}
            </button>
          )}
          {isConductEditable && (
            <button
              onClick={handleSubmitToAdmin}
              disabled={submittingRoster}
              className="flex items-center gap-2 px-3.5 py-2 bg-indigo-900 text-white rounded-lg text-sm font-semibold hover:bg-indigo-950 disabled:opacity-50 transition-colors shadow-sm"
              title="Submit verified roster and conduct to administrator"
            >
              <Send className="w-4 h-4" />
              {submittingRoster ? 'Submitting…' : 'Submit to Admin'}
            </button>
          )}
          <button
            onClick={() => navigate('/homeroom/roster/paper')}
            className="flex items-center gap-2 px-3.5 py-2 bg-indigo-700 text-white rounded-lg text-sm font-semibold hover:bg-indigo-800 transition-colors shadow-sm"
            title="Open official 7-row academic paper roster for preview and printing"
          >
            <FileText className="w-4 h-4" /> 7-Row Paper Roster
          </button>
        </div>
      </div>

      {/* ── Approved & Locked Notice Banner ── */}
      {reviewStatus === 'APPROVED' && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm no-print">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-base text-emerald-950">Roster Approved</p>
              <p className="text-sm text-emerald-800 font-medium mt-0.5">
                This roster has been approved by the administrator and is now locked. Official printing is available.
              </p>
              {reviewStatusData?.reviewedAt && (
                <p className="text-xs text-emerald-700 mt-1 font-medium">
                  Approved on {new Date(reviewStatusData.reviewedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => navigate('/homeroom/roster/paper')}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-colors shrink-0 shadow-sm uppercase tracking-wider"
            title="Open official 7-row academic paper roster"
          >
            <Printer className="w-4 h-4" /> Print Official Roster
          </button>
        </div>
      )}

      {/* ── Rejection Notice Banner ── */}
      {reviewStatus === 'REJECTED' && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-start gap-3 shadow-sm no-print">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-base text-red-900">Roster Rejected</p>
            {reviewStatusData?.rejectionReason ? (
              <div className="mt-2">
                <p className="text-xs font-bold text-red-700 uppercase tracking-wider">Reason:</p>
                <p className="text-sm text-red-800 font-medium bg-red-100/70 p-2.5 rounded-lg border border-red-200 mt-0.5">
                  {reviewStatusData.rejectionReason}
                </p>
              </div>
            ) : null}
            <p className="text-xs text-red-700 mt-2">
              You can edit the roster and submit it again.
            </p>
          </div>
        </div>
      )}

      {/* ── Pending-results notice ── */}
      {!hasSubmittedResults && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3 no-print">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">No submitted results yet</p>
            <p className="text-sm text-amber-700 mt-0.5">
              Subject teachers haven't sent any results to this homeroom yet. The marks columns will
              populate automatically once they submit. Press <strong>Refresh</strong> to check for
              updates.
            </p>
          </div>
        </div>
      )}

      {/* ── Empty students ── */}
      {data.students.length === 0 ? (
        <div className="bg-white border rounded-xl p-10 text-center text-gray-400">
          <p className="font-semibold text-gray-500">No students enrolled in this section.</p>
          <p className="text-sm mt-1">
            Enroll students from the Admin panel, then refresh this page.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Search toolbar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm no-print">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Class Roster:</span>
              <span className="text-xs font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
                {filteredStudents.length} of {data.students.length} Students
              </span>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search student name or adm no..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-9 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* ── Main table ── */}
          <div className="bg-white border rounded-xl overflow-x-auto shadow-sm">
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
                  {data.subjects.map((subj) => (
                    <th
                      key={subj.id}
                      className="border border-gray-700 p-2 text-center min-w-[100px] bg-gray-800"
                    >
                      <div className="font-bold text-xs leading-tight">{subj.name}</div>
                      <div className="text-[10px] text-gray-300 font-normal mt-0.5">{subj.code}</div>
                    </th>
                  ))}

                  {/* Summary Columns */}
                  <th className="border border-gray-700 p-2.5 text-center w-16 bg-gray-800 font-bold">Sum</th>
                  <th className="border border-gray-700 p-2.5 text-center w-16 bg-gray-800 font-bold">Avg</th>
                  <th className="border border-gray-700 p-2.5 text-center w-14 bg-gray-800 font-bold">Rank</th>
                  <th className="border border-gray-700 p-2.5 text-center w-14 font-bold">Abs D</th>
                  <th className="border border-gray-700 p-2.5 text-center w-16 font-bold">Conduct</th>
                </tr>
              </thead>

              {filteredStudents.length === 0 ? (
                <tbody>
                  <tr>
                    <td
                      colSpan={6 + data.subjects.length + 5}
                      className="p-12 text-center"
                    >
                      <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-center">
                        <Search className="w-10 h-10 text-gray-300 mb-3" />
                        <h4 className="text-sm font-semibold text-gray-900 mb-1">No matching students found</h4>
                        <p className="text-xs text-gray-500 mb-4">
                          No students on this roster match "{searchQuery}". Check the spelling or clear the filter.
                        </p>
                        <button
                          onClick={() => setSearchQuery('')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          Clear Search
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              ) : (
                filteredStudents.map((student, sIdx) => {
                  const isStudentComplete = student.isComplete !== false;
                  const subjectScoreMap = new Map(student.subjectScores.map((sc) => [sc.subjectId, sc]));

              return (
                <tbody
                  key={student.studentId}
                  className="student-group border-b-2 border-gray-400 hover:bg-gray-50/30"
                >
                  {PERIOD_ROWS.map((period, pIdx) => {
                    const isFirstRow = pIdx === 0;

                    return (
                      <tr key={`${student.studentId}-${period.key}`} className={period.bg}>
                        {/* Left Identifiers Spanned Across 7 Rows */}
                        {isFirstRow && (
                          <>
                            <td
                              rowSpan={7}
                              className="border border-gray-300 p-2.5 text-center font-bold bg-gray-50/80 text-gray-800 align-middle"
                            >
                              {sIdx + 1}
                            </td>
                            <td
                              rowSpan={7}
                              className="border border-gray-300 p-2.5 text-center font-mono text-[11px] text-gray-700 align-middle whitespace-nowrap"
                            >
                              {student.admissionNo}
                            </td>
                            <td
                              rowSpan={7}
                              className="border border-gray-300 p-2.5 text-left font-bold text-gray-900 align-middle min-w-[170px]"
                            >
                              <div className="text-sm">{student.studentName}</div>
                              {!isStudentComplete && (
                                <div
                                  className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 font-normal border border-amber-200"
                                  title={
                                    student.missingSubjects?.length
                                      ? `Missing: ${student.missingSubjects.join(', ')}`
                                      : 'Incomplete'
                                  }
                                >
                                  ⚠ Incomplete
                                  {student.missingSubjects?.length
                                    ? ` (${student.missingSubjects[0]}${
                                        student.missingSubjects.length > 1 ? '…' : ''
                                      })`
                                    : ''}
                                </div>
                              )}
                            </td>
                            <td
                              rowSpan={7}
                              className="border border-gray-300 p-2.5 text-center text-gray-700 align-middle"
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

                        {/* Period Label (1st, 2nd, Ave1, 3rd, 4th, Ave2, Yearly) */}
                        <td className="border border-gray-300 p-2 text-center font-bold text-xs text-gray-800">
                          {period.label}
                        </td>

                        {/* Dynamic Subject Marks for this Period */}
                        {data.subjects.map((subj) => {
                          const sc = subjectScoreMap.get(subj.id);
                          const rawVal = sc ? (sc as any)[period.key] : null;
                          const displayVal =
                            rawVal != null
                              ? typeof rawVal === 'number'
                                ? period.key.includes('Avg') || period.key === 'yearlyAverage'
                                  ? rawVal.toFixed(1)
                                  : rawVal
                                : rawVal
                              : '—';

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
                              {isStudentComplete && student.rank != null ? student.rank : '—'}
                            </td>
                            <td
                              rowSpan={7}
                              className="border border-gray-300 p-2.5 text-center text-gray-700 align-middle"
                            >
                              {student.absentDays}
                            </td>
                            <td
                              rowSpan={7}
                              className="border border-gray-300 p-2 text-center align-middle"
                            >
                              {isConductEditable ? (
                                <select
                                  id={`conduct-select-${student.studentId}`}
                                  value={conductState[student.studentId] || ''}
                                  onChange={(e) => handleConductChange(student.studentId, e.target.value)}
                                  className={`px-2.5 py-1 text-xs font-bold rounded border shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                    conductState[student.studentId] === 'A'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                      : conductState[student.studentId] === 'B'
                                      ? 'bg-blue-50 text-blue-800 border-blue-300'
                                      : conductState[student.studentId] === 'C'
                                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                                      : 'bg-white text-gray-400 border-gray-300'
                                  }`}
                                >
                                  <option value="" disabled>Select</option>
                                  <option value="A">A</option>
                                  <option value="B">B</option>
                                  <option value="C">C</option>
                                </select>
                              ) : (
                                <span
                                  className={`inline-block px-2.5 py-1 text-xs font-black rounded border ${
                                    (conductState[student.studentId] || student.conduct) === 'A'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                      : (conductState[student.studentId] || student.conduct) === 'B'
                                      ? 'bg-blue-50 text-blue-800 border-blue-300'
                                      : (conductState[student.studentId] || student.conduct) === 'C'
                                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                                      : 'bg-gray-100 text-gray-400 border-gray-200'
                                  }`}
                                  title="Locked: Roster submitted or approved"
                                >
                                  {conductState[student.studentId] || student.conduct || '—'}
                                </span>
                              )}
                            </td>
                          </>
                        )}
                        </tr>
                      );
                    })}
                  </tbody>
                );
              }))}
            </table>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; }
          table { font-size: 8px; }
          @page { size: A4 landscape; margin: 0.5cm; }
        }
      `}</style>
    </div>
  );
}
