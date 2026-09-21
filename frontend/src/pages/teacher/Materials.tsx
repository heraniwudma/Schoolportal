import React, { useEffect, useState, useMemo } from 'react';
import { Download, Upload, FileText, Video, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { formatClassSection } from '../../lib/classSection';
import TeacherVideoManagement from './TeacherVideoManagement';

type TeachingAssignment = { classSectionId: string; ClassSection: { id: string; name: string; GradeLevel?: { name: string } | null } };
type Material = { id: string; title: string; description?: string | null; fileName?: string | null; category?: string | null; createdAt?: string | null };

export default function TeacherMaterials() {
  const [activeTab, setActiveTab] = useState<'documents' | 'videos'>('documents');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [adminMaterials, setAdminMaterials] = useState<Material[]>([]);
  const [sections, setSections] = useState<TeachingAssignment[]>([]);
  const [title, setTitle] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAdminMaterials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return adminMaterials;
    return adminMaterials.filter((m) =>
      (m.title || '').toLowerCase().includes(q) ||
      (m.description || '').toLowerCase().includes(q) ||
      (m.category || '').toLowerCase().includes(q) ||
      (m.fileName || '').toLowerCase().includes(q)
    );
  }, [adminMaterials, searchQuery]);

  const filteredMaterials = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter((m) =>
      (m.title || '').toLowerCase().includes(q) ||
      (m.description || '').toLowerCase().includes(q) ||
      (m.category || '').toLowerCase().includes(q) ||
      (m.fileName || '').toLowerCase().includes(q)
    );
  }, [materials, searchQuery]);

  const load = async () => {
    try {
      const [materialData, adminMaterialData, assignmentData] = await Promise.all([
        api.get<Material[]>('/materials'),
        api.get<Material[]>('/materials/admin/published').catch(() => []),
        api.get<TeachingAssignment[]>('/teachers/assignments'),
      ]);
      setMaterials(materialData);
      setAdminMaterials(Array.isArray(adminMaterialData) ? adminMaterialData : []);
      const uniqueSections = assignmentData.filter((item, index, all) => all.findIndex((candidate) => candidate.classSectionId === item.classSectionId) === index);
      setSections(uniqueSections);
      setSectionId((current) => current || uniqueSections[0]?.classSectionId || '');
    } catch (err) {
      console.error('Failed to load materials:', err);
      toast.error('Could not load materials');
    }
  };

  useEffect(() => { 
    load().catch(() => toast.error('Could not load materials')); 
  }, []);

  const download = async (id: string) => {
    try {
      const { url } = await api.get<{ url: string }>(`/materials/${id}/download`);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch { toast.error('Could not create the download link'); }
  };

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title || !sectionId || !file) return toast.error('Choose a title, section, and file');
    const form = new FormData();
    form.append('title', title);
    form.append('category', 'material');
    form.append('target_role', 'student');
    form.append('classSectionId', sectionId);
    form.append('file', file);
    try {
      await api.post('/materials', form);
      setTitle(''); setFile(null);
      await load();
      toast.success('Material uploaded for the selected section');
    } catch (error: any) { toast.error(error.message || 'Upload failed'); }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header & Tab Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Learning Materials & Media</h2>
          <p className="text-sm text-gray-500">
            Manage document resources and educational YouTube videos for your classes.
          </p>
        </div>

        <div className="flex items-center bg-gray-100 p-1 rounded-2xl text-xs font-black shadow-inner">
          <button
            onClick={() => setActiveTab('documents')}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'documents'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <FileText className="w-4 h-4 text-blue-600" />
            File Materials
          </button>
          <button
            onClick={() => setActiveTab('videos')}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTab === 'videos'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Video className="w-4 h-4" />
            YouTube Video Lessons
          </button>
        </div>
      </div>

      {activeTab === 'videos' ? (
        <TeacherVideoManagement />
      ) : (
        <>
          <form onSubmit={upload} className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white border rounded-xl p-5 shadow-sm">
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Material title" className="border rounded-lg px-3 py-2" />
            <select value={sectionId} onChange={(event) => setSectionId(event.target.value)} className="border rounded-lg px-3 py-2">{sections.map((section) => <option key={section.classSectionId} value={section.classSectionId}>{formatClassSection(section.ClassSection)}</option>)}</select>
            <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="border rounded-lg px-3 py-2" />
            <button className="bg-blue-900 text-white rounded-lg px-4 py-2 font-semibold flex items-center justify-center gap-2 hover:bg-blue-800 transition-colors"><Upload className="w-4 h-4" />Upload for students</button>
          </form>

          {/* Search bar for learning materials */}
          {(materials.length > 0 || adminMaterials.length > 0) && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search learning materials by title, description, or file..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-9 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {adminMaterials.length > 0 && (
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">📌 Admin Published Materials</h3>
              {filteredAdminMaterials.length === 0 ? (
                <p className="text-xs text-gray-400 italic p-4 bg-white border rounded-xl">
                  No admin published materials match "{searchQuery}".
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  {filteredAdminMaterials.map((material) => (
                    <article key={material.id} className="bg-white border rounded-lg p-4 shadow-sm">
                      <p className="text-xs uppercase text-blue-600 font-bold">{material.category || 'Material'}</p>
                      <h4 className="font-bold text-gray-900 mt-1">{material.title}</h4>
                      <p className="text-sm text-gray-500 mt-2">{material.description}</p>
                      <button 
                        onClick={() => download(material.id)} 
                        className="mt-3 text-blue-800 font-semibold flex gap-2 hover:text-blue-600"
                      >
                        <Download className="w-4 h-4" />{material.fileName || 'Download'}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">📚 Class Materials</h3>
            {materials.length === 0 ? (
              <div className="bg-white border rounded-xl p-8 text-center text-gray-400">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="font-semibold text-gray-500">No class materials uploaded yet</p>
                <p className="text-xs mt-1">Use the upload form above to share documents with your class.</p>
              </div>
            ) : filteredMaterials.length === 0 ? (
              <div className="bg-white border rounded-xl p-8 text-center text-gray-400">
                <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="font-semibold text-gray-700">No materials match "{searchQuery}"</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-xs font-bold text-blue-800 hover:underline"
                >
                  Clear Search
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredMaterials.map((material) => (
                  <article key={material.id} className="bg-white border rounded-xl p-5 shadow-sm">
                    <p className="text-xs uppercase text-gray-400">{material.category || 'Material'}</p>
                    <h3 className="font-bold text-gray-900">{material.title}</h3>
                    <p className="text-sm text-gray-500 mt-2">{material.description}</p>
                    <button onClick={() => download(material.id)} className="mt-4 text-blue-800 font-semibold flex gap-2 hover:text-blue-600"><Download className="w-4 h-4" />{material.fileName || 'Download'}</button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
