import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Eye,
  Award,
  Calendar,
  User,
  Search,
  RefreshCw,
  AlertCircle,
  ClipboardList,
  Loader2,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import ReviewSubmissionModal, { SubmissionReviewData } from './ReviewSubmissionModal';
import { AssignmentItem } from './EditAssignmentModal';

interface AssignmentSubmissionsModalProps {
  assignment: AssignmentItem | null;
  isOpen: boolean;
  onClose: () => void;
  onGradeUpdated?: (submissionId: string, score: number, maxScore: number, feedback?: string) => void;
}

export default function AssignmentSubmissionsModal({
  assignment,
  isOpen,
  onClose,
  onGradeUpdated,
}: AssignmentSubmissionsModalProps) {
  const queryClient = useQueryClient();

  const [submissions, setSubmissions] = useState<SubmissionReviewData[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected submission for complete response review & grading
  const [reviewSubmission, setReviewSubmission] = useState<SubmissionReviewData | null>(null);
  const [reviewMode, setReviewMode] = useState<'view' | 'edit'>('view');

  const fetchSubmissions = async () => {
    if (!assignment?.id) return;
    setLoading(true);
    setError(null);

    try {
      const data = await api.get<SubmissionReviewData[]>(`/assignments/${assignment.id}/submissions`);
      setSubmissions(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to load assignment submissions:', err);
      setError(err?.message || 'Failed to load student submissions for this assignment.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && assignment?.id) {
      setSearchQuery('');
      setReviewSubmission(null);
      fetchSubmissions();
    } else {
      setSubmissions([]);
      setError(null);
      setReviewSubmission(null);
    }
  }, [isOpen, assignment?.id]);

  const filteredSubmissions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter((sub) => {
      const name = (sub.studentName || '').toLowerCase();
      const adm = (sub.admissionNo || '').toLowerCase();
      const login = (sub.loginId || '').toLowerCase();
      const file = (sub.fileName || '').toLowerCase();
      return name.includes(q) || adm.includes(q) || login.includes(q) || file.includes(q);
    });
  }, [submissions, searchQuery]);

  const gradedCount = useMemo(() => {
    return submissions.filter((s) => s.isGraded || s.grade).length;
  }, [submissions]);

  const handleOpenSubmission = (sub: SubmissionReviewData, mode: 'view' | 'edit') => {
    setReviewMode(mode);
    setReviewSubmission(sub);
  };

  const handleGraded = (submissionId: string, score: number, maxScore: number, feedback?: string) => {
    setSubmissions((prev) =>
      prev.map((sub) =>
        sub.id === submissionId
          ? {
              ...sub,
              isGraded: true,
              status: 'GRADED',
              feedback: feedback ?? sub.feedback,
              grade: { score, maxScore, id: sub.grade?.id },
            }
          : sub
      )
    );

    queryClient.invalidateQueries({ queryKey: ['assignments', 'teacher'] });
    queryClient.invalidateQueries({ queryKey: ['teachers', 'dashboard'] });

    if (onGradeUpdated) {
      onGradeUpdated(submissionId, score, maxScore, feedback);
    }
  };

  if (!isOpen || !assignment) return null;

  const maxMarkDisplay = assignment.maxMark ?? 20;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-white/15 text-blue-100 border border-white/20">
                  STUDENT RESPONSES
                </span>
                {assignment.subject && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-100 border border-blue-400/20">
                    {assignment.subject}
                  </span>
                )}
                {assignment.targetClass && (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-100 border border-indigo-400/20">
                    {assignment.targetClass}
                  </span>
                )}
              </div>

              <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-blue-300 shrink-0" />
                Assignment: {assignment.title}
              </h2>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-blue-200 mt-2">
                <span className="font-semibold text-amber-300">
                  Maximum Mark: {maxMarkDisplay} pts
                </span>
                <span>•</span>
                <span>
                  Due: {assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'No due date'}
                </span>
                <span>•</span>
                <span>
                  {submissions.length} submission{submissions.length === 1 ? '' : 's'} ({gradedCount} graded)
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer shrink-0"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Subheader / Search & Actions Bar */}
          <div className="p-4 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search student by name, admission no, or file..."
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-200 bg-white text-xs outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                type="button"
                onClick={fetchSubmissions}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 text-xs font-semibold shadow-sm transition disabled:opacity-50 cursor-pointer"
                title="Refresh submissions"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin text-blue-900")} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          {/* Submissions List Content */}
          <div className="p-6 overflow-y-auto flex-1 divide-y divide-gray-100">
            {loading ? (
              <div className="py-16 text-center">
                <Loader2 className="w-8 h-8 text-blue-900 animate-spin mx-auto mb-3" />
                <p className="text-sm font-semibold text-gray-700">Fetching submitted student responses…</p>
                <p className="text-xs text-gray-400 mt-1">Retrieving answers for assignment: {assignment.title}</p>
              </div>
            ) : error ? (
              <div className="py-12 text-center max-w-md mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-gray-900">Unable to Load Submissions</h4>
                <p className="text-xs text-gray-500 mt-1 mb-4">{error}</p>
                <button
                  type="button"
                  onClick={fetchSubmissions}
                  className="px-4 py-2 rounded-xl bg-blue-900 text-white text-xs font-semibold hover:bg-blue-950 transition cursor-pointer"
                >
                  Retry Request
                </button>
              </div>
            ) : submissions.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center mx-auto mb-3 border border-gray-100">
                  <ClipboardList className="w-7 h-7" />
                </div>
                <h4 className="text-base font-bold text-gray-800">No submissions yet.</h4>
                <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                  Enrolled students have not turned in any work for this assignment yet. When students submit their answers or documents, they will appear here immediately.
                </p>
              </div>
            ) : filteredSubmissions.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm font-semibold text-gray-700">No matching student submissions</p>
                <p className="text-xs text-gray-400 mt-1">No responses match "{searchQuery}"</p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-3 text-xs font-semibold text-blue-900 hover:underline"
                >
                  Clear search filter
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Table Header Summary */}
                <div className="hidden sm:grid grid-cols-12 gap-4 px-3 py-2 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  <div className="col-span-5">Student</div>
                  <div className="col-span-3">Submitted</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                {filteredSubmissions.map((sub) => {
                  const isGraded = sub.isGraded || !!sub.grade;
                  const scoreDisplay = sub.grade ? `${sub.grade.score}/${sub.grade.maxScore}` : null;

                  return (
                    <div
                      key={sub.id}
                      className="p-4 rounded-xl border border-gray-100 hover:border-gray-200 bg-white hover:bg-gray-50/60 shadow-sm transition flex flex-col sm:grid sm:grid-cols-12 gap-4 items-start sm:items-center"
                    >
                      {/* Student Info */}
                      <div className="col-span-5 flex items-center gap-3 w-full">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center shrink-0 font-bold text-sm">
                          {sub.studentName ? sub.studentName.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-gray-900 truncate">
                            {sub.studentName || 'Student'}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                            <span>{sub.admissionNo || sub.loginId || 'No ID'}</span>
                            {sub.fileName && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 font-medium truncate max-w-[130px]" title={sub.fileName}>
                                <FileText className="w-3 h-3 text-blue-800" />
                                {sub.fileName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Submitted Date */}
                      <div className="col-span-3 text-xs text-gray-600 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <span>
                          {sub.submittedAt
                            ? new Date(sub.submittedAt).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : 'Unknown date'}
                        </span>
                      </div>

                      {/* Status */}
                      <div className="col-span-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider",
                            isGraded
                              ? "bg-green-100 text-green-800 border border-green-200"
                              : "bg-blue-50 text-blue-800 border border-blue-200"
                          )}
                        >
                          {isGraded ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-green-700" />
                              Graded ({scoreDisplay})
                            </>
                          ) : (
                            'Submitted'
                          )}
                        </span>
                      </div>

                      {/* Actions */}
                      <div className="col-span-2 flex items-center justify-end gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => handleOpenSubmission(sub, 'view')}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 text-xs font-semibold shadow-sm transition cursor-pointer"
                          title="View student complete response"
                        >
                          <Eye className="w-3.5 h-3.5 text-gray-500" />
                          <span>View Response</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenSubmission(sub, 'edit')}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-950 text-white text-xs font-semibold shadow-sm transition cursor-pointer shrink-0"
                          title="Grade or edit response score"
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>{isGraded ? 'Edit Grade' : 'Grade'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <div>
              Showing {filteredSubmissions.length} of {submissions.length} submission{submissions.length === 1 ? '' : 's'}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold shadow-sm transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Review Submission Modal for Individual Response */}
      <ReviewSubmissionModal
        submission={reviewSubmission}
        isOpen={!!reviewSubmission}
        initialMode={reviewMode}
        onClose={() => setReviewSubmission(null)}
        onGraded={handleGraded}
      />
    </>
  );
}
