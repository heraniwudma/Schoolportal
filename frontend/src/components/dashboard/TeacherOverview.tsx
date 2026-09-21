import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Users, 
  BookOpen, 
  ClipboardList, 
  FileCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  Calendar,
  User,
  ArrowRight,
  GraduationCap,
  LayoutList,
  FileText,
  Award,
  Plus,
  Edit3,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import StatCard from './StatCard';
import { cn } from '../../lib/utils';
import { api } from '../../lib/api';
import ReviewSubmissionModal, { SubmissionReviewData } from './ReviewSubmissionModal';
import EditAttendanceModal, { AttendanceRecordItem } from './EditAttendanceModal';
import StartAttendanceSessionModal, { AssignedSectionOption } from './StartAttendanceSessionModal';
import EditAssignmentModal, { AssignmentItem } from './EditAssignmentModal';
import AssignmentSubmissionsModal from './AssignmentSubmissionsModal';
import { useHomeroomContext } from '../../hooks/useHomeroom';

interface TeacherDashboardData {
  assignedSubjectsCount: number;
  activeStudentsCount: number;
  assignmentsPublishedCount: number;
  publishedResultsCount: number;
  pendingExamsCount: number;
  attendance: {
    recordsReviewed: number;
    presentCount: number;
    absentCount: number;
    records?: AttendanceRecordItem[];
    assignedSections?: AssignedSectionOption[];
  };
  recentActions: Array<{ id: string; type: string; text: string; at: string }>;
  submittedAssignments?: SubmissionReviewData[];
}

const TeacherOverview = () => {
  const queryClient = useQueryClient();
  const [selectedSubmission, setSelectedSubmission] = useState<SubmissionReviewData | null>(null);
  const [submissionModalMode, setSubmissionModalMode] = useState<'view' | 'edit'>('view');
  const [editingRecord, setEditingRecord] = useState<AttendanceRecordItem | null>(null);
  const [isStartSessionOpen, setIsStartSessionOpen] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<AssignmentItem | null>(null);
  const [viewingAssignmentSubmissions, setViewingAssignmentSubmissions] = useState<AssignmentItem | null>(null);

  const { data: teacherAssignmentsList = [] } = useQuery<any[]>({
    queryKey: ['assignments', 'teacher'],
    queryFn: () => api.get<any[]>('/assignments/teacher'),
    staleTime: 2 * 60 * 1000,
  });

  const { data: teachingAssignments = [] } = useQuery<any[]>({
    queryKey: ['teachers', 'assignments'],
    queryFn: () => api.get<any[]>('/teachers/assignments'),
    staleTime: 5 * 60 * 1000,
  });

  const showSuccessFeedback = (msg: string) => {
    setActionSuccessMessage(msg);
    setTimeout(() => setActionSuccessMessage(null), 4000);
  };

  const handleAttendanceUpdated = () => {
    queryClient.invalidateQueries({ queryKey: ['teachers', 'dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['attendance'] });
    showSuccessFeedback('Attendance record updated successfully.');
  };

  const handleSessionSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['teachers', 'dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['attendance'] });
    showSuccessFeedback('Attendance session recorded successfully.');
  };

  const { data: dashboard, isLoading } = useQuery<TeacherDashboardData>({
    queryKey: ['teachers', 'dashboard'],
    queryFn: () => api.get<TeacherDashboardData>('/teachers/dashboard'),
    staleTime: 2 * 60 * 1000,
  });

  // Homeroom context — shared React Query cache (also used by the Sidebar).
  // Only fires when the user is a teacher; returns isHomeroomTeacher=false
  // when they have no homeroom assignment.
  const { data: homeroomContext } = useHomeroomContext();
  const isHomeroom = !!homeroomContext?.isHomeroomTeacher;
  const homeroomSection = homeroomContext?.assignedSection;

  const submissions = dashboard?.submittedAssignments || [];

  const HOMEROOM_LINKS = [
    { label: 'Subject Results Matrix', href: '/homeroom/submissions', icon: LayoutList, desc: 'Track per-subject submission progress' },
    { label: 'Class Roster & Ranks',   href: '/homeroom/roster',      icon: Users,       desc: 'Consolidated roster with term marks' },
    { label: 'Report Cards',           href: '/homeroom/report-cards',icon: Award,       desc: 'Print and prepare student report cards' },
    { label: 'Prepare Report Cards',   href: '/homeroom/reports',     icon: FileText,    desc: 'Set conduct grades and remarks' },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="My Subjects" 
          value={isLoading ? '…' : (dashboard?.assignedSubjectsCount ?? 0)} 
          icon={BookOpen} 
          iconClassName="bg-blue-50 text-blue-600"
        />
        <StatCard 
          title="Active Students" 
          value={isLoading ? '…' : (dashboard?.activeStudentsCount ?? 0)} 
          icon={Users} 
          iconClassName="bg-indigo-50 text-indigo-600"
        />
        <StatCard 
          title="Submitted Assignments"
          value={isLoading ? '…' : submissions.length}
          icon={ClipboardList} 
          iconClassName="bg-amber-50 text-amber-600"
        />
        <StatCard 
          title="Pending Exam Reviews" 
          value={isLoading ? '…' : (dashboard?.pendingExamsCount ?? 0)} 
          icon={FileCheck} 
          iconClassName="bg-purple-50 text-purple-600"
        />
      </div>

      {/* ── Homeroom Quick-Access Panel (visible only to homeroom teachers) ── */}
      {isHomeroom && (
        <div className="bg-gradient-to-r from-indigo-900 to-indigo-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <GraduationCap className="w-5 h-5 text-indigo-200" />
                <span className="text-xs font-black text-indigo-200 uppercase tracking-widest">Homeroom Teacher</span>
              </div>
              <h3 className="text-lg font-bold text-white leading-tight">
                {(homeroomSection?.grade || homeroomSection?.gradeLevel)
                  ? `${homeroomSection.grade || homeroomSection.gradeLevel} — ${homeroomSection.name}`
                  : homeroomSection?.name ?? 'My Homeroom Class'}
              </h3>
              <p className="text-sm text-indigo-300 mt-0.5">
                {(homeroomSection?.studentCount ?? homeroomSection?.enrolledCount) != null
                  ? `${homeroomSection?.studentCount ?? homeroomSection?.enrolledCount} enrolled student${(homeroomSection?.studentCount ?? homeroomSection?.enrolledCount) === 1 ? '' : 's'}`
                  : 'Manage your homeroom section from the links below'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-indigo-700/40">
            {HOMEROOM_LINKS.map(({ label, href, icon: Icon, desc }) => (
              <Link
                key={href}
                to={href}
                className="flex flex-col items-start gap-2 p-5 bg-indigo-800/50 hover:bg-indigo-700/60 transition-colors group"
              >
                <div className="w-9 h-9 rounded-xl bg-indigo-700 group-hover:bg-indigo-600 flex items-center justify-center transition-colors">
                  <Icon className="w-4.5 h-4.5 text-indigo-100" size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white leading-tight">{label}</p>
                  <p className="text-xs text-indigo-300 mt-0.5 leading-snug">{desc}</p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-indigo-400 group-hover:text-indigo-200 mt-auto transition-colors" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid: Attendance & Recent Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Attendance Review
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Real-time student attendance records for your assigned sections
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-blue-900 bg-blue-50 font-bold px-2.5 py-1 rounded-full border border-blue-100">
                {dashboard?.attendance.recordsReviewed ?? 0} records reviewed
              </span>
              <button
                type="button"
                onClick={() => setIsStartSessionOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 px-3.5 py-1.5 rounded-xl transition-all shadow-sm active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" /> Start Session
              </button>
            </div>
          </div>

          {actionSuccessMessage && (
            <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-xl text-xs font-bold text-green-800 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <span>{actionSuccessMessage}</span>
            </div>
          )}

          <div className="p-6 flex-1">
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 animate-pulse space-y-3">
                    <div className="flex justify-between">
                      <div className="h-4 bg-gray-200 rounded w-20" />
                      <div className="h-4 bg-gray-200 rounded-full w-14" />
                    </div>
                    <div className="h-4 bg-gray-200 rounded w-36" />
                    <div className="h-3 bg-gray-200 rounded w-28" />
                  </div>
                ))}
              </div>
            ) : (!dashboard?.attendance.assignedSections || dashboard.attendance.assignedSections.length === 0) ? (
              <div className="p-8 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center mb-3">
                  <Users className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-gray-800">No Assigned Classes Found</h4>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">
                  You are not currently assigned to any homeroom or subject class sections. Once classes are assigned, you can review and take attendance.
                </p>
              </div>
            ) : (!dashboard?.attendance.records || dashboard.attendance.records.length === 0) ? (
              <div className="p-8 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-900 flex items-center justify-center mb-3">
                  <Calendar className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-gray-800">No Attendance Records Recorded Yet</h4>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">
                  No attendance entries found for your assigned sections. Click "Start Session" to take student attendance.
                </p>
                <button
                  type="button"
                  onClick={() => setIsStartSessionOpen(true)}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 px-4 py-2 rounded-xl transition-all shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Start First Attendance Session
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dashboard.attendance.records.map((item) => {
                  const statusConfig = {
                    PRESENT: { label: 'Present', bg: 'bg-green-100 text-green-800 border-green-200' },
                    ABSENT: { label: 'Absent', bg: 'bg-red-100 text-red-800 border-red-200' },
                    LATE: { label: 'Late', bg: 'bg-orange-100 text-orange-800 border-orange-200' },
                    EXCUSED: { label: 'Excused', bg: 'bg-blue-100 text-blue-800 border-blue-200' },
                  }[item.status] || { label: item.status, bg: 'bg-gray-100 text-gray-700 border-gray-200' };

                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-gray-200 hover:shadow-sm transition flex flex-col justify-between gap-3 group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-blue-900 bg-blue-50 px-2 py-1 rounded uppercase tracking-widest border border-blue-100/60 truncate max-w-[170px]">
                          {item.className}
                        </span>
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border",
                          statusConfig.bg
                        )}>
                          {statusConfig.label}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-gray-900 text-sm truncate">{item.studentName}</h4>
                          {item.admissionNo && (
                            <span className="text-[11px] font-mono font-semibold text-gray-400 shrink-0">
                              {item.admissionNo}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(item.date).toLocaleDateString()} &bull; Period {item.period || 1}
                        </p>
                        {item.remarks && (
                          <p className="text-[11px] text-gray-500 italic mt-1 bg-white/70 px-2 py-1 rounded border border-gray-100 truncate">
                            "{item.remarks}"
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-gray-100/80 mt-1">
                        <span className="text-[11px] font-medium text-gray-500">
                          Status: <span className="font-bold text-gray-800">{statusConfig.label}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingRecord(item)}
                          className="text-xs font-bold text-blue-900 hover:text-blue-700 hover:underline flex items-center gap-1 transition-colors"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          
          {/* Quick link to Attendance Management page */}
          <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between text-xs">
            <span className="text-gray-500">
              Showing recent attendance activity
            </span>
            <Link
              to="/attendance"
              className="font-bold text-blue-900 hover:text-blue-950 hover:underline flex items-center gap-1"
            >
              Open Full Attendance Manager <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-purple-600" />
              Recent Actions
            </h3>
          </div>
          <div className="p-6 space-y-6">
            {(dashboard?.recentActions ?? []).map((action) => {
              const Icon = action.type === 'exam' ? FileCheck : ClipboardList;
              const color = action.type === 'exam' ? 'text-purple-600' : 'text-amber-600';
              return (
              <div key={action.id} className="flex gap-4">
                <div className={cn("w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center shrink-0", color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 leading-tight">{action.text}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(action.at).toLocaleString()}</p>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Published Assignments Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 text-lg">
                <BookOpen className="w-5 h-5 text-blue-900" />
                My Published Assignments
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-900 border border-blue-200">
                {teacherAssignmentsList.length} assignment{teacherAssignmentsList.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Manage your published assignments, due dates, instructions, and maximum marks.
            </p>
          </div>
          <Link
            to="/assignments"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-900 hover:text-blue-950 hover:underline shrink-0"
          >
            Create / Publish Assignment <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="p-6">
          {teacherAssignmentsList.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-xs italic">
              No assignments published yet. Click "Create / Publish Assignment" to distribute tasks to your classes.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teacherAssignmentsList.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-gray-200 hover:shadow-sm transition flex flex-col justify-between gap-3 group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-gray-900 text-sm leading-snug">{item.title}</h4>
                      <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-900 border border-blue-100">
                        Max: {item.maxMark ?? 20} pts
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-gray-500 mt-1">
                      {item.subject && <span className="font-semibold text-gray-700">{item.subject}</span>}
                      {(item.ClassSection?.name || item.targetClass) && (
                        <>
                          <span>•</span>
                          <span>{item.ClassSection?.name || item.targetClass}</span>
                        </>
                      )}
                    </div>

                    <p className="text-[11px] text-gray-400 mt-1">
                      Due: {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'No date'} &bull; {item.submissions?.length || 0} submissions
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-100/80 mt-1">
                    <button
                      type="button"
                      onClick={() => setViewingAssignmentSubmissions(item)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-bold transition cursor-pointer"
                      title="View student responses for this assignment"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View Response ({item.submissions?.length || 0})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingAssignment(item)}
                      className="text-xs font-bold text-gray-600 hover:text-blue-900 hover:underline flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Assignment
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Submitted Assignments Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 text-lg">
                <ClipboardList className="w-5 h-5 text-blue-900" />
                Submitted Assignments
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-900 border border-blue-200">
                {submissions.length} submission{submissions.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Review submitted student answers, open attached documents, and assign grades.
            </p>
          </div>
          <Link
            to="/assignments"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-900 hover:text-blue-950 hover:underline shrink-0"
          >
            Manage Assignments <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading submitted assignments…</div>
          ) : submissions.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center mx-auto mb-3">
                <ClipboardList className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-gray-700">No submissions yet</p>
              <p className="text-xs text-gray-400 mt-1">Student submissions for your assignments will appear here once submitted.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {submissions.map((sub) => (
                <div 
                  key={sub.id} 
                  className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50/60 p-3 rounded-xl transition cursor-pointer"
                  onClick={() => setSelectedSubmission(sub)}
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-900 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-gray-900 text-sm">{sub.studentName}</span>
                        <span className="text-xs text-gray-400">({sub.admissionNo})</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-gray-100 text-gray-600">
                          {sub.subject}
                        </span>
                        {sub.targetClass && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-indigo-50 text-indigo-700">
                            {sub.targetClass}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-gray-700 mt-1">
                        Assignment: {sub.assignmentTitle}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Submitted: {new Date(sub.submittedAt).toLocaleString()}
                        {sub.fileName ? ` • File: ${sub.fileName}` : ''}
                        {sub.content ? ' • Written answer provided' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
                    <span className={cn(
                      "text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider",
                      sub.isGraded || sub.grade
                        ? "bg-green-100 text-green-800 border border-green-200"
                        : "bg-blue-50 text-blue-800 border border-blue-200"
                    )}>
                      {sub.isGraded || sub.grade
                        ? `Graded (${sub.grade?.score}/${sub.grade?.maxScore})`
                        : "Needs Review"}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSubmission(sub);
                        setSubmissionModalMode('view');
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 text-xs font-semibold shadow-sm transition cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Response
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSubmission(sub);
                        setSubmissionModalMode('edit');
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-950 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
                    >
                      <Award className="w-3.5 h-3.5" />
                      {sub.isGraded || sub.grade ? 'Edit Grade' : 'Edit Response / Grade'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Review Submission Modal */}
      <ReviewSubmissionModal
        submission={selectedSubmission}
        isOpen={!!selectedSubmission}
        initialMode={submissionModalMode}
        onClose={() => setSelectedSubmission(null)}
        onGraded={(submissionId, score, maxScore, feedback) => {
          setSelectedSubmission((prev) => prev && prev.id === submissionId ? {
            ...prev,
            isGraded: true,
            feedback: feedback ?? prev.feedback,
            grade: { score, maxScore },
          } : prev);
        }}
      />

      {/* Edit Attendance Modal */}
      <EditAttendanceModal
        isOpen={!!editingRecord}
        onClose={() => setEditingRecord(null)}
        record={editingRecord}
        onSuccess={handleAttendanceUpdated}
      />

      {/* Start Attendance Session Modal */}
      <StartAttendanceSessionModal
        isOpen={isStartSessionOpen}
        onClose={() => setIsStartSessionOpen(false)}
        assignedSections={dashboard?.attendance.assignedSections || []}
        onSuccess={handleSessionSaved}
      />

      {/* Edit Assignment Modal */}
      <EditAssignmentModal
        isOpen={!!editingAssignment}
        onClose={() => setEditingAssignment(null)}
        assignment={editingAssignment}
        teachingAssignments={teachingAssignments}
        onSuccess={(updated) => {
          queryClient.invalidateQueries({ queryKey: ['assignments', 'teacher'] });
          queryClient.invalidateQueries({ queryKey: ['teachers', 'dashboard'] });
          showSuccessFeedback(`Assignment "${updated.title}" updated successfully.`);
        }}
      />

      {/* Assignment Student Responses Modal */}
      <AssignmentSubmissionsModal
        assignment={viewingAssignmentSubmissions}
        isOpen={!!viewingAssignmentSubmissions}
        onClose={() => setViewingAssignmentSubmissions(null)}
      />
    </div>
  );
};

export default TeacherOverview;
