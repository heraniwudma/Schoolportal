import React, { useState } from 'react';
import { Bell, Send, Trash2, Calendar, Archive, Clock, Eye, X, Edit2, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useOutletContext } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAdminNotices, getUserNotices, createNotice, updateNotice, deleteNotice, Notice } from '../../api/notices';
import { useGradeLevels } from '../../hooks/useAcademicStructure';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useAuth } from '../../context/AuthContext';

const CATEGORIES = ['General', 'Academic', 'Examination', 'Attendance', 'Fees', 'Events', 'Emergency', 'Results', 'Homework', 'System'];

const AnnouncementCenter = () => {
  const queryClient = useQueryClient();
  const outletContext = useOutletContext<{ searchQuery?: string }>();
  const globalSearchQuery = outletContext?.searchQuery || '';
  const [localSearch, setLocalSearch] = useState('');
  const { user } = useAuth();
  const { activeAcademicYearId } = useAcademicYear();
  const isAdmin = user?.role === 'admin';
  const isTeacher = user?.role === 'teacher';
  const canManage = isAdmin || isTeacher;

  // State for Composer/Edit Modal
  const [editingNotice, setEditingNotice] = useState<Notice | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'General',
    targetType: 'GLOBAL',
    targetRole: '',
    gradeId: '',
    sectionId: '',
    scheduledAt: '',
    expiresAt: ''
  });

  // State for Filters
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  
  const { data: notices = [], isLoading } = useQuery({
    queryKey: ['notices', isAdmin ? 'admin' : 'user'],
    queryFn: isAdmin ? getAdminNotices : getUserNotices
  });

  const { data: gradeLevels = [] } = useGradeLevels(activeAcademicYearId);

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      category: 'General',
      targetType: 'GLOBAL',
      targetRole: '',
      gradeId: '',
      sectionId: '',
      scheduledAt: '',
      expiresAt: ''
    });
    setEditingNotice(null);
  };

  const openEditModal = (notice: Notice) => {
    setFormData({
      title: notice.title,
      content: notice.content,
      category: notice.category || 'General',
      targetType: notice.targetType,
      targetRole: notice.targetRole || '',
      gradeId: notice.gradeId || '',
      sectionId: notice.sectionId || '',
      scheduledAt: notice.scheduledAt ? new Date(notice.scheduledAt).toISOString().slice(0, 16) : '',
      expiresAt: notice.expiresAt ? new Date(notice.expiresAt).toISOString().slice(0, 16) : '',
    });
    setEditingNotice(notice);
  };

  const createMutation = useMutation({
    mutationFn: createNotice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notices'] });
      toast.success('Announcement created successfully!');
      resetForm();
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to create announcement')
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Notice> }) => updateNotice(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notices'] });
      toast.success('Announcement updated!');
      resetForm();
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to update announcement')
  });

  const deleteMutation = useMutation({
    mutationFn: deleteNotice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notices'] });
      toast.success('Announcement deleted.');
    }
  });

  const handleSubmit = (status: 'DRAFT' | 'PUBLISHED' | 'SCHEDULED' | 'ARCHIVED' | undefined) => {
    if (!formData.title || !formData.content) {
      toast.error('Title and message are required.');
      return;
    }

    const payload: any = {
      title: formData.title,
      content: formData.content,
      category: formData.category,
      targetType: formData.targetType,
    };
    if (status) payload.status = status;

    if (formData.targetType === 'ROLE' && formData.targetRole) payload.targetRole = formData.targetRole;
    if (formData.targetType === 'GRADE' && formData.gradeId) payload.gradeId = formData.gradeId;
    if (formData.targetType === 'SECTION') {
      payload.gradeId = formData.gradeId;
      payload.sectionId = formData.sectionId;
    }

    payload.scheduledAt = formData.scheduledAt ? new Date(formData.scheduledAt).toISOString() : null;
    payload.expiresAt = formData.expiresAt ? new Date(formData.expiresAt).toISOString() : null;

    if (editingNotice) {
      updateMutation.mutate({ id: editingNotice.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleQuickAction = (id: string, status: 'PUBLISHED' | 'ARCHIVED' | 'DRAFT', actionName: string) => {
    if (confirm(`Are you sure you want to ${actionName} this announcement?`)) {
      updateMutation.mutate({ id, data: { status } });
    }
  };

  const rawSearch = localSearch || globalSearchQuery || '';
  const q = rawSearch.trim().toLowerCase();

  const filteredNotices = notices.filter(n => {
    if (filterStatus !== 'ALL' && n.status !== filterStatus) return false;
    if (filterCategory !== 'ALL' && n.category !== filterCategory) return false;
    if (q) {
      const matchTitle = (n.title || '').toLowerCase().includes(q);
      const matchContent = (n.content || '').toLowerCase().includes(q);
      const matchCategory = (n.category || '').toLowerCase().includes(q);
      const matchAuthor = (n.User?.email || '').toLowerCase().includes(q);
      const matchTarget = (n.targetRole || n.targetType || '').toLowerCase().includes(q);
      return matchTitle || matchContent || matchCategory || matchAuthor || matchTarget;
    }
    return true;
  });

  const selectedGrade = gradeLevels.find(g => g.id === formData.gradeId);
  const availableSections = selectedGrade?.ClassSection || [];

  const renderComposerFields = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 px-2">Title *</label>
        <input
          type="text"
          placeholder="Announcement Title"
          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-gray-900"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 px-2">Category</label>
          <select
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-gray-900"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 px-2">Target Audience</label>
          <select
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-gray-900"
            value={formData.targetType}
            onChange={(e) => setFormData({ ...formData, targetType: e.target.value })}
          >
            {isAdmin && <option value="GLOBAL">Everyone (Global)</option>}
            {isAdmin && <option value="ROLE">Specific Role</option>}
            <option value="GRADE">Specific Grade</option>
            <option value="SECTION">Specific Section</option>
          </select>
        </div>
      </div>

      {formData.targetType === 'ROLE' && isAdmin && (
        <div>
          <select
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-gray-900"
            value={formData.targetRole}
            onChange={(e) => setFormData({ ...formData, targetRole: e.target.value })}
          >
            <option value="">Select Role...</option>
            <option value="STUDENT">Students Only</option>
            <option value="TEACHER">Teachers Only</option>
            <option value="PARENT">Parents Only</option>
          </select>
        </div>
      )}

      {(formData.targetType === 'GRADE' || formData.targetType === 'SECTION') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-gray-900"
            value={formData.gradeId}
            onChange={(e) => setFormData({ ...formData, gradeId: e.target.value, sectionId: '' })}
          >
            <option value="">Select Grade...</option>
            {gradeLevels.filter(g => g.ClassSection && g.ClassSection.length > 0).map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>

          {formData.targetType === 'SECTION' && (
            <select
              className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-bold text-gray-900"
              value={formData.sectionId}
              onChange={(e) => setFormData({ ...formData, sectionId: e.target.value })}
              disabled={!formData.gradeId}
            >
              <option value="">Select Section...</option>
              {availableSections.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 px-2">Schedule Date</label>
          <input
            type="datetime-local"
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-xs font-bold text-gray-900"
            value={formData.scheduledAt}
            onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 px-2">Expire Date</label>
          <input
            type="datetime-local"
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-xs font-bold text-gray-900"
            value={formData.expiresAt}
            onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 px-2">Message *</label>
        <textarea
          rows={5}
          placeholder="Draft your message here..."
          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-900 resize-none"
          value={formData.content}
          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
        ></textarea>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-gray-900">Announcement Center</h2>
          <p className="text-gray-500 mt-1">Broadcast important information to the school community.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        
        {/* COMPOSER (Admins & Teachers) */}
        {canManage && !editingNotice && (
        <div className="xl:col-span-1 bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
          <h3 className="text-lg font-black text-gray-900 uppercase tracking-widest">Create Broadcast</h3>
          
          {renderComposerFields()}

          <div className="flex flex-col gap-3">
            <button
              disabled={createMutation.isPending}
              onClick={() => handleSubmit(formData.scheduledAt ? 'SCHEDULED' : 'PUBLISHED')}
              className="w-full py-4 bg-blue-900 text-white rounded-xl font-black uppercase tracking-[0.1em] hover:bg-blue-800 transition-all flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {formData.scheduledAt ? 'Schedule Broadcast' : 'Publish Broadcast'}
            </button>
            <button
              disabled={createMutation.isPending}
              onClick={() => handleSubmit('DRAFT')}
              className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-bold uppercase tracking-[0.1em] hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
            >
              Save as Draft
            </button>
          </div>
        </div>
        )}

        {/* FEED */}
        <div className={cn("space-y-6", canManage && !editingNotice ? "xl:col-span-2" : "xl:col-span-3")}>
          <div className="flex flex-wrap items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm gap-4">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] px-2">Notice Board</h3>
            
            <div className="flex flex-wrap items-center gap-3 flex-1 justify-end">
              <div className="relative min-w-[200px] max-w-xs flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search announcements..."
                  value={localSearch}
                  onChange={(e) => setLocalSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                />
                {localSearch && (
                  <button
                    type="button"
                    onClick={() => setLocalSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full"
                    title="Clear search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select 
                className="bg-gray-50 border-none rounded-lg text-xs font-bold text-gray-600 px-3 py-2 outline-none"
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
              >
                <option value="ALL">All Categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              
              {canManage && (
                <select 
                  className="bg-gray-50 border-none rounded-lg text-xs font-bold text-gray-600 px-3 py-2 outline-none"
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                >
                  <option value="ALL">All Status</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="DRAFT">Drafts</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-100">
              <div className="w-10 h-10 border-4 border-blue-900 border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-4 text-gray-500 font-bold">Loading notices...</p>
            </div>
          ) : filteredNotices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-100 text-center">
              <Bell className="w-12 h-12 text-gray-200 mb-4" />
              <p className="text-gray-900 font-bold text-base">
                {q ? `No announcements matching "${rawSearch.trim()}"` : 'No announcements found.'}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {q || filterStatus !== 'ALL' || filterCategory !== 'ALL'
                  ? 'Try adjusting your search keywords or active filters.'
                  : 'Check back later for new updates.'}
              </p>
              {(localSearch || filterStatus !== 'ALL' || filterCategory !== 'ALL') && (
                <button
                  type="button"
                  onClick={() => {
                    setLocalSearch('');
                    setFilterStatus('ALL');
                    setFilterCategory('ALL');
                  }}
                  className="mt-3 px-3.5 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredNotices.map((ann) => {
                const canEditThis = canManage && (isAdmin || ann.authorId === user?.id);

                return (
                  <div key={ann.id} className={cn(
                    "bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 group relative overflow-hidden transition-all",
                    ann.status === 'EXPIRED' && "opacity-60"
                  )}>
                    
                    {/* Status Strip */}
                    <div className={cn(
                      "absolute left-0 top-0 bottom-0 w-1.5",
                      ann.status === 'PUBLISHED' ? "bg-green-500" :
                      ann.status === 'DRAFT' ? "bg-gray-400" :
                      ann.status === 'SCHEDULED' ? "bg-blue-400" :
                      ann.status === 'EXPIRED' ? "bg-orange-400" : "bg-red-900"
                    )} />

                    <div className="flex items-start justify-between mb-4 pl-3">
                      <div>
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 block">
                            {ann.category} • {new Date(ann.createdAt).toLocaleDateString()}
                        </span>
                        <h4 className="font-black text-gray-900 text-lg">{ann.title}</h4>
                      </div>
                      
                      {canEditThis && (
                      <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
                        <button onClick={() => openEditModal(ann)} className="p-2 text-gray-400 hover:text-blue-600 tooltip" title="Edit Announcement">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        
                        {ann.status === 'DRAFT' && (
                          <button onClick={() => handleQuickAction(ann.id, 'PUBLISHED', 'publish')} className="p-2 text-gray-400 hover:text-green-600 tooltip" title="Publish">
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {(ann.status === 'PUBLISHED' || ann.status === 'SCHEDULED' || ann.status === 'EXPIRED') && (
                          <button onClick={() => handleQuickAction(ann.id, 'ARCHIVED', 'archive')} className="p-2 text-gray-400 hover:text-orange-600" title="Archive">
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                        {ann.status === 'ARCHIVED' && (
                          <button onClick={() => handleQuickAction(ann.id, 'DRAFT', 'restore to draft')} className="p-2 text-gray-400 hover:text-blue-600" title="Restore to Draft">
                            <Archive className="w-4 h-4 rotate-180" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to permanently delete this announcement?')) {
                              deleteMutation.mutate(ann.id);
                            }
                          }}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      )}
                    </div>

                    <div className="pl-3 py-2 text-gray-600 text-sm whitespace-pre-wrap leading-relaxed">
                      {ann.content}
                    </div>

                    <div className="flex flex-wrap items-center justify-between mt-6 pl-3 border-t border-gray-50 pt-4 gap-4">
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black text-gray-400 flex items-center gap-1 uppercase tracking-widest">
                          By {ann.User?.email || 'Admin'}
                        </span>
                        {ann.status === 'SCHEDULED' && (
                          <span className="text-[10px] font-black text-blue-500 flex items-center gap-1 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded">
                            <Clock className="w-3 h-3" /> Scheduled: {new Date(ann.scheduledAt!).toLocaleString()}
                          </span>
                        )}
                        {ann.status === 'EXPIRED' && (
                          <span className="text-[10px] font-black text-orange-500 flex items-center gap-1 uppercase tracking-widest bg-orange-50 px-2 py-1 rounded">
                            Expired: {new Date(ann.expiresAt!).toLocaleString()}
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] font-black text-blue-900 bg-blue-50 px-2 py-1 rounded-lg uppercase tracking-widest">
                        {ann.targetType} {ann.targetRole ? `- ${ann.targetRole}` : ''} {ann.GradeLevel ? `- ${ann.GradeLevel.name}` : ''} {ann.ClassSection ? `(${ann.ClassSection.name})` : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* EDIT MODAL */}
      {editingNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden my-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-widest">Edit Announcement</h3>
                <p className="text-xs text-gray-500 font-bold mt-1">Status: <span className="text-blue-600">{editingNotice.status}</span></p>
              </div>
              <button onClick={resetForm} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-white rounded-xl transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-8">
              {renderComposerFields()}
            </div>

            <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex flex-wrap items-center justify-end gap-3">
              <button
                onClick={resetForm}
                className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-bold uppercase tracking-[0.1em] hover:bg-gray-50 transition-all"
              >
                Cancel
              </button>
              
              {/* Contextual actions based on status */}
              {editingNotice.status === 'DRAFT' && (
                <button
                  disabled={updateMutation.isPending}
                  onClick={() => handleSubmit('PUBLISHED')}
                  className="px-6 py-3 bg-green-600 text-white rounded-xl font-bold uppercase tracking-[0.1em] hover:bg-green-700 transition-all"
                >
                  Publish Now
                </button>
              )}
              {editingNotice.status === 'SCHEDULED' && (
                <button
                  disabled={updateMutation.isPending}
                  onClick={() => handleSubmit('DRAFT')}
                  className="px-6 py-3 bg-gray-600 text-white rounded-xl font-bold uppercase tracking-[0.1em] hover:bg-gray-700 transition-all"
                >
                  Cancel Schedule
                </button>
              )}
              {(editingNotice.status === 'EXPIRED' || editingNotice.status === 'ARCHIVED') && (
                <button
                  disabled={updateMutation.isPending}
                  onClick={() => handleSubmit('PUBLISHED')}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold uppercase tracking-[0.1em] hover:bg-blue-700 transition-all"
                >
                  Re-Publish
                </button>
              )}

              <button
                disabled={updateMutation.isPending}
                onClick={() => handleSubmit(undefined)} // Just saves data without status change
                className="px-8 py-3 bg-blue-900 text-white rounded-xl font-black uppercase tracking-[0.1em] hover:bg-blue-800 transition-all shadow-lg shadow-blue-900/20"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <Toaster position="top-right" />
    </div>
  );
};

export default AnnouncementCenter;
