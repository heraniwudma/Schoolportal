import React, { useState, useEffect } from 'react';
import { X, Check, Clock, AlertCircle, Calendar, User, FileText } from 'lucide-react';
import { api } from '../../lib/api';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface AttendanceRecordItem {
  id: string;
  studentId: string;
  studentName: string;
  admissionNo: string | null;
  classSectionId: string;
  className: string;
  date: string;
  period: number;
  status: AttendanceStatus;
  remarks?: string;
}

interface EditAttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: AttendanceRecordItem | null;
  onSuccess: () => void;
}

const STATUS_OPTIONS: Array<{
  value: AttendanceStatus;
  label: string;
  description: string;
  color: string;
  activeBg: string;
  borderColor: string;
}> = [
  {
    value: 'PRESENT',
    label: 'Present',
    description: 'Student is in class and attended session',
    color: 'text-green-700',
    activeBg: 'bg-green-50 border-green-500 ring-2 ring-green-500/20',
    borderColor: 'border-green-200',
  },
  {
    value: 'ABSENT',
    label: 'Absent',
    description: 'Student did not attend without excuse',
    color: 'text-red-700',
    activeBg: 'bg-red-50 border-red-500 ring-2 ring-red-500/20',
    borderColor: 'border-red-200',
  },
  {
    value: 'LATE',
    label: 'Late',
    description: 'Arrived after session commencement',
    color: 'text-orange-700',
    activeBg: 'bg-orange-50 border-orange-500 ring-2 ring-orange-500/20',
    borderColor: 'border-orange-200',
  },
  {
    value: 'EXCUSED',
    label: 'Excused',
    description: 'Permitted absence with approved reason',
    color: 'text-blue-700',
    activeBg: 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20',
    borderColor: 'border-blue-200',
  },
];

export const EditAttendanceModal: React.FC<EditAttendanceModalProps> = ({
  isOpen,
  onClose,
  record,
  onSuccess,
}) => {
  const [status, setStatus] = useState<AttendanceStatus>('PRESENT');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (record) {
      setStatus(record.status);
      setRemarks(record.remarks || '');
      setError(null);
    }
  }, [record]);

  if (!isOpen || !record) return null;

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await api.patch(`/attendance/${record.id}`, {
        status,
        remarks: remarks.trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to update attendance:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to update attendance record');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Edit Attendance Record</h3>
            <p className="text-xs text-gray-500 mt-0.5">Modify student status and optional attendance note</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2.5 text-xs text-red-700 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Student & Class Meta */}
          <div className="p-4 rounded-xl bg-gray-50/80 border border-gray-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-900" />
                <span className="text-sm font-bold text-gray-900">{record.studentName}</span>
              </div>
              {record.admissionNo && (
                <span className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-600 font-semibold">
                  {record.admissionNo}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t border-gray-200/60">
              <span className="font-semibold text-gray-700">{record.className}</span>
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <span>{new Date(record.date).toLocaleDateString()} &bull; Period {record.period || 1}</span>
              </div>
            </div>
          </div>

          {/* Status Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
              Attendance Status
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {STATUS_OPTIONS.map((opt) => {
                const isSelected = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                      isSelected
                        ? opt.activeBg
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-black uppercase tracking-wider ${opt.color}`}>
                        {opt.label}
                      </span>
                      {isSelected && (
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center text-white bg-current ${opt.color}`}>
                          <Check className="w-2.5 h-2.5 text-white stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 leading-snug">{opt.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Remarks */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-gray-400" />
              Remarks / Reason (Optional)
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Medical excuse submitted, traffic delay..."
              className="w-full px-3.5 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition-colors"
              maxLength={150}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
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
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-xs font-bold text-white bg-blue-900 hover:bg-blue-800 rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? (
              <>
                <Clock className="w-3.5 h-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditAttendanceModal;
