import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FiEdit3, FiX, FiCalendar, FiBookOpen, FiAward, FiAlertCircle, FiCheck, FiFileText } from 'react-icons/fi';
import { api } from '../../lib/api';

export interface AssignmentItem {
  id: string;
  title: string;
  instructions?: string | null;
  description?: string | null;
  cleanInstructions?: string;
  subject?: string | null;
  targetClass?: string | null;
  classSectionId?: string | null;
  subjectId?: string | null;
  dueDate?: string | Date;
  maxMark?: number;
  attachmentUrl?: string | null;
  submissions?: any[];
}

export interface TeachingAssignmentOption {
  subjectId: string;
  classSectionId: string;
  Subject: { id: string; name: string; code?: string };
  ClassSection: { id: string; name: string };
}

interface EditAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: AssignmentItem | null;
  teachingAssignments?: TeachingAssignmentOption[];
  onSuccess?: (updatedAssignment: any) => void;
}

export default function EditAssignmentModal({
  isOpen,
  onClose,
  assignment,
  teachingAssignments = [],
  onSuccess,
}: EditAssignmentModalProps) {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [maxMark, setMaxMark] = useState<string>('20');
  const [dueDate, setDueDate] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [classSectionId, setClassSectionId] = useState('');

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize form fields when assignment or modal state changes
  useEffect(() => {
    if (assignment && isOpen) {
      setTitle(assignment.title || '');
      
      // Clean instructions of metadata
      const cleanDesc = assignment.cleanInstructions || 
        (assignment.instructions || assignment.description || '')
          .replace(/\s*MAX_MARK:[0-9]+(\.[0-9]+)?/g, '')
          .trim();
      setDescription(cleanDesc);

      setMaxMark(String(assignment.maxMark ?? 20));

      // Format dueDate to YYYY-MM-DD
      if (assignment.dueDate) {
        const d = new Date(assignment.dueDate);
        if (!isNaN(d.getTime())) {
          const iso = d.toISOString().split('T')[0];
          setDueDate(iso);
        } else {
          setDueDate('');
        }
      } else {
        setDueDate('');
      }

      // Match subject & section from teaching assignments if possible
      let matchedSubjectId = assignment.subjectId || '';
      let matchedSectionId = assignment.classSectionId || '';

      if (!matchedSubjectId && assignment.subject && teachingAssignments.length > 0) {
        const found = teachingAssignments.find(
          (ta) => ta.Subject?.name?.toLowerCase() === assignment.subject?.toLowerCase()
        );
        if (found) matchedSubjectId = found.subjectId;
      }

      if (!matchedSectionId && assignment.targetClass && teachingAssignments.length > 0) {
        const found = teachingAssignments.find(
          (ta) => ta.ClassSection?.name?.toLowerCase() === assignment.targetClass?.toLowerCase()
        );
        if (found) matchedSectionId = found.classSectionId;
      }

      setSubjectId(matchedSubjectId);
      setClassSectionId(matchedSectionId);
      setErrorMessage(null);
    }
  }, [assignment, isOpen, teachingAssignments]);

  if (!isOpen || !assignment) return null;

  // Derive unique subjects available to this teacher
  const uniqueSubjects = [
    ...new Map(teachingAssignments.map((ta) => [ta.Subject?.id, ta.Subject])).values(),
  ].filter(Boolean);

  // Derive available sections for the currently selected subject (or all assigned sections)
  const availableSections = subjectId
    ? teachingAssignments
        .filter((ta) => ta.subjectId === subjectId)
        .map((ta) => ta.ClassSection)
        .filter(Boolean)
    : [
        ...new Map(
          teachingAssignments.map((ta) => [ta.ClassSection?.id, ta.ClassSection])
        ).values(),
      ].filter(Boolean);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Client-side validations
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage('Assignment name/title is required.');
      return;
    }

    const numMax = parseFloat(maxMark);
    if (isNaN(numMax) || numMax <= 0) {
      setErrorMessage('Maximum mark must be a valid positive number greater than zero.');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        title: trimmedTitle,
        instructions: description,
        description: description,
        maxMark: numMax,
      };

      if (dueDate) {
        payload.dueDate = new Date(dueDate).toISOString();
      }

      if (subjectId) {
        payload.subjectId = subjectId;
      }

      if (classSectionId) {
        payload.classSectionId = classSectionId;
      }

      const updated = await api.patch<any>(`/assignments/${assignment.id}`, payload);

      // Invalidate relevant query caches everywhere
      queryClient.invalidateQueries({ queryKey: ['assignments', 'teacher'] });
      queryClient.invalidateQueries({ queryKey: ['teachers', 'dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['results'] });
      queryClient.invalidateQueries({ queryKey: ['students', 'my-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['student-assignment'] });

      if (onSuccess) {
        onSuccess(updated);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to update assignment:', err);
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save assignment changes. Please verify all details.';
      setErrorMessage(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-900 to-indigo-950 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-blue-200 backdrop-blur-md">
              <FiEdit3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Edit Assignment</h2>
              <p className="text-xs text-blue-200 mt-0.5">
                Update assignment details, maximum marks, due date, and instructions
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white hover:bg-white/10 p-2 rounded-xl transition"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-800 text-xs font-semibold animate-in fade-in">
              <FiAlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                {errorMessage}
              </div>
            </div>
          )}

          {/* Assignment Name */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
              Assignment Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Mathematics Assignment 1"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition"
            />
          </div>

          {/* Subject & Target Class Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
                <FiBookOpen className="w-3.5 h-3.5 text-blue-700" />
                Subject
              </label>
              {uniqueSubjects.length > 0 ? (
                <select
                  value={subjectId}
                  onChange={(e) => {
                    const newSubId = e.target.value;
                    setSubjectId(newSubId);
                    // If current classSectionId is not valid for new subject, auto-select first
                    const validSections = teachingAssignments.filter((ta) => ta.subjectId === newSubId);
                    if (validSections.length > 0 && !validSections.some((s) => s.classSectionId === classSectionId)) {
                      setClassSectionId(validSections[0].classSectionId);
                    }
                  }}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition"
                >
                  <option value="">Select Subject</option>
                  {uniqueSubjects.map((sub: any) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name} {sub.code ? `(${sub.code})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  disabled
                  value={assignment.subject || 'Assigned Subject'}
                  className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-500 font-medium cursor-not-allowed"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
                Class / Section
              </label>
              {availableSections.length > 0 ? (
                <select
                  value={classSectionId}
                  onChange={(e) => setClassSectionId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition"
                >
                  <option value="">Select Class / Section</option>
                  {availableSections.map((sec: any) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  disabled
                  value={assignment.targetClass || 'Target Class'}
                  className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-500 font-medium cursor-not-allowed"
                />
              )}
            </div>
          </div>

          {/* Maximum Mark & Due Date Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
                <FiAward className="w-3.5 h-3.5 text-amber-600" />
                Maximum Mark <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                required
                min="0.1"
                step="any"
                value={maxMark}
                onChange={(e) => setMaxMark(e.target.value)}
                placeholder="20"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Must be greater than zero. Cannot be reduced below existing student grades.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
                <FiCalendar className="w-3.5 h-3.5 text-indigo-600" />
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Scheduled deadline for student submissions.
              </p>
            </div>
          </div>

          {/* Description / Instructions */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
              <FiFileText className="w-3.5 h-3.5 text-gray-600" />
              Description / Instructions
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter assignment questions, requirements, or guidelines for students..."
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition resize-y"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-950 text-white text-sm font-bold shadow-md shadow-blue-950/10 transition flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <FiCheck className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
