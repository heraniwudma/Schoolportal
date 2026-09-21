import React, { useState, useEffect } from 'react';
import { X, Check, Users, Calendar, Clock, AlertCircle, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { AttendanceStatus } from './EditAttendanceModal';

export interface AssignedSectionOption {
  id: string;
  name: string;
  gradeName?: string;
  academicYearId?: string;
}

interface StartAttendanceSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignedSections: AssignedSectionOption[];
  onSuccess: () => void;
}

interface SessionStudent {
  id: string;
  name: string;
  admissionNo: string | null;
  status: AttendanceStatus;
}

export const StartAttendanceSessionModal: React.FC<StartAttendanceSessionModalProps> = ({
  isOpen,
  onClose,
  assignedSections,
  onSuccess,
}) => {
  const [selectedSectionId, setSelectedSectionId] = useState<string>('');
  const [sessionDate, setSessionDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [period, setPeriod] = useState<number>(1);
  const [students, setStudents] = useState<SessionStudent[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Set initial selected section
  useEffect(() => {
    if (assignedSections && assignedSections.length > 0) {
      setSelectedSectionId((prev) => prev || assignedSections[0].id);
    }
  }, [assignedSections]);

  // Fetch students whenever the selected section changes
  useEffect(() => {
    if (!isOpen || !selectedSectionId) return;

    let isMounted = true;
    setLoadingStudents(true);
    setError(null);

    api.get<SessionStudent[]>(`/attendance/students?classSectionId=${selectedSectionId}`)
      .then((res: any) => {
        if (!isMounted) return;
        const studentList = Array.isArray(res) ? res : res?.data || [];
        setStudents(
          studentList.map((s: any) => ({
            id: s.id,
            name: s.name || `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'Student',
            admissionNo: s.admissionNo || null,
            status: 'PRESENT' as AttendanceStatus,
          }))
        );
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error('Failed to load students for section:', err);
        setError(err?.response?.data?.message || 'Failed to load students for this class section.');
        setStudents([]);
      })
      .finally(() => {
        if (isMounted) setLoadingStudents(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedSectionId]);

  if (!isOpen) return null;

  const handleStatusChange = (studentId: string, newStatus: AttendanceStatus) => {
    setStudents((prev) =>
      prev.map((s) => (s.id === studentId ? { ...s, status: newStatus } : s))
    );
  };

  const handleMarkAll = (targetStatus: AttendanceStatus) => {
    setStudents((prev) => prev.map((s) => ({ ...s, status: targetStatus })));
  };

  const handleSaveSession = async () => {
    if (!selectedSectionId) {
      setError('Please select a class section.');
      return;
    }

    if (students.length === 0) {
      setError('No students enrolled in this section to record attendance for.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await api.post('/attendance', {
        classSectionId: selectedSectionId,
        date: sessionDate,
        period: Number(period) || 1,
        records: students.map((s) => ({
          studentId: s.id,
          status: s.status,
        })),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save attendance session:', err);
      setError(err?.response?.data?.message || err?.message || 'Error saving attendance session.');
    } finally {
      setSaving(false);
    }
  };

  const filteredStudents = students.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return s.name.toLowerCase().includes(q) || (s.admissionNo && s.admissionNo.toLowerCase().includes(q));
  });

  const presentCount = students.filter((s) => s.status === 'PRESENT').length;
  const absentCount = students.filter((s) => s.status === 'ABSENT').length;
  const lateCount = students.filter((s) => s.status === 'LATE').length;
  const excusedCount = students.filter((s) => s.status === 'EXCUSED').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-900" />
              Start Attendance Session
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Record attendance for assigned classes and update database</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters & Config */}
        <div className="p-6 border-b border-gray-100 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Section Selection */}
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">
                Class Section
              </label>
              <select
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 p-2 text-xs font-semibold text-gray-800 bg-white focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 outline-none"
              >
                {assignedSections.length === 0 ? (
                  <option value="">No assigned sections</option>
                ) : (
                  assignedSections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.gradeName ? `Grade ${sec.gradeName} - ${sec.name}` : sec.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">
                Session Date
              </label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-full rounded-xl border border-gray-200 p-2 text-xs font-semibold text-gray-800 bg-white focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 outline-none"
              />
            </div>

            {/* Period */}
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1">
                Period
              </label>
              <select
                value={period}
                onChange={(e) => setPeriod(Number(e.target.value))}
                className="w-full rounded-xl border border-gray-200 p-2 text-xs font-semibold text-gray-800 bg-white focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 outline-none"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                  <option key={p} value={p}>
                    Period {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Stats & Mark All Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <span className="font-bold text-gray-800">{students.length} Students:</span>
              <span className="text-green-700 font-bold">{presentCount} P</span> &bull;
              <span className="text-red-700 font-bold">{absentCount} A</span> &bull;
              <span className="text-orange-700 font-bold">{lateCount} L</span> &bull;
              <span className="text-blue-700 font-bold">{excusedCount} E</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleMarkAll('PRESENT')}
                className="px-2.5 py-1 text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
              >
                Mark All Present
              </button>
              <button
                type="button"
                onClick={() => handleMarkAll('ABSENT')}
                className="px-2.5 py-1 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              >
                Mark All Absent
              </button>
            </div>
          </div>

          {/* Student Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student by name or ID..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-900"
            />
          </div>
        </div>

        {/* Student Roster Table / List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 px-6">
          {loadingStudents ? (
            <div className="p-12 text-center text-xs text-gray-400">
              <Clock className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-900" />
              Loading student roster for this section...
            </div>
          ) : students.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-gray-700">No students enrolled</p>
              <p className="text-xs text-gray-400 mt-1">There are currently no active students found in this class section.</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-400">
              No students match "{searchQuery}".
            </div>
          ) : (
            filteredStudents.map((student) => (
              <div
                key={student.id}
                className="py-3 flex items-center justify-between gap-4 hover:bg-gray-50/50 px-2 rounded-xl transition"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-900 truncate">{student.name}</p>
                  {student.admissionNo && (
                    <p className="text-[11px] font-mono text-gray-400">{student.admissionNo}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as AttendanceStatus[]).map((st) => {
                    const active = student.status === st;
                    const styles = {
                      PRESENT: active
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-green-300',
                      ABSENT: active
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-red-300',
                      LATE: active
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300',
                      EXCUSED: active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300',
                    }[st];

                    const shortLabel = {
                      PRESENT: 'Present',
                      ABSENT: 'Absent',
                      LATE: 'Late',
                      EXCUSED: 'Excused',
                    }[st];

                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleStatusChange(student.id, st)}
                        className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition-all ${styles}`}
                      >
                        {shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50">
          <span className="text-xs text-gray-500">
            {students.length} students in session
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveSession}
              disabled={saving || students.length === 0}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Clock className="w-3.5 h-3.5 animate-spin" />
                  Saving Attendance...
                </>
              ) : (
                'Save Attendance Session'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StartAttendanceSessionModal;
