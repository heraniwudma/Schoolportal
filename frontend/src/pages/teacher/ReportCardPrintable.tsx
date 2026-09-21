/**
 * ReportCardPrintable — standalone report-card print/preview page
 * Route: /homeroom/report-cards
 *
 * This page fetches compiled cards from the backend, lets the teacher
 * select individual or multiple students, then renders print-ready
 * front+back pages using the same layout as HomeroomReportCards.
 */

import React, { useState, useCallback } from 'react';
import {
  Printer, Download, ChevronLeft, ChevronRight,
  CheckSquare, Square, AlertCircle, Clock, RefreshCw, Search, X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { useAcademicYears } from '../../hooks/useAcademicStructure';
import {
  useHomeroomContext,
  useCompiledReportCards,
  ReportCardData,
} from '../../hooks/useHomeroom';
import { downloadCompiledReportCardsPdf } from '../../api/reportCards';


// ─── Types ────────────────────────────────────────────────────────────────────

type Grade = 'A' | 'B' | 'C' | 'D';

// ─── Competency keys (shared with HomeroomReportCards) ───────────────────────

const COMPETENCY_KEYS: Array<{ key: keyof ReportCardData['behaviourAssessment']; label: string }> = [
  { key: 'academicPotential',          label: 'Academic Potential' },
  { key: 'uniform',                    label: 'Uniform' },
  { key: 'timeManagement',             label: 'Time Management' },
  { key: 'harmfulActions',             label: 'Harmful Actions' },
  { key: 'responsibilities',           label: 'Responsibilities' },
  { key: 'clubActivities',             label: 'Club Activities' },
  { key: 'classworkHomework',          label: 'Classwork/Homework' },
  { key: 'flexibility',                label: 'Flexibility' },
  { key: 'hardWork',                   label: 'Hard Work' },
  { key: 'positiveThinking',           label: 'Positive Thinking' },
  { key: 'obeyingRules',               label: 'Obeying Rules' },
  { key: 'interpersonalCommunication', label: 'Interpersonal Communication' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReportCardPrintable() {
  // Selection + navigation
  const [selectedIds, setSelectedIds]   = useState<string[]>([]);
  const [searchQuery, setSearchQuery]   = useState('');
  const [currentPage, setCurrentPage]   = useState(0);
  const [side, setSide]                 = useState<'front' | 'back'>('front');
  const [printMode, setPrintMode]       = useState<'preview' | 'all-selected' | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);


  // React Query
  const { data: homeroomContext, isLoading: contextLoading, error: contextError } = useHomeroomContext();
  const { data: years = [],       isLoading: yearsLoading }                        = useAcademicYears();

  const currentYear = years.find((y) => y.isCurrent) || years[0];
  const sectionId   = homeroomContext?.assignedSection?.id;
  // Use the section's own academicYearId from context so the compiled-cards
  // query always targets the correct year, not whatever year happens to be
  // first in the years list.
  const yearId =
    homeroomContext?.assignedSection?.academicYearId ??
    homeroomContext?.academicYearId ??
    currentYear?.id;

  const {
    data: rawStudents = [],
    isLoading: cardsLoading,
    error: cardsError,
    refetch,
  } = useCompiledReportCards(sectionId, yearId);

  const students = Array.isArray(rawStudents) ? rawStudents : [];
  // Don't block on yearsLoading if we already have yearId from context.
  const loading  = contextLoading || (yearsLoading && !yearId) || (cardsLoading && !students.length);

  const error =
    (contextError as any)?.message ||
    (!contextLoading && !homeroomContext?.assignedSection ? 'No homeroom section assigned to your account' : '') ||
    (cardsError as any)?.message || '';

  // ── Selection helpers ─────────────────────────────────────────────────────

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleStudents = normalizedSearch
    ? students.filter((student) =>
        `${student.firstName} ${student.lastName} ${student.admissionNo}`
          .toLowerCase()
          .includes(normalizedSearch),
      )
    : students;
  const allSelected = visibleStudents.length > 0 && visibleStudents.every((student) => selectedIds.includes(student.studentId));

  const toggleAll = () =>
    setSelectedIds((current) => allSelected
      ? current.filter((id) => !visibleStudents.some((student) => student.studentId === id))
      : [...new Set([...current, ...visibleStudents.map((student) => student.studentId)])]);

  const toggleOne = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  // ── Navigation (single-card preview) ─────────────────────────────────────

  const selectedStudents = students.filter((s) => selectedIds.includes(s.studentId));
  const previewStudent   = selectedStudents[currentPage] ?? students[currentPage];
  const totalPreview     = selectedStudents.length || students.length;

  const goNext = () => {
    if (side === 'front') { setSide('back'); }
    else if (currentPage < totalPreview - 1) { setCurrentPage((p) => p + 1); setSide('front'); }
  };
  const goPrev = () => {
    if (side === 'back') { setSide('front'); }
    else if (currentPage > 0) { setCurrentPage((p) => p - 1); setSide('back'); }
  };

  // ── Print all selected ────────────────────────────────────────────────────

  const handlePrint = () => {
    if (!selectedIds.length && students.length) {
      // Nothing explicitly selected → print all
      setSelectedIds(students.map((s) => s.studentId));
    }
    setTimeout(() => window.print(), 100);
  };

  // ── CSV export ────────────────────────────────────────────────────────────

  const handleExportCsv = () => {
    const toExport = selectedStudents.length ? selectedStudents : students;
    const rows = toExport.map((s) => [
      s.admissionNo,
      `${s.firstName} ${s.lastName}`,
      s.overallAverage?.toFixed(1) ?? '',
      s.overallRank || '',
      s.conduct,
    ]);
    const csv = [['Admission No', 'Student', 'Avg', 'Rank', 'Conduct'], ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'report-cards.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleDownloadPdf = async () => {
    if (!sectionId || !yearId) {
      toast.error('No homeroom section or academic year selected.');
      return;
    }
    if (students.length === 0) {
      toast.warning('No report card data available to download.');
      return;
    }
    setIsDownloadingPdf(true);
    try {
      const targetIds = selectedIds.length > 0 ? selectedIds : undefined;
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
  // Render states
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <Clock className="w-10 h-10 text-blue-900 animate-spin" />
      <p className="text-gray-500 ml-3">Loading report cards…</p>
    </div>
  );

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-red-900">Error</p>
        <p className="text-red-700 text-sm">{error}</p>
        <button onClick={() => refetch()} className="mt-2 text-sm font-semibold text-red-800 underline">
          Retry
        </button>
      </div>
    </div>
  );

  if (!students.length) return (
    <div className="text-gray-500 p-6">No report cards available for this section.</div>
  );

  const displayStudent = selectedStudents.length ? selectedStudents[currentPage] : students[currentPage];

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN UI
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Screen controls (hidden when printing) ── */}
      <div className="no-print max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Report Cards</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Select students then print individual or batch cards.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleExportCsv}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200">
              <Download className="w-4 h-4" /> Export CSV
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf || loading || students.length === 0}
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
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-lg text-sm font-semibold hover:bg-blue-800 shadow-sm">
              <Printer className="w-4 h-4" />
              {selectedIds.length
                ? `Print ${selectedIds.length} selected`
                : `Print all (${students.length})`}
            </button>
          </div>
        </div>

        {/* Student selection checklist */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-3">
            <button onClick={toggleAll} className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              {allSelected
                ? <CheckSquare className="w-4 h-4 text-blue-600" />
                : <Square className="w-4 h-4 text-gray-400" />}
              {allSelected ? 'Deselect all' : `Select all (${students.length})`}
            </button>
            {selectedIds.length > 0 && (
              <span className="ml-2 text-xs text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded-full">
              {selectedIds.length} selected
            </span>
            )}
            <div className="ml-auto relative block w-full max-w-xs">
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
          <div className="divide-y">
            {visibleStudents.map((s) => {
              const sel = selectedIds.includes(s.studentId);
              const isPreview = displayStudent?.studentId === s.studentId;
              return (
                <div key={s.studentId}
                  className={cn('flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors',
                    sel && 'bg-blue-50/40', isPreview && 'ring-1 ring-inset ring-blue-300')}
                  onClick={() => {
                    toggleOne(s.studentId);
                    const idx = students.findIndex((x) => x.studentId === s.studentId);
                    setCurrentPage(idx);
                    setSide('front');
                  }}>
                  {sel
                    ? <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                    : <Square      className="w-4 h-4 text-gray-300 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-gray-900 text-sm">{s.firstName} {s.lastName}</span>
                    <span className="text-xs text-gray-400 ml-2">{s.admissionNo}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500 shrink-0">
                    <span>Avg: <strong>{s.overallAverage?.toFixed(1) ?? '—'}</strong></span>
                    <span>Rank: <strong>{s.overallRank || '—'}</strong></span>
                  </div>
                </div>
              );
            })}
            {!visibleStudents.length && (
              <div className="px-4 py-12 text-center">
                <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-center">
                  <Search className="w-10 h-10 text-gray-300 mb-3" />
                  <h4 className="text-sm font-semibold text-gray-900 mb-1">No matching students found</h4>
                  <p className="text-xs text-gray-500 mb-4">
                    No students match "{searchQuery}". Check the spelling or clear the filter.
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
            )}
          </div>
        </div>

        {/* Single-card preview navigation */}
        {displayStudent && (
          <>
            <div className="flex justify-between items-center px-1">
              <button onClick={goPrev}
                disabled={currentPage === 0 && side === 'front'}
                className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm disabled:opacity-40">
                <ChevronLeft className="w-4 h-4" /> Previous
              </button>
              <span className="text-sm text-gray-600">
                {displayStudent.firstName} {displayStudent.lastName} —{' '}
                <span className={cn('font-semibold', side === 'front' ? 'text-blue-700' : 'text-purple-700')}>
                  {side === 'front' ? 'Front Page' : 'Back Page'}
                </span>
              </span>
              <button onClick={goNext}
                disabled={currentPage === totalPreview - 1 && side === 'back'}
                className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm disabled:opacity-40">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Preview card */}
            <div className="bg-white shadow-2xl mx-auto border rounded-lg overflow-hidden"
              style={{ width: '8.5in', minHeight: '11in', padding: '0.5in' }}>
              {side === 'front'
                ? <FrontPage student={displayStudent} />
                : <BackPage  student={displayStudent} />}
            </div>
          </>
        )}
      </div>

      {/* ── Print pages (only rendered on paper) ── */}
      <div className="hidden print:block">
        {(selectedIds.length ? selectedStudents : students).map((student) => (
          <React.Fragment key={student.studentId}>
            <div style={{ pageBreakAfter: 'always', width: '8.5in', minHeight: '11in', padding: '0.5in', fontFamily: 'Arial, sans-serif', fontSize: '10px', boxSizing: 'border-box' }}>
              <FrontPage student={student} />
            </div>
            <div style={{ pageBreakAfter: 'always', width: '8.5in', minHeight: '11in', padding: '0.5in', fontFamily: 'Arial, sans-serif', fontSize: '10px', boxSizing: 'border-box' }}>
              <BackPage student={student} />
            </div>
          </React.Fragment>
        ))}
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
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
      <div className="text-center border-b-2 border-gray-800 pb-2">
        <h1 className="text-lg font-bold">Mentor Academy, from Kindergarten - High School</h1>
        <p className="font-semibold">STUDENT REPORT CARD</p>
      </div>

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

      <div>
        <p className="font-bold text-center mb-1">METHOD OF GRADING</p>
        <table className="w-full border border-gray-800 text-center text-xs">
          <tbody>
            <tr className="border-b border-gray-800">
              {['Marks 90-100','Marks 80-89','Marks 70-79','Marks 60-69','Below 60'].map((r, i) => (
                <td key={i} className={cn('p-1', i < 4 && 'border-r border-gray-800')}>{r}</td>
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

      <div>
        <p className="font-bold text-center mb-1">BASIC SKILLS &amp; PERSONAL DEVELOPMENT</p>
        <table className="w-full border border-gray-800 text-xs">
          <thead>
            <tr className="bg-gray-100">
              <th className="border-r border-gray-800 p-1 text-left">Competency</th>
              {(['A','B','C','D'] as Grade[]).map((g, i) => (
                <th key={g} className={cn('p-1 text-center w-8', i < 3 && 'border-r border-gray-800')}>{g}</th>
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
  const today = student.reportDate
    || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="h-full flex flex-col space-y-2 text-xs" style={{ fontFamily: 'Arial, sans-serif' }}>
      <div className="text-center border-b-2 border-gray-800 pb-1">
        <h1 className="text-sm font-bold">{student.firstName} {student.lastName} — Academic Results</h1>
      </div>

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
