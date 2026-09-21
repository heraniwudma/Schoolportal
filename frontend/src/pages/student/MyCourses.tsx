import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Tag, Download, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { getMyCourses } from '../../api/students';

const MyCourses = ({ searchQuery: propSearchQuery = '' }: { searchQuery?: string } = {}) => {
  const navigate = useNavigate();
  const outletCtx = useOutletContext<{ searchQuery?: string } | null>();
  const [localSearch, setLocalSearch] = useState('');

  const effectiveSearch = (localSearch || propSearchQuery || outletCtx?.searchQuery || '').trim().toLowerCase();

  const { data: courses = [], isLoading, isError } = useQuery({
    queryKey: ['my-courses'],
    queryFn: getMyCourses,
  });

  const filteredCourses = courses.filter((subject) => {
    if (!effectiveSearch) return true;
    const nameMatch = (subject.name || '').toLowerCase().includes(effectiveSearch);
    const codeMatch = (subject.code || '').toLowerCase().includes(effectiveSearch);
    const gradeMatch = (subject.grade || '').toLowerCase().includes(effectiveSearch);
    const typeMatch = (subject.type || 'CORE').toLowerCase().includes(effectiveSearch);
    const descMatch = (subject.description || '').toLowerCase().includes(effectiveSearch);
    return nameMatch || codeMatch || gradeMatch || typeMatch || descMatch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Registered Subjects</h2>
          <p className="text-sm text-gray-500">Subjects assigned to your active grade level.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search subjects or codes..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-gray-800 placeholder-gray-400 shadow-sm"
            />
            {localSearch && (
              <button
                type="button"
                onClick={() => setLocalSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <span className="text-xs font-black uppercase tracking-wider bg-blue-50 text-blue-900 px-3 py-2 rounded-xl shrink-0">
            {filteredCourses.length} {filteredCourses.length === 1 ? 'Subject' : 'Subjects'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading && <p className="text-sm text-gray-500">Loading subjects...</p>}
        {isError && <p className="text-sm text-red-600">Could not load subjects.</p>}
        {!isLoading && !isError && courses.length === 0 && (
          <p className="text-sm text-gray-500">No subjects are assigned to your grade yet.</p>
        )}
        {!isLoading && !isError && courses.length > 0 && filteredCourses.length === 0 && (
          <div className="col-span-full bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center space-y-2">
            <Search className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="font-bold text-gray-800">No subjects match your search</p>
            <p className="text-xs text-gray-400">
              No registered subjects found matching "{localSearch || propSearchQuery || outletCtx?.searchQuery}".
            </p>
            <button
              onClick={() => setLocalSearch('')}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Clear search
            </button>
          </div>
        )}
        {filteredCourses.map((subject) => (
          <div key={subject.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            <div className="h-24 bg-[#1e3a8a] flex items-center justify-center">
              <BookOpen className="text-white/20 w-16 h-16" />
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded uppercase tracking-wider">
                  {subject.code}
                </span>
                <span className="text-xs font-bold text-gray-400">{subject.grade}</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-4">{subject.name}</h3>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Tag className="w-4 h-4 text-gray-400" />
                  <span>{subject.type ?? 'CORE'} Subject</span>
                </div>
                {subject.description && <p className="text-sm text-gray-600">{subject.description}</p>}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100 flex gap-2">
                <button 
                  onClick={() => navigate('/materials')} 
                  className="flex-1 py-2.5 bg-blue-50 text-blue-900 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-blue-100 transition-colors cursor-pointer"
                >
                  Course Material
                </button>
                <button 
                  onClick={() => toast.info('Syllabus download will be available soon')} 
                  className="flex-1 py-2.5 bg-gray-50 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-100 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  View Syllabus
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MyCourses;
