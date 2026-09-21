import React, { useState, useEffect } from 'react';
import { X, Edit3, AlertCircle, Check, Award } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface GradeItem {
  id: string;
  name: string;
  fieldKey: 'mid' | 'assignment' | 'quiz' | 'classwork' | 'final';
  maxMark: number;
  itemType: 'ASSIGNMENT' | 'EXAMINATION';
  highestStudentGrade?: number;
}

interface EditGradeItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  gradeItem: GradeItem | null;
  highestGradeInClass?: number;
  highestGradeStudentName?: string;
  onSave: (itemId: string, updatedData: { name: string; maxMark: number }) => Promise<void>;
}

export const EditGradeItemModal: React.FC<EditGradeItemModalProps> = ({
  isOpen,
  onClose,
  gradeItem,
  highestGradeInClass = 0,
  highestGradeStudentName,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [maxMark, setMaxMark] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (gradeItem) {
      setName(gradeItem.name);
      setMaxMark(String(gradeItem.maxMark));
      setError(null);
    }
  }, [gradeItem, isOpen]);

  if (!isOpen || !gradeItem) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Item name is required.');
      return;
    }

    const parsedMax = parseFloat(maxMark);
    if (isNaN(parsedMax) || parsedMax <= 0) {
      setError('Maximum mark must be a valid positive number greater than 0.');
      return;
    }

    // Check if new maximum mark is lower than highest student score
    if (highestGradeInClass > 0 && parsedMax < highestGradeInClass) {
      setError(
        `Maximum mark (${parsedMax}) cannot be lower than the highest recorded student mark (${highestGradeInClass}${
          highestGradeStudentName ? ` - ${highestGradeStudentName}` : ''
        }). Lowering maximum marks below existing earned scores is not allowed.`
      );
      return;
    }

    setSaving(true);
    try {
      await onSave(gradeItem.id, { name: trimmedName, maxMark: parsedMax });
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to update grade item';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const fieldKeyLabels: Record<string, string> = {
    mid: 'Midterm Examination',
    assignment: 'Assignment / Project',
    quiz: 'Quiz / Short Test',
    classwork: 'Classwork / Participation',
    final: 'Final Examination',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 w-full max-w-lg overflow-hidden transition-all transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-blue-50/50 via-white to-indigo-50/30 dark:from-gray-800/50 dark:to-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Edit Grade Item</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Update item name and maximum mark for {fieldKeyLabels[gradeItem.fieldKey] || gradeItem.fieldKey}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Metadata pill */}
          <div className="flex items-center justify-between p-3.5 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-100/80 dark:border-blue-900/50">
            <div className="flex items-center gap-2.5">
              <Award className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-xs font-semibold text-blue-900 dark:text-blue-300">
                Component Category:
              </span>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 rounded-lg shadow-sm border border-blue-200/60 dark:border-blue-800">
              {fieldKeyLabels[gradeItem.fieldKey] || gradeItem.fieldKey}
            </span>
          </div>

          {/* Highest Grade Alert if applicable */}
          {highestGradeInClass > 0 && (
            <div className="text-xs p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Current Highest Student Score: </span>
                <strong className="underline">{highestGradeInClass} marks</strong>
                {highestGradeStudentName && <span> ({highestGradeStudentName})</span>}.
                <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                  The maximum mark cannot be reduced below this score to preserve earned student grades.
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="text-xs p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 flex items-start gap-2.5 animate-in shake">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="font-medium leading-relaxed">{error}</div>
            </div>
          )}

          {/* Input: Item Name */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Grade Item Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Assignment 1 - Chapter 1"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
            />
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              This name will be displayed in Grade Entry, Student Response Reviews, and Reports.
            </p>
          </div>

          {/* Input: Maximum Mark */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
              Maximum Mark <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={maxMark}
                onChange={(e) => setMaxMark(e.target.value)}
                placeholder="e.g., 25"
                className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">
                pts
              </span>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Must be a positive number greater than 0. Existing student marks are preserved.
            </p>
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-600/25 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving Changes…
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
