import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Search,
  Users,
  GraduationCap,
  Check,
  AlertTriangle,
  BookOpen,
  UserCheck,
  UserX,
  RefreshCw,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { ManagedUser, StudentLookupItem, ClassSection, getUserDisplayName } from '../../types/users';
import { useUsers } from '../../hooks/useUsers';

interface LinkChildrenModalProps {
  open: boolean;
  parentUser: ManagedUser | null;
  classSections: ClassSection[];
  onClose: () => void;
  onSuccess?: () => void;
}

export const LinkChildrenModal: React.FC<LinkChildrenModalProps> = ({
  open,
  parentUser,
  classSections,
  onClose,
  onSuccess,
}) => {
  const { getStudentsLookup, linkParentChildren } = useUsers();

  const [students, setStudents] = useState<StudentLookupItem[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [initialLinkedIds, setInitialLinkedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSection, setSelectedSection] = useState<string>('ALL');
  const [showConfirmReassign, setShowConfirmReassign] = useState(false);

  // Target Parent ID (using Parent.id or user.id)
  const parentId = parentUser?.Parent?.id || parentUser?.id;
  const parentName = parentUser ? getUserDisplayName(parentUser) : 'Parent';

  // Load students lookup list when modal opens
  useEffect(() => {
    if (!open || !parentUser || !parentId) return;

    let isMounted = true;
    setIsLoading(true);
    setSearchQuery('');
    setSelectedSection('ALL');

    getStudentsLookup()
      .then((data) => {
        if (!isMounted) return;
        setStudents(data);

        // Identify students currently linked to this parent
        const linkedIds = new Set<string>();
        data.forEach((s) => {
          if (s.parentId === parentId || s.parent?.id === parentId) {
            linkedIds.add(s.id);
          }
        });

        // Also check parentUser.Parent.Student if available
        if (parentUser.Parent?.Student) {
          parentUser.Parent.Student.forEach((s) => linkedIds.add(s.id));
        }

        setSelectedStudentIds(new Set(linkedIds));
        setInitialLinkedIds(new Set(linkedIds));
      })
      .catch((err) => {
        console.error('Failed to load students for linking:', err);
        toast.error('Failed to load student list.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, parentUser, parentId, getStudentsLookup]);

  // Students currently selected as objects
  const selectedStudents = useMemo(() => {
    return students.filter((s) => selectedStudentIds.has(s.id));
  }, [students, selectedStudentIds]);

  // Students that are currently assigned to ANOTHER parent and selected
  const reassignedStudents = useMemo(() => {
    return selectedStudents.filter(
      (s) => s.parentId && s.parentId !== parentId && s.parent && s.parent.id !== parentId,
    );
  }, [selectedStudents, parentId]);

  // Filtered student list for candidate selection
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      // Class section filter
      if (selectedSection !== 'ALL') {
        if (s.classSectionId !== selectedSection && s.classSectionName !== selectedSection) {
          return false;
        }
      }

      // Search query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const matchName = (s.fullName || '').toLowerCase().includes(q);
      const matchAdm = (s.admissionNo || '').toLowerCase().includes(q);
      const matchSection = (s.classSectionName || '').toLowerCase().includes(q);
      const matchGrade = (s.gradeLevelName || '').toLowerCase().includes(q);
      const matchParent = (s.parent?.fullName || '').toLowerCase().includes(q);

      return matchName || matchAdm || matchSection || matchGrade || matchParent;
    });
  }, [students, searchQuery, selectedSection]);

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const removeSelected = (studentId: string) => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      next.delete(studentId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!parentId) {
      toast.error('Parent ID not found.');
      return;
    }

    // Check if there are reassignments that need confirmation
    if (reassignedStudents.length > 0 && !showConfirmReassign) {
      setShowConfirmReassign(true);
      return;
    }

    setIsSaving(true);
    try {
      const studentIdsArray = Array.from(selectedStudentIds);
      await linkParentChildren(parentId, studentIdsArray);

      toast.success(
        `Successfully updated linked children for ${parentName} (${studentIdsArray.length} linked).`,
      );
      setShowConfirmReassign(false);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to save parent-child links:', err);
      toast.error(err?.message || 'Failed to update linked children.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!open || !parentUser) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-blue-900/5 via-indigo-900/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-900 text-white flex items-center justify-center font-black shadow-md shadow-blue-900/20">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-gray-900">Manage Children</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800">
                  Parent
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Link or unlink students for <span className="font-bold text-gray-900">{parentName}</span> ({parentUser.loginId})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selected Children summary bar */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-gray-700 uppercase tracking-wider">
                Selected Children ({selectedStudentIds.size})
              </span>
              {selectedStudentIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedStudentIds(new Set())}
                  className="text-[11px] font-bold text-red-600 hover:underline"
                >
                  Clear All
                </button>
              )}
            </div>
            {reassignedStudents.length > 0 && (
              <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md">
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                {reassignedStudents.length} student(s) will be reassigned from another parent
              </span>
            )}
          </div>

          {selectedStudents.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No students currently selected for this parent.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto py-1">
              {selectedStudents.map((s) => {
                const isOriginallyLinked = initialLinkedIds.has(s.id);
                const isReassigned = s.parentId && s.parentId !== parentId;

                return (
                  <div
                    key={s.id}
                    className={cn(
                      'flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-xl text-xs font-bold transition-all border',
                      isReassigned
                        ? 'bg-amber-50 text-amber-900 border-amber-200'
                        : isOriginallyLinked
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        : 'bg-blue-50 text-blue-900 border-blue-200',
                    )}
                  >
                    <span>{s.fullName}</span>
                    <span className="text-[10px] opacity-60">({s.admissionNo})</span>
                    <button
                      type="button"
                      onClick={() => removeSelected(s.id)}
                      className="p-0.5 hover:bg-black/10 rounded-full transition-colors ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Search & Filter Toolbar */}
        <div className="p-4 px-6 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search students by name, admission number, section..."
              className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full hover:bg-gray-200/50 transition-colors"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="sm:w-56">
            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="ALL">All Classes / Sections</option>
              {classSections.map((cs) => (
                <option key={cs.id} value={cs.id}>
                  {cs.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Student list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-900" />
              <p className="text-sm font-bold">Loading student records...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2 text-center">
              <GraduationCap className="w-10 h-10 opacity-30" />
              <p className="text-sm font-bold text-gray-600">
                {searchQuery.trim()
                  ? `No students found matching "${searchQuery.trim()}"`
                  : 'No matching students found'}
              </p>
              <p className="text-xs text-gray-400">
                {searchQuery.trim() || selectedSection !== 'ALL'
                  ? 'Try adjusting your search terms or class section filter.'
                  : 'No students available to display.'}
              </p>
              {(searchQuery || selectedSection !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedSection('ALL');
                  }}
                  className="mt-2 px-3.5 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            filteredStudents.map((student) => {
              const isSelected = selectedStudentIds.has(student.id);
              const isLinkedToThisParent =
                student.parentId === parentId || (student.parent && student.parent.id === parentId);
              const isLinkedToOtherParent =
                student.parentId && student.parentId !== parentId && student.parent && student.parent.id !== parentId;

              return (
                <div
                  key={student.id}
                  onClick={() => toggleStudent(student.id)}
                  className={cn(
                    'flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer group',
                    isSelected
                      ? 'bg-blue-50/60 border-blue-300 shadow-sm'
                      : 'bg-white border-gray-100 hover:border-gray-300 hover:bg-gray-50/50',
                  )}
                >
                  <div className="flex items-center gap-3.5">
                    {/* Checkbox */}
                    <div
                      className={cn(
                        'w-5 h-5 rounded-lg border flex items-center justify-center transition-all flex-shrink-0',
                        isSelected
                          ? 'bg-blue-900 border-blue-900 text-white'
                          : 'border-gray-300 bg-white group-hover:border-gray-400',
                      )}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    {/* Student Info */}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-gray-900">{student.fullName}</p>
                        <span className="text-xs font-bold text-gray-400">
                          {student.admissionNo}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3 h-3 text-gray-400" />
                          {student.classSectionName || 'No class assigned'}
                        </span>
                        {student.gradeLevelName && (
                          <>
                            <span>•</span>
                            <span>{student.gradeLevelName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Badges */}
                  <div className="flex items-center gap-2">
                    {isLinkedToThisParent ? (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                        <UserCheck className="w-3 h-3" />
                        Linked to this Parent
                      </span>
                    ) : isLinkedToOtherParent ? (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900" title={`Currently assigned to ${student.parent?.fullName}`}>
                        <AlertTriangle className="w-3 h-3 text-amber-700" />
                        Assigned: {student.parent?.fullName}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500">
                        Unassigned
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Confirmation Modal if reassigning students */}
        {showConfirmReassign && (
          <div className="p-4 bg-amber-50 border-t border-amber-200 flex items-start gap-3 animate-in slide-in-from-bottom-2">
            <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider">
                Confirm Relationship Transfer
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                The following students are currently linked to another parent and will be reassigned to{' '}
                <span className="font-bold">{parentName}</span>:
              </p>
              <ul className="mt-1 list-disc list-inside text-xs text-amber-900 font-semibold space-y-0.5">
                {reassignedStudents.map((s) => (
                  <li key={s.id}>
                    {s.fullName} ({s.admissionNo}) — currently with parent{' '}
                    <span className="font-bold">{s.parent?.fullName}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmReassign(false)}
                className="px-3 py-1.5 bg-white border border-amber-300 text-amber-800 rounded-xl text-xs font-bold hover:bg-amber-100/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm"
              >
                {isSaving ? 'Reassigning...' : 'Confirm Reassignment'}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <div className="text-xs text-gray-500">
            <span className="font-bold text-gray-900">{selectedStudentIds.size}</span> student(s) selected
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-black hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white text-xs font-black shadow-md shadow-blue-900/20 transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  Save Children
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LinkChildrenModal;
