import React, { useState } from 'react';
import {
  Search,
  UserPlus,
  Filter,
  Edit2,
  Trash2,
  Key,
  Eye,
  UserCheck,
  UserX,
  RefreshCw,
  Users,
  GraduationCap,
  BookOpen,
  Shield,
  Download,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { cn } from '../../lib/utils';
import { useUsers } from '../../hooks/useUsers';
import { useAuth } from '../../context/AuthContext';
import { useAcademicYear } from '../../context/AcademicYearContext';
import {
  ManagedUser,
  CreateUserPayload,
  UpdateUserPayload,
  ROLE_COLORS,
  ROLE_LABELS,
  getUserDisplayName,
  getUserProfileId,
  DbRole,
} from '../../types/users';
import { ApiError } from '../../lib/api';
import AddEditUserModal from '../../components/admin/AddEditUserModal';
import UserProfileDrawer from '../../components/admin/UserProfileDrawer';
import ConfirmDialog from '../../components/admin/ConfirmDialog';
import LinkChildrenModal from '../../components/admin/LinkChildrenModal';

// ─── Stat Card ────────────────────────────────────────────────────────────────

const StatPill: React.FC<{ label: string; value: number; icon: React.ElementType; color: string }> = ({
  label, value, icon: Icon, color,
}) => (
  <div className={cn('flex items-center gap-3 px-5 py-4 rounded-2xl bg-white border border-gray-100 shadow-sm')}>
    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <p className="text-2xl font-black text-gray-900 leading-none">{value}</p>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">{label}</p>
    </div>
  </div>
);

// ─── Role badge ───────────────────────────────────────────────────────────────

const RoleBadge: React.FC<{ role: DbRole }> = ({ role }) => {
  const c = ROLE_COLORS[role];
  return (
    <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest', c.bg, c.text)}>
      {ROLE_LABELS[role]}
    </span>
  );
};

// ─── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ isActive: boolean }> = ({ isActive }) => (
  <div className="flex items-center gap-1.5">
    <span className={cn('w-2 h-2 rounded-full', isActive ? 'bg-green-500' : 'bg-red-400')} />
    <span className={cn('text-[10px] font-black uppercase tracking-widest', isActive ? 'text-green-700' : 'text-red-600')}>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  </div>
);

// ─── Skeleton row ─────────────────────────────────────────────────────────────

const SkeletonRow: React.FC = () => (
  <tr>
    {[...Array(6)].map((_, i) => (
      <td key={i} className="px-6 py-4">
        <div className="h-4 bg-gray-100 rounded-lg animate-pulse" style={{ width: `${60 + i * 10}%` }} />
      </td>
    ))}
  </tr>
);

// ─── Main component ───────────────────────────────────────────────────────────

const UserManagement: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { activeAcademicYearId } = useAcademicYear();
  const outletCtx = useOutletContext<{ searchQuery?: string }>() || {};
  const globalSearchQuery = outletCtx.searchQuery;

  const {
    users, meta, stats, classSections, parentsList, filters,
    isLoading, isStatsLoading, isExporting, error,
    applyFilters, refresh,
    fetchClassSections, fetchParentsList,
    createUser, updateUser, activateUser, deactivateUser, resetPassword, deleteUser,
    exportUsers,
  } = useUsers();

  React.useEffect(() => {
    if (globalSearchQuery !== undefined && globalSearchQuery !== filters.search) {
      applyFilters({ search: globalSearchQuery });
    }
  }, [globalSearchQuery]);

  // Export menu state
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = async (mode: 'all' | 'filtered') => {
    setShowExportMenu(false);
    try {
      await exportUsers(mode);
      toast.success(mode === 'all' ? 'All users exported successfully.' : 'Filtered users exported successfully.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to export users.');
    }
  };

  // Modal / drawer state
  const [showAddEdit, setShowAddEdit] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [profileUser, setProfileUser] = useState<ManagedUser | null>(null);
  const [linkChildrenUser, setLinkChildrenUser] = useState<ManagedUser | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Lazy-load lookup options only when modals actually open
  React.useEffect(() => {
    if (showAddEdit || linkChildrenUser) {
      void fetchClassSections(activeAcademicYearId);
      void fetchParentsList();
    }
  }, [showAddEdit, linkChildrenUser, activeAcademicYearId, fetchClassSections, fetchParentsList]);

  // Confirm dialog state
  type ConfirmAction =
    | { type: 'deactivate'; user: ManagedUser }
    | { type: 'activate'; user: ManagedUser }
    | { type: 'delete'; user: ManagedUser }
    | { type: 'reset'; user: ManagedUser; newPassword: string };

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [isConfirmLoading, setIsConfirmLoading] = useState(false);

  // Reset password inline state
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Sort toggle helper
  const toggleSort = (col: string) => {
    if (filters.sortBy === col) {
      applyFilters({ sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' });
    } else {
      applyFilters({ sortBy: col, sortOrder: 'asc' });
    }
  };

  const SortIcon: React.FC<{ col: string }> = ({ col }) => {
    if (filters.sortBy !== col) return <ChevronUp className="w-3 h-3 text-gray-300" />;
    return filters.sortOrder === 'asc'
      ? <ChevronUp className="w-3 h-3 text-blue-600" />
      : <ChevronDown className="w-3 h-3 text-blue-600" />;
  };

  // ── Save (create or edit) ────────────────────────────────────────────────────

  const handleSave = async (payload: CreateUserPayload | UpdateUserPayload) => {
    setIsSaving(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.id, payload as UpdateUserPayload);
        toast.success('User updated successfully.');
      } else {
        await createUser(payload as CreateUserPayload);
        toast.success('User created successfully.');
      }
      setShowAddEdit(false);
      setEditingUser(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Unable to save user.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Confirm action execution ─────────────────────────────────────────────────

  const executeConfirm = async () => {
    if (!confirmAction) return;
    setIsConfirmLoading(true);
    try {
      if (confirmAction.type === 'deactivate') {
        await deactivateUser(confirmAction.user.id);
        toast.success(`${getUserDisplayName(confirmAction.user)} has been deactivated.`);
      } else if (confirmAction.type === 'activate') {
        await activateUser(confirmAction.user.id);
        toast.success(`${getUserDisplayName(confirmAction.user)} has been activated.`);
      } else if (confirmAction.type === 'delete') {
        await deleteUser(confirmAction.user.id);
        toast.success('User deleted successfully.');
      } else if (confirmAction.type === 'reset') {
        await resetPassword(confirmAction.user.id, confirmAction.newPassword);
        toast.success('Password reset successfully.');
        setResetUserId(null);
        setNewPassword('');
      }
      setConfirmAction(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setIsConfirmLoading(false);
    }
  };

  const openEdit = (u: ManagedUser) => { setEditingUser(u); setShowAddEdit(true); };
  const openAdd = () => { setEditingUser(null); setShowAddEdit(true); };

  const handleResetPassword = (u: ManagedUser) => {
    if (!newPassword || newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    setConfirmAction({ type: 'reset', user: u, newPassword });
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  const isSelf = (u: ManagedUser) => currentUser?.id === u.id;

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900">User Management</h2>
          <p className="text-sm text-gray-500">Manage students, teachers, parents, and admin accounts.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refresh}
            className="p-3 bg-gray-50 border border-gray-100 rounded-2xl text-gray-400 hover:text-blue-900 hover:bg-blue-50 transition-all"
            title="Refresh"
          >
            <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
          </button>

          {/* ── Export Users Dropdown ────────────────────────────────────── */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setShowExportMenu((prev) => !prev)}
              disabled={isExporting}
              className={cn(
                'flex items-center gap-2.5 px-5 py-3 bg-white border border-gray-200 text-gray-700 rounded-2xl text-sm font-bold hover:bg-gray-50 hover:text-blue-900 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed',
                showExportMenu && 'ring-2 ring-blue-500/20 border-blue-500',
              )}
            >
              <Download className={cn('w-4 h-4 text-blue-900', isExporting && 'animate-bounce')} />
              <span>{isExporting ? 'Exporting...' : 'Export Users'}</span>
              <ChevronDown className={cn('w-3.5 h-3.5 text-gray-400 transition-transform duration-200', showExportMenu && 'rotate-180')} />
            </button>

            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-2 border-b border-gray-50 mb-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">CSV Export Options</p>
                </div>
                <button
                  onClick={() => void handleExport('all')}
                  disabled={isExporting}
                  className="w-full flex items-start gap-3 p-2.5 rounded-xl hover:bg-purple-50/70 text-left transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center flex-shrink-0 group-hover:bg-purple-100 transition-colors">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-gray-900 group-hover:text-purple-900">Download All Users</p>
                    <p className="text-[10px] text-gray-400 font-medium leading-tight mt-0.5">
                      Export entire user directory ({stats?.total ? `${stats.total} users` : 'all records'})
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => void handleExport('filtered')}
                  disabled={isExporting}
                  className="w-full flex items-start gap-3 p-2.5 rounded-xl hover:bg-blue-50/70 text-left transition-colors group mt-1"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                    <Filter className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-gray-900 group-hover:text-blue-900">Download Filtered Users</p>
                    <p className="text-[10px] text-gray-400 font-medium leading-tight mt-0.5">
                      Export matching search & filter criteria
                    </p>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={openAdd}
            className="flex items-center gap-3 px-6 py-3 bg-blue-900 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-800 transition-colors shadow-lg shadow-blue-900/20"
          >
            <UserPlus className="w-4 h-4" />
            Add New User
          </button>
        </div>
      </div>

      {/* ── Stats Bar ──────────────────────────────────────────────────────── */}
      {!isStatsLoading && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatPill label="Total" value={stats.total} icon={Users} color="bg-gray-100 text-gray-600" />
          <StatPill label="Active" value={stats.active} icon={UserCheck} color="bg-green-50 text-green-600" />
          <StatPill label="Inactive" value={stats.inactive} icon={UserX} color="bg-red-50 text-red-500" />
          <StatPill label="Students" value={stats.students} icon={GraduationCap} color="bg-blue-50 text-blue-600" />
          <StatPill label="Teachers" value={stats.teachers} icon={BookOpen} color="bg-indigo-50 text-indigo-600" />
          <StatPill label="Parents" value={stats.parents} icon={Users} color="bg-emerald-50 text-emerald-600" />
          <StatPill label="Admins" value={stats.admins} icon={Shield} color="bg-purple-50 text-purple-600" />
        </div>
      )}
      {isStatsLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[...Array(7)].map((_, i) => <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      )}

      {/* ── Search + Filters ───────────────────────────────────────────────── */}
      <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name, login ID, email, admission no., staff ID…"
            className="w-full pl-12 pr-10 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-medium text-sm transition-all"
            value={filters.search}
            onChange={(e) => applyFilters({ search: e.target.value })}
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => applyFilters({ search: '' })}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex gap-3">
          <select
            className="bg-gray-50 border border-gray-100 rounded-2xl px-5 py-3.5 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-sm appearance-none min-w-[140px]"
            value={filters.role}
            onChange={(e) => applyFilters({ role: e.target.value })}
          >
            <option value="">All Roles</option>
            <option value="STUDENT">Students</option>
            <option value="TEACHER">Teachers</option>
            <option value="PARENT">Parents</option>
            <option value="ADMIN">Admins</option>
          </select>
          <select
            className="bg-gray-50 border border-gray-100 rounded-2xl px-5 py-3.5 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold text-sm appearance-none min-w-[130px]"
            value={filters.status}
            onChange={(e) => applyFilters({ status: e.target.value })}
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button className="p-3.5 bg-gray-50 border border-gray-100 rounded-2xl text-gray-400 hover:text-blue-900 hover:bg-blue-50 transition-all">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl px-6 py-4 text-sm font-medium flex items-center justify-between">
          <span>{error}</span>
          <button onClick={refresh} className="text-xs font-black underline">Retry</button>
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                <th className="px-6 py-5">
                  <button className="flex items-center gap-1" onClick={() => toggleSort('name')}>
                    User Info <SortIcon col="name" />
                  </button>
                </th>
                <th className="px-6 py-5">
                  <button className="flex items-center gap-1" onClick={() => toggleSort('role')}>
                    Role <SortIcon col="role" />
                  </button>
                </th>
                <th className="px-6 py-5">Identity / Class</th>
                <th className="px-6 py-5">
                  <button className="flex items-center gap-1" onClick={() => toggleSort('status')}>
                    Status <SortIcon col="status" />
                  </button>
                </th>
                <th className="px-6 py-5">
                  <button className="flex items-center gap-1" onClick={() => toggleSort('createdAt')}>
                    Registered <SortIcon col="createdAt" />
                  </button>
                </th>
                <th className="px-6 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? [...Array(6)].map((_, i) => <SkeletonRow key={i} />)
                : users.length === 0
                ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3 text-gray-400">
                        <Users className="w-10 h-10 opacity-30" />
                        <p className="font-black text-sm">
                          {filters.search ? `No users match "${filters.search}"` : 'No users found'}
                        </p>
                        <p className="text-xs">
                          {filters.search
                            ? 'Try checking for typos or searching by email, login ID, or role.'
                            : 'Try adjusting the search or filter.'}
                        </p>
                        {filters.search && (
                          <button
                            type="button"
                            onClick={() => applyFilters({ search: '' })}
                            className="mt-2 text-xs font-bold text-blue-900 hover:underline cursor-pointer"
                          >
                            Clear search
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
                : users.map((u) => {
                  const displayName = getUserDisplayName(u);
                  const profileId = getUserProfileId(u);
                  const initials = displayName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                  const sectionName = u.Student?.ClassSection?.name;

                  return (
                    <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group">
                      {/* User Info */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-900/5 rounded-xl flex items-center justify-center text-blue-900 font-black text-sm flex-shrink-0">
                            {initials}
                          </div>
                          <div>
                            <p className="text-sm font-black text-gray-900">{displayName}</p>
                            <p className="text-xs text-gray-400">{u.email ?? u.loginId}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-6 py-4">
                        <RoleBadge role={u.role} />
                      </td>

                      {/* Identity */}
                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-gray-900">{profileId}</p>
                        {u.role === 'PARENT' ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span
                              className={cn(
                                'px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider',
                                u.Parent?.Student && u.Parent.Student.length > 0
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-gray-100 text-gray-400',
                              )}
                            >
                              {u.Parent?.Student?.length
                                ? `${u.Parent.Student.length} Child${u.Parent.Student.length > 1 ? 'ren' : ''}`
                                : 'No Children'}
                            </span>
                          </div>
                        ) : (
                          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-0.5">
                            {sectionName ?? (u.Teacher?.staffId ? `Staff: ${u.Teacher.staffId}` : '')}
                          </p>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4">
                        <StatusBadge isActive={u.isActive} />
                      </td>

                      {/* Registered */}
                      <td className="px-6 py-4">
                        <p className="text-xs text-gray-500">{fmt(u.createdAt)}</p>
                        {u.lastLoginAt && <p className="text-[10px] text-gray-400">Last: {fmt(u.lastLoginAt)}</p>}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Manage Children (Parent Only) */}
                          {u.role === 'PARENT' && (
                            <button
                              onClick={() => setLinkChildrenUser(u)}
                              title="Manage / Link Children"
                              className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                            >
                              <Users className="w-4 h-4" />
                            </button>
                          )}

                          {/* View */}
                          <button
                            onClick={() => setProfileUser(u)}
                            title="View Profile"
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => openEdit(u)}
                            title="Edit User"
                            className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Activate / Deactivate */}
                          {u.isActive ? (
                            <button
                              onClick={() => !isSelf(u) && setConfirmAction({ type: 'deactivate', user: u })}
                              title={isSelf(u) ? 'Cannot deactivate your own account' : 'Deactivate'}
                              disabled={isSelf(u)}
                              className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => setConfirmAction({ type: 'activate', user: u })}
                              title="Activate"
                              className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-xl transition-all"
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                          )}

                          {/* Reset Password */}
                          <button
                            onClick={() => setResetUserId(resetUserId === u.id ? null : u.id)}
                            title="Reset Password"
                            className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-all"
                          >
                            <Key className="w-4 h-4" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => !isSelf(u) && setConfirmAction({ type: 'delete', user: u })}
                            title={isSelf(u) ? 'Cannot delete your own account' : 'Delete User'}
                            disabled={isSelf(u)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Inline reset-password panel */}
                        {resetUserId === u.id && (
                          <div className="mt-2 flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="New password (8+ chars)"
                              className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-500 w-44"
                            />
                            <button
                              onClick={() => handleResetPassword(u)}
                              className="px-3 py-1.5 bg-amber-500 text-white rounded-xl text-xs font-black hover:bg-amber-600 transition-colors"
                            >
                              Set
                            </button>
                            <button
                              onClick={() => { setResetUserId(null); setNewPassword(''); }}
                              className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-black hover:bg-gray-200 transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ────────────────────────────────────────────────────── */}
        {!isLoading && meta.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400 font-medium">
              Showing {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total} users
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={meta.page <= 1}
                onClick={() => applyFilters({ page: meta.page - 1 })}
                className="p-2 rounded-xl bg-gray-50 border border-gray-100 text-gray-400 hover:text-blue-900 hover:bg-blue-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {[...Array(meta.totalPages)].map((_, i) => {
                const pg = i + 1;
                if (meta.totalPages > 7 && Math.abs(pg - meta.page) > 2 && pg !== 1 && pg !== meta.totalPages) return null;
                return (
                  <button
                    key={pg}
                    onClick={() => applyFilters({ page: pg })}
                    className={cn(
                      'w-8 h-8 rounded-xl text-xs font-black transition-all',
                      pg === meta.page ? 'bg-blue-900 text-white' : 'bg-gray-50 text-gray-500 hover:bg-blue-50 hover:text-blue-900 border border-gray-100',
                    )}
                  >
                    {pg}
                  </button>
                );
              })}
              <button
                disabled={meta.page >= meta.totalPages}
                onClick={() => applyFilters({ page: meta.page + 1 })}
                className="p-2 rounded-xl bg-gray-50 border border-gray-100 text-gray-400 hover:text-blue-900 hover:bg-blue-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        {!isLoading && meta.totalPages <= 1 && users.length > 0 && (
          <div className="px-6 py-4 border-t border-gray-100">
            <p className="text-xs text-gray-400 font-medium">{meta.total} user{meta.total !== 1 ? 's' : ''}</p>
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      <AddEditUserModal
        open={showAddEdit}
        editUser={editingUser}
        classSections={classSections}
        parentsList={parentsList}
        isSaving={isSaving}
        onSave={handleSave}
        onClose={() => { setShowAddEdit(false); setEditingUser(null); }}
      />

      <UserProfileDrawer
        user={profileUser}
        onClose={() => setProfileUser(null)}
        onManageChildren={(u) => {
          setProfileUser(null);
          setLinkChildrenUser(u);
        }}
      />

      <LinkChildrenModal
        open={Boolean(linkChildrenUser)}
        parentUser={linkChildrenUser}
        classSections={classSections}
        onClose={() => setLinkChildrenUser(null)}
        onSuccess={() => {
          refresh();
        }}
      />

      {/* Deactivate */}
      <ConfirmDialog
        open={confirmAction?.type === 'deactivate'}
        title="Deactivate Account"
        description={`Are you sure you want to deactivate ${confirmAction?.type === 'deactivate' ? getUserDisplayName(confirmAction.user) : ''}? They will no longer be able to access the portal.`}
        confirmLabel="Deactivate"
        variant="warning"
        isLoading={isConfirmLoading}
        onConfirm={() => void executeConfirm()}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Activate */}
      <ConfirmDialog
        open={confirmAction?.type === 'activate'}
        title="Activate Account"
        description={`Reactivate ${confirmAction?.type === 'activate' ? getUserDisplayName(confirmAction.user) : ''}? They will regain access to the portal.`}
        confirmLabel="Activate"
        variant="warning"
        isLoading={isConfirmLoading}
        onConfirm={() => void executeConfirm()}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Delete */}
      <ConfirmDialog
        open={confirmAction?.type === 'delete'}
        title="Delete User"
        description={`Are you sure you want to delete ${confirmAction?.type === 'delete' ? getUserDisplayName(confirmAction.user) : ''}? This action is irreversible and may affect associated academic records.`}
        confirmLabel="Delete Permanently"
        variant="danger"
        isLoading={isConfirmLoading}
        onConfirm={() => void executeConfirm()}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Reset password */}
      <ConfirmDialog
        open={confirmAction?.type === 'reset'}
        title="Reset Password"
        description={`Set a new password for ${confirmAction?.type === 'reset' ? getUserDisplayName(confirmAction.user) : ''}?`}
        confirmLabel="Reset Password"
        variant="warning"
        isLoading={isConfirmLoading}
        onConfirm={() => void executeConfirm()}
        onCancel={() => setConfirmAction(null)}
      />

      <Toaster position="top-right" richColors />
    </div>
  );
};

export default UserManagement;
