import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Save,
  Calculator,
  ChevronRight,
  Send,
  AlertTriangle,
  CheckCircle2,
  Lock,
  X,
  Edit3,
  Sliders,
  Layers,
  Award,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Toaster, toast } from 'sonner';
import { api } from '../../lib/api';
import { formatClassSection } from '../../lib/classSection';
import { getEnrolledStudents } from '../../api/roster';
import { EditGradeItemModal, GradeItem } from '../../components/dashboard/EditGradeItemModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeachingAssignment {
  id: string;
  classSectionId: string;
  subjectId: string;
  academicYearId: string;
  ClassSection: { id: string; name: string; GradeLevel?: { name: string } };
  Subject: { id: string; name: string };
}

interface GradeRow {
  id: string; // student.id
  name: string;
  admissionNo?: string;
  mid: number;
  assignment: number;
  quiz: number;
  classwork: number;
  final: number;
}

interface SubjectStatusInfo {
  status: string;
  isSubmitted: boolean;
  isReturnedForCorrection: boolean;
  correctionRequired: boolean;
  correctionReason: string | null;
  returnedAt: string | null;
  returnedBy: string | null;
  rosterReviewStatus: string;
  rosterLocked: boolean;
  isRosterLocked: boolean;
  grades: Array<{
    studentId: string;
    admissionNo: string;
    studentName: string;
    marks: number;
    status: string;
    components?: {
      mid?: number;
      assignment?: number;
      quiz?: number;
      classwork?: number;
      final?: number;
    };
  }>;
}

const defaultGradeItems: GradeItem[] = [
  { id: 'mid', name: 'Midterm Exam', fieldKey: 'mid', maxMark: 20, itemType: 'EXAMINATION' },
  { id: 'assignment', name: 'Assignment 1', fieldKey: 'assignment', maxMark: 20, itemType: 'ASSIGNMENT' },
  { id: 'quiz', name: 'Quiz', fieldKey: 'quiz', maxMark: 10, itemType: 'EXAMINATION' },
  { id: 'classwork', name: 'Classwork', fieldKey: 'classwork', maxMark: 10, itemType: 'ASSIGNMENT' },
  { id: 'final', name: 'Final Exam', fieldKey: 'final', maxMark: 40, itemType: 'EXAMINATION' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** "Quarter 1" → "TERM_1", already-coded strings pass through unchanged */
function toTermCode(quarter: string): string {
  return quarter.startsWith('TERM_') ? quarter : quarter.replace('Quarter ', 'TERM_');
}

const calculateTotal = (grade: GradeRow) =>
  Number(
    (
      (grade.mid || 0) +
      (grade.assignment || 0) +
      (grade.quiz || 0) +
      (grade.classwork || 0) +
      (grade.final || 0)
    ).toFixed(2)
  );

// ─── Component ────────────────────────────────────────────────────────────────

const ResultsGradeEntry = () => {
  const [selectedQuarter, setSelectedQuarter] = useState('Quarter 1');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [gradeItems, setGradeItems] = useState<GradeItem[]>(defaultGradeItems);
  const [editingItem, setEditingItem] = useState<GradeItem | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subjectStatus, setSubjectStatus] = useState<SubjectStatusInfo | null>(null);

  const [teachingAssignments, setTeachingAssignments] = useState<TeachingAssignment[]>([]);

  const selectedAssignment = useMemo(
    () => teachingAssignments.find((a) => a.id === selectedAssignmentId) ?? null,
    [selectedAssignmentId, teachingAssignments],
  );

  const totalMaxMarks = useMemo(() => {
    return gradeItems.reduce((acc, item) => acc + (Number(item.maxMark) || 0), 0) || 100;
  }, [gradeItems]);

  // ── Load teaching assignments on mount ──────────────────────────────────────
  useEffect(() => {
    api
      .get<TeachingAssignment[]>('/teachers/assignments')
      .then((assignments) => {
        setTeachingAssignments(assignments);
        if (assignments[0]) setSelectedAssignmentId(assignments[0].id);
      })
      .catch(() => toast.error('Could not load your active class-subject assignments'));
  }, []);

  // ── Load grade items whenever assignment or quarter changes ────────────────
  useEffect(() => {
    if (!selectedAssignment) {
      setGradeItems(defaultGradeItems);
      return;
    }

    const term = toTermCode(selectedQuarter);
    api
      .get<any>(
        `/results/grade-items?classSectionId=${selectedAssignment.classSectionId}&subjectId=${selectedAssignment.subjectId}&academicYearId=${selectedAssignment.academicYearId}&term=${term}`
      )
      .then((data) => {
        const rawItems = Array.isArray(data) ? data : data?.items;
        if (rawItems && Array.isArray(rawItems) && rawItems.length > 0) {
          const mapped: GradeItem[] = rawItems.map((it: any) => ({
            id: it.id,
            name: it.name,
            fieldKey: it.fieldKey || it.field,
            maxMark: Number(it.maxMark),
            itemType: it.itemType || it.type,
            highestStudentGrade: it.highestGrade ?? it.highestStudentGrade,
          }));
          setGradeItems(mapped);
        } else {
          setGradeItems(defaultGradeItems);
        }
      })
      .catch((err) => {
        console.error('Could not load customized grade items:', err);
        setGradeItems(defaultGradeItems);
      });
  }, [selectedAssignment, selectedQuarter]);

  // ── Load enrolled students and subject status whenever assignment or quarter changes ────
  useEffect(() => {
    if (!selectedAssignment) {
      setGrades([]);
      setSubjectStatus(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const term = toTermCode(selectedQuarter);

    Promise.all([
      getEnrolledStudents(selectedAssignment.academicYearId, selectedAssignment.classSectionId),
      api
        .get<SubjectStatusInfo>(
          `/results/subject-status?classSectionId=${selectedAssignment.classSectionId}&academicYearId=${selectedAssignment.academicYearId}&subjectId=${selectedAssignment.subjectId}&term=${term}`,
        )
        .catch(() => null),
    ])
      .then(([enrolled, statusInfo]) => {
        if (cancelled) return;
        setSubjectStatus(statusInfo);

        if (enrolled.length === 0) {
          setGrades([]);
          toast.info(`No students found enrolled in ${formatClassSection(selectedAssignment.ClassSection)}`);
          return;
        }

        const existingGradesMap = new Map<string, any>(
          (statusInfo?.grades ?? []).map((g) => [g.studentId, g]),
        );

        setGrades(
          enrolled.map((s) => {
            const studentResult = existingGradesMap.get(s.id);
            const comps = studentResult?.components;
            return {
              id: s.id,
              name: s.name || `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || 'Student',
              admissionNo: (s as any).admissionNumber || (s as any).admissionNo || '',
              mid: typeof comps?.mid === 'number' ? comps.mid : 0,
              assignment: typeof comps?.assignment === 'number' ? comps.assignment : 0,
              quiz: typeof comps?.quiz === 'number' ? comps.quiz : 0,
              classwork: typeof comps?.classwork === 'number' ? comps.classwork : 0,
              final:
                typeof comps?.final === 'number'
                  ? comps.final
                  : typeof studentResult?.marks === 'number'
                  ? studentResult.marks
                  : 0,
            };
          }),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to fetch students / status:', err);
        toast.error('Could not load class results information.');
        setGrades([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAssignment, selectedQuarter]);

  // ── Grade change handler ─────────────────────────────────────────────────────
  const handleGradeChange = (
    id: string,
    field: 'mid' | 'assignment' | 'quiz' | 'classwork' | 'final',
    value: string,
  ) => {
    const item = gradeItems.find((gi) => gi.fieldKey === field);
    const max = item ? item.maxMark : field === 'final' ? 40 : field === 'quiz' || field === 'classwork' ? 10 : 20;

    if (value === '') {
      setGrades((prev) => prev.map((g) => (g.id === id ? { ...g, [field]: 0 } : g)));
      return;
    }

    const parsed = parseFloat(value);
    const num = Math.min(Math.max(isNaN(parsed) ? 0 : parsed, 0), max);
    setGrades((prev) => prev.map((g) => (g.id === id ? { ...g, [field]: num } : g)));
  };

  // ── Build the grades payload used by both save and submit ────────────────────
  const buildGradesPayload = (rows: GradeRow[]) =>
    rows.map((g) => ({
      studentId: g.id,
      marks: calculateTotal(g),
      mid: g.mid,
      assignment: g.assignment,
      quiz: g.quiz,
      classwork: g.classwork,
      final: g.final,
    }));

  // ─────────────────────────────────────────────────────────────────────────────
  // "Save Class Results" — writes all rows to SubjectResult as DRAFT & Grade components
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedAssignment) return toast.error('Select one of your active class-subject assignments');
    if (grades.length === 0) return toast.error('No students loaded for this class');

    setSaving(true);
    try {
      const result = await api.post<{ savedCount: number; ignoredStudentIds: string[] }>('/results/draft', {
        classSectionId: selectedAssignment.classSectionId,
        subjectId: selectedAssignment.subjectId,
        academicYearId: selectedAssignment.academicYearId,
        term: toTermCode(selectedQuarter),
        grades: buildGradesPayload(grades),
      });

      const ignored = result.ignoredStudentIds?.length ?? 0;
      if (ignored > 0) {
        toast.success(`Saved ${result.savedCount} results (${ignored} students skipped — no longer enrolled)`);
      } else {
        toast.success(`Saved ${result.savedCount} student results`);
      }
    } catch (err: any) {
      const msg: string = err?.response?.data?.message ?? err?.message ?? 'Save failed';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Per-row "Publish" button — saves that one student then marks them SUBMITTED
  // ─────────────────────────────────────────────────────────────────────────────
  const publishStudent = async (studentId: string) => {
    if (!selectedAssignment) return toast.error('Select one of your active class-subject assignments');
    const term = toTermCode(selectedQuarter);
    try {
      await api.post('/results/draft', {
        classSectionId: selectedAssignment.classSectionId,
        subjectId: selectedAssignment.subjectId,
        academicYearId: selectedAssignment.academicYearId,
        term,
        grades: buildGradesPayload(grades.filter((g) => g.id === studentId)),
      });
      await api.post('/results/publish-student', {
        classSectionId: selectedAssignment.classSectionId,
        subjectId: selectedAssignment.subjectId,
        academicYearId: selectedAssignment.academicYearId,
        term,
        studentId,
      });
      toast.success('Student result published');
    } catch (err: any) {
      const msg: string = err?.response?.data?.message ?? err?.message ?? 'Could not publish result';
      toast.error(msg);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // "Send to Homeroom" — saves all grades inline then submits in one round-trip
  // ─────────────────────────────────────────────────────────────────────────────
  const submitToHomeroom = async () => {
    if (!selectedAssignment) return toast.error('Select one of your active class-subject assignments');
    if (grades.length === 0) return toast.error('No students loaded — cannot submit empty results');

    setSubmitting(true);
    try {
      const result = await api.post<{ success: boolean; count: number }>('/results/submit-to-homeroom', {
        classSectionId: selectedAssignment.classSectionId,
        subjectId: selectedAssignment.subjectId,
        academicYearId: selectedAssignment.academicYearId,
        term: toTermCode(selectedQuarter),
        grades: buildGradesPayload(grades),
      });
      toast.success(`${result.count} student results sent to homeroom teacher`);
      if (subjectStatus) {
        setSubjectStatus({
          ...subjectStatus,
          status: 'SUBMITTED',
          isSubmitted: true,
          isReturnedForCorrection: false,
          correctionRequired: false,
        });
      }
    } catch (err: any) {
      const msg: string = err?.response?.data?.message ?? err?.message ?? 'Could not submit results';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Save Grade Item (Name & Maximum Mark)
  // ─────────────────────────────────────────────────────────────────────────────
  const handleSaveGradeItem = async (
    itemId: string,
    updatedData: { name: string; maxMark: number },
  ) => {
    if (!selectedAssignment) return;

    await api.patch(`/results/grade-items/${itemId}`, {
      name: updatedData.name,
      maxMark: updatedData.maxMark,
      classSectionId: selectedAssignment.classSectionId,
      subjectId: selectedAssignment.subjectId,
      academicYearId: selectedAssignment.academicYearId,
      term: toTermCode(selectedQuarter),
    });

    // Update local state in-place with exact same ID
    setGradeItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, name: updatedData.name, maxMark: updatedData.maxMark }
          : item
      )
    );

    toast.success(`Updated "${updatedData.name}" (Maximum: ${updatedData.maxMark} pts)`);
  };

  // Find the highest student grade for an item's component key
  const getHighestGradeForComponent = (
    fieldKey: 'mid' | 'assignment' | 'quiz' | 'classwork' | 'final',
  ) => {
    let highest = 0;
    let studentName = '';
    grades.forEach((g) => {
      const val = Number(g[fieldKey]) || 0;
      if (val > highest) {
        highest = val;
        studentName = g.name;
      }
    });
    return { highest, studentName };
  };

  const filteredGrades = grades.filter((g) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (g.name || '').toLowerCase().includes(q) ||
      (g.id || '').toLowerCase().includes(q) ||
      (g.admissionNo && g.admissionNo.toLowerCase().includes(q))
    );
  });

  const isEditingLocked =
    Boolean(subjectStatus?.isRosterLocked) ||
    Boolean(subjectStatus?.isSubmitted && !subjectStatus?.correctionRequired);

  const currentHighestScore = editingItem
    ? getHighestGradeForComponent(editingItem.fieldKey)
    : { highest: 0, studentName: '' };

  return (
    <div className="space-y-6">
      {/* ── Status Banners ── */}
      {subjectStatus?.correctionRequired && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/30">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-amber-950">
                  Returned for Correction by Homeroom Teacher
                </h3>
                {subjectStatus.returnedAt && (
                  <span className="text-xs text-amber-800 font-medium">
                    Date returned: {new Date(subjectStatus.returnedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              {subjectStatus.returnedBy && (
                <p className="text-xs text-amber-800 mt-0.5">
                  Returned by: <span className="font-semibold">{subjectStatus.returnedBy}</span>
                </p>
              )}
              <div className="mt-3 p-4 bg-white/90 rounded-xl border border-amber-200">
                <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">Reason:</p>
                <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap font-medium">
                  {subjectStatus.correctionReason || 'Please verify and correct the recorded student marks.'}
                </p>
              </div>
              <p className="text-xs text-amber-900/80 mt-2 font-medium">
                Existing grades are loaded below. You can now edit the marks, save your draft, and click{' '}
                <strong>Send to Homeroom</strong> to submit again.
              </p>
            </div>
          </div>
        </div>
      )}

      {subjectStatus?.isRosterLocked && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-800 text-sm font-semibold flex items-center gap-3">
          <Lock className="w-5 h-5 text-red-600 shrink-0" />
          The class roster has been{' '}
          {subjectStatus.rosterReviewStatus === 'APPROVED'
            ? 'approved by administrator'
            : 'submitted to admin'}{' '}
          and is locked for editing.
        </div>
      )}

      {subjectStatus?.isSubmitted && !subjectStatus?.correctionRequired && !subjectStatus?.isRosterLocked && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-green-800 text-sm font-semibold flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          Grades for this subject and term have been submitted to the homeroom teacher.
        </div>
      )}

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Academic Grade Entry</h2>
          <p className="text-sm text-gray-500">
            Enter student scores for each grading item, edit item names &amp; maximum marks, and send to homeroom.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={handleSave}
            disabled={saving || grades.length === 0 || !selectedAssignment || isEditingLocked}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-900 text-white rounded-xl text-sm font-bold hover:bg-blue-800 transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save Class Results'}
          </button>
          <button
            onClick={submitToHomeroom}
            disabled={
              submitting ||
              saving ||
              grades.length === 0 ||
              !selectedAssignment ||
              (isEditingLocked && !subjectStatus?.correctionRequired)
            }
            className="flex items-center gap-2 px-5 py-2.5 border border-blue-900 text-blue-900 rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-blue-50 transition-colors cursor-pointer"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Sending…' : subjectStatus?.correctionRequired ? 'Submit Again' : 'Send to Homeroom'}
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Quarter</label>
          <select
            value={selectedQuarter}
            onChange={(e) => setSelectedQuarter(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-sm"
          >
            <option>Quarter 1</option>
            <option>Quarter 2</option>
            <option>Quarter 3</option>
            <option>Quarter 4</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">
            Assigned Class &amp; Subject
          </label>
          <select
            value={selectedAssignmentId}
            onChange={(e) => setSelectedAssignmentId(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-sm"
          >
            <option value="">Select an assigned class and subject</option>
            {teachingAssignments.map((a) => (
              <option key={a.id} value={a.id}>
                {formatClassSection(a.ClassSection)} — {a.Subject.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Search</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Name, ID, or Admission No…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 text-sm font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Grade Items & Evaluation Weights Toolbar ── */}
      <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-slate-50 p-5 rounded-2xl border border-blue-100 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-900">Grading Items &amp; Maximum Marks</h4>
              <p className="text-xs text-gray-500">
                Click <strong>Edit</strong> on any item to modify its title or maximum mark directly.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-3 py-1 bg-white text-blue-900 border border-blue-200 rounded-full shadow-sm">
              Total Weight: <span className="text-blue-600">{totalMaxMarks} pts</span>
            </span>
          </div>
        </div>

        {/* Item cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 pt-1">
          {gradeItems.map((item) => (
            <div
              key={item.id || item.fieldKey}
              className="bg-white p-3 rounded-xl border border-gray-200 shadow-xs hover:border-blue-300 transition-all flex flex-col justify-between gap-2"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 tracking-wider">
                  {item.fieldKey}
                </span>
                <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                  {item.maxMark} pts
                </span>
              </div>
              <div className="min-h-[2.5rem]">
                <p className="text-xs font-bold text-gray-900 line-clamp-2" title={item.name}>
                  {item.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingItem(item);
                  setIsEditModalOpen(true);
                }}
                disabled={isEditingLocked}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 text-gray-700 rounded-lg text-xs font-bold border border-gray-200 hover:border-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit Item
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Grade table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100 text-[11px] font-black text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-4 min-w-[200px]">Student</th>
                {gradeItems.map((item) => (
                  <th key={item.fieldKey} className="px-4 py-4 text-center min-w-[130px]">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <div className="flex items-center gap-1.5 group">
                        <span className="font-bold text-gray-800 text-xs truncate max-w-[100px]" title={item.name}>
                          {item.name}
                        </span>
                        {!isEditingLocked && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItem(item);
                              setIsEditModalOpen(true);
                            }}
                            title={`Edit ${item.name}`}
                            className="text-gray-400 hover:text-blue-600 p-0.5 rounded transition-colors"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-md">
                        Max: {item.maxMark}
                      </span>
                    </div>
                  </th>
                ))}
                <th className="px-6 py-4 text-right min-w-[140px]">
                  <div className="flex flex-col items-end">
                    <span>Total Marks</span>
                    <span className="text-[10px] font-bold text-gray-400">Max: {totalMaxMarks}</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={2 + gradeItems.length} className="px-6 py-12 text-center text-gray-500 font-medium">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm">
                        Loading enrolled students
                        {selectedAssignment ? ` for ${formatClassSection(selectedAssignment.ClassSection)}` : ''}…
                      </p>
                    </div>
                  </td>
                </tr>
              ) : filteredGrades.length === 0 ? (
                <tr>
                  <td colSpan={2 + gradeItems.length} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-center">
                      <Search className="w-10 h-10 text-gray-300 mb-3" />
                      <h4 className="text-sm font-semibold text-gray-900 mb-1">
                        {searchQuery ? 'No matching students' : 'No students found'}
                      </h4>
                      <p className="text-xs text-gray-500 mb-4">
                        {searchQuery
                          ? `No student in this class section matches "${searchQuery}".`
                          : selectedAssignment
                          ? 'No students enrolled for this class section.'
                          : 'Select an assigned class and subject above to begin.'}
                      </p>
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          Clear Search
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredGrades.map((grade) => {
                  const studentTotal = calculateTotal(grade);
                  const percentage = totalMaxMarks > 0 ? (studentTotal / totalMaxMarks) * 100 : 0;
                  return (
                    <tr key={grade.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-gray-900">{grade.name}</p>
                        <p className="text-[10px] text-gray-400 font-bold">
                          {grade.admissionNo ? `Adm: ${grade.admissionNo} • ` : ''}ID: {grade.id}
                        </p>
                      </td>
                      {gradeItems.map((item) => {
                        const field = item.fieldKey;
                        return (
                          <td key={field} className="px-4 py-4">
                            <div className="flex justify-center">
                              <input
                                type="number"
                                min={0}
                                max={item.maxMark}
                                step="any"
                                value={grade[field] === 0 ? '' : grade[field]}
                                placeholder="0"
                                disabled={isEditingLocked}
                                onChange={(e) => handleGradeChange(grade.id, field, e.target.value)}
                                className="w-20 text-center bg-gray-50 border border-gray-200 rounded-lg py-2 text-sm font-bold focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                              />
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span
                            className={cn(
                              'inline-flex items-center justify-center min-w-[4rem] px-3 py-1 rounded-full text-xs font-black shadow-xs',
                              percentage >= 90
                                ? 'bg-green-100 text-green-800'
                                : percentage >= 70
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800',
                            )}
                          >
                            {studentTotal} / {totalMaxMarks}
                          </span>
                          <button
                            onClick={() => publishStudent(grade.id)}
                            disabled={isEditingLocked}
                            className="ml-1 text-xs font-bold text-blue-800 hover:underline disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Publish
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer info bar */}
      <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-900 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-blue-900">Dynamic Grade Item Totals &amp; Percentages</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Item weights adapt to your customized maximum marks. Earned student marks are preserved without unwanted scaling.
            </p>
          </div>
        </div>
        <button
          onClick={() => toast.info(`All student totals calculated based on ${totalMaxMarks} maximum points.`)}
          className="flex items-center gap-2 text-xs font-black text-blue-900 uppercase tracking-wider hover:underline cursor-pointer self-start sm:self-auto"
        >
          Recalculate All
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Modal for editing grade item name & max mark */}
      <EditGradeItemModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingItem(null);
        }}
        gradeItem={editingItem}
        highestGradeInClass={currentHighestScore.highest}
        highestGradeStudentName={currentHighestScore.studentName}
        onSave={handleSaveGradeItem}
      />

      <Toaster position="top-right" />
    </div>
  );
};

export default ResultsGradeEntry;
