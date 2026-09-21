import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, Clock, CheckCircle2, Save, Send, HelpCircle,
  AlertCircle, FolderOpen, X, BadgeCheck, XCircle, RefreshCw,
  FileText, AlertTriangle, Rocket, Calendar, Globe, Timer,
  ChevronDown, ChevronUp, Award, Search, RotateCcw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Toaster, toast } from 'sonner';
import { api } from '../../lib/api';
import { formatClassSection } from '../../lib/classSection';
import TeacherExamResultsModal from './TeacherExamResultsModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  text: string;
  options: string[];
  correctAnswer: number;
  marks: number;
}

interface Subject { id: string; name: string; }

type TeachingAssignment = {
  subjectId: string;
  classSectionId: string;
  Subject: Subject;
  ClassSection: { id: string; name: string };
};

type ExamStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'PUBLISHED';

interface ReviewHistoryItem {
  id: string;
  status?: string | null;
  action: string;
  reason?: string | null;
  actionByName?: string | null;
  createdAt: string;
}

interface TeacherExam {
  id: string;
  title: string;
  status: ExamStatus;
  duration: number;
  instructions?: string | null;
  rejectionReason?: string | null;
  isResubmitted?: boolean;
  resubmittedAt?: string | null;
  reviewHistory?: ReviewHistoryItem[];
  Subject?: { id: string; name: string } | null;
  Class?: { name: string } | null;
  ClassSection?: { id: string; name: string } | null;
  questions?: Array<{
    id: string;
    text?: string;
    questionText?: string;
    marks?: number;
    options?: any[];
  }>;
  windowStart?: string | null;
  windowEnd?: string | null;
  delayMinutes?: number;
  updatedAt?: string;
  createdAt?: string;
}

interface PublishedExam {
  id: string;
  title: string;
  status: string;
  duration: number;
  totalMarks?: number;
  Subject?: { name: string } | null;
  ClassSection?: { name: string } | null;
  questionCount: number;
  windowStart: string | null;
  windowEnd: string | null;
  delayMinutes: number;
  resultsReleased?: boolean;
  resultsReleasedAt?: string | null;
  windowStatus: 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'NO_WINDOW';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractRejectionReason(instructions?: string | null): string | null {
  if (!instructions) return null;
  const m = instructions.match(/^\[REJECTION_REASON\]:\s*(.+)/s);
  return m ? m[1].trim() : null;
}

const STATUS_CONFIG: Record<ExamStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  DRAFT:     { label: 'Draft',           bg: 'bg-gray-100',   text: 'text-gray-600',  icon: <FileText   className="w-3.5 h-3.5" /> },
  PENDING:   { label: 'Pending Review',  bg: 'bg-amber-100',  text: 'text-amber-700', icon: <Clock      className="w-3.5 h-3.5" /> },
  APPROVED:  { label: 'Approved',        bg: 'bg-green-100',  text: 'text-green-700', icon: <BadgeCheck className="w-3.5 h-3.5" /> },
  REJECTED:  { label: 'Rejected',        bg: 'bg-red-100',    text: 'text-red-700',   icon: <XCircle    className="w-3.5 h-3.5" /> },
  PUBLISHED: { label: 'Published',       bg: 'bg-blue-100',   text: 'text-blue-700',  icon: <Globe      className="w-3.5 h-3.5" /> },
};

/** Format an ISO string for display. */
function fmtDT(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

/** Minutes from now → datetime-local value string (YYYY-MM-DDTHH:mm). */
function nowPlus(mins: number): string {
  const d = new Date(Date.now() + mins * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Publish Modal ─────────────────────────────────────────────────────────────

interface PublishModalProps {
  exam: TeacherExam;
  onClose: () => void;
  onPublished: (examId: string) => void;
}

function PublishModal({ exam, onClose, onPublished }: PublishModalProps) {
  const [windowStart, setWindowStart] = useState(() =>
    exam.windowStart ? new Date(exam.windowStart).toISOString().slice(0, 16) : nowPlus(5),
  );
  const [windowEnd, setWindowEnd] = useState(() =>
    exam.windowEnd
      ? new Date(exam.windowEnd).toISOString().slice(0, 16)
      : nowPlus(5 + exam.duration + 10),
  );
  const [publishing, setPublishing] = useState(false);

  const startDate = windowStart ? new Date(windowStart) : null;
  const endDate   = windowEnd   ? new Date(windowEnd)   : null;
  const windowMins = startDate && endDate ? Math.round((endDate.getTime() - startDate.getTime()) / 60_000) : 0;
  const isPast   = startDate ? startDate < new Date(Date.now() - 60_000) : false;
  const badOrder = startDate && endDate ? endDate <= startDate : false;
  const isValid  = startDate && endDate && !isPast && !badOrder;

  const validationMsg = isPast ? 'Start time cannot be in the past.'
    : badOrder ? 'End time must be after start time.'
    : '';

  const handlePublish = async () => {
    if (!isValid) return;
    setPublishing(true);
    try {
      const res = await api.post<{ message: string }>(`/examinations/${exam.id}/publish`, {
        windowStart: startDate!.toISOString(),
        windowEnd:   endDate!.toISOString(),
      });
      toast.success(res.message ?? `"${exam.title}" is now live for students!`);
      onPublished(exam.id);
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? 'Could not publish exam');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl border border-gray-100">

        {/* Header */}
        <div className="flex items-center justify-between p-8 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-900">
              <Rocket className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900">Publish to Students</h3>
              <p className="text-xs text-gray-400 font-semibold mt-0.5">Set the delivery window for this exam</p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 space-y-5">
          {/* Exam info strip */}
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-sm">
            <p className="font-black text-gray-900">{exam.title}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {exam.Subject?.name ?? '—'} &bull; {exam.ClassSection?.name ?? '—'} &bull; {exam.duration} mins &bull; {exam.questions?.length ?? 0} questions
            </p>
          </div>

          {/* Start datetime */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">
              Start Time <span className="normal-case font-semibold tracking-normal text-red-400">(when students can begin)</span>
            </label>
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="datetime-local" value={windowStart}
                onChange={(e) => setWindowStart(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-semibold text-gray-900 transition-all" />
            </div>
          </div>

          {/* End datetime */}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">
              End Time <span className="normal-case font-semibold tracking-normal text-red-400">(window closes — no new sessions after this)</span>
            </label>
            <div className="relative">
              <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="datetime-local" value={windowEnd}
                onChange={(e) => setWindowEnd(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-semibold text-gray-900 transition-all" />
            </div>
          </div>

          {/* Live validation / preview */}
          {startDate && endDate && (
            <div className={cn('rounded-2xl p-4 border text-sm space-y-1.5',
              isValid ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200')}>
              {isValid ? (
                <>
                  <p className="font-bold text-green-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" /> Ready to publish
                  </p>
                  <p className="text-green-800 text-xs">
                    Students in <strong>{exam.ClassSection?.name ?? 'your section'}</strong> can start
                    from <strong>{fmtDT(windowStart)}</strong> until <strong>{fmtDT(windowEnd)}</strong>.
                  </p>
                  <p className="text-green-700 text-xs">
                    Total window: <strong>{windowMins} minutes</strong>
                    {windowMins < exam.duration && (
                      <span className="text-amber-700 ml-2">
                        ⚠ Shorter than exam duration ({exam.duration} mins) — late starters may run out of time.
                      </span>
                    )}
                  </p>
                </>
              ) : (
                <p className="font-bold text-red-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" /> {validationMsg}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-3.5 bg-gray-100 text-gray-700 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button onClick={handlePublish} disabled={!isValid || publishing}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-blue-900 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-800 transition-colors disabled:opacity-50 shadow-lg shadow-blue-900/20">
            {publishing
              ? <><RefreshCw className="w-4 h-4 animate-spin" /> Publishing…</>
              : <><Rocket className="w-4 h-4" /> Publish Now</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ExamCreation() {
  // Current editing state
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [editingMode, setEditingMode] = useState<'NEW' | 'DRAFT' | 'REJECTED'>('NEW');
  const [activeExamTitle, setActiveExamTitle] = useState('');
  const [activeExamFeedback, setActiveExamFeedback] = useState<string | null>(null);

  const [teachingAssignments, setTeachingAssignments] = useState<TeachingAssignment[]>([]);
  const [teacherExams,   setTeacherExams]   = useState<TeacherExam[]>([]);
  const [approvedExams,  setApprovedExams]  = useState<TeacherExam[]>([]);
  const [rejectedExams,  setRejectedExams]  = useState<TeacherExam[]>([]);
  const [publishedExams, setPublishedExams] = useState<PublishedExam[]>([]);

  const [examData, setExamData] = useState({
    title: '', subjectId: '', classId: '', classSectionId: '',
    duration: 60, instructions: '',
  });
  const [questions, setQuestions] = useState<Question[]>([
    { id: '1', text: '', options: ['', '', '', ''], correctAnswer: 0, marks: 10 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Draft modal
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [draftsList,        setDraftsList]        = useState<any[]>([]);
  const [isLoadingDrafts,  setIsLoadingDrafts]   = useState(false);

  // Expand/collapse for approved & published cards
  const [expandedApproved,  setExpandedApproved]  = useState<Record<string, boolean>>({});
  const [expandedPublished, setExpandedPublished] = useState<Record<string, boolean>>({});

  // Delay inputs per published exam
  const [delayInputs, setDelayInputs] = useState<Record<string, string>>({});
  const [delayingId,  setDelayingId]  = useState<string | null>(null);

  // Publish modal
  const [publishModalExam, setPublishModalExam] = useState<TeacherExam | null>(null);

  // Results & Review modal
  const [resultsModalExamId, setResultsModalExamId] = useState<string | null>(null);

  // Search queries for each section
  const [publishedSearchQuery, setPublishedSearchQuery] = useState('');
  const [approvedSearchQuery, setApprovedSearchQuery] = useState('');
  const [rejectedSearchQuery, setRejectedSearchQuery] = useState('');
  const [historySearchQuery, setHistorySearchQuery] = useState('');
  const [draftSearchQuery, setDraftSearchQuery] = useState('');

  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);

  const filteredPublishedExams = publishedExams.filter((exam) => {
    const q = publishedSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (exam.title || '').toLowerCase().includes(q) ||
      (exam.Subject?.name || '').toLowerCase().includes(q) ||
      (exam.ClassSection?.name || '').toLowerCase().includes(q)
    );
  });

  const filteredApprovedExams = approvedExams.filter((exam) => {
    const q = approvedSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (exam.title || '').toLowerCase().includes(q) ||
      (exam.Subject?.name || '').toLowerCase().includes(q) ||
      (exam.ClassSection?.name || '').toLowerCase().includes(q)
    );
  });

  const filteredRejectedExams = rejectedExams.filter((exam) => {
    const q = rejectedSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (exam.title || '').toLowerCase().includes(q) ||
      (exam.Subject?.name || '').toLowerCase().includes(q) ||
      (exam.ClassSection?.name || '').toLowerCase().includes(q) ||
      (exam.rejectionReason || '').toLowerCase().includes(q)
    );
  });

  const filteredTeacherExams = teacherExams.filter((exam) => {
    const q = historySearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (exam.title || '').toLowerCase().includes(q) ||
      (exam.Subject?.name || '').toLowerCase().includes(q) ||
      (exam.ClassSection?.name || '').toLowerCase().includes(q) ||
      (exam.status || '').toLowerCase().includes(q)
    );
  });

  const filteredDraftsList = draftsList.filter((draft) => {
    const q = draftSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (draft.title || '').toLowerCase().includes(q) ||
      (draft.Subject?.name || '').toLowerCase().includes(q) ||
      (draft.ClassSection?.name || '').toLowerCase().includes(q)
    );
  });

  // ── Data loaders ─────────────────────────────────────────────────────────────

  const loadTeacherExams = useCallback(async () => {
    try { setTeacherExams(await api.get<TeacherExam[]>('/examinations/teacher')); } catch { /* silent */ }
  }, []);

  const loadApprovedExams = useCallback(async () => {
    try { setApprovedExams(await api.get<TeacherExam[]>('/examinations/approved-for-teacher')); } catch { /* silent */ }
  }, []);

  const loadRejectedExams = useCallback(async () => {
    try { setRejectedExams(await api.get<TeacherExam[]>('/examinations/rejected-for-teacher')); } catch { /* silent */ }
  }, []);

  const loadPublishedExams = useCallback(async () => {
    try { setPublishedExams(await api.get<PublishedExam[]>('/examinations/published-for-teacher')); } catch { /* silent */ }
  }, []);

  useEffect(() => {
    Promise.allSettled([
      api.get<{ assignments: TeachingAssignment[] }>('/examinations/form-data')
        .then((data) => {
          setTeachingAssignments(data.assignments);
          const first = data.assignments[0];
          if (first) {
            setExamData((p) => ({
              ...p,
              subjectId: p.subjectId || first.subjectId,
              classSectionId: p.classSectionId || first.classSectionId,
            }));
          }
        })
        .catch((err) => toast.error('Failed to load form data: ' + err.message)),
      loadTeacherExams(),
      loadApprovedExams(),
      loadRejectedExams(),
      loadPublishedExams(),
    ]);
  }, [loadTeacherExams, loadApprovedExams, loadRejectedExams, loadPublishedExams]);

  // ── After a publish succeeds: move exam from approved to published ──────────

  const handlePublished = useCallback((examId: string) => {
    setApprovedExams((prev) => prev.filter((e) => e.id !== examId));
    loadPublishedExams();
    loadTeacherExams();
  }, [loadPublishedExams, loadTeacherExams]);

  // ── Question helpers ──────────────────────────────────────────────────────────

  const addQuestion = () =>
    setQuestions((p) => [
      ...p,
      { id: Math.random().toString(36).substring(2, 9), text: '', options: ['', '', '', ''], correctAnswer: 0, marks: 10 },
    ]);

  const removeQuestion = (id: string) => {
    if (questions.length > 1) setQuestions((p) => p.filter((q) => q.id !== id));
  };

  const updateQuestion      = (id: string, text: string)           => setQuestions((p) => p.map((q) => q.id === id ? { ...q, text } : q));
  const updateQuestionMarks = (id: string, marks: number)          => setQuestions((p) => p.map((q) => q.id === id ? { ...q, marks: Math.max(1, marks) } : q));
  const updateOption        = (qId: string, oIdx: number, v: string) =>
    setQuestions((p) => p.map((q) => q.id === qId ? { ...q, options: q.options.map((o, i) => i === oIdx ? v : o) } : q));
  const setCorrectAnswer    = (qId: string, idx: number)           =>
    setQuestions((p) => p.map((q) => q.id === qId ? { ...q, correctAnswer: idx } : q));

  // ── Reset builder to New Exam ────────────────────────────────────────────────

  const handleResetForm = () => {
    setEditingExamId(null);
    setEditingMode('NEW');
    setActiveExamTitle('');
    setActiveExamFeedback(null);
    setExamData({
      title: '',
      subjectId: teachingAssignments[0]?.subjectId || '',
      classId: '',
      classSectionId: teachingAssignments[0]?.classSectionId || '',
      duration: 60,
      instructions: '',
    });
    setQuestions([
      { id: '1', text: '', options: ['', '', '', ''], correctAnswer: 0, marks: 10 },
    ]);
  };

  // ── Draft modal & handlers ───────────────────────────────────────────────────

  const handleOpenDraftsModal = async () => {
    setIsLoadingDrafts(true);
    setIsDraftModalOpen(true);
    try {
      setDraftsList(await api.get<any[]>('/examinations/drafts'));
    } catch {
      toast.error('Could not load saved drafts.');
    } finally {
      setIsLoadingDrafts(false);
    }
  };

  const handleSelectDraft = (draft: any) => {
    setEditingExamId(draft.id);
    setEditingMode('DRAFT');
    setActiveExamTitle(draft.title || 'Untitled Exam');
    setActiveExamFeedback(null);

    setExamData({
      title: draft.title || '',
      subjectId: draft.Subject?.id || draft.subjectId || teachingAssignments[0]?.subjectId || '',
      classId: draft.Class?.id || draft.classId || '',
      classSectionId: draft.ClassSection?.id || draft.classSectionId || teachingAssignments[0]?.classSectionId || '',
      duration: draft.duration || 60,
      instructions: draft.instructions || '',
    });

    if (draft.questions?.length) {
      setQuestions(draft.questions.map((q: any) => ({
        id: q.id || Math.random().toString(36).substring(2, 9),
        text: q.questionText || q.text || '',
        options: q.options?.map((o: any) => o.optionText || '') || ['', '', '', ''],
        correctAnswer: q.options?.findIndex((o: any) => o.isCorrect === true) ?? 0,
        marks: q.marks || 10,
      })));
    } else {
      setQuestions([{ id: '1', text: '', options: ['', '', '', ''], correctAnswer: 0, marks: 10 }]);
    }

    setIsDraftModalOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast.success(`Loaded draft: ${draft.title || 'Untitled Exam'}`);
  };

  const handleDeleteDraft = async (draftId: string) => {
    if (!window.confirm('Are you sure you want to delete this saved draft?')) return;
    try {
      await api.delete(`/examinations/${draftId}`);
      setDraftsList((p) => p.filter((d) => d.id !== draftId));
      if (editingExamId === draftId) {
        handleResetForm();
      }
      loadTeacherExams();
      toast.success('Draft deleted permanently');
    } catch (err: any) {
      toast.error(err.message || 'Could not delete draft');
    }
  };

  // ── Load a rejected exam into builder ────────────────────────────────────────

  const handleSelectRejectedExam = async (exam: TeacherExam) => {
    try {
      let fullExam = exam;
      try {
        fullExam = await api.get<TeacherExam>(`/examinations/details/${exam.id}`);
      } catch {
        fullExam = exam;
      }

      setEditingExamId(fullExam.id);
      setEditingMode('REJECTED');
      setActiveExamTitle(fullExam.title || 'Untitled Exam');
      const feedback = fullExam.rejectionReason || extractRejectionReason(fullExam.instructions);
      setActiveExamFeedback(feedback);

      // Clean instructions if it previously had [REJECTION_REASON] embedded
      const cleanInstructions = fullExam.instructions
        ? fullExam.instructions.replace(/^\[REJECTION_REASON\]:\s*.*(\r?\n)?/s, '').trim()
        : '';

      setExamData({
        title: fullExam.title || '',
        subjectId: fullExam.Subject?.id || (fullExam as any).subjectId || teachingAssignments[0]?.subjectId || '',
        classId: (fullExam as any).classId || '',
        classSectionId: fullExam.ClassSection?.id || (fullExam as any).classSectionId || teachingAssignments[0]?.classSectionId || '',
        duration: fullExam.duration || 60,
        instructions: cleanInstructions,
      });

      if (fullExam.questions?.length) {
        setQuestions(fullExam.questions.map((q: any) => ({
          id: q.id || Math.random().toString(36).substring(2, 9),
          text: q.questionText || q.text || '',
          options: q.options?.map((o: any) => o.optionText || '') || ['', '', '', ''],
          correctAnswer: q.options?.findIndex((o: any) => o.isCorrect === true) ?? 0,
          marks: q.marks || 10,
        })));
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast.info(`Loaded "${fullExam.title}" for revision. Review admin feedback and click "Resubmit to Admin".`);
    } catch (err: any) {
      toast.error('Failed to load rejected exam: ' + err.message);
    }
  };

  // ── Save Draft (either update existing or save as new copy) ───────────────────

  const handleSaveDraft = async (saveAsNew = false) => {
    if (!examData.title.trim()) {
      toast.error('Please enter an exam title before saving draft');
      return;
    }
    setIsSubmitting(true);
    const payload = {
      title: examData.title.trim(),
      subjectId: examData.subjectId || teachingAssignments[0]?.subjectId,
      classId: examData.classId,
      classSectionId: examData.classSectionId || teachingAssignments[0]?.classSectionId,
      duration: Number(examData.duration) || 60,
      instructions: examData.instructions || null,
      status: editingMode === 'REJECTED' && !saveAsNew ? 'REJECTED' : 'DRAFT',
      questions: questions.map((q) => ({
        questionText: q.text,
        marks: Number(q.marks) || 10,
        options: q.options.map((optText, optIdx) => ({
          optionText: optText,
          isCorrect: q.correctAnswer === optIdx,
        })),
      })),
    };

    try {
      if (editingExamId && !saveAsNew) {
        await api.patch(`/examinations/${editingExamId}`, payload);
        toast.success(editingMode === 'REJECTED' ? 'Corrections saved' : 'Draft updated successfully');
      } else {
        const res = await api.post<any>('/examinations', payload);
        if (res?.id) {
          setEditingExamId(res.id);
          setEditingMode('DRAFT');
          setActiveExamTitle(res.title || examData.title);
          setActiveExamFeedback(null);
        }
        toast.success(saveAsNew ? 'Saved as brand-new draft copy' : 'Exam saved as draft in database');
      }
      await Promise.allSettled([
        loadTeacherExams(),
        loadRejectedExams(),
      ]);
    } catch (err: any) {
      toast.error(`Failed to save draft: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Send to Exam Review (New or Draft exams) ──────────────────────────────────

  const handleSendForReview = async () => {
    if (!examData.title || !examData.subjectId || !examData.classSectionId) {
      toast.error('Please fill in the title, subject, and assigned section');
      return;
    }
    if (questions.some((q) => !q.text || q.options.some((o) => !o.trim()))) {
      toast.error('Please fill in all questions and options before submitting for review');
      return;
    }

    setIsSubmitting(true);
    const payload = {
      title: examData.title.trim(),
      subjectId: examData.subjectId,
      classId: examData.classId,
      classSectionId: examData.classSectionId,
      duration: Number(examData.duration) || 60,
      instructions: examData.instructions || null,
      status: 'PENDING',
      questions: questions.map((q) => ({
        questionText: q.text,
        marks: Number(q.marks) || 10,
        options: q.options.map((optText, optIdx) => ({
          optionText: optText,
          isCorrect: q.correctAnswer === optIdx,
        })),
      })),
    };

    try {
      if (editingExamId) {
        await api.patch(`/examinations/${editingExamId}`, payload);
      } else {
        await api.post('/examinations', payload);
      }
      toast.success('Exam submitted for review — the admin will be notified');
      handleResetForm();
      await Promise.allSettled([
        loadTeacherExams(),
        loadApprovedExams(),
        loadRejectedExams(),
      ]);
    } catch (err: any) {
      toast.error(`Failed to submit examination: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Resubmit Rejected Exam to Admin ──────────────────────────────────────────

  const handleResubmitExam = async () => {
    if (!editingExamId) return;
    if (!examData.title || !examData.subjectId || !examData.classSectionId) {
      toast.error('Please fill in the title, subject, and assigned section');
      return;
    }
    if (questions.some((q) => !q.text || q.options.some((o) => !o.trim()))) {
      toast.error('Please fill in all questions and options before resubmitting');
      return;
    }

    setIsSubmitting(true);
    const payload = {
      title: examData.title.trim(),
      subjectId: examData.subjectId,
      classId: examData.classId,
      classSectionId: examData.classSectionId,
      duration: Number(examData.duration) || 60,
      instructions: examData.instructions || null,
      status: 'REJECTED',
      questions: questions.map((q) => ({
        questionText: q.text,
        marks: Number(q.marks) || 10,
        options: q.options.map((optText, optIdx) => ({
          optionText: optText,
          isCorrect: q.correctAnswer === optIdx,
        })),
      })),
    };

    try {
      // 1. Save all updated questions and instructions to the database
      await api.patch(`/examinations/${editingExamId}`, payload);
      // 2. Resubmit to Admin (moves status to PENDING, sets isResubmitted: true, records audit trail)
      await api.post(`/examinations/${editingExamId}/resubmit`);

      toast.success('Exam resubmitted to Admin for review!');
      handleResetForm();
      await Promise.allSettled([
        loadTeacherExams(),
        loadRejectedExams(),
        loadApprovedExams(),
      ]);
    } catch (err: any) {
      toast.error(`Resubmission failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Delay a published exam ────────────────────────────────────────────────────

  const handleDelay = async (examId: string) => {
    const mins = Number(delayInputs[examId] ?? '');
    if (!mins || mins < 1 || mins > 120) { toast.error('Enter a delay between 1 and 120 minutes'); return; }
    setDelayingId(examId);
    try {
      await api.post(`/examinations/${examId}/delay`, { minutes: mins });
      toast.success(`Exam delayed by ${mins} minutes — student dashboards will update automatically`);
      setDelayInputs((p) => ({ ...p, [examId]: '' }));
      loadPublishedExams();
    } catch (err: any) { toast.error(err?.message || 'Delay failed'); }
    finally { setDelayingId(null); }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20">

      {/* ── Page header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-black text-gray-900">
              {editingMode === 'REJECTED'
                ? 'Fix & Resubmit Exam'
                : editingMode === 'DRAFT'
                ? 'Edit Saved Draft'
                : 'Create New Examination'}
            </h2>
            {editingMode === 'REJECTED' && (
              <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-black uppercase tracking-wider">
                Revision Mode
              </span>
            )}
            {editingMode === 'DRAFT' && (
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-black uppercase tracking-wider">
                Draft Mode
              </span>
            )}
          </div>
          <p className="text-gray-500 mt-1">
            {editingMode === 'REJECTED'
              ? 'Address administrator notes, update your exam questions, and send back for approval.'
              : 'Design your exam questions with automated grading and scheduled release windows.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {editingMode !== 'NEW' && (
            <button
              type="button"
              onClick={handleResetForm}
              className="flex items-center gap-2 px-4 py-3 bg-gray-100 rounded-2xl text-sm font-black text-gray-700 uppercase tracking-widest hover:bg-gray-200 transition-colors shadow-sm"
              title="Clear current form and create a brand new exam"
            >
              <RotateCcw className="w-4 h-4" /> Start New Exam
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenDraftsModal}
            className="flex items-center gap-2 px-5 py-3 bg-gray-100 rounded-2xl text-sm font-black text-gray-700 uppercase tracking-widest hover:bg-gray-200 transition-colors shadow-sm"
          >
            <FolderOpen className="w-4 h-4" /> View Saved Drafts
          </button>

          {editingMode === 'REJECTED' ? (
            <>
              <button
                disabled={isSubmitting}
                type="button"
                onClick={() => handleSaveDraft(false)}
                className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-black text-gray-700 uppercase tracking-widest hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> Save Corrections
              </button>
              <button
                disabled={isSubmitting}
                type="button"
                onClick={handleResubmitExam}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? 'Resubmitting…' : 'Resubmit to Admin'}
              </button>
            </>
          ) : (
            <>
              <button
                disabled={isSubmitting}
                type="button"
                onClick={() => handleSaveDraft(false)}
                className="flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-black text-gray-700 uppercase tracking-widest hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {editingMode === 'DRAFT' ? 'Update Draft' : 'Save Draft'}
              </button>

              {editingMode === 'DRAFT' && (
                <button
                  disabled={isSubmitting}
                  type="button"
                  onClick={() => handleSaveDraft(true)}
                  className="flex items-center gap-2 px-5 py-3 bg-blue-50 border border-blue-200 rounded-2xl text-sm font-black text-blue-900 uppercase tracking-widest hover:bg-blue-100 transition-colors shadow-sm disabled:opacity-50"
                  title="Create a new draft copy rather than updating the existing one"
                >
                  <Plus className="w-4 h-4" /> Save as New Draft
                </button>
              )}

              <button
                disabled={isSubmitting}
                type="button"
                onClick={handleSendForReview}
                className="flex items-center gap-2 px-6 py-3 bg-blue-900 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-800 transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? 'Sending…' : 'Send to Exam Review'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Active Banner (Draft or Rejected mode indicator) ── */}
      {editingMode === 'REJECTED' && (
        <div className="bg-gradient-to-r from-red-500/10 via-amber-500/10 to-orange-500/10 border-2 border-red-300 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-red-100 text-red-700 rounded-2xl flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-widest bg-red-600 text-white px-2.5 py-0.5 rounded-full">
                    Action Required: Rejected Exam
                  </span>
                  <h4 className="font-black text-gray-900 text-base">Editing: {activeExamTitle}</h4>
                </div>
                <div className="mt-2.5 p-3 bg-white/90 rounded-xl border border-red-200 shadow-xs">
                  <p className="text-[11px] font-bold text-red-900 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600" /> Admin Feedback / Reason for Rejection:
                  </p>
                  <p className="text-sm font-semibold text-red-800">{activeExamFeedback || 'No specific feedback was provided.'}</p>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Update your questions, choices, or instructions below to address this note, then click <strong>Resubmit to Admin</strong>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
              <button
                type="button"
                onClick={handleResetForm}
                className="px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleResubmitExam}
                className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-red-700 transition-colors shadow-md shadow-red-600/20 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Resubmit to Admin
              </button>
            </div>
          </div>
        </div>
      )}

      {editingMode === 'DRAFT' && (
        <div className="bg-blue-50/80 border border-blue-200 rounded-3xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-100 text-blue-800 rounded-xl flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest bg-blue-900 text-white px-2 py-0.5 rounded-full">
                  Draft Loaded
                </span>
                <h4 className="font-black text-gray-900 text-sm">Editing Draft: {activeExamTitle}</h4>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Changes saved here will update this draft. Use "Save as New Draft" to duplicate into a separate entry.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleResetForm}
              className="px-3.5 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 transition-colors"
            >
              Start New Exam
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSaveDraft(true)}
              className="px-3.5 py-2 bg-white border border-blue-300 text-blue-900 rounded-xl text-xs font-bold hover:bg-blue-50 transition-colors"
              title="Save current form as a brand new draft without overwriting this one"
            >
              Save as New Draft
            </button>
          </div>
        </div>
      )}

      {/* ── Exam metadata form ── */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-4">
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Exam Title</label>
          <input type="text" placeholder="e.g. Mathematics Mid-Term Exam 2026"
            className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-gray-900 transition-all placeholder:text-gray-300"
            value={examData.title} onChange={(e) => setExamData({ ...examData, title: e.target.value })} />
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Subject</label>
          <select className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-gray-900 appearance-none"
            value={examData.subjectId} onChange={(e) => setExamData({ ...examData, subjectId: e.target.value })}>
            {teachingAssignments.length === 0
              ? <option value="">Loading…</option>
              : [...new Map(teachingAssignments.map((item) => [item.subjectId, item.Subject])).values()]
                  .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Section</label>
          <select className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-gray-900 appearance-none"
            value={examData.classSectionId} onChange={(e) => setExamData({ ...examData, classSectionId: e.target.value })}>
            {teachingAssignments
              .filter((item) => item.subjectId === examData.subjectId)
              .map((item) => (
                <option key={item.classSectionId} value={item.classSectionId}>
                  {formatClassSection(item.ClassSection)}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Duration (Mins)</label>
          <div className="relative">
            <Clock className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input type="number" min={5}
              className="w-full bg-gray-50 border border-gray-100 rounded-2xl pl-14 pr-6 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-gray-900"
              value={examData.duration} onChange={(e) => setExamData({ ...examData, duration: Number(e.target.value) })} />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Total Exam Marks</label>
          <div className="bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 font-black text-gray-700 flex items-center justify-between">
            <span className="text-xl text-blue-900">{totalMarks}</span>
            <span className="text-xs text-gray-400 uppercase tracking-widest">{questions.length} questions</span>
          </div>
        </div>

        {/* Exam instructions field */}
        <div className="lg:col-span-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              Instructions &amp; Exam Guidelines
            </label>
            <span className="text-xs text-gray-400 font-semibold">Visible to students before and during exam</span>
          </div>
          <textarea
            rows={3}
            placeholder="e.g. Read each question carefully. Select the best answer for each question. Calculators are allowed..."
            className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-semibold text-gray-900 transition-all placeholder:text-gray-300 resize-none text-sm"
            value={examData.instructions}
            onChange={(e) => setExamData({ ...examData, instructions: e.target.value })}
          />
        </div>
      </div>

      {/* ── Questions builder ── */}
      <div className="space-y-8">
        <div className="flex items-center justify-between px-4">
          <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
            <HelpCircle className="w-6 h-6 text-blue-600" />
            Exam Questions ({questions.length}) &bull; <span className="text-base text-gray-500 font-bold">{totalMarks} Total Marks</span>
          </h3>
          <button type="button" onClick={addQuestion}
            className="flex items-center gap-2 px-6 py-3 bg-blue-50 text-blue-900 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-100 transition-colors">
            <Plus className="w-4 h-4" /> Add Question
          </button>
        </div>

        {questions.map((question, qIdx) => (
          <div key={question.id} className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-8 md:p-12">
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-900 rounded-2xl flex items-center justify-center text-white font-black">
                    {qIdx + 1}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-gray-700 uppercase tracking-widest">Question {qIdx + 1}</h4>
                    <p className="text-xs text-gray-400">Specify question text, options, correct answer, and individual marks</p>
                  </div>
                </div>
                <button type="button" onClick={() => removeQuestion(question.id)}
                  className="p-3 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <div className="mb-10">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 px-2">Question Text</label>
                <textarea rows={2} placeholder="Enter the question here…"
                  className="w-full bg-gray-50 border border-gray-100 rounded-3xl px-8 py-6 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-lg text-gray-900 resize-none transition-all placeholder:text-gray-200"
                  value={question.text} onChange={(e) => updateQuestion(question.id, e.target.value)} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {question.options.map((option, oIdx) => {
                  const isSelected = question.correctAnswer === oIdx;
                  return (
                    <div key={oIdx} onClick={() => setCorrectAnswer(question.id, oIdx)}
                      className={cn('relative rounded-3xl transition-all border-2 cursor-pointer p-4 pr-14',
                        isSelected ? 'bg-green-50 border-green-300 shadow-sm' : 'bg-gray-50 border-transparent hover:border-blue-100')}>
                      <div className="flex items-center gap-4">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setCorrectAnswer(question.id, oIdx); }}
                          className={cn('w-10 h-10 rounded-xl flex items-center justify-center font-black transition-colors shrink-0',
                            isSelected ? 'bg-green-600 text-white' : 'bg-white text-gray-400 hover:bg-gray-100')}>
                          {String.fromCharCode(65 + oIdx)}
                        </button>
                        <input type="text" placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                          className="bg-transparent border-none outline-none font-bold text-gray-900 w-full placeholder:text-gray-300"
                          value={option} onClick={(e) => e.stopPropagation()}
                          onChange={(e) => updateOption(question.id, oIdx, e.target.value)} />
                      </div>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setCorrectAnswer(question.id, oIdx); }}
                        className={cn('absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all',
                          isSelected ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-400 hover:bg-gray-300')}>
                        <CheckCircle2 className="w-5 h-5" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="px-8 py-4 mt-6 bg-gray-50/80 border border-gray-100 rounded-2xl flex items-center justify-between">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Auto-Grading &bull; Select the correct option above</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Marks for this question:</span>
                  <input type="number" min={1} value={question.marks}
                    onChange={(e) => updateQuestionMarks(question.id, Number(e.target.value))}
                    className="w-16 bg-white border border-gray-200 rounded-lg py-1 px-2 font-black text-blue-900 text-center outline-none focus:border-blue-500" />
                </div>
              </div>
            </div>
          </div>
        ))}

        <button type="button" onClick={addQuestion}
          className="w-full py-12 bg-gray-50 border-4 border-dashed border-gray-200 rounded-[2.5rem] flex flex-col items-center justify-center gap-4 text-gray-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all group">
          <div className="w-16 h-16 bg-white rounded-[2rem] shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
            <Plus className="w-8 h-8" />
          </div>
          <span className="text-sm font-black uppercase tracking-[0.2em]">Add Another Question</span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          ── REJECTED EXAMS — Action Required ──────────────────────────────────
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-br from-red-50 to-orange-50 p-8 rounded-[2rem] border border-red-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-700 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-black text-gray-900">Rejected Exams</h3>
                  {rejectedExams.length > 0 && (
                    <span className="px-2.5 py-0.5 bg-red-600 text-white rounded-full text-xs font-black">
                      {rejectedExams.length} Action Needed
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  Exams returned by administrator for revisions. Review feedback, fix questions, and resubmit.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search rejected exams..."
                value={rejectedSearchQuery}
                onChange={(e) => setRejectedSearchQuery(e.target.value)}
                className="w-full bg-white border border-red-200 rounded-xl pl-9 pr-9 py-2 text-xs font-semibold text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-red-500/20"
              />
              {rejectedSearchQuery && (
                <button
                  onClick={() => setRejectedSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button onClick={loadRejectedExams}
              className="p-2 text-red-700 hover:bg-red-100 rounded-xl transition-colors shrink-0" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {rejectedExams.length === 0 ? (
          <div className="py-8 text-center text-gray-400">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500 opacity-60" />
            <p className="font-semibold text-gray-600">No rejected exams</p>
            <p className="text-xs text-gray-400 mt-0.5">All submitted exams are either approved or in review queue.</p>
          </div>
        ) : filteredRejectedExams.length === 0 ? (
          <div className="py-8 text-center text-gray-500 bg-white/70 rounded-2xl border border-red-100 p-6">
            <Search className="w-8 h-8 text-red-300 mx-auto mb-2" />
            <p className="font-bold text-gray-800">No rejected exams match "{rejectedSearchQuery}"</p>
            <button
              onClick={() => setRejectedSearchQuery('')}
              className="mt-2 inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg"
            >
              <X className="w-3 h-3" /> Clear filter
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRejectedExams.map((exam) => {
              const feedback = exam.rejectionReason || extractRejectionReason(exam.instructions);
              const isCurrentEditing = editingExamId === exam.id;
              return (
                <div key={exam.id} className={cn('bg-white rounded-2xl border-2 overflow-hidden transition-all',
                  isCurrentEditing ? 'border-red-500 ring-4 ring-red-500/10' : 'border-red-200 hover:border-red-300')}>
                  <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-700 shrink-0 mt-0.5">
                        <XCircle className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-black text-gray-900 text-base truncate">{exam.title}</h4>
                          {isCurrentEditing && (
                            <span className="px-2 py-0.5 bg-red-600 text-white text-[10px] font-black uppercase tracking-wider rounded-md">
                              Currently Loaded in Builder
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {exam.Subject?.name} &bull; {exam.ClassSection?.name} &bull; {exam.duration} mins &bull; {exam.questions?.length ?? 0} questions
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      <button
                        type="button"
                        onClick={() => handleSelectRejectedExam(exam)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-red-700 transition-colors shadow-sm shadow-red-600/20"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Fix &amp; Resubmit
                      </button>
                    </div>
                  </div>

                  {/* Admin Feedback Box */}
                  <div className="px-5 py-3.5 bg-red-50/80 border-t border-red-100 flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black text-red-900 uppercase tracking-widest">Admin Rejection Feedback</p>
                        {exam.updatedAt && (
                          <span className="text-[10px] font-semibold text-red-500">
                            Rejected on {new Date(exam.updatedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-red-800 mt-0.5">
                        {feedback || 'No specific rejection comments provided.'}
                      </p>
                    </div>
                  </div>

                  {/* Review History Trail */}
                  {exam.reviewHistory && exam.reviewHistory.length > 0 && (
                    <div className="px-5 py-2.5 bg-gray-50/70 border-t border-gray-100 flex items-center gap-2 text-[11px] text-gray-500">
                      <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span>
                        Audit Timeline: {exam.reviewHistory.map((h, i) => (
                          <span key={h.id}>
                            {i > 0 && ' → '}
                            <strong className="text-gray-700">{h.action}</strong>
                            {h.actionByName ? ` by ${h.actionByName}` : ''} ({new Date(h.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })})
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          ── PUBLISHED EXAMS ──────────────────────────────────────────────────
          Live exams visible to students — with delay control.
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-[2rem] border border-blue-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
              <Globe className="w-6 h-6 text-blue-700" />
              Published Exams
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Exams live for students. Use <strong>Push Back</strong> to delay the window if you need more time.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search published exams..."
                value={publishedSearchQuery}
                onChange={(e) => setPublishedSearchQuery(e.target.value)}
                className="w-full bg-white border border-blue-200 rounded-xl pl-9 pr-9 py-2 text-xs font-semibold text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {publishedSearchQuery && (
                <button
                  onClick={() => setPublishedSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button onClick={loadPublishedExams}
              className="p-2 text-blue-700 hover:bg-blue-100 rounded-xl transition-colors shrink-0" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {publishedExams.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            <Globe className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="font-semibold text-gray-500">No published exams yet</p>
            <p className="text-sm mt-1">Approve an exam, then publish it from the section below.</p>
          </div>
        ) : filteredPublishedExams.length === 0 ? (
          <div className="py-10 text-center text-gray-500 bg-white/70 rounded-2xl border border-blue-100 p-6">
            <Search className="w-8 h-8 text-blue-300 mx-auto mb-2" />
            <p className="font-bold text-gray-800">No published exams match "{publishedSearchQuery}"</p>
            <p className="text-xs text-gray-500 mt-1 mb-3">Try refining your search term or clear the filter.</p>
            <button
              onClick={() => setPublishedSearchQuery('')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Clear Search
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPublishedExams.map((exam) => {
              const ws = exam.windowStatus;
              const windowBadge =
                ws === 'OPEN'      ? { label: '● Live — students can start now', cls: 'text-green-700 bg-green-50 border-green-200' }
                : ws === 'SCHEDULED' ? { label: `Scheduled — opens ${fmtDT(exam.windowStart)}`,   cls: 'text-amber-700 bg-amber-50 border-amber-200' }
                : ws === 'CLOSED'    ? { label: 'Window closed',                                 cls: 'text-gray-500 bg-gray-100 border-gray-200' }
                :                     { label: 'No window set',                                  cls: 'text-gray-400 bg-gray-50 border-gray-100' };

              return (
                <div key={exam.id} className="bg-white rounded-2xl border border-blue-200 overflow-hidden">
                  <div className="p-5 flex items-center justify-between gap-4 cursor-pointer hover:bg-blue-50/40 transition-colors"
                    onClick={() => setExpandedPublished((p) => ({ ...p, [exam.id]: !p[exam.id] }))}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-700 shrink-0">
                        <Globe className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-black text-gray-900 truncate">{exam.title}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {exam.Subject?.name} &bull; {exam.ClassSection?.name} &bull; {exam.duration} mins &bull; {exam.questionCount} questions
                          {exam.delayMinutes > 0 && <span className="ml-2 text-amber-600 font-semibold">+{exam.delayMinutes}m delayed</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      {exam.resultsReleased ? (
                        <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border text-emerald-700 bg-emerald-50 border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Review Released
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border text-gray-500 bg-gray-50 border-gray-200">
                          Review Unreleased
                        </span>
                      )}
                      <span className={cn('px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border', windowBadge.cls)}>
                        {windowBadge.label}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setResultsModalExamId(exam.id);
                        }}
                        className="px-3.5 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center gap-1.5 shadow-sm shadow-blue-900/20"
                      >
                        <Award className="w-3.5 h-3.5" /> Results &amp; Review
                      </button>
                      {expandedPublished[exam.id] ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {expandedPublished[exam.id] && (
                    <div className="px-5 pb-5 border-t border-blue-100 pt-4 space-y-4">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 bg-gray-50 rounded-xl">
                          <p className="font-black text-gray-400 uppercase tracking-widest mb-1">Opens</p>
                          <p className="font-semibold text-gray-700">{fmtDT(exam.windowStart)}</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-xl">
                          <p className="font-black text-gray-400 uppercase tracking-widest mb-1">Closes</p>
                          <p className="font-semibold text-gray-700">{fmtDT(exam.windowEnd)}</p>
                        </div>
                      </div>

                      {ws !== 'CLOSED' && (
                        <div className="flex items-center gap-3">
                          <div className="relative flex-1">
                            <Timer className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input type="number" min={1} max={120} placeholder="Delay by N minutes…"
                              value={delayInputs[exam.id] ?? ''}
                              onChange={(e) => setDelayInputs((p) => ({ ...p, [exam.id]: e.target.value }))}
                              className="w-full pl-10 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20" />
                          </div>
                          <button onClick={() => handleDelay(exam.id)} disabled={delayingId === exam.id}
                            className="px-4 py-2 bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50 transition-colors whitespace-nowrap">
                            {delayingId === exam.id ? 'Applying…' : 'Push Back'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          ── APPROVED EXAMS — ready to publish ────────────────────────────────
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-8 rounded-[2rem] border border-green-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
              <BadgeCheck className="w-6 h-6 text-green-600" />
              Approved — Ready to Publish
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Admin-cleared exams. Set a start &amp; end time to deploy them directly to your students.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search approved exams..."
                value={approvedSearchQuery}
                onChange={(e) => setApprovedSearchQuery(e.target.value)}
                className="w-full bg-white border border-green-200 rounded-xl pl-9 pr-9 py-2 text-xs font-semibold text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-green-500/20"
              />
              {approvedSearchQuery && (
                <button
                  onClick={() => setApprovedSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button onClick={loadApprovedExams}
              className="p-2 text-green-700 hover:bg-green-100 rounded-xl transition-colors shrink-0" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {approvedExams.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            <BadgeCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="font-semibold text-gray-500">No approved exams yet</p>
            <p className="text-sm mt-1">Submit an exam for review — it will appear here once admin approves it.</p>
          </div>
        ) : filteredApprovedExams.length === 0 ? (
          <div className="py-10 text-center text-gray-500 bg-white/70 rounded-2xl border border-green-100 p-6">
            <Search className="w-8 h-8 text-green-300 mx-auto mb-2" />
            <p className="font-bold text-gray-800">No approved exams match "{approvedSearchQuery}"</p>
            <p className="text-xs text-gray-500 mt-1 mb-3">Try refining your search term or clear the filter.</p>
            <button
              onClick={() => setApprovedSearchQuery('')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Clear Search
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredApprovedExams.map((exam) => (
              <div key={exam.id} className="bg-white rounded-2xl border border-green-200 overflow-hidden">
                <div className="p-5 flex items-center justify-between gap-4">
                  {/* Left: info + expand toggle */}
                  <div className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                    onClick={() => setExpandedApproved((p) => ({ ...p, [exam.id]: !p[exam.id] }))}>
                    <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center text-green-700 shrink-0">
                      <BadgeCheck className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-black text-gray-900 truncate">{exam.title}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {exam.Subject?.name} &bull; {exam.ClassSection?.name} &bull;{' '}
                        {exam.duration} mins &bull; {exam.questions?.length ?? 0} questions
                      </p>
                    </div>
                  </div>

                  {/* Right: Publish button + collapse toggle */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setPublishModalExam(exam)}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-800 transition-colors shadow-sm shadow-blue-900/20">
                      <Rocket className="w-3.5 h-3.5" /> Publish to Students
                    </button>
                    <button onClick={() => setExpandedApproved((p) => ({ ...p, [exam.id]: !p[exam.id] }))}>
                      {expandedApproved[exam.id]
                        ? <ChevronUp className="w-4 h-4 text-gray-400" />
                        : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </button>
                  </div>
                </div>

                {expandedApproved[exam.id] && (
                  <div className="px-5 pb-5 border-t border-green-100 pt-4">
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">
                      Questions Preview ({exam.questions?.length ?? 0})
                    </p>
                    {exam.questions?.length ? (
                      <ol className="space-y-2">
                        {exam.questions.map((q, idx) => (
                          <li key={q.id} className="text-sm text-gray-700 bg-gray-50 px-4 py-2 rounded-xl">
                            <span className="font-bold text-blue-900 mr-2">{idx + 1}.</span>
                            {q.text || (q as any).questionText}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No question details available.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          ── EXAMINATION HISTORY LOG ───────────────────────────────────────────
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-xl font-black text-gray-900 flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-blue-600" />
              Your Examination History
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Track status, submission stages, and administrative feedback on all your exams.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search history by title, subject..."
                value={historySearchQuery}
                onChange={(e) => setHistorySearchQuery(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-9 py-2 text-xs font-semibold text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              {historySearchQuery && (
                <button
                  onClick={() => setHistorySearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button onClick={loadTeacherExams}
              className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl transition-colors shrink-0" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {teacherExams.length === 0 ? (
          <p className="text-gray-400 italic">No exams yet. Your created exams will appear here.</p>
        ) : filteredTeacherExams.length === 0 ? (
          <div className="py-10 text-center text-gray-500 bg-gray-50/50 rounded-2xl border border-gray-100 p-6">
            <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="font-bold text-gray-800">No exams match "{historySearchQuery}"</p>
            <p className="text-xs text-gray-500 mt-1 mb-3">Try refining your search term or clear the filter.</p>
            <button
              onClick={() => setHistorySearchQuery('')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Clear Search
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTeacherExams.map((exam) => {
              const cfg = STATUS_CONFIG[exam.status] ?? STATUS_CONFIG.DRAFT;
              const feedback = exam.rejectionReason || extractRejectionReason(exam.instructions);
              return (
                <div key={exam.id} className={cn('rounded-2xl border overflow-hidden transition-all',
                  exam.status === 'REJECTED' ? 'border-red-300 shadow-xs' : 'border-gray-100')}>
                  <div className="p-4 bg-gray-50 flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={cn('p-2 rounded-xl shrink-0', cfg.bg)}>
                        <span className={cfg.text}>{cfg.icon}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-gray-900 truncate">{exam.title}</h4>
                          {exam.isResubmitted && (
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase rounded">
                              Resubmitted
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {exam.Subject?.name}{exam.ClassSection?.name ? ` • ${exam.ClassSection.name}` : ''}
                          {exam.duration ? ` • ${exam.duration} mins` : ''}
                          {exam.questions?.length ? ` • ${exam.questions.length} questions` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn('px-3 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase flex items-center gap-1.5',
                        cfg.bg, cfg.text)}>
                        {cfg.icon} {cfg.label}
                      </span>
                      {exam.status === 'REJECTED' && (
                        <button
                          type="button"
                          onClick={() => handleSelectRejectedExam(exam)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-xs"
                        >
                          <RefreshCw className="w-3 h-3" /> Fix &amp; Resubmit
                        </button>
                      )}
                    </div>
                  </div>
                  {exam.status === 'REJECTED' && feedback && (
                    <div className="px-4 py-3 bg-red-50 border-t border-red-100 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-black text-red-700 uppercase tracking-widest mb-0.5">Admin Rejection Feedback</p>
                        <p className="text-sm text-red-800 font-medium">{feedback}</p>
                        <p className="text-xs text-red-500 mt-1">Please update questions and re-submit this exam for review.</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Saved Drafts Modal ── */}
      {isDraftModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-2xl shadow-2xl border border-gray-100 relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-900">
                  <FolderOpen className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-black text-gray-900">Saved Drafts</h3>
                    {draftsList.length > 0 && (
                      <span className="px-2.5 py-0.5 bg-blue-100 text-blue-900 rounded-full text-xs font-black">
                        {draftsList.length} saved
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 font-bold">Permanently stored in database &bull; Select a draft to resume editing</p>
                </div>
              </div>
              <button type="button" onClick={() => setIsDraftModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drafts Search */}
            {draftsList.length > 0 && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter saved drafts by title, subject..."
                  value={draftSearchQuery}
                  onChange={(e) => setDraftSearchQuery(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-9 py-2 text-xs font-semibold text-gray-800 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                {draftSearchQuery && (
                  <button
                    onClick={() => setDraftSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {isLoadingDrafts ? (
              <div className="py-12 text-center text-gray-400 font-bold">Loading drafts from database…</div>
            ) : draftsList.length === 0 ? (
              <div className="py-12 text-center text-gray-400 font-bold">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                No saved drafts found. Click "Save Draft" on any exam to store it here.
              </div>
            ) : filteredDraftsList.length === 0 ? (
              <div className="py-10 text-center text-gray-500">
                <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="font-bold text-gray-800">No drafts match "{draftSearchQuery}"</p>
                <button
                  onClick={() => setDraftSearchQuery('')}
                  className="mt-2 text-xs font-medium text-blue-600 hover:underline"
                >
                  Clear filter
                </button>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-3 pr-2">
                {filteredDraftsList.map((draft) => {
                  const draftMarks = draft.questions?.reduce((sum: number, q: any) => sum + (q.marks || 10), 0) || 0;
                  return (
                    <div key={draft.id} onClick={() => handleSelectDraft(draft)}
                      className="p-5 bg-gray-50 rounded-2xl border border-gray-100 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-black text-gray-900 group-hover:text-blue-900 transition-colors text-base truncate">
                          {draft.title || 'Untitled Examination'}
                        </h4>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                          <span>{draft.Subject?.name || 'General'}</span>
                          {draft.ClassSection?.name && <span>&bull; {draft.ClassSection.name}</span>}
                          <span>&bull; {draft.questions?.length ?? 0} questions ({draftMarks} marks)</span>
                          <span>&bull; {draft.duration} mins</span>
                        </div>
                        <p className="text-[11px] text-gray-400 font-medium mt-1">
                          Saved: {new Date(draft.updatedAt).toLocaleDateString()} at{' '}
                          {new Date(draft.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <span className="text-xs font-black bg-white group-hover:bg-blue-900 group-hover:text-white text-gray-700 px-4 py-2 rounded-xl transition-all shadow-sm border border-gray-100">
                          Load Draft
                        </span>
                        <button type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteDraft(draft.id); }}
                          className="text-xs font-bold text-red-600 px-3 py-2 hover:bg-red-50 rounded-xl transition-colors">
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Publish Modal ── */}
      {publishModalExam && (
        <PublishModal
          exam={publishModalExam}
          onClose={() => setPublishModalExam(null)}
          onPublished={handlePublished}
        />
      )}

      {/* ── Results & Review Release Modal ── */}
      {resultsModalExamId && (
        <TeacherExamResultsModal
          examId={resultsModalExamId}
          onClose={() => setResultsModalExamId(null)}
          onExamUpdated={loadPublishedExams}
        />
      )}

      <Toaster position="top-right" />
    </div>
  );
}
