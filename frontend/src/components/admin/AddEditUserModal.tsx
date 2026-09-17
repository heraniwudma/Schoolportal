import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatClassSection } from '../../lib/classSection';
import {
  ClassSection,
  CreateUserPayload,
  DbRole,
  ManagedUser,
  ParentLookupOption,
  ROLE_LABELS,
  UpdateUserPayload,
  getUserDisplayName,
} from '../../types/users';

interface AddEditUserModalProps {
  open: boolean;
  editUser: ManagedUser | null;
  classSections: ClassSection[];
  parentsList: ParentLookupOption[];
  isSaving: boolean;
  onSave: (payload: CreateUserPayload | UpdateUserPayload) => Promise<void>;
  onClose: () => void;
}

interface FormState {
  loginId: string;
  password: string;
  role: DbRole;
  email: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  // Student
  admissionNo: string;
  classSectionId: string;
  parentId: string;
  gender: string;
  dob: string;
  address: string;
  emergencyContact: string;
  // Teacher
  staffId: string;
  // Parent
  occupation: string;
  relationship: string;
}

const EMPTY: FormState = {
  loginId: '', password: '', role: 'STUDENT', email: '', phoneNumber: '',
  firstName: '', lastName: '',
  admissionNo: '', classSectionId: '', parentId: '', gender: '', dob: '', address: '', emergencyContact: '',
  staffId: '',
  occupation: '', relationship: '',
};

const Field: React.FC<{
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}> = ({ label, required, children, hint }) => (
  <div className="space-y-1.5">
    <label className="block text-xs font-black text-gray-600 uppercase tracking-widest">
      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    {children}
    {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
  </div>
);

const inputCls = 'w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all';
const selectCls = inputCls + ' appearance-none';

const AddEditUserModal: React.FC<AddEditUserModalProps> = ({
  open, editUser, classSections, parentsList, isSaving, onSave, onClose,
}) => {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const isEdit = editUser !== null;

  // Populate form when editing
  useEffect(() => {
    if (!open) return;
    if (!editUser) { setForm(EMPTY); setErrors({}); return; }

    const s = editUser.Student;
    const t = editUser.Teacher;
    const p = editUser.Parent;
    setForm({
      loginId: editUser.loginId,
      password: '',
      role: editUser.role,
      email: editUser.email ?? '',
      phoneNumber: editUser.phoneNumber ?? '',
      firstName: s?.firstName ?? t?.firstName ?? p?.firstName ?? '',
      lastName: s?.lastName ?? t?.lastName ?? p?.lastName ?? '',
      admissionNo: s?.admissionNo ?? '',
      classSectionId: s?.ClassSection?.id ?? '',
      parentId: s?.parentId ?? s?.Parent?.id ?? '',
      gender: s?.gender ?? '',
      dob: s?.dob ? s.dob.slice(0, 10) : '',
      address: s?.address ?? t?.address ?? '',
      emergencyContact: s?.emergencyContact ?? '',
      staffId: t?.staffId ?? '',
      occupation: p?.occupation ?? '',
      relationship: p?.relationship ?? '',
    });
    setErrors({});
  }, [open, editUser]);

  if (!open) return null;

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.firstName.trim()) e.firstName = 'First name is required';
    if (!form.lastName.trim()) e.lastName = 'Last name is required';
    if (!form.loginId.trim()) e.loginId = 'Login ID is required';
    if (!isEdit && form.password.length < 8) e.password = 'Password must be at least 8 characters';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email format';
    if (form.role === 'STUDENT' && !form.admissionNo.trim()) e.admissionNo = 'Admission number is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (isEdit) {
      const payload: UpdateUserPayload = {
        loginId: form.loginId || undefined,
        email: form.email || undefined,
        phoneNumber: form.phoneNumber || undefined,
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
      };
      if (form.role === 'STUDENT') Object.assign(payload, { admissionNo: form.admissionNo, classSectionId: form.classSectionId || undefined, parentId: form.parentId || null, gender: form.gender || undefined, dob: form.dob || undefined, address: form.address || undefined, emergencyContact: form.emergencyContact || undefined });
      if (form.role === 'TEACHER') Object.assign(payload, { staffId: form.staffId || undefined, address: form.address || undefined });
      if (form.role === 'PARENT') Object.assign(payload, { occupation: form.occupation || undefined, relationship: form.relationship || undefined });
      await onSave(payload);
    } else {
      const payload: CreateUserPayload = {
        loginId: form.loginId,
        password: form.password,
        role: form.role,
        email: form.email || undefined,
        phoneNumber: form.phoneNumber || undefined,
        firstName: form.firstName,
        lastName: form.lastName,
      };
      if (form.role === 'STUDENT') Object.assign(payload, { admissionNo: form.admissionNo, classSectionId: form.classSectionId || undefined, parentId: form.parentId || undefined, gender: form.gender || undefined, dob: form.dob || undefined, address: form.address || undefined, emergencyContact: form.emergencyContact || undefined });
      if (form.role === 'TEACHER') Object.assign(payload, { staffId: form.staffId || undefined, address: form.address || undefined });
      if (form.role === 'PARENT') Object.assign(payload, { occupation: form.occupation || undefined, relationship: form.relationship || undefined });
      await onSave(payload);
    }
  };

  const err = (f: keyof FormState) => errors[f] ? <p className="text-[10px] text-red-500 mt-1">{errors[f]}</p> : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-black text-gray-900">
              {isEdit ? `Edit User — ${getUserDisplayName(editUser!)}` : 'Add New User'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {isEdit ? 'Update the user\'s information.' : 'Fill in all required fields to create a new account.'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex-1 overflow-y-auto p-8 space-y-6">

          {/* Role selector (only on create) */}
          {!isEdit && (
            <Field label="Role" required>
              <div className="grid grid-cols-4 gap-2">
                {(['STUDENT', 'TEACHER', 'PARENT', 'ADMIN'] as DbRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, role: r }))}
                    className={cn(
                      'py-2 rounded-xl text-xs font-black uppercase tracking-widest border transition-all',
                      form.role === r
                        ? 'bg-blue-900 text-white border-blue-900'
                        : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-blue-300',
                    )}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {/* Common fields */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" required>
              <input className={cn(inputCls, errors.firstName && 'border-red-400')} value={form.firstName} onChange={set('firstName')} placeholder="e.g. Abebe" />
              {err('firstName')}
            </Field>
            <Field label="Last Name" required>
              <input className={cn(inputCls, errors.lastName && 'border-red-400')} value={form.lastName} onChange={set('lastName')} placeholder="e.g. Kebede" />
              {err('lastName')}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Login ID" required hint="Used to log in to the portal">
              <input className={cn(inputCls, errors.loginId && 'border-red-400')} value={form.loginId} onChange={set('loginId')} placeholder="e.g. STU-2024-001" />
              {err('loginId')}
            </Field>
            {!isEdit && (
              <Field label="Password" required>
                <input type="password" className={cn(inputCls, errors.password && 'border-red-400')} value={form.password} onChange={set('password')} placeholder="Min. 8 characters" />
                {err('password')}
              </Field>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Email" hint="Optional">
              <input type="email" className={cn(inputCls, errors.email && 'border-red-400')} value={form.email} onChange={set('email')} placeholder="user@school.edu" />
              {err('email')}
            </Field>
            <Field label="Phone Number" hint="Optional">
              <input className={inputCls} value={form.phoneNumber} onChange={set('phoneNumber')} placeholder="+251 9XX XXX XXX" />
            </Field>
          </div>

          {/* Student-specific fields */}
          {form.role === 'STUDENT' && (
            <>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Student Details</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Admission Number" required>
                  <input className={cn(inputCls, errors.admissionNo && 'border-red-400')} value={form.admissionNo} onChange={set('admissionNo')} placeholder="e.g. ADM-2024-001" />
                  {err('admissionNo')}
                </Field>
                <Field label="Class / Section">
                  <select className={selectCls} value={form.classSectionId} onChange={set('classSectionId')}>
                    <option value="">No class assigned</option>
                    {classSections.map((cs) => (
                      <option key={cs.id} value={cs.id}>{formatClassSection(cs)}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Parent / Guardian (Optional)" hint="Link this student to an existing parent account">
                <select className={selectCls} value={form.parentId} onChange={set('parentId')}>
                  <option value="">No Parent Linked</option>
                  {parentsList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName} ({p.relationship || 'Parent'}) — {p.User.loginId}{p.phoneNumber ? ` • ${p.phoneNumber}` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Gender">
                  <select className={selectCls} value={form.gender} onChange={set('gender')}>
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </Field>
                <Field label="Date of Birth">
                  <input type="date" className={inputCls} value={form.dob} onChange={set('dob')} />
                </Field>
              </div>
              <Field label="Address">
                <input className={inputCls} value={form.address} onChange={set('address')} placeholder="Home address" />
              </Field>
              <Field label="Emergency Contact">
                <input className={inputCls} value={form.emergencyContact} onChange={set('emergencyContact')} placeholder="Emergency contact phone" />
              </Field>
            </>
          )}

          {/* Teacher-specific fields */}
          {form.role === 'TEACHER' && (
            <>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Teacher Details</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Staff ID">
                  <input className={inputCls} value={form.staffId} onChange={set('staffId')} placeholder="e.g. TCH-001" />
                </Field>
                <Field label="Address">
                  <input className={inputCls} value={form.address} onChange={set('address')} placeholder="Home address" />
                </Field>
              </div>
            </>
          )}

          {/* Parent-specific fields */}
          {form.role === 'PARENT' && (
            <>
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Parent Details</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Occupation">
                  <input className={inputCls} value={form.occupation} onChange={set('occupation')} placeholder="e.g. Engineer" />
                </Field>
                <Field label="Relationship to Student">
                  <select className={selectCls} value={form.relationship} onChange={set('relationship')}>
                    <option value="">Select relationship</option>
                    <option value="Father">Father</option>
                    <option value="Mother">Mother</option>
                    <option value="Guardian">Guardian</option>
                    <option value="Other">Other</option>
                  </select>
                </Field>
              </div>
            </>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-8 py-5 border-t border-gray-100 bg-gray-50/50">
          <button type="button" onClick={onClose} disabled={isSaving} className="px-6 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold hover:bg-gray-200 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={(e) => { void handleSubmit(e as unknown as React.FormEvent); }}
            disabled={isSaving}
            className="px-8 py-2.5 rounded-xl bg-blue-900 text-white text-sm font-black uppercase tracking-widest hover:bg-blue-800 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {isSaving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddEditUserModal;
