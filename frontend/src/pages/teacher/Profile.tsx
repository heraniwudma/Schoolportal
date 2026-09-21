import React, { useEffect, useState } from 'react';
import { Save, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { getMyAccount, updateMyAccount, uploadMyAvatar, type AccountProfile } from '../../api/account';
import { useAuth } from '../../context/AuthContext';
import ChangePasswordForm from '../../components/account/ChangePasswordForm';

export default function TeacherProfile() {
  const { updateProfile } = useAuth();
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', loginId: '', staffId: '', phoneNumber: '', address: '', qualification: '' });

  useEffect(() => { getMyAccount().then((data) => {
    setAccount(data);
    setForm({ firstName: data.Teacher?.firstName || '', lastName: data.Teacher?.lastName || '', email: data.email || '', loginId: data.loginId, staffId: data.Teacher?.staffId || '', phoneNumber: data.Teacher?.phoneNumber || '', address: data.Teacher?.address || '', qualification: data.Teacher?.qualification || '' });
  }).catch(() => toast.error('Could not load your account')); }, []);

  const save = async (event: React.FormEvent) => { event.preventDefault(); try {
    const updated = await updateMyAccount(form);
    setAccount(updated); updateProfile({ name: `${form.firstName} ${form.lastName}`.trim(), email: form.email, idNumber: form.loginId });
    toast.success('Account updated');
  } catch (error: unknown) { toast.error(error instanceof Error ? error.message : 'Could not update account'); } };

  const changeAvatar = async (file?: File) => { if (!file) return; try { const updated = await uploadMyAvatar(file); setAccount(updated); updateProfile({ avatar: updated.avatarUrl || undefined }); toast.success('Profile picture updated'); } catch (error: unknown) { toast.error(error instanceof Error ? error.message : 'Avatar upload failed'); } };
  if (!account) return <div className="p-8 text-gray-500">Loading account…</div>;
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Account</h1>
        <p className="text-gray-500">Manage your teacher registration and personal details.</p>
      </div>
      <div className="bg-white border rounded-xl p-6 flex items-center gap-5">
        <img src={account.avatarUrl || 'https://placehold.co/96x96?text=Profile'} className="w-20 h-20 rounded-full object-cover" />
        <label className="cursor-pointer text-blue-900 font-semibold flex gap-2">
          <Upload className="w-4 h-4" />
          Update profile picture
          <input type="file" accept="image/*" className="hidden" onChange={(event) => changeAvatar(event.target.files?.[0])} />
        </label>
      </div>
      <form onSubmit={save} className="bg-white border rounded-xl p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {([['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'], ['loginId', 'Login ID'], ['staffId', 'Staff ID'], ['phoneNumber', 'Phone number'], ['address', 'Address'], ['qualification', 'Qualification']] as const).map(([key, label]) => (
          <label key={key} className="text-sm font-medium">
            {label}
            <input type={key === 'email' ? 'email' : 'text'} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="mt-1 w-full border rounded-lg px-3 py-2" />
          </label>
        ))}
        <button className="md:col-span-2 bg-blue-900 text-white rounded-lg py-2 font-semibold flex justify-center gap-2">
          <Save className="w-4 h-4" />
          Save changes
        </button>
      </form>
      <ChangePasswordForm />
    </div>
  );
}
