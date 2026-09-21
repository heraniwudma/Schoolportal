import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AlertCircle, ArrowRight, GraduationCap, Loader2 } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { APP_DESCRIPTION } from '../../config/branding';

type FormData = Record<string, string>;
const initial: FormData = { role: 'student', name: '', idNumber: '', email: '', password: '', confirmPassword: '', grade: '', department: '', institutionId: '', institutionName: '', admissionType: '', fatherName: '', grandfatherName: '', gender: '', dob: '', nationality: '', disability: 'no', disabilityType: '', guardianFullName: '', familyHeadGender: '', guardianEmail: '', guardianPhone: '', parentStatus: '', fatherEducationLevel: '', motherEducationLevel: '', economicStatus: '', familyKebele: '', locationType: '', residenceRegion: '', residenceZone: '', residenceWoreda: '', birthRegion: '', birthZone: '', birthWoreda: '', nationalId: '' };
const optionalFieldKeys = new Set(['email', 'guardianEmail', 'nationalId', 'department', 'grade']);

const fields: Array<[string, string, string?]> = [
  ['institutionId', 'Institution ID'], ['institutionName', 'Institution Name'], ['idNumber', 'Student ID'], ['admissionType', 'Admission Type'], ['name', 'First Name'], ['fatherName', "Father's Name"], ['grandfatherName', "Grandfather's Name"], ['nationality', 'Nationality'], ['guardianFullName', "Parent's or Guardian's Full Name"], ['guardianEmail', "Parent's or Guardian's Email", 'email'], ['guardianPhone', "Parent's or Guardian's Phone", 'tel'], ['parentStatus', 'Parent Status'], ['fatherEducationLevel', "Father's or Male Guardian's Education Level"], ['motherEducationLevel', "Mother's or Female Guardian's Education Level"], ['economicStatus', 'Student Economic Status'], ['familyKebele', 'Family Kebele'], ['locationType', 'Location Type'], ['residenceRegion', 'Region of Residence'], ['residenceZone', 'Zone of Residence'], ['residenceWoreda', 'Woreda of Residence'], ['birthRegion', 'Region of Birth'], ['birthZone', 'Zone of Birth'], ['birthWoreda', 'Woreda of Birth'], ['nationalId', 'National ID'],
];

export default function RegisterPage() {
  const [form, setForm] = useState(initial);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  const change = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (formError) setFormError(null);
    setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  };

  const input = (name: string, label: string, type = 'text', overrideRequired?: boolean) => {
    const isRequired = overrideRequired !== undefined ? overrideRequired : !optionalFieldKeys.has(name);
    return (
      <label className="block text-sm font-medium text-gray-700">
        {label}{isRequired && <span className="text-red-600"> *</span>}
        {!isRequired && <span className="text-xs text-gray-400"> (Optional)</span>}
        <input
          name={name}
          type={type}
          required={isRequired}
          value={form[name] || ''}
          onChange={change}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      </label>
    );
  };

  const section = (title: string, children: React.ReactNode) => (
    <fieldset className="rounded-xl border border-gray-200 p-4">
      <legend className="px-2 font-semibold text-blue-950">{title}</legend>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (form.password.length < 8) {
      const msg = 'Password must be at least 8 characters long.';
      setFormError(msg);
      return toast.error(msg);
    }

    if (form.password !== form.confirmPassword) {
      const msg = 'Passwords do not match.';
      setFormError(msg);
      return toast.error(msg);
    }

    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      const msg = 'Please enter a valid account email address.';
      setFormError(msg);
      return toast.error(msg);
    }

    if (form.guardianEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.guardianEmail.trim())) {
      const msg = 'Please enter a valid parent or guardian email address.';
      setFormError(msg);
      return toast.error(msg);
    }

    if (form.role === 'student' && form.disability === 'yes' && !form.disabilityType.trim()) {
      const msg = 'Disability type is required when disability is set to Yes.';
      setFormError(msg);
      return toast.error(msg);
    }

    if (form.role === 'student' && !/^[+0-9()\-\s]{7,25}$/.test(form.guardianPhone.trim())) {
      const msg = 'Please enter a valid parent or guardian phone number (7-25 digits).';
      setFormError(msg);
      return toast.error(msg);
    }

    setIsLoading(true);
    try {
      await api.post('/auth/register', {
        ...form,
        name: form.name.trim(),
        idNumber: form.idNumber.trim(),
        studentId: form.role === 'student' ? form.idNumber.trim() : undefined,
        email: form.email.trim() || undefined,
        guardianEmail: form.guardianEmail.trim() || undefined,
        role: form.role.toUpperCase(),
        disabilityType: form.disability === 'yes' ? form.disabilityType.trim() : undefined,
      });
      toast.success('Account created successfully. Please sign in.');
      navigate('/login', { replace: true });
    } catch (error: any) {
      let msg = 'Registration failed. Please check your inputs and try again.';
      if (typeof error?.message === 'string' && error.message.trim()) {
        msg = error.message;
      } else if (typeof error?.response?.data?.message === 'string') {
        msg = error.response.data.message;
      } else if (Array.isArray(error?.response?.data?.message)) {
        msg = error.response.data.message.join('\n• ');
      }
      setFormError(msg);
      toast.error(msg.length > 90 ? 'Registration failed. Please see error details below.' : msg);
    } finally {
      setIsLoading(false);
    }
  };

  const student = form.role === 'student';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-blue-800 to-indigo-900 px-4 py-10">
      <main className="mx-auto max-w-5xl rounded-2xl bg-white p-6 shadow-2xl sm:p-8">
        <header className="mb-7 text-center">
          <GraduationCap className="mx-auto mb-3 h-12 w-12 text-blue-900" />
          <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
          <p className="text-sm text-gray-500">{APP_DESCRIPTION}</p>
        </header>

        {formError && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              <div>
                <h3 className="font-semibold text-red-900">Registration Failed</h3>
                <p className="mt-1 whitespace-pre-line text-red-700">{formError}</p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {input('email', 'Account Email', 'email', false)}
            <label className="block text-sm font-medium text-gray-700">
              Account type
              <select name="role" value={form.role} onChange={change} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2">
                <option value="student">Student</option>
                <option value="parent">Parent</option>
                <option value="teacher">Staff / Teacher</option>
              </select>
            </label>
          </div>

          {student ? (
            <>
              {section('A — Institution / Academic Information', (
                <>
                  {fields.slice(0, 4).map(([key, label, type]) => input(key, label, type))}
                  {input('grade', 'Class / Grade')}
                </>
              ))}
              {section('B — Personal Information', (
                <>
                  {fields.slice(4, 8).map(([key, label, type]) => input(key, label, type))}
                  <label className="block text-sm font-medium text-gray-700">
                    Sex <span className="text-red-600">*</span>
                    <select required name="gender" value={form.gender} onChange={change} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2">
                      <option value="">Select sex</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </label>
                  {input('dob', 'Date of Birth', 'date')}
                </>
              ))}
              {section('C — Disability Information', (
                <>
                  <label className="block text-sm font-medium text-gray-700">
                    Disability <span className="text-red-600">*</span>
                    <span className="mt-2 flex gap-4 font-normal">
                      <span><input type="radio" name="disability" value="yes" checked={form.disability === 'yes'} onChange={change} /> Yes</span>
                      <span><input type="radio" name="disability" value="no" checked={form.disability === 'no'} onChange={change} /> No</span>
                    </span>
                  </label>
                  {input('disabilityType', 'Disability Type', 'text', form.disability === 'yes')}
                </>
              ))}
              {section('D — Family / Guardian Information', (
                <>
                  {fields.slice(8, 16).map(([key, label, type]) => input(key, label, type))}
                  <label className="block text-sm font-medium text-gray-700">
                    Family Head's Gender <span className="text-red-600">*</span>
                    <select required name="familyHeadGender" value={form.familyHeadGender} onChange={change} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2">
                      <option value="">Select gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </label>
                </>
              ))}
              {section('E — Residence Information', fields.slice(16, 21).map(([key, label, type]) => input(key, label, type)))}
              {section('F — Birth Location', fields.slice(21, 24).map(([key, label, type]) => input(key, label, type)))}
              {section('G — National Identification', input('nationalId', 'National ID'))}
            </>
          ) : (
            <>
              {input('name', 'Full Name')}
              {input('idNumber', 'ID Number')}
              {form.role === 'teacher' ? input('department', 'Subject / Department') : input('grade', 'Child Class / Grade', 'text', false)}
            </>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {input('password', 'Password', 'password')}
            {input('confirmPassword', 'Confirm Password', 'password')}
          </div>

          <button disabled={isLoading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-900 py-3 font-semibold text-white disabled:opacity-70">
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Create Account <ArrowRight className="h-5 w-5" /></>}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account? <Link className="font-semibold text-blue-700" to="/login">Sign in here</Link>
        </p>
      </main>
      <Toaster position="top-right" />
    </div>
  );
}
