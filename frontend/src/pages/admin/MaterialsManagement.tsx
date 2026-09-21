import React, { useState, useEffect, useRef } from 'react';
import { FileText, Plus, Download, Trash2, Search, Filter, ShieldAlert, Book, X, Edit, UploadCloud, Loader2, Video } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Toaster, toast } from 'sonner';
import { getMaterials, createMaterial, deleteMaterial, updateMaterial, getMaterialDownloadUrl, Material } from '../../api/materials';
import AdminVideoReview from './AdminVideoReview';

const MaterialsManagement = () => {
  const [activeSection, setActiveSection] = useState<'files' | 'videos'>('files');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState<Material | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [newMaterial, setNewMaterial] = useState({ title: '', category: 'Materials', target_role: 'All Users', description: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All Categories');

  useEffect(() => {
    fetchMaterials();
  }, []);

  const fetchMaterials = async () => {
    setIsLoading(true);
    try {
      const response = await getMaterials();
      setMaterials(response);
    } catch (error) {
      toast.error('Failed to fetch materials');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg'];
      if (!validTypes.includes(file.type)) {
        toast.error('Invalid file type. Only PDF, DOCX, XLSX, PNG, and JPG are allowed.');
        return;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast.error('File too large. Maximum size is 10MB.');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditing && !selectedFile) {
      toast.error('Please select a file to upload');
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('title', newMaterial.title);
    formData.append('category', newMaterial.category);
    formData.append('target_role', newMaterial.target_role);
    formData.append('description', newMaterial.description);
    if (selectedFile) {
      formData.append('file', selectedFile);
    }

    try {
      if (isEditing) {
        toast.loading('Updating material...', { id: 'upload' });
        await updateMaterial(isEditing.id, formData);
        toast.success('Material updated successfully!', { id: 'upload' });
      } else {
        toast.loading('Uploading material...', { id: 'upload' });
        await createMaterial(formData);
        toast.success('Material uploaded successfully!', { id: 'upload' });
      }
      
      setIsUploading(false);
      setIsEditing(null);
      setNewMaterial({ title: '', category: 'Materials', target_role: 'All Users', description: '' });
      setSelectedFile(null);
      fetchMaterials();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save material', { id: 'upload' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!isDeleting) return;
    toast.loading('Deleting material...', { id: 'delete' });
    try {
      await deleteMaterial(isDeleting);
      toast.success('Material deleted successfully', { id: 'delete' });
      setMaterials(materials.filter(m => m.id !== isDeleting));
    } catch (error) {
      toast.error('Failed to delete material', { id: 'delete' });
    } finally {
      setIsDeleting(null);
    }
  };

  const handleDownload = async (id: string) => {
    if (downloadingId) return;
    setDownloadingId(id);
    try {
      toast.loading('Preparing download...', { id: 'download' });
      const { url } = await getMaterialDownloadUrl(id);
      toast.success('Download ready!', { id: 'download' });
      
      const a = document.createElement('a');
      a.href = url;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      toast.error('Unable to download this material. Please try again.', { id: 'download' });
    } finally {
      setDownloadingId(null);
    }
  };

  const openEditModal = (material: Material) => {
    setIsEditing(material);
    setNewMaterial({
      title: material.title,
      category: material.category || 'Materials',
      description: material.description || '',
      target_role: material.target_role || 'All Users'
    });
    setSelectedFile(null);
    setIsUploading(true);
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredMaterials = materials.filter(item => {
    const matchesSearch = !q ||
      item.title.toLowerCase().includes(q) || 
      (item.description && item.description.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q)) ||
      (item.target_role && item.target_role.toLowerCase().includes(q));
    
    const matchesCategory = filterCategory === 'All Categories' || 
                            (item.category && item.category.toLowerCase() === filterCategory.toLowerCase());

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-gray-900">Materials &amp; Media Management</h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage administrative documents and review teacher-submitted YouTube video lessons.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-gray-100 p-1 rounded-2xl text-xs font-black shadow-inner">
            <button
              onClick={() => setActiveSection('files')}
              className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 ${
                activeSection === 'files'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <FileText className="w-4 h-4 text-blue-600" />
              File Materials
            </button>
            <button
              onClick={() => setActiveSection('videos')}
              className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 ${
                activeSection === 'videos'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Video className="w-4 h-4" />
              Video Approvals
            </button>
          </div>

          {activeSection === 'files' && (
            <button
              onClick={() => {
                setIsEditing(null);
                setNewMaterial({ title: '', category: 'Materials', target_role: 'All Users', description: '' });
                setSelectedFile(null);
                setIsUploading(true);
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-blue-800 transition-colors shadow-md shadow-blue-900/20"
            >
              <Plus className="w-4 h-4" />
              Upload Material
            </button>
          )}
        </div>
      </div>

      {activeSection === 'videos' ? (
        <AdminVideoReview />
      ) : (
        <>

      {isUploading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-lg shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button onClick={() => setIsUploading(false)} className="absolute right-8 top-8 text-gray-400 hover:text-gray-900" disabled={isSubmitting}>
              <X className="w-6 h-6" />
            </button>
            <h3 className="text-2xl font-black text-gray-900 mb-6">{isEditing ? 'Edit Material' : 'Upload Material'}</h3>
            <form onSubmit={handleUpload} className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Title</label>
                <input
                  required
                  type="text"
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-500/10"
                  placeholder="Enter material title"
                  value={newMaterial.title}
                  onChange={e => setNewMaterial({...newMaterial, title: e.target.value})}
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Category</label>
                <select
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 appearance-none"
                  value={newMaterial.category}
                  onChange={e => setNewMaterial({...newMaterial, category: e.target.value})}
                  disabled={isSubmitting}
                >
                  <option value="Rules">Rules</option>
                  <option value="Notices">Notices</option>
                  <option value="Materials">Materials</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Target Audience</label>
                <select
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 appearance-none"
                  value={newMaterial.target_role}
                  onChange={e => setNewMaterial({...newMaterial, target_role: e.target.value})}
                  disabled={isSubmitting}
                >
                  <option value="All Users">All Users</option>
                  <option value="Teachers Only">Teachers Only</option>
                  <option value="Students Only">Students Only</option>
                  <option value="Parents Only">Parents Only</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Description</label>
                <textarea
                  required
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 resize-none"
                  placeholder="Brief description..."
                  value={newMaterial.description}
                  onChange={e => setNewMaterial({...newMaterial, description: e.target.value})}
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">File</label>
                <div 
                  className={cn("border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center transition-colors", isSubmitting ? "opacity-50" : "cursor-pointer hover:bg-gray-50")}
                  onClick={() => !isSubmitting && fileInputRef.current?.click()}
                >
                  <UploadCloud className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm font-bold text-gray-700">
                    {selectedFile ? selectedFile.name : (isEditing ? 'Click to replace file (optional)' : 'Click to select file')}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest">PDF, DOCX, XLSX, PNG, JPG (MAX 10MB)</p>
                  <input
                    type="file"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg"
                    disabled={isSubmitting}
                  />
                </div>
              </div>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-5 bg-blue-900 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-900/20 flex items-center justify-center disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (isEditing ? 'Confirm Changes' : 'Confirm Upload')}
              </button>
            </form>
          </div>
        </div>
      )}

      {isDeleting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center">
            <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">Delete Material?</h3>
            <p className="text-gray-500 mb-6">Are you sure you want to delete this material? This action cannot be undone.</p>
            <div className="flex gap-4">
              <button onClick={() => setIsDeleting(null)} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold">Cancel</button>
              <button onClick={confirmDelete} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold">Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search materials by title, description, category, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-12 py-4 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200/50 transition-colors"
              title="Clear search"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="flex gap-4">
          <select 
            className="bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 font-bold appearance-none min-w-[180px]"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option>All Categories</option>
            <option>Rules</option>
            <option>Notices</option>
            <option>Materials</option>
          </select>
          <button className="p-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-400 hover:text-blue-900 transition-all">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500 font-bold">Loading materials...</div>
      ) : filteredMaterials.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-[2rem] shadow-sm border border-gray-100">
          <Book className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-lg font-bold text-gray-600">
            {searchQuery.trim() ? (
              <>No materials matching &ldquo;{searchQuery.trim()}&rdquo;</>
            ) : (
              'No materials found.'
            )}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {searchQuery.trim() || filterCategory !== 'All Categories'
              ? 'Try adjusting your search keywords or category filter.'
              : 'Upload a new material or clear your search filters.'}
          </p>
          {(searchQuery || filterCategory !== 'All Categories') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterCategory('All Categories');
              }}
              className="mt-4 px-4 py-2 bg-blue-50 text-blue-900 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-100 transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredMaterials.map((item) => {
            const isRule = item.category === 'Rules';
            const isNotice = item.category === 'Notices';
            const catName = isRule ? 'RULE' : isNotice ? 'NOTICE' : 'MATERIAL';

            return (
              <div key={item.id} className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 group overflow-hidden hover:border-blue-900/20 transition-all flex flex-col relative">
                <div className={cn(
                  "p-8 flex items-center gap-6",
                  isRule ? "bg-amber-50" : isNotice ? "bg-indigo-50" : "bg-blue-50"
                )}>
                  <div className={cn(
                    "w-16 h-16 rounded-[1.5rem] flex items-center justify-center shrink-0 shadow-lg shadow-black/5",
                    isRule ? "bg-amber-600 text-white" : isNotice ? "bg-indigo-600 text-white" : "bg-blue-600 text-white"
                  )}>
                    {isRule ? <ShieldAlert className="w-8 h-8" /> : <Book className="w-8 h-8" />}
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 block mb-2">{catName}</span>
                    <h3 className="text-lg font-black text-gray-900 line-clamp-1">{item.title}</h3>
                  </div>
                </div>

                <div className="p-8 flex-1 flex flex-col">
                  <p className="text-sm text-gray-500 leading-relaxed mb-8 flex-1">
                    {item.description}
                  </p>

                  <div className="flex items-center justify-between pt-8 border-t border-gray-100">
                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                      {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                    </span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setIsDeleting(item.id)} className="p-3 bg-gray-50 text-gray-400 hover:text-red-600 rounded-xl transition-all" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEditModal(item)} className="p-3 bg-gray-50 text-gray-400 hover:text-blue-600 rounded-xl transition-all" title="Edit">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDownload(item.id)} 
                        disabled={downloadingId === item.id}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-800 transition-colors disabled:opacity-50"
                      >
                        {downloadingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        {downloadingId === item.id ? 'Downloading...' : 'Download'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
      <Toaster position="top-right" />
    </div>
  );
};

export default MaterialsManagement;
