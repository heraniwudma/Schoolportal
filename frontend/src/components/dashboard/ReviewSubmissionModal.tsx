import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Download,
  CheckCircle2,
  User,
  Calendar,
  Award,
  BookOpen,
  Edit3,
  AlertCircle,
  MessageSquare,
  Loader2,
} from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export interface SubmissionReviewData {
  id: string;
  assignmentId: string;
  assignmentTitle: string;
  subject: string;
  targetClass?: string;
  instructions?: string;
  studentId: string;
  studentName: string;
  admissionNo: string;
  loginId?: string;
  submittedAt: string;
  content: string | null;
  fileName: string | null;
  fileUrl: string | null;
  fileSize: number | null;
  fileType?: string | null;
  feedback?: string | null;
  isGraded?: boolean;
  status?: string;
  grade?: { id?: string; score: number; maxScore: number } | null;
  gradeItem?: {
    id: string;
    name: string;
    maxMark: number;
    fieldKey: string;
    itemType?: string;
  };
}

interface ReviewSubmissionModalProps {
  submission: SubmissionReviewData | null;
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'view' | 'edit';
  onGraded?: (submissionId: string, score: number, maxScore: number, feedback?: string) => void;
}

export default function ReviewSubmissionModal({
  submission,
  isOpen,
  onClose,
  initialMode = 'view',
  onGraded,
}: ReviewSubmissionModalProps) {
  const queryClient = useQueryClient();

  const [activeData, setActiveData] = useState<SubmissionReviewData | null>(submission);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  const [mode, setMode] = useState<'view' | 'edit'>(initialMode);
  const [score, setScore] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const [savingGrade, setSavingGrade] = useState<boolean>(false);
  const [downloading, setDownloading] = useState<boolean>(false);

  // Load authoritative submission data directly from backend
  useEffect(() => {
    if (!isOpen || !submission) {
      setActiveData(null);
      setScore('');
      setFeedback('');
      setValidationError(null);
      return;
    }

    setActiveData(submission);
    setMode(initialMode);

    let isMounted = true;
    setLoadingDetails(true);

    api
      .get<SubmissionReviewData>(`/assignments/submissions/${submission.id}`)
      .then((authoritativeData) => {
        if (!isMounted || !authoritativeData) return;
        setActiveData(authoritativeData);

        if (authoritativeData.grade) {
          setScore(String(authoritativeData.grade.score));
        } else {
          setScore('');
        }
        setFeedback(authoritativeData.feedback || '');
      })
      .catch((err) => {
        console.warn('Could not fetch latest submission details, using initial data:', err);
        if (submission.grade) {
          setScore(String(submission.grade.score));
        } else {
          setScore('');
        }
        setFeedback(submission.feedback || '');
      })
      .finally(() => {
        if (isMounted) setLoadingDetails(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, submission, initialMode]);

  if (!isOpen || !activeData) return null;

  const currentGradeItem = activeData.gradeItem || {
    id: activeData.assignmentId,
    name: activeData.assignmentTitle || 'Assignment',
    maxMark: activeData.grade?.maxScore || 20,
    fieldKey: 'assignment',
  };

  const maxMark = Number(currentGradeItem.maxMark) || 20;

  // Real-time validation
  const validateGradeInput = (val: string): string | null => {
    if (val === undefined || val === null || val.trim() === '') {
      return 'Grade is required and cannot be empty.';
    }
    const num = Number(val);
    if (isNaN(num)) {
      return 'Grade must be a valid numeric value.';
    }
    if (num < 0) {
      return 'Grade cannot be negative.';
    }
    if (num > maxMark) {
      return `Grade cannot exceed the maximum mark of ${maxMark}.`;
    }
    return null;
  };

  const handleScoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setScore(val);
    if (val.trim() === '') {
      setValidationError('Grade is required.');
    } else {
      const err = validateGradeInput(val);
      setValidationError(err);
    }
  };

  const handleDownloadFile = async () => {
    setDownloading(true);
    try {
      const res = await api.get<{ url: string }>(`/assignments/submissions/${activeData.id}/file`);
      if (res?.url) {
        window.open(res.url, '_blank', 'noopener,noreferrer');
      } else {
        toast.error('File URL could not be resolved');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not download submission file');
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateGradeInput(score);
    if (err) {
      setValidationError(err);
      return toast.error(err);
    }

    const numScore = Number(score);
    setSavingGrade(true);
    setValidationError(null);

    try {
      const res = await api.post<{
        success: boolean;
        message: string;
        grade: { id: string; score: number; maxScore: number; itemName: string };
        feedback: string | null;
        status: string;
      }>(`/assignments/submissions/${activeData.id}/grade`, {
        score: numScore,
        feedback: feedback.trim(),
      });

      toast.success(res?.message || `Grade saved successfully: ${numScore} / ${maxMark}`);

      const updatedGrade = {
        score: numScore,
        maxScore: maxMark,
      };

      setActiveData((prev) =>
        prev
          ? {
              ...prev,
              isGraded: true,
              status: 'GRADED',
              feedback: feedback.trim(),
              grade: updatedGrade,
            }
          : prev
      );

      setMode('view');

      if (onGraded) {
        onGraded(activeData.id, numScore, maxMark, feedback.trim());
      }

      queryClient.invalidateQueries({ queryKey: ['teachers', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['results'] });
    } catch (err: any) {
      const msg = err?.message || 'Failed to submit grade';
      setValidationError(msg);
      toast.error(msg);
    } finally {
      setSavingGrade(false);
    }
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return '';
    return `${(bytes / 1024 / 1024).toFixed(bytes >= 1024 * 1024 ? 1 : 2)} MB`;
  };

  const isGraded = Boolean(activeData.isGraded || activeData.grade);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-gray-100 max-h-[92vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="response-review-modal-title"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 bg-gradient-to-r from-blue-50/70 via-gray-50/50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-900 text-white flex items-center justify-center shadow-sm">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900 bg-blue-100/80 px-2 py-0.5 rounded">
                  {activeData.subject} {activeData.targetClass ? `• ${activeData.targetClass}` : ''}
                </span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                    isGraded
                      ? 'bg-green-100 text-green-800 border border-green-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  {isGraded
                    ? `Graded (${activeData.grade?.score}/${activeData.grade?.maxScore ?? maxMark})`
                    : 'Needs Review'}
                </span>
              </div>
              <h2 id="response-review-modal-title" className="text-lg font-bold text-gray-900 mt-0.5">
                STUDENT RESPONSE REVIEW
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Student & Submission Summary Card */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-gray-50 border border-gray-200/80">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-semibold">Student</p>
                <p className="font-bold text-gray-900 text-base">{activeData.studentName}</p>
                <p className="text-xs text-gray-500">
                  ID: <span className="font-semibold text-gray-700">{activeData.admissionNo}</span>
                  {activeData.loginId && activeData.loginId !== activeData.admissionNo ? (
                    <span className="ml-1 text-gray-400">({activeData.loginId})</span>
                  ) : null}
                </p>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-gray-600 sm:border-l sm:border-gray-200 sm:pl-4">
              <div>
                <span className="font-bold text-gray-700">Assignment:</span>{' '}
                <span className="text-gray-900 font-medium">{activeData.assignmentTitle}</span>
              </div>
              <div>
                <span className="font-bold text-gray-700">Subject:</span>{' '}
                <span className="text-gray-900 font-medium">{activeData.subject}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-500 pt-0.5">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <span>
                  Submitted:{' '}
                  <strong className="text-gray-700 font-medium">
                    {new Date(activeData.submittedAt).toLocaleString()}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Section 1: Question / Item Prompt */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5 mb-2">
              <BookOpen className="w-4 h-4 text-blue-700" />
              QUESTION / ITEM INSTRUCTIONS
            </h3>
            {activeData.instructions?.trim() ? (
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap bg-gray-50 p-3.5 rounded-lg border border-gray-100">
                {activeData.instructions}
              </p>
            ) : (
              <p className="text-sm text-gray-400 italic bg-gray-50 p-3 rounded-lg">
                No specific instructions or question text provided for this assignment.
              </p>
            )}
          </div>

          {/* Section 2: Student's Submitted Answer */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-700" />
                STUDENT'S SUBMITTED ANSWER
              </h3>
              {activeData.content ? (
                <span className="text-[11px] font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded">
                  Written Response Provided
                </span>
              ) : (
                <span className="text-[11px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                  No Written Text
                </span>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-blue-50/20 p-4 text-gray-900 text-sm leading-relaxed whitespace-pre-wrap min-h-[90px]">
              {activeData.content?.trim() ? (
                activeData.content
              ) : (
                <p className="text-gray-400 italic">
                  The student submitted an attached document/file without additional inline text.
                </p>
              )}
            </div>

            {/* Attached File (if any) */}
            {activeData.fileName && (
              <div className="mt-3.5 pt-3 border-t border-gray-100">
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Attached File Submission
                </p>
                <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white hover:border-blue-300 transition">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-900 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-bold text-gray-900 truncate">{activeData.fileName}</p>
                      {activeData.fileSize ? (
                        <p className="text-xs text-gray-400">{formatFileSize(activeData.fileSize)}</p>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadFile}
                    disabled={downloading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-950 text-white text-xs font-bold shrink-0 disabled:opacity-50 transition shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {downloading ? 'Opening…' : 'Open / Download'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Teacher Review & Feedback */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5 mb-2">
              <MessageSquare className="w-4 h-4 text-indigo-600" />
              TEACHER REVIEW & CORRECTIONS / FEEDBACK
            </h3>
            {mode === 'edit' ? (
              <div>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Enter teacher feedback, corrections, or constructive notes for the student..."
                  rows={3}
                  className="w-full rounded-xl border border-gray-300 bg-white p-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 leading-relaxed placeholder:text-gray-400"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Teacher corrections and feedback will be saved with the submission evaluation.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3.5 text-sm text-gray-800">
                {activeData.feedback?.trim() ? (
                  <p className="whitespace-pre-wrap leading-relaxed">{activeData.feedback}</p>
                ) : (
                  <p className="text-gray-400 italic">No teacher review comments entered yet.</p>
                )}
              </div>
            )}
          </div>

          {/* Section 4: GRADING (Connected to Grade Entry) */}
          <div className="rounded-xl border-2 border-blue-900/20 bg-blue-50/30 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3 border-b border-blue-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-500" />
                GRADING (GRADE ENTRY SYSTEM)
              </h3>
              {isGraded && mode === 'view' && (
                <button
                  type="button"
                  onClick={() => setMode('edit')}
                  className="inline-flex items-center gap-1 text-xs font-bold text-blue-900 hover:text-blue-950 hover:underline cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit Grade
                </button>
              )}
            </div>

            {/* Display Item Name & Maximum Mark matching Grade Entry */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 text-xs">
              <div className="p-3 bg-white rounded-lg border border-gray-200">
                <span className="text-gray-500 font-semibold block">Grade Item Name:</span>
                <span className="text-sm font-bold text-gray-900 mt-0.5 block">
                  {currentGradeItem.name}
                </span>
              </div>
              <div className="p-3 bg-white rounded-lg border border-gray-200">
                <span className="text-gray-500 font-semibold block">Maximum Mark:</span>
                <span className="text-sm font-bold text-gray-900 mt-0.5 block">
                  {maxMark}
                </span>
              </div>
            </div>

            {mode === 'edit' ? (
              <form onSubmit={handleSaveGrade} className="space-y-4">
                <div>
                  <label htmlFor="given-grade-input" className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Given Grade:
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-[200px]">
                      <input
                        id="given-grade-input"
                        type="number"
                        min="0"
                        max={maxMark}
                        step="any"
                        value={score}
                        onChange={handleScoreChange}
                        placeholder={`0 – ${maxMark}`}
                        className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-base font-bold focus:outline-none focus:ring-2 ${
                          validationError
                            ? 'border-red-500 focus:ring-red-200 text-red-900'
                            : 'border-gray-300 focus:border-blue-900 focus:ring-blue-900/20 text-gray-900'
                        }`}
                        required
                        autoFocus
                      />
                    </div>
                    <span className="text-sm font-bold text-gray-600">/ {maxMark}</span>
                  </div>
                  {validationError && (
                    <div className="flex items-center gap-1.5 text-xs text-red-600 font-semibold mt-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{validationError}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-blue-100">
                  <span className="text-xs text-gray-500">
                    {isGraded ? (
                      <span className="text-green-700 font-medium">
                        Current grade: {activeData.grade?.score} / {activeData.grade?.maxScore ?? maxMark}
                      </span>
                    ) : (
                      'Status: Not Graded'
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {isGraded && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode('view');
                          setValidationError(null);
                        }}
                        className="px-4 py-2 rounded-xl border border-gray-300 text-gray-700 text-xs font-bold hover:bg-gray-100 transition"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={savingGrade || !!validationError || score.trim() === ''}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-950 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition shadow-sm cursor-pointer"
                    >
                      {savingGrade ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <Award className="w-3.5 h-3.5" />
                          Submit Grade
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200">
                <div>
                  <span className="text-xs text-gray-500 font-medium">Recorded Grade:</span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    {isGraded ? (
                      <>
                        <span className="text-2xl font-black text-blue-900">
                          {activeData.grade?.score}
                        </span>
                        <span className="text-sm font-bold text-gray-500">
                          / {activeData.grade?.maxScore ?? maxMark}
                        </span>
                        <span className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-green-700 bg-green-50 px-2.5 py-0.5 rounded-full border border-green-200">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Graded
                        </span>
                      </>
                    ) : (
                      <span className="text-sm font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                        Not Graded Yet
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMode('edit')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-900 hover:bg-blue-950 text-white text-xs font-bold uppercase tracking-wider transition shadow-sm cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {isGraded ? 'Edit Grade' : 'Enter Grade'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-3.5 bg-gray-50/80 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {loadingDetails ? 'Updating latest status…' : 'Review synchronized with Grade Entry.'}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl border border-gray-300 bg-white text-gray-700 text-xs font-bold hover:bg-gray-100 transition shadow-sm cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
