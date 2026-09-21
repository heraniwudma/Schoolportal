import React, { useState, useEffect, useMemo } from 'react';
import { Badge } from '../../components/ui/badge';
import { FileText, Calendar, Paperclip, ExternalLink, Search, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { useNavigate } from 'react-router-dom';
import { StudentAssignmentItem } from '../../api/students';

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../../components/ui/empty';

interface FormattedAssignment {
  id: string;
  title: string;
  subjectName: string;
  description: string;
  dueDate: string;
  rawDueDate: string;
  status: 'pending' | 'submitted';
  attachmentUrl: string | null;
  teacherName: string;
}

const Assignments = ({ searchQuery = '' }: { searchQuery?: string }) => {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState<FormattedAssignment[]>([]);
  const [localSearch, setLocalSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [downloadingResourceId, setDownloadingResourceId] = useState<string | null>(null);

  const handleOpenResource = async (assignmentId: string) => {
    setDownloadingResourceId(assignmentId);
    try {
      const res = await api.get<{ url?: string; downloadUrl?: string; fileName?: string }>(
        `/students/my-assignments/${assignmentId}/resource`,
      );
      const downloadUrl = res?.downloadUrl || res?.url;
      if (downloadUrl && (downloadUrl.startsWith('http://') || downloadUrl.startsWith('https://'))) {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast.error('Could not generate download link for this resource.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not download assignment resource.');
    } finally {
      setDownloadingResourceId(null);
    }
  };

  useEffect(() => {
    async function fetchRealAssignments() {
      try {
        const rawList = await api.get<StudentAssignmentItem[]>('/students/my-assignments');
        const list = Array.isArray(rawList) ? rawList : [];

        const formattedData: FormattedAssignment[] = list.map((item) => ({
          id: item.id,
          title: item.title || 'Untitled',
          subjectName: item.subject || item.ClassSection?.name || item.targetClass || 'General',
          description: item.instructions || '',
          dueDate: item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'No date',
          rawDueDate: item.dueDate,
          status: item.submissions && item.submissions.length > 0 ? 'submitted' : 'pending',
          attachmentUrl: item.attachmentUrl || null,
          teacherName: item.Teacher ? `${item.Teacher.firstName || ''} ${item.Teacher.lastName || ''}`.trim() : 'Teacher',
        }));

        setAssignments(formattedData);
      } catch (error) {
        console.error('Failed to fetch assignments:', error);
        setLoadError(true);
        toast.error('Could not load assignments from server.');
      } finally {
        setLoading(false);
      }
    }

    fetchRealAssignments();
  }, []);

  // Compute available unique subjects from returned assignments
  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    assignments.forEach((a) => {
      if (a.subjectName) set.add(a.subjectName);
    });
    return Array.from(set).sort();
  }, [assignments]);

  const effectiveSearch = (localSearch || searchQuery || '').trim().toLowerCase();

  const filteredAssignments = useMemo(() => {
    return assignments.filter((assignment) => {
      // 1. Text Search Filter
      const matchesSearch = !effectiveSearch ||
        assignment.title.toLowerCase().includes(effectiveSearch) ||
        assignment.subjectName.toLowerCase().includes(effectiveSearch) ||
        assignment.description.toLowerCase().includes(effectiveSearch) ||
        assignment.teacherName.toLowerCase().includes(effectiveSearch);

      // 2. Subject Filter
      const matchesSubject = selectedSubject === 'ALL' || assignment.subjectName === selectedSubject;

      // 3. Status Filter
      const matchesStatus = selectedStatus === 'ALL' || assignment.status === selectedStatus;

      return matchesSearch && matchesSubject && matchesStatus;
    });
  }, [assignments, effectiveSearch, selectedSubject, selectedStatus]);

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading your assignments...</div>;
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-8 text-center text-red-700">
        Assignments could not be loaded. Please refresh the page and try again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Assignments & Homework</h2>
          <p className="text-sm text-gray-500">View and submit assignments from your teachers.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* In-page Search Input */}
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search assignments..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full bg-white border border-gray-200 text-xs rounded-xl pl-9 pr-8 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
            />
            {localSearch && (
              <button
                type="button"
                onClick={() => setLocalSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Subject Filter */}
          <select 
            aria-label="Filter by Subject"
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="bg-white border border-gray-200 text-xs font-bold text-gray-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shadow-sm"
          >
            <option value="ALL">All Subjects ({assignments.length})</option>
            {availableSubjects.map((subj) => (
              <option key={subj} value={subj}>
                {subj}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select 
            aria-label="Filter by Status"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-white border border-gray-200 text-xs font-bold text-gray-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20 cursor-pointer shadow-sm"
          >
            <option value="ALL">All Status</option>
            <option value="pending">Pending</option>
            <option value="submitted">Submitted</option>
          </select>
        </div>
      </div>
      
      {filteredAssignments.length === 0 ? (
        <Empty className="min-h-[400px]">
          <EmptyMedia>
            <Search className="h-10 w-10" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{assignments.length === 0 ? 'No assignments have been assigned yet' : 'No assignments match your filters'}</EmptyTitle>
            <EmptyDescription>
              {assignments.length === 0 
                ? 'New assignments from your teachers will appear here.' 
                : effectiveSearch
                ? `No assignments found matching "${effectiveSearch}".`
                : 'Try adjusting your category or status filters to find what you are looking for.'}
            </EmptyDescription>
            {effectiveSearch && (
              <button
                type="button"
                onClick={() => setLocalSearch('')}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors mx-auto"
              >
                <X className="w-3.5 h-3.5" />
                Clear Search
              </button>
            )}
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredAssignments.map((assignment) => (
            <div 
              key={assignment.id} 
              className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-blue-200 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                  assignment.status === 'pending' ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600"
                )}>
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold text-gray-900">{assignment.title}</h3>
                    <Badge variant={assignment.status === 'pending' ? 'outline' : 'default'} className={cn(
                      assignment.status === 'pending' ? "text-amber-600 border-amber-200 bg-amber-50" : "text-green-600 border-green-200 bg-green-50"
                    )}>
                      {assignment.status.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-500 mb-2">{assignment.subjectName} • Prof. {assignment.teacherName}</p>
                  <p className="text-sm text-gray-600 line-clamp-1">{assignment.description}</p>
                </div>
              </div>

              <div className="flex flex-col md:items-end gap-4 shrink-0">
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-gray-400 font-medium">DUE DATE</p>
                    <p className="text-sm font-semibold text-gray-900 flex items-center gap-1">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {assignment.dueDate}
                    </p>
                  </div>
                  <div className="w-px h-8 bg-gray-100"></div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400 font-medium">MATERIAL</p>
                    {assignment.attachmentUrl ? (
                      <button 
                        type="button"
                        onClick={() => handleOpenResource(assignment.id)}
                        disabled={downloadingResourceId === assignment.id}
                        className="text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50 ml-auto"
                      >
                        <Paperclip className="w-4 h-4" />
                        {downloadingResourceId === assignment.id ? 'Opening...' : 'Resources'}
                      </button>
                    ) : (
                      <span className="text-sm text-gray-400">None</span>
                    )}
                  </div>
                </div>
                
                <div className="flex gap-2 w-full md:w-auto">
                  <button
                    onClick={() => navigate(`/assignments/${assignment.id}`)}
                    className="flex-1 md:flex-none px-5 py-2 border border-blue-200 text-blue-800 text-sm font-semibold rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
                  >
                    View Assignment
                  </button>
                  {assignment.status === 'pending' ? (
                    <button 
                      onClick={() => navigate(`/assignments/${assignment.id}?submit=1`)} 
                      className="flex-1 md:flex-none px-6 py-2 bg-[#1e3a8a] text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      Submit Work
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  ) : (
                    <button 
                      onClick={() => navigate(`/assignments/${assignment.id}`)} 
                      className="flex-1 md:flex-none px-6 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                    >
                      View Submission
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Assignments;
