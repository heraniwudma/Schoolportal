import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Download, ShieldAlert, Book, RefreshCw, AlertCircle, Video, Search, X } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import StudentVideoLessons from '../../components/dashboard/StudentVideoLessons';

export interface BackendMaterial {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  category: 'materials' | 'rules' | 'notices' | string;
  targetRole: string;
  createdAt: string;
  updatedAt: string;
  userId: string | null;
  classSectionId: string | null;
}

function formatBytes(bytes: number, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

const Materials = ({ searchQuery: propSearchQuery = '' }: { searchQuery?: string } = {}) => {
  const outletCtx = useOutletContext<{ searchQuery?: string } | null>();
  const [mainTab, setMainTab] = useState<'documents' | 'videos'>('documents');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'notices' | 'materials' | 'rules'>('all');
  const [localSearch, setLocalSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const effectiveSearch = (localSearch || propSearchQuery || outletCtx?.searchQuery || '').trim().toLowerCase();

  const { data: materials = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['materials'],
    queryFn: () => api.get<BackendMaterial[]>('/materials'),
  });

  const filteredMaterials = materials.filter((material) => {
    if (selectedFilter !== 'all') {
      const cat = (material.category || '').toLowerCase();
      if (!cat.includes(selectedFilter)) return false;
    }
    if (effectiveSearch) {
      const titleMatch = (material.title || '').toLowerCase().includes(effectiveSearch);
      const descMatch = (material.description || '').toLowerCase().includes(effectiveSearch);
      const fileMatch = (material.fileName || '').toLowerCase().includes(effectiveSearch);
      const catMatch = (material.category || '').toLowerCase().includes(effectiveSearch);
      return titleMatch || descMatch || fileMatch || catMatch;
    }
    return true;
  });

  const handleDownload = async (material: BackendMaterial) => {
    setDownloadingId(material.id);
    try {
      const res = await api.get<{ url?: string; downloadUrl?: string; fileName?: string }>(
        `/materials/${material.id}/download`,
      );
      const downloadUrl = res?.downloadUrl || res?.url;
      if (downloadUrl && (downloadUrl.startsWith('http://') || downloadUrl.startsWith('https://'))) {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast.error('Direct download link could not be generated for this material.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not download file.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Main Tab Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Learning Materials & Video Lessons</h2>
          <p className="text-xs sm:text-sm text-gray-500">
            Access study documents, school guidelines, and teacher-curated educational YouTube videos.
          </p>
        </div>

        <div className="flex items-center bg-gray-100 p-1 rounded-2xl text-xs font-black shadow-inner">
          <button
            onClick={() => setMainTab('documents')}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
              mainTab === 'documents'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <FileText className="w-4 h-4 text-blue-600" />
            Study Documents
          </button>
          <button
            onClick={() => setMainTab('videos')}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
              mainTab === 'videos'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Video className="w-4 h-4" />
            Video Lessons
          </button>
        </div>
      </div>

      {mainTab === 'videos' ? (
        <StudentVideoLessons showHeader={false} searchQuery={effectiveSearch} />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {(['all', 'materials', 'rules', 'notices'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setSelectedFilter(filter)}
                  className={cn(
                    "px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer",
                    selectedFilter === filter 
                      ? "bg-[#1e3a8a] text-white shadow-sm" 
                      : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {filter === 'all' ? 'All Resources' : filter}
                </button>
              ))}
            </div>

            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search documents..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-800 placeholder-gray-400 shadow-sm"
              />
              {localSearch && (
                <button
                  onClick={() => setLocalSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="py-20 text-center text-gray-400">
              <RefreshCw className="w-10 h-10 animate-spin mx-auto mb-3 text-blue-900" />
              <p className="text-sm font-bold text-gray-700">Loading resources and materials...</p>
            </div>
          ) : isError ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center text-red-700 space-y-3">
              <AlertCircle className="w-10 h-10 mx-auto text-red-500" />
              <p className="font-bold">Could not load materials from server.</p>
              <button 
                onClick={() => refetch()}
                className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Try Again
              </button>
            </div>
          ) : materials.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center text-gray-500 space-y-2">
              <Book className="w-12 h-12 mx-auto text-gray-300 mb-2" />
              <p className="font-bold text-gray-900">No resources available</p>
              <p className="text-sm text-gray-400">
                No learning materials or guides have been published for your grade or section yet.
              </p>
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center text-gray-500 space-y-2">
              <Search className="w-12 h-12 mx-auto text-gray-300 mb-2" />
              <p className="font-bold text-gray-900">No resources match your filters</p>
              <p className="text-sm text-gray-400">
                {effectiveSearch
                  ? `No resources found matching "${localSearch || propSearchQuery || outletCtx?.searchQuery}".`
                  : `No resources found under the category "${selectedFilter}".`}
              </p>
              <button
                onClick={() => {
                  setLocalSearch('');
                  setSelectedFilter('all');
                }}
                className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMaterials.map((material) => {
                const isRule = (material.category || '').toLowerCase().includes('rule');
                const isNotice = (material.category || '').toLowerCase().includes('notice');

                return (
                  <div 
                    key={material.id} 
                    className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow flex flex-col"
                  >
                    <div className={cn(
                      "p-6 flex items-center gap-4",
                      isRule ? "bg-amber-50" : isNotice ? "bg-purple-50" : "bg-blue-50"
                    )}>
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                        isRule ? "bg-amber-600 text-white" : isNotice ? "bg-purple-600 text-white" : "bg-blue-600 text-white"
                      )}>
                        {isRule ? <ShieldAlert className="w-6 h-6" /> : isNotice ? <FileText className="w-6 h-6" /> : <Book className="w-6 h-6" />}
                      </div>
                      <div className="overflow-hidden">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-1">
                          {material.category || 'Material'}
                        </span>
                        <h3 className="font-bold text-gray-900 truncate" title={material.title}>
                          {material.title}
                        </h3>
                      </div>
                    </div>
                    
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <p className="text-sm text-gray-600 mb-6 line-clamp-3">
                        {material.description || 'No additional description provided.'}
                      </p>
                      
                      <div className="space-y-3 pt-4 border-t border-gray-100">
                        <div className="flex items-center justify-between text-xs text-gray-400 font-medium">
                          <span>{material.createdAt ? new Date(material.createdAt).toLocaleDateString() : '—'}</span>
                          {material.fileSize ? <span>{formatBytes(material.fileSize)}</span> : null}
                        </div>

                        <button 
                          onClick={() => handleDownload(material)} 
                          disabled={downloadingId === material.id}
                          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#1e3a8a] text-white hover:bg-blue-800 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {downloadingId === material.id ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Preparing Download...
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              Download / View File
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Materials;
