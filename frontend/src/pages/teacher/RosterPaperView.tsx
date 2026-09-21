import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Printer,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Clock,
  FileText,
  Download,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYears } from '../../hooks/useAcademicStructure';
import {
  useHomeroomContext,
  useConsolidatedRoster,
  useRosterReviewStatus,
  useOfficialPrintRoster,
} from '../../hooks/useHomeroom';
import { downloadOfficialPrintRosterPdf } from '../../api/adminReports';


const PERIOD_ROWS = [
  { key: 'term1', label: '1st', bg: '' },
  { key: 'term2', label: '2nd', bg: '' },
  { key: 'sem1Avg', label: 'Ave1', bg: 'bg-blue-50 font-semibold text-blue-950' },
  { key: 'term3', label: '3rd', bg: '' },
  { key: 'term4', label: '4th', bg: '' },
  { key: 'sem2Avg', label: 'Ave2', bg: 'bg-blue-50 font-semibold text-blue-950' },
  { key: 'yearlyAverage', label: 'Yearly', bg: 'bg-emerald-50 font-bold text-emerald-950' },
] as const;

export default function RosterPaperView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const querySectionId = searchParams.get('sectionId') || searchParams.get('classSectionId');
  const queryYearId = searchParams.get('academicYearId') || searchParams.get('yearId');

  const { data: homeroomContext, isLoading: contextLoading } = useHomeroomContext();
  const { data: years = [], isLoading: yearsLoading } = useAcademicYears();

  const currentYear = years.find((y) => y.isCurrent) || years[0];
  const sectionId = querySectionId || homeroomContext?.assignedSection?.id;
  // Priority: URL param > section's own academicYearId > current/first year.
  // The URL param lets the admin roster page pass an explicit year.
  // For the teacher view we must use the section's year, not the first year
  // in the list, to prevent academic-year mismatches on the backend.
  const yearId =
    queryYearId ||
    (homeroomContext?.assignedSection?.academicYearId ??
      homeroomContext?.academicYearId ??
      currentYear?.id);

  const { data: reviewStatusData, isLoading: statusLoading } = useRosterReviewStatus(sectionId, yearId);
  const reviewStatus = reviewStatusData?.status ?? 'DRAFT';
  const isApproved = reviewStatus === 'APPROVED';

  // Authoritative official print endpoint for APPROVED rosters
  const { data: officialPrintData, isLoading: officialLoading } = useOfficialPrintRoster(
    sectionId,
    yearId,
    isApproved,
  );

  // Fallback / preview data for screen inspection before approval
  const { data: fallbackRosterData, isLoading: rosterLoading } = useConsolidatedRoster(
    sectionId,
    yearId,
  );

  const activeRoster = isApproved && officialPrintData ? officialPrintData : fallbackRosterData;
  const officialHeader = officialPrintData?.officialHeader;

  const loading =
    (contextLoading && !querySectionId) ||
    yearsLoading ||
    statusLoading ||
    (isApproved ? officialLoading : rosterLoading);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Clock className="w-10 h-10 text-blue-900 mx-auto mb-3 animate-spin" />
          <p className="text-gray-600 font-medium text-sm">Preparing official academic roster...</p>
        </div>
      </div>
    );
  }

  if (!sectionId) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900">No Section Selected</h2>
        <p className="text-sm text-gray-600">
          {isAdmin
            ? 'Please select a class section from the Admin Class Roster review page to view and print its official roster.'
            : 'No homeroom section is assigned to your account.'}
        </p>
        <button
          onClick={() => (isAdmin ? navigate('/admin/class-roster') : navigate('/homeroom/roster'))}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50"
        >
          <ArrowLeft className="w-4 h-4" /> {isAdmin ? 'Go to Class Roster' : 'Back to Dashboard'}
        </button>
      </div>
    );
  }

  if (!activeRoster) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900">Roster Unavailable</h2>
        <p className="text-sm text-gray-600">
          No roster data is currently available for this section and academic year.
        </p>
        <button
          onClick={() => (isAdmin ? navigate('/admin/class-roster') : navigate('/homeroom/roster'))}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50"
        >
          <ArrowLeft className="w-4 h-4" /> {isAdmin ? 'Back to Class Roster' : 'Back to Roster'}
        </button>
      </div>
    );
  }

  const [isDownloadingPdf, setIsDownloadingPdf] = React.useState(false);

  const handlePrint = () => {
    if (!isApproved) return;
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!isApproved) {
      toast.error('Roster must be Approved by Admin before downloading official PDF.');
      return;
    }
    if (!sectionId || !yearId) {
      toast.error('Missing class section or academic year.');
      return;
    }
    setIsDownloadingPdf(true);
    try {
      await downloadOfficialPrintRosterPdf(
        sectionId,
        yearId,
        `Official_Roster_${officialHeader?.sectionName || 'Class'}.pdf`,
      );
      toast.success('Official academic roster PDF downloaded successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download official roster PDF');
    } finally {
      setIsDownloadingPdf(false);
    }
  };


  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
      {/* ── Screen Controls / Actions Bar (Hidden on Print) ── */}
      <div className="no-print bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => (isAdmin ? navigate('/admin/class-roster') : navigate('/homeroom/roster'))}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> {isAdmin ? 'Back to Class Roster' : 'Back to Roster'}
          </button>
          <div className="h-5 w-px bg-gray-300" />
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-900" />
            <span className="font-bold text-gray-900 text-sm">Official 7-Row Paper Roster</span>
          </div>
        </div>

        {/* ── Approval Status Notice Banner ── */}
        <div className="flex items-center gap-3 flex-wrap">
          {isApproved ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>APPROVED ✓ — Official roster available for printing</span>
            </div>
          ) : reviewStatus === 'SUBMITTED_TO_ADMIN' ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold">
              <Clock className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Pending Admin Approval — Official Print Locked</span>
            </div>
          ) : reviewStatus === 'REJECTED' ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>
                Rejected by Admin — Official Print Locked
                {reviewStatusData?.rejectionReason && `: "${reviewStatusData.rejectionReason}"`}
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Draft — Official Print Locked (Roster must be Approved by Admin)</span>
            </div>
          )}

          {/* ── Print & Download Buttons ── */}
          <button
            onClick={handleDownloadPdf}
            disabled={!isApproved || isDownloadingPdf}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm ${
              isApproved
                ? 'bg-blue-900 hover:bg-blue-800 text-white cursor-pointer'
                : 'bg-gray-200 text-gray-400 border border-gray-300 cursor-not-allowed opacity-75'
            }`}
            title={isApproved ? 'Download Official Academic Roster PDF' : 'PDF download is locked until roster review is Approved'}
          >
            {isDownloadingPdf ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : isApproved ? (
              <Download className="w-4 h-4" />
            ) : (
              <Lock className="w-4 h-4" />
            )}
            {isApproved ? 'Download PDF' : 'PDF Locked'}
          </button>
          <button
            onClick={handlePrint}
            disabled={!isApproved}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm ${
              isApproved
                ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer'
                : 'bg-gray-200 text-gray-400 border border-gray-300 cursor-not-allowed opacity-75'
            }`}
            title={isApproved ? 'Print Official Paper Roster' : 'Printing is locked until roster review is Approved'}
          >
            {isApproved ? <Printer className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            {isApproved ? 'Print Official Roster' : 'Print Locked'}
          </button>

        </div>
      </div>

      {/* ── Official Academic Paper Sheet ── */}
      <div className="print-sheet bg-white border border-gray-300 rounded-lg p-6 shadow-sm overflow-x-auto">
        {/* ── Paper Document Header ── */}
        <div className="text-center space-y-1 pb-4 border-b-2 border-gray-900 mb-4">
          <p className="text-xs uppercase tracking-widest text-gray-600 font-semibold">
            {officialHeader?.institutionName ?? 'School Management Portal'} • Academic Affairs
          </p>
          <div className="flex items-center justify-center gap-3">
            <h1 className="text-xl md:text-2xl font-black text-gray-900 tracking-wide uppercase">
              {isApproved ? 'Official Student Academic Roster' : 'Student Academic Roster (Preview)'}
            </h1>
            {isApproved && (
              <span className="px-2 py-0.5 rounded border-2 border-emerald-700 bg-emerald-50 text-emerald-800 text-xs font-black uppercase tracking-wider">
                APPROVED ✓
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs text-gray-800 font-medium pt-1">
            <span>
              <strong>Academic Year:</strong> {officialHeader?.academicYear ?? currentYear?.year ?? 'N/A'}
            </span>
            <span>
              <strong>Grade & Section:</strong> {activeRoster.section.grade ? `${activeRoster.section.grade} - ` : ''}
              {activeRoster.section.name}
            </span>
            <span>
              <strong>Homeroom Teacher:</strong>{' '}
              {officialHeader?.homeroomTeacher ?? activeRoster.section.homeroomTeacher ?? 'Unassigned'}
            </span>
            <span>
              <strong>Status:</strong>{' '}
              <span className={isApproved ? 'text-emerald-700 font-bold' : 'text-amber-700 font-semibold'}>
                {reviewStatus}
              </span>
            </span>
            {isApproved && officialHeader?.reviewedAt && (
              <span>
                <strong>Approved On:</strong> {new Date(officialHeader.reviewedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* ── 7-Row Paper Table ── */}
        <table className="w-full text-left border-collapse border border-gray-900 text-[11px]">
          {/* Repeating Table Header */}
          <thead>
            <tr className="bg-gray-900 text-white">
              <th className="border border-gray-700 p-2 text-center w-8">No</th>
              <th className="border border-gray-700 p-2 text-center w-24">Adm No</th>
              <th className="border border-gray-700 p-2 text-left min-w-[150px]">Student Name</th>
              <th className="border border-gray-700 p-2 text-center w-10">Age</th>
              <th className="border border-gray-700 p-2 text-center w-10">Sex</th>
              <th className="border border-gray-700 p-2 text-center w-14 font-bold bg-gray-800">Period</th>

              {/* Dynamic Subject Columns */}
              {activeRoster.subjects.map((subj) => (
                <th
                  key={subj.id}
                  className="border border-gray-700 p-2 text-center min-w-[70px] bg-gray-800"
                >
                  <div className="font-bold text-[11px] leading-tight">{subj.name}</div>
                  <div className="text-[9px] text-gray-300 font-normal">{subj.code}</div>
                </th>
              ))}

              {/* Summary Columns */}
              <th className="border border-gray-700 p-2 text-center w-14 bg-gray-800">Sum</th>
              <th className="border border-gray-700 p-2 text-center w-14 bg-gray-800">Avg</th>
              <th className="border border-gray-700 p-2 text-center w-12 bg-gray-800 font-bold">Rank</th>
              <th className="border border-gray-700 p-2 text-center w-10">Abs</th>
              <th className="border border-gray-700 p-2 text-center w-12">Cond</th>
            </tr>
          </thead>

          {/* Table Body: 1 Student = Exactly 7 Academic Rows */}
          {activeRoster.students.map((student, sIdx) => {
            const isStudentComplete = student.isComplete;
            const subjectScoreMap = new Map(student.subjectScores.map((sc) => [sc.subjectId, sc]));

            return (
              <tbody
                key={student.studentId}
                className="student-group border-b-2 border-gray-900 break-inside-avoid hover:bg-gray-50/50"
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
                            className="border border-gray-400 p-2 text-center font-bold bg-gray-50 text-gray-800 align-middle"
                          >
                            {sIdx + 1}
                          </td>
                          <td
                            rowSpan={7}
                            className="border border-gray-400 p-2 text-center font-mono text-[10px] text-gray-700 align-middle"
                          >
                            {student.admissionNo}
                          </td>
                          <td
                            rowSpan={7}
                            className="border border-gray-400 p-2 text-left font-bold text-gray-900 align-middle"
                          >
                            <div>{student.studentName}</div>
                            {!isStudentComplete && (
                              <div className="text-[10px] text-red-600 font-normal mt-0.5" title={`Missing: ${student.missingSubjects?.join(', ')}`}>
                                ⚠ Incomplete{student.missingSubjects?.length ? ` (${student.missingSubjects[0]}${student.missingSubjects.length > 1 ? '…' : ''})` : ''}
                              </div>
                            )}
                          </td>
                          <td
                            rowSpan={7}
                            className="border border-gray-400 p-2 text-center text-gray-700 align-middle"
                          >
                            {student.age != null ? student.age : '—'}
                          </td>
                          <td
                            rowSpan={7}
                            className="border border-gray-400 p-2 text-center text-gray-700 align-middle"
                          >
                            {student.sex || '—'}
                          </td>
                        </>
                      )}

                      {/* Period Label (1st, 2nd, Ave1, 3rd, 4th, Ave2, Yearly) */}
                      <td className="border border-gray-400 p-1.5 text-center font-bold text-[10px] text-gray-800">
                        {period.label}
                      </td>

                      {/* Dynamic Subject Marks for this Period */}
                      {activeRoster.subjects.map((subj) => {
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
                            className="border border-gray-400 p-1.5 text-center text-[10.5px]"
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
                            className="border border-gray-400 p-2 text-center font-bold text-gray-900 bg-gray-50 align-middle"
                          >
                            {isStudentComplete && student.sum != null ? student.sum : '—'}
                          </td>
                          <td
                            rowSpan={7}
                            className="border border-gray-400 p-2 text-center font-bold text-gray-900 bg-gray-50 align-middle"
                          >
                            {isStudentComplete && student.average != null
                              ? student.average.toFixed(2)
                              : '—'}
                          </td>
                          <td
                            rowSpan={7}
                            className="border border-gray-400 p-2 text-center font-black text-sm text-indigo-950 bg-indigo-50/50 align-middle"
                          >
                            {isStudentComplete && student.rank != null ? student.rank : '—'}
                          </td>
                          <td
                            rowSpan={7}
                            className="border border-gray-400 p-2 text-center text-gray-800 align-middle"
                          >
                            {student.absentDays}
                          </td>
                          <td
                            rowSpan={7}
                            className="border border-gray-400 p-2 text-center font-semibold text-gray-800 align-middle"
                          >
                            {student.conduct || '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>

        {/* ── Official Signatures / Stamp Footer ── */}
        <div className="mt-8 pt-6 border-t-2 border-gray-800 flex justify-between items-end text-xs text-gray-800 font-semibold px-4">
          <div className="space-y-1">
            <p>Homeroom Teacher: _____________________________</p>
            <p className="text-[10px] text-gray-500 font-normal">Signature & Date</p>
          </div>
          <div className="text-center space-y-1">
            <p>School Seal / Stamp</p>
            <div className="w-24 h-12 border border-dashed border-gray-400 mx-auto rounded" />
          </div>
          <div className="space-y-1 text-right">
            <p>Director / Principal: _____________________________</p>
            <p className="text-[10px] text-gray-500 font-normal">Signature & Date</p>
          </div>
        </div>
      </div>

      {/* ── Dedicated Print Stylesheet ── */}
      <style>{`
        @page {
          size: A4 landscape;
          margin: 0.8cm 0.6cm;
        }
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            background: white !important;
            color: black !important;
            font-size: 8.5px !important;
            margin: 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-sheet {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 8px !important;
          }
          th, td {
            border: 1px solid #222 !important;
            padding: 2px 3px !important;
          }
          thead {
            display: table-header-group !important;
          }
          tbody.student-group {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </div>
  );
}
