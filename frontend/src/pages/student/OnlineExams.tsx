import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  AlertCircle, Clock, Lock, ArrowRight, RefreshCw,
  CheckCircle2, Timer, BookOpen, BadgeCheck, Hourglass, Eye,
  Search, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { useOutletContext } from 'react-router-dom';
import ExamSession, { LiveExamData } from './ExamSession';
import ExamReviewModal from './ExamReviewModal';

// ─── API types (mirrors backend getStudentAvailableExams response) ─────────────

type WindowStatus = 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'NO_WINDOW';

type SessionStatus =
  | 'ACTIVE'
  | 'INTERRUPTED'
  | 'AWAITING_RESUME'
  | 'COMPLETED'
  | 'TIMED_OUT';

interface AvailableExam {
  id: string;
  title: string;
  duration: number;
  totalMarks: number;
  examDate: string;
  windowStart: string | null;
  windowEnd: string | null;
  delayMinutes: number;
  resultsReleased?: boolean;
  resultsReleasedAt?: string | null;
  windowStatus: WindowStatus;
  subject: { id: string; name: string } | null;
  questionCount: number;
  session: {
    id: string;
    status: SessionStatus;
    timeRemainingSeconds: number;
    startedAt: string;
    completedAt?: string | null;
    score?: number | null;
    totalMarks?: number | null;
    percentage?: number | null;
  } | null;
  serverNow: string;  // ISO — lets us sync the client clock
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a formatted mm:ss or hh:mm:ss countdown string from a future ISO date. */
function formatCountdown(targetIso: string, serverNow: string, clientFetchedAt: number): string {
  const serverOffset = Date.now() - clientFetchedAt;   // rough drift correction
  const targetMs = new Date(targetIso).getTime();
  const serverMs = new Date(serverNow).getTime() + serverOffset;
  const diff = Math.max(0, Math.floor((targetMs - serverMs) / 1000));

  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;

  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmt(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

// ─── Countdown cell component ─────────────────────────────────────────────────

function CountdownCell({
  targetIso,
  serverNow,
  fetchedAt,
  onExpire,
}: {
  targetIso: string;
  serverNow: string;
  fetchedAt: number;
  onExpire: () => void;
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const label = formatCountdown(targetIso, serverNow, fetchedAt);
  const remaining = Math.max(
    0,
    Math.floor(
      (new Date(targetIso).getTime() - (new Date(serverNow).getTime() + (Date.now() - fetchedAt))) / 1000,
    ),
  );

  useEffect(() => {
    if (remaining === 0) onExpire();
  }, [remaining, onExpire]);

  return <span className="font-mono font-black tabular-nums">{label}</span>;
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function OnlineExams({ searchQuery: propSearchQuery = '' }: { searchQuery?: string } = {}) {
  const [exams, setExams] = useState<AvailableExam[]>([]);
  const [localSearch, setLocalSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [startingExamId, setStartingExamId] = useState<string | null>(null);
  const [reviewingExamId, setReviewingExamId] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState(Date.now());

  // Active exam session data — set when student starts/resumes
  const [activeSession, setActiveSession] = useState<{
    exam: AvailableExam;
    liveData: LiveExamData;
  } | null>(null);

  // Poll set for exams in AWAITING_RESUME state
  const pollRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // ── Load exam list ──────────────────────────────────────────────────────────

  const loadExams = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const data = await api.get<AvailableExam[]>('/examinations/student/available');
      setExams(data);
      setFetchedAt(Date.now());
    } catch (err: any) {
      if (!silent) toast.error('Could not load exams: ' + (err.message ?? 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadExams();
    // Refresh every 30 s so delay broadcasts propagate automatically
    const id = setInterval(() => loadExams(true), 30_000);
    return () => clearInterval(id);
  }, [loadExams]);

  // ── Polling for AWAITING_RESUME exams ─────────────────────────────────────

  useEffect(() => {
    const awaitingExams = exams.filter((e) => e.session?.status === 'AWAITING_RESUME');

    // Start polling for newly-awaiting exams
    awaitingExams.forEach((exam) => {
      if (pollRef.current[exam.id]) return; // already polling
      pollRef.current[exam.id] = setInterval(async () => {
        try {
          const res = await api.get<{
            status: string;
            sessionToken?: string;
            timeRemainingSeconds?: number;
            answers?: Record<string, string>;
          }>(`/examinations/${exam.id}/session/resume-status`);

          if (res.status === 'APPROVED' && res.sessionToken) {
            clearInterval(pollRef.current[exam.id]);
            delete pollRef.current[exam.id];
            toast.success('Your teacher approved your resume. Entering exam…');
            // Fetch full questions and launch session
            handleStartOrResume(exam, res.sessionToken, res.timeRemainingSeconds, res.answers);
          }
        } catch {
          // silent
        }
      }, 5_000);
    });

    // Clear polls for exams no longer awaiting
    Object.keys(pollRef.current).forEach((examId) => {
      if (!awaitingExams.find((e) => e.id === examId)) {
        clearInterval(pollRef.current[examId]);
        delete pollRef.current[examId];
      }
    });

    return () => {
      Object.values(pollRef.current).forEach(clearInterval);
    };
  }, [exams]);

  // ── Start / Resume session ─────────────────────────────────────────────────

  const handleStartOrResume = useCallback(
    async (
      exam: AvailableExam,
      existingToken?: string,
      existingTime?: number,
      existingAnswers?: Record<string, string>,
    ) => {
      setStartingExamId(exam.id);
      try {
        let liveData: LiveExamData;

        if (existingToken) {
          // Resume path — we already have token + time from the poll response
          // but still need to call start to get a fresh token + questions
          const res = await api.post<LiveExamData>(`/examinations/${exam.id}/session/start`, {
            deviceFingerprint: navigator.userAgent.slice(0, 64),
          });
          liveData = {
            ...res,
            // If teacher just approved, merge the saved answers so nothing is lost
            answers: existingAnswers ?? res.answers,
            timeRemainingSeconds: existingTime ?? res.timeRemainingSeconds,
          };
        } else {
          liveData = await api.post<LiveExamData>(`/examinations/${exam.id}/session/start`, {
            deviceFingerprint: navigator.userAgent.slice(0, 64),
          });

          // Merge any locally-cached answers so the student never loses progress
          const localKey = `exam_progress_${exam.id}`;
          const cached = localStorage.getItem(localKey);
          if (cached) {
            try {
              const parsed = JSON.parse(cached) as { answers?: Record<string, string>; timeRemaining?: number };
              if (parsed.answers) {
                liveData = {
                  ...liveData,
                  answers: { ...liveData.answers, ...parsed.answers },
                };
              }
            } catch {
              // ignore corrupt cache
            }
          }
        }

        setActiveSession({ exam, liveData });
      } catch (err: any) {
        const msg: string = err?.message ?? 'Could not start the exam';
        toast.error(msg);

        // If the backend says they're awaiting approval, refresh the list so
        // the UI shows the correct state immediately
        if (msg.toLowerCase().includes('awaiting') || msg.toLowerCase().includes('paused')) {
          loadExams(true);
        }
      } finally {
        setStartingExamId(null);
      }
    },
    [loadExams],
  );

  // ── Session complete callback ──────────────────────────────────────────────

  const handleSessionComplete = useCallback(() => {
    setActiveSession(null);
    loadExams(true);
  }, [loadExams]);

  // ── Active session → render ExamSession ───────────────────────────────────

  if (activeSession) {
    return (
      <ExamSession
        exam={activeSession.exam}
        liveData={activeSession.liveData}
        onComplete={handleSessionComplete}
      />
    );
  }

  const outletCtx = useOutletContext<{ searchQuery?: string } | null>();
  const effectiveSearch = (localSearch || propSearchQuery || outletCtx?.searchQuery || '').trim().toLowerCase();
  const filteredExams = exams.filter((exam) => {
    if (!effectiveSearch) return true;
    const titleMatch = exam.title.toLowerCase().includes(effectiveSearch);
    const subjectMatch = exam.subject?.name ? exam.subject.name.toLowerCase().includes(effectiveSearch) : false;
    return titleMatch || subjectMatch;
  });

  return (
    <div className="space-y-6">
      {/* Header & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Online Examinations</h2>
          <p className="text-sm text-gray-500">Your scheduled exams and live session controls.</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by title or subject..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-gray-800 placeholder-gray-400 shadow-sm"
            />
            {localSearch && (
              <button
                onClick={() => setLocalSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-0.5"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => loadExams()}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-blue-50 hover:text-blue-900 transition-all disabled:opacity-50 shadow-sm whitespace-nowrap"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-amber-900 text-sm mb-0.5">Important Examination Notice</h3>
          <p className="text-xs text-amber-800 leading-relaxed">
            Ensure a stable internet connection before starting. Your answers are auto-saved every
            15 seconds. If you disconnect, your session is paused — your teacher will resume it.
            The timer is server-authoritative and cannot be paused by refreshing.
          </p>
        </div>
      </div>

      {/* Exam cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 animate-pulse">
              <div className="h-4 bg-gray-100 rounded w-1/3 mb-4" />
              <div className="h-6 bg-gray-100 rounded w-2/3 mb-3" />
              <div className="h-4 bg-gray-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : exams.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <BookOpen className="w-10 h-10 mx-auto mb-3 text-gray-200" />
          <p className="font-semibold text-gray-500">No published exams yet</p>
          <p className="text-sm text-gray-400 mt-1">
            Exams that your teacher has published and scheduled will appear here with a live countdown timer.
          </p>
        </div>
      ) : filteredExams.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center">
          <Search className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-semibold text-gray-700">No exams match your search</p>
          <p className="text-sm text-gray-400 mt-1">
            No examinations found matching "{localSearch || propSearchQuery}".
          </p>
          <button
            onClick={() => setLocalSearch('')}
            className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredExams.map((exam) => {
            const isStarting = startingExamId === exam.id;
            const session = exam.session;

            return (
              <ExamCard
                key={exam.id}
                exam={exam}
                isStarting={isStarting}
                fetchedAt={fetchedAt}
                onStart={() => handleStartOrResume(exam)}
                onRefresh={() => loadExams(true)}
                onReview={(id) => setReviewingExamId(id)}
              />
            );
          })}
        </div>
      )}

      {reviewingExamId && (
        <ExamReviewModal
          examId={reviewingExamId}
          onClose={() => setReviewingExamId(null)}
        />
      )}
    </div>
  );
}

// ─── Exam Card ─────────────────────────────────────────────────────────────────

function ExamCard({
  exam,
  isStarting,
  fetchedAt,
  onStart,
  onRefresh,
  onReview,
}: {
  exam: AvailableExam;
  isStarting: boolean;
  fetchedAt: number;
  onStart: () => void;
  onRefresh: () => void;
  onReview: (examId: string) => void;
}) {
  const session = exam.session;
  const ws = exam.windowStatus;

  // Has the student completed this exam?
  const isDone = session?.status === 'COMPLETED' || session?.status === 'TIMED_OUT';
  // Is the student mid-exam (active or interrupted but not yet awaiting)?
  const isResumable = session?.status === 'ACTIVE' || session?.status === 'INTERRUPTED';
  // Is the student waiting for teacher approval?
  const isAwaiting = session?.status === 'AWAITING_RESUME';

  // Derive the action the CTA should present
  type CtaKind = 'start' | 'resume' | 'locked' | 'closed' | 'done' | 'awaiting';
  let cta: CtaKind = 'start';

  if (isDone) cta = 'done';
  else if (isAwaiting) cta = 'awaiting';
  else if (isResumable) cta = 'resume';
  else if (ws === 'CLOSED') cta = 'closed';
  else if (ws === 'SCHEDULED') cta = 'locked';
  else cta = 'start'; // OPEN or NO_WINDOW

  const delayBanner = exam.delayMinutes > 0;

  return (
    <div
      className={`bg-white rounded-2xl border overflow-hidden transition-all ${
        cta === 'done' ? 'border-green-200' :
        cta === 'awaiting' ? 'border-amber-300 ring-2 ring-amber-100' :
        cta === 'resume' ? 'border-blue-300 ring-2 ring-blue-100' :
        'border-gray-100 hover:border-blue-200'
      }`}
    >
      <div className="p-6">
        {/* Top row: subject badge + delay notice */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full uppercase tracking-widest">
            {exam.subject?.name ?? 'Exam'}
          </span>
          {delayBanner && (
            <span className="text-[10px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
              <Timer className="w-3 h-3" /> +{exam.delayMinutes}m delayed
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="text-lg font-bold text-gray-900 mb-1 leading-tight">{exam.title}</h3>

        {/* Meta row */}
        <div className="flex items-center gap-4 mb-5 text-xs text-gray-400 font-semibold">
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {exam.duration} mins</span>
          <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" /> {exam.questionCount} questions</span>
          <span>{exam.totalMarks} marks</span>
        </div>

        {/* Window info */}
        {exam.windowStart && (
          <div className="mb-5 p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-600">
            {ws === 'SCHEDULED' && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-amber-700 font-semibold">
                  <Lock className="w-3.5 h-3.5" /> Opens in:
                </span>
                <span className="text-amber-800 font-black">
                  <CountdownCell
                    targetIso={exam.windowStart}
                    serverNow={exam.serverNow}
                    fetchedAt={fetchedAt}
                    onExpire={onRefresh}
                  />
                </span>
              </div>
            )}
            {ws === 'OPEN' && exam.windowEnd && (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-green-700 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Closes in:
                </span>
                <span className="text-green-800 font-black">
                  <CountdownCell
                    targetIso={exam.windowEnd}
                    serverNow={exam.serverNow}
                    fetchedAt={fetchedAt}
                    onExpire={onRefresh}
                  />
                </span>
              </div>
            )}
            {ws === 'CLOSED' && (
              <span className="text-gray-500">Exam window has closed.</span>
            )}
          </div>
        )}

        {/* Resume-in-progress banner */}
        {isResumable && session && (
          <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-200 text-xs text-blue-800 flex items-center justify-between">
            <span className="font-semibold flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5" /> In progress —
            </span>
            <span className="font-black">{fmt(session.timeRemainingSeconds)} remaining</span>
          </div>
        )}

        {/* Awaiting teacher banner */}
        {isAwaiting && (
          <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs flex items-start gap-2">
            <Hourglass className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 animate-bounce" />
            <div className="text-amber-800">
              <p className="font-bold">Session paused — waiting for teacher approval</p>
              <p className="mt-0.5 text-amber-700">
                Your teacher will review your request and restore your session. This page checks
                automatically every 5 seconds.
              </p>
            </div>
          </div>
        )}

        {/* CTA button */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div />
          {cta === 'done' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 text-green-700 rounded-xl text-xs font-bold">
                <BadgeCheck className="w-3.5 h-3.5" /> Completed
                {session?.score !== null && session?.score !== undefined && (
                  <span className="ml-1 font-black">({session.score} / {exam.totalMarks} marks)</span>
                )}
              </span>

              {exam.resultsReleased ? (
                <button
                  type="button"
                  onClick={() => onReview(exam.id)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-sm shadow-blue-900/20"
                >
                  <Eye className="w-3.5 h-3.5" /> Review Exam &amp; Answers
                </button>
              ) : (
                <span className="text-[11px] font-semibold text-gray-400 bg-gray-50 border border-gray-100 px-2.5 py-1.5 rounded-xl">
                  Answer key pending release
                </span>
              )}
            </div>
          )}
          {cta === 'awaiting' && (
            <span className="flex items-center gap-2 px-5 py-2 bg-amber-100 text-amber-700 rounded-xl text-sm font-bold">
              <Hourglass className="w-4 h-4 animate-bounce" /> Awaiting Approval
            </span>
          )}
          {cta === 'closed' && (
            <span className="flex items-center gap-2 px-5 py-2 bg-gray-100 text-gray-500 rounded-xl text-sm font-bold">
              <Lock className="w-4 h-4" /> Window Closed
            </span>
          )}
          {cta === 'locked' && (
            <span className="flex items-center gap-2 px-5 py-2 bg-gray-100 text-gray-400 rounded-xl text-sm font-bold cursor-not-allowed">
              <Lock className="w-4 h-4" /> Not Open Yet
            </span>
          )}
          {cta === 'resume' && (
            <button
              onClick={onStart}
              disabled={isStarting}
              className="flex items-center gap-2 px-6 py-2 bg-blue-900 text-white text-sm font-bold rounded-xl hover:bg-blue-800 transition-colors disabled:opacity-60"
            >
              {isStarting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>Resume Exam <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          )}
          {cta === 'start' && (
            <button
              onClick={onStart}
              disabled={isStarting}
              className="flex items-center gap-2 px-6 py-2 bg-blue-900 text-white text-sm font-bold rounded-xl hover:bg-blue-800 transition-colors disabled:opacity-60"
            >
              {isStarting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>Start Exam <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
