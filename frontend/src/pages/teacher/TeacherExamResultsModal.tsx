import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Send,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Users,
  Award,
  TrendingUp,
  Clock,
  BookOpen,
  Trash2,
  RefreshCw,
  Eye,
  ShieldCheck,
  ShieldAlert,
  Search,
} from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';

interface StudentRow {
  studentId: string;
  admissionNo: string;
  studentName: string;
  gender?: string;
  sessionId: string | null;
  sessionStatus: string;
  startedAt: string | null;
  completedAt: string | null;
  score: number | null;
  totalMarks: number;
  percentage: number | null;
  passed: boolean | null;
  answeredQuestionsCount: number;
}

interface ResultsSummaryResponse {
  exam: {
    id: string;
    title: string;
    totalMarks: number;
    duration: number;
    resultsReleased: boolean;
    resultsReleasedAt: string | null;
    subject?: { id: string; name: string; code?: string };
    classSection?: { id: string; name: string };
    questionCount: number;
  };
  stats: {
    totalEnrolled: number;
    submissionsCount: number;
    pendingCount: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    passRate: number;
    passCount: number;
  };
  students: StudentRow[];
}

interface Props {
  examId: string;
  onClose: () => void;
  onExamUpdated?: () => void;
}

export default function TeacherExamResultsModal({ examId, onClose, onExamUpdated }: Props) {
  const [data, setData] = useState<ResultsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'SUBMITTED' | 'PENDING'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [resettingStudentId, setResettingStudentId] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ResultsSummaryResponse>(`/examinations/${examId}/results-summary`);
      setData(res);
    } catch (err: any) {
      toast.error('Failed to load exam results: ' + (err.message ?? 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [examId]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const handleToggleRelease = async (release: boolean) => {
    const actionName = release ? 'Release Exam Review' : 'Retract Exam Review';
    const confirmMsg = release
      ? 'Release graded exam review and correct answers to students now? Students will be able to view their score and side-by-side correct answer keys.'
      : 'Retract exam review? Students will immediately lose access to correct answer keys until you release it again.';

    if (!window.confirm(confirmMsg)) return;

    setActionLoading(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        `/examinations/${examId}/release-results`,
        { release },
      );
      toast.success(res.message);
      await fetchResults();
      if (onExamUpdated) onExamUpdated();
    } catch (err: any) {
      toast.error(`Failed to ${release ? 'release' : 'retract'} results: ` + (err.message ?? 'Error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetStudentSubmission = async (studentId: string, studentName: string) => {
    const confirmMsg = `Are you sure you want to reset the submission for ${studentName}? This will clear their answers and allow them to retake or have their submission updated.`;
    if (!window.confirm(confirmMsg)) return;

    setResettingStudentId(studentId);
    try {
      await api.delete(`/examinations/${examId}/results/${studentId}`);
      toast.success(`Submission reset for ${studentName}.`);
      await fetchResults();
      if (onExamUpdated) onExamUpdated();
    } catch (err: any) {
      toast.error('Failed to reset submission: ' + (err.message ?? 'Error'));
    } finally {
      setResettingStudentId(null);
    }
  };

  const exam = data?.exam;
  const stats = data?.stats;
  const isReleased = exam?.resultsReleased ?? false;

  const filteredStudents = (data?.students ?? []).filter((s) => {
    const isDone = s.sessionStatus === 'COMPLETED' || s.sessionStatus === 'TIMED_OUT';
    if (filter === 'SUBMITTED' && !isDone) return false;
    if (filter === 'PENDING' && isDone) return false;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return (
        (s.studentName || '').toLowerCase().includes(q) ||
        (s.admissionNo || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-5xl my-8 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-6 md:p-8 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-500/30 text-blue-200 border border-blue-400/30">
                {exam?.subject?.name ?? 'Exam'}
              </span>
              <span className="text-xs text-blue-200">
                {exam?.classSection?.name ?? 'Class'} &bull; {exam?.duration ?? 0} Mins &bull; {exam?.questionCount ?? 0} Questions
              </span>
            </div>
            <h2 className="text-2xl font-black">{exam?.title ?? 'Exam Results & Review'}</h2>
            <p className="text-xs text-blue-200/80 mt-1">
              Evaluate class performance and manage student answer key releases.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-2xl transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1">
          {loading ? (
            <div className="py-20 text-center space-y-4">
              <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-gray-500">Loading student exam submissions and statistics...</p>
            </div>
          ) : !data ? (
            <div className="py-16 text-center text-gray-500">
              <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
              <p className="font-bold">Failed to load exam data</p>
            </div>
          ) : (
            <>
              {/* Release Review Banner & Controls */}
              <div
                className={`p-6 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all ${
                  isReleased
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
                }`}
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                      isReleased ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'
                    }`}
                  >
                    {isReleased ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-base">
                        {isReleased ? 'Exam Review & Answer Keys are LIVE' : 'Exam Review is UNRELEASED'}
                      </h4>
                      <span
                        className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          isReleased ? 'bg-emerald-200/80 text-emerald-800' : 'bg-indigo-200/80 text-indigo-800'
                        }`}
                      >
                        {isReleased ? 'Visible to Students' : 'Hidden from Students'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1 max-w-xl">
                      {isReleased
                        ? `Students can view their submitted answers side-by-side with the correct solutions (Released ${
                            exam.resultsReleasedAt ? new Date(exam.resultsReleasedAt).toLocaleString() : 'recently'
                          }).`
                        : 'Students can only see their completion status. Release exam review to enable educational self-assessment and answer key inspection.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto">
                  {isReleased ? (
                    <button
                      onClick={() => handleToggleRelease(false)}
                      disabled={actionLoading}
                      className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-red-200 bg-white text-red-700 hover:bg-red-50 text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      {actionLoading ? 'Retracting…' : 'Retract Review'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleToggleRelease(true)}
                      disabled={actionLoading}
                      className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-md shadow-blue-900/20 disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      {actionLoading ? 'Publishing…' : 'Release Exam Review'}
                    </button>
                  )}
                </div>
              </div>

              {/* Class Performance Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                    <Users className="w-4 h-4 text-blue-600" />
                    Submissions
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-gray-900">{stats?.submissionsCount}</span>
                    <span className="text-xs text-gray-400 font-semibold">/ {stats?.totalEnrolled} enrolled</span>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                    Class Average
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-indigo-900">{stats?.averageScore}</span>
                    <span className="text-xs text-gray-400 font-semibold">/ {exam?.totalMarks} marks</span>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Pass Rate
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-emerald-700">{stats?.passRate}%</span>
                    <span className="text-xs text-gray-400 font-semibold">({stats?.passCount} passed)</span>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                    <Award className="w-4 h-4 text-amber-600" />
                    High / Low
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-black text-amber-700">{stats?.highestScore}</span>
                    <span className="text-xs text-gray-400 font-bold">/</span>
                    <span className="text-lg font-bold text-gray-500">{stats?.lowestScore}</span>
                  </div>
                </div>
              </div>

              {/* Roster & Submissions Section */}
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 text-lg">Student Submissions</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
                      {filteredStudents.length} Students
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    {/* Search */}
                    <div className="relative w-full sm:w-60">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search student or adm no..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-8 pr-8 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 w-full"
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

                    {/* Filter Pills */}
                    <div className="flex items-center bg-gray-100 p-1 rounded-xl text-xs font-bold">
                      <button
                        onClick={() => setFilter('ALL')}
                        className={`px-3 py-1 rounded-lg transition-colors ${
                          filter === 'ALL' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        All
                      </button>
                      <button
                        onClick={() => setFilter('SUBMITTED')}
                        className={`px-3 py-1 rounded-lg transition-colors ${
                          filter === 'SUBMITTED' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        Submitted
                      </button>
                      <button
                        onClick={() => setFilter('PENDING')}
                        className={`px-3 py-1 rounded-lg transition-colors ${
                          filter === 'PENDING' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        Pending
                      </button>
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50/80 text-[11px] font-black uppercase tracking-wider text-gray-500 border-b border-gray-100">
                      <tr>
                        <th className="px-5 py-3.5">Student</th>
                        <th className="px-4 py-3.5">Status</th>
                        <th className="px-4 py-3.5">Answered</th>
                        <th className="px-4 py-3.5">Score</th>
                        <th className="px-4 py-3.5">Completed At</th>
                        <th className="px-5 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredStudents.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-5 py-12 text-center">
                            <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-center">
                              <Search className="w-10 h-10 text-gray-300 mb-3" />
                              <h4 className="text-sm font-semibold text-gray-900 mb-1">
                                {searchQuery ? 'No matching students found' : 'No submissions found'}
                              </h4>
                              <p className="text-xs text-gray-500 mb-4">
                                {searchQuery
                                  ? `No students match "${searchQuery}". Check the spelling or clear your search.`
                                  : 'No student submissions found for the selected filter.'}
                              </p>
                              {searchQuery && (
                                <button
                                  onClick={() => setSearchQuery('')}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  Clear Search
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredStudents.map((st) => {
                          const isDone = st.sessionStatus === 'COMPLETED' || st.sessionStatus === 'TIMED_OUT';
                          return (
                            <tr key={st.studentId} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-5 py-3.5">
                                <div className="font-bold text-gray-900">{st.studentName}</div>
                                <div className="text-xs text-gray-400">{st.admissionNo}</div>
                              </td>
                              <td className="px-4 py-3.5">
                                {isDone ? (
                                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200 flex items-center gap-1.5 w-fit">
                                    <CheckCircle2 className="w-3 h-3" /> Submitted
                                  </span>
                                ) : st.sessionStatus === 'ACTIVE' || st.sessionStatus === 'INTERRUPTED' ? (
                                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1.5 w-fit">
                                    <Clock className="w-3 h-3 animate-spin" /> In Progress
                                  </span>
                                ) : st.sessionStatus === 'AWAITING_RESUME' ? (
                                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5 w-fit">
                                    <AlertTriangle className="w-3 h-3" /> Needs Resume
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500 w-fit">
                                    Not Started
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-xs text-gray-600">
                                {isDone ? (
                                  <span className="font-semibold">
                                    {st.answeredQuestionsCount} / {exam?.questionCount}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                              <td className="px-4 py-3.5">
                                {isDone && st.score !== null ? (
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-gray-900">
                                      {st.score} <span className="text-xs text-gray-400 font-normal">/ {st.totalMarks}</span>
                                    </span>
                                    <span
                                      className={`px-2 py-0.5 rounded-md text-xs font-black ${
                                        st.passed
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : 'bg-rose-50 text-rose-700'
                                      }`}
                                    >
                                      {st.percentage}%
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3.5 text-xs text-gray-500">
                                {st.completedAt ? new Date(st.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ', ' + new Date(st.completedAt).toLocaleDateString() : '—'}
                              </td>
                              <td className="px-5 py-3.5 text-right">
                                {isDone && (
                                  <button
                                    onClick={() => handleResetStudentSubmission(st.studentId, st.studentName)}
                                    disabled={resettingStudentId === st.studentId}
                                    title="Reset / Delete this student's submission to allow a retake"
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 md:p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={fetchResults}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
