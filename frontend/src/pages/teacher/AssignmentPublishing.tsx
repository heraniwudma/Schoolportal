import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FiSend, FiUpload, FiFileText, FiCalendar, FiBookOpen, FiSearch, FiX, FiEdit3 } from 'react-icons/fi';
import { api } from '../../lib/api';
import { formatClassSection } from '../../lib/classSection';
import ReviewSubmissionModal, { SubmissionReviewData } from '../../components/dashboard/ReviewSubmissionModal';
import EditAssignmentModal, { AssignmentItem } from '../../components/dashboard/EditAssignmentModal';

export default function PublishAssignmentPage() {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    subjectId: '',
    classSectionId: '',
    title: '',
    instructions: '',
    dueDate: '',
    attachmentUrl: '',
    maxMark: '20',
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedSubmissions, setSelectedSubmissions] = useState<any[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [loadingSubmissions, setLoadingSubmissions] = useState<boolean>(false);
  const [reviewSubmission, setReviewSubmission] = useState<SubmissionReviewData | null>(null);
  const [submissionModalMode, setSubmissionModalMode] = useState<'view' | 'edit'>('view');
  const [editingAssignment, setEditingAssignment] = useState<AssignmentItem | null>(null);

  const [searchParams] = useSearchParams();
  const urlAssignmentId = searchParams.get('assignmentId') || searchParams.get('view');

  const handleOpenSubmission = (submission: any, mode: 'view' | 'edit') => {
    const isGraded = Boolean(submission.isGraded || (submission.grades && submission.grades.length > 0) || submission.grade);
    const gradeObj = isGraded
      ? (submission.grade || (submission.grades && submission.grades[0] ? { score: submission.grades[0].score, maxScore: submission.grades[0].maxScore } : null))
      : null;
    setSubmissionModalMode(mode);
    setReviewSubmission({
      id: submission.id,
      assignmentId: submission.assignmentId || selectedAssignment?.id,
      assignmentTitle: submission.assignmentTitle || selectedAssignment?.title || '',
      subject: submission.subject || selectedAssignment?.subject || '',
      targetClass: submission.targetClass || selectedAssignment?.targetClass || '',
      instructions: submission.instructions || selectedAssignment?.instructions || '',
      studentId: submission.student?.id || submission.studentId,
      studentName: submission.studentName || `${submission.student?.firstName || ''} ${submission.student?.lastName || ''}`.trim() || 'Student',
      admissionNo: submission.admissionNo || submission.student?.admissionNo || '',
      loginId: submission.loginId || submission.student?.User?.loginId || submission.admissionNo || '',
      submittedAt: submission.submittedAt || submission.createdAt,
      content: submission.content || null,
      fileName: submission.fileName || null,
      fileUrl: submission.fileUrl || null,
      fileSize: submission.fileSize || null,
      fileType: submission.fileType || null,
      feedback: submission.feedback || (submission.grades && submission.grades[0]?.feedback) || null,
      isGraded,
      grade: gradeObj,
    });
  };

  const [assignmentSearchQuery, setAssignmentSearchQuery] = useState('');
  const [submissionSearchQuery, setSubmissionSearchQuery] = useState('');

  // TanStack Query caches and deduplicates concurrent/StrictMode requests
  const { data: teachingAssignments = [] } = useQuery<any[]>({
    queryKey: ['teachers', 'assignments'],
    queryFn: () => api.get<any[]>('/teachers/assignments'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: assignmentsList = [] } = useQuery<any[]>({
    queryKey: ['assignments', 'teacher'],
    queryFn: () => api.get<any[]>('/assignments/teacher'),
    staleTime: 2 * 60 * 1000,
  });

  const recentPublications = useMemo(() => {
    return assignmentsList.map((item) => ({
      id: item.id,
      title: item.title,
      subject: item.subject,
      targetClass: item.ClassSection?.name || item.targetClass || '',
      classSectionId: item.classSectionId,
      subjectId: item.subjectId,
      instructions: item.instructions || item.description || '',
      description: item.description || item.instructions || '',
      cleanInstructions: item.cleanInstructions || (item.instructions || item.description || '').replace(/\s*MAX_MARK:[0-9]+(\.[0-9]+)?/g, '').trim(),
      dueDate: item.dueDate,
      maxMark: item.maxMark ?? 20,
      time: new Date(item.createdAt).toLocaleString(),
      submissions: item.submissions || [],
      attachmentUrl: item.attachmentUrl || null,
    }));
  }, [assignmentsList]);

  const filteredPublications = useMemo(() => {
    const q = assignmentSearchQuery.trim().toLowerCase();
    if (!q) return recentPublications;
    return recentPublications.filter((item) =>
      (item.title || '').toLowerCase().includes(q) ||
      (item.targetClass || '').toLowerCase().includes(q) ||
      (item.subject?.name || item.subject || '').toLowerCase().includes(q)
    );
  }, [recentPublications, assignmentSearchQuery]);

  const filteredSubmissions = useMemo(() => {
    const q = submissionSearchQuery.trim().toLowerCase();
    if (!q) return selectedSubmissions;
    return selectedSubmissions.filter((s) =>
      `${s.student?.firstName || ''} ${s.student?.lastName || ''}`.toLowerCase().includes(q) ||
      (s.student?.admissionNo || '').toLowerCase().includes(q) ||
      (s.fileName || '').toLowerCase().includes(q)
    );
  }, [selectedSubmissions, submissionSearchQuery]);

  // Set default subject/section once teaching assignments are available
  useEffect(() => {
    if (teachingAssignments.length > 0 && !formData.subjectId) {
      const first = teachingAssignments[0];
      setFormData((current) => ({
        ...current,
        subjectId: current.subjectId || first.subjectId,
        classSectionId: current.classSectionId || first.classSectionId,
      }));
    }
  }, [teachingAssignments]);

  const loadSubmissions = async (assignment: any) => {
    setSelectedAssignment(assignment);
    setLoadingSubmissions(true);
    try {
      const subs = await api.get<any[]>(`/assignments/${assignment.id}/submissions`);
      setSelectedSubmissions(Array.isArray(subs) ? subs : []);
    } catch (error: any) {
      alert(error.message || 'Could not load submissions');
      setSelectedSubmissions([]);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  useEffect(() => {
    if (urlAssignmentId && recentPublications.length > 0 && !selectedAssignment) {
      const found = recentPublications.find((p) => p.id === urlAssignmentId);
      if (found) {
        loadSubmissions(found);
      }
    }
  }, [urlAssignmentId, recentPublications, selectedAssignment]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const newAssignment = await api.post<any>('/assignments', {
          title: formData.title,
          subjectId: formData.subjectId,
          classSectionId: formData.classSectionId,
          description: formData.instructions,
          instructions: formData.instructions,
          dueDate: formData.dueDate,
          attachmentUrl: formData.attachmentUrl,
          maxMark: parseFloat(formData.maxMark) || 20,
      });
      
      setMessage('Assignment published successfully and distributed to enrolled students!');
      queryClient.invalidateQueries({ queryKey: ['assignments', 'teacher'] });
      queryClient.invalidateQueries({ queryKey: ['teachers', 'dashboard'] });
      setFormData({
        subjectId: teachingAssignments[0]?.subjectId || '',
        classSectionId: teachingAssignments[0]?.classSectionId || '',
        title: '',
        instructions: '',
        dueDate: '',
        attachmentUrl: '',
        maxMark: '20',
      });
    } catch (error) {
      console.error(error);
      alert('Error publishing assignment. Ensure you are logged in and the backend server is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-8 font-sans text-gray-800">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Publish Assignment</h1>
        <p className="text-sm text-gray-500 mt-1">Create and distribute new assignments to your classes.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Column: Form Card (Span 2) */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <form onSubmit={handlePublish} className="space-y-6">
            
            {/* Subject and Target Class Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Subject</label>
                <select
                  name="subjectId"
                  value={formData.subjectId}
                  onChange={(e) => {
                    const assignment = teachingAssignments.find((item) => item.subjectId === e.target.value);
                    setFormData({ ...formData, subjectId: e.target.value, classSectionId: assignment?.classSectionId || '' });
                  }}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                >
                  {[...new Map(teachingAssignments.map((item) => [item.Subject.id, item.Subject])).values()].map((subject: any) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Target Class</label>
                <select
                  name="classSectionId"
                  value={formData.classSectionId}
                  onChange={handleChange}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                >
                  {teachingAssignments.filter((item) => item.subjectId === formData.subjectId).map((item) => <option key={item.classSectionId} value={item.classSectionId}>{formatClassSection(item.ClassSection)}</option>)}
                </select>
              </div>
            </div>

            {/* Assignment Title */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Assignment Title</label>
              <input
                type="text"
                name="title"
                placeholder="e.g. Weekly Math Quiz - Algebra"
                value={formData.title}
                onChange={handleChange}
                required
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
            </div>

            {/* Instructions / Description */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Instructions / Description</label>
              <textarea
                name="instructions"
                rows={5}
                placeholder="Provide detailed instructions for the students..."
                value={formData.instructions}
                onChange={handleChange}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 resize-none"
              />
            </div>

            {/* Due Date, Maximum Mark, and Attachment Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-start">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Due Date</label>
                <input
                  type="date"
                  name="dueDate"
                  value={formData.dueDate}
                  onChange={handleChange}
                  required
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Maximum Mark</label>
                <input
                  type="number"
                  name="maxMark"
                  min="0.1"
                  step="any"
                  value={formData.maxMark}
                  onChange={handleChange}
                  required
                  placeholder="20"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Attachment</label>
                <label className="flex items-center justify-center gap-2 w-full bg-blue-50/50 border border-dashed border-blue-200 rounded-xl py-3 px-4 text-blue-600 text-sm font-semibold cursor-pointer hover:bg-blue-50 transition">
                  <FiUpload className="text-lg" />
                  <span>Upload File</span>
                  <input 
                    type="file" 
                    className="hidden" 
                    onChange={(e) => {
                      if(e.target.files?.[0]) {
                        setFormData({...formData, attachmentUrl: e.target.files[0].name});
                      }
                    }} 
                  />
                </label>
                {formData.attachmentUrl && (
                  <p className="text-xs text-gray-500 mt-1 truncate">Selected: {formData.attachmentUrl}</p>
                )}
              </div>
            </div>

            {/* Success Message Banner */}
            {message && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium">
                {message}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#142850] hover:bg-blue-950 text-white font-semibold py-4 rounded-xl shadow-lg shadow-blue-900/10 transition flex items-center justify-center gap-2 tracking-wide uppercase text-sm disabled:opacity-50"
            >
              <FiSend className="text-base" />
              <span>{loading ? 'Publishing Assignment...' : 'Publish Assignment'}</span>
            </button>

          </form>
        </div>

        {/* Right Column: Recent Publications Card (Span 1) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <FiFileText className="text-lg" />
            </div>
            <h2 className="font-bold text-gray-900 text-base">Recent Publications</h2>
          </div>

          {/* Search bar for assignments */}
          {recentPublications.length > 0 && (
            <div className="relative mb-4">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
              <input
                type="text"
                placeholder="Search publications..."
                value={assignmentSearchQuery}
                onChange={(e) => setAssignmentSearchQuery(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-9 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-900/20"
              />
              {assignmentSearchQuery && (
                <button
                  type="button"
                  onClick={() => setAssignmentSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                >
                  <FiX className="text-sm" />
                </button>
              )}
            </div>
          )}

          <div className="space-y-4">
            {filteredPublications.map((item) => (
              <div key={item.id} className="p-4 rounded-xl bg-gray-50/70 border border-gray-100 transition hover:bg-gray-50 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-gray-900 text-sm leading-snug">{item.title}</h3>
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-900 border border-blue-100">
                      Max: {item.maxMark} pts
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 mt-1">
                    {item.subject && (
                      <span className="font-semibold text-gray-700">{item.subject}</span>
                    )}
                    {item.targetClass && (
                      <>
                        <span>•</span>
                        <span>{item.targetClass}</span>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-gray-400 mt-1">
                    <span>Due: {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'No due date'}</span>
                    <span>•</span>
                    <span>Submissions: {item.submissions?.length || 0}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-gray-200/60 mt-1">
                  <button 
                    type="button" 
                    onClick={() => loadSubmissions(item)} 
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition flex-1 text-center cursor-pointer ${
                      selectedAssignment?.id === item.id
                        ? 'bg-blue-900 text-white hover:bg-blue-950'
                        : 'bg-blue-50 text-blue-900 hover:bg-blue-100'
                    }`}
                  >
                    View Response ({item.submissions?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAssignment(item)}
                    className="px-3 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-950 text-white text-xs font-semibold shadow-sm transition flex items-center justify-center gap-1.5 shrink-0"
                  >
                    <FiEdit3 className="w-3.5 h-3.5" />
                    <span>Edit Assignment</span>
                  </button>
                </div>
              </div>
            ))}
            {recentPublications.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No published assignments yet.</p>
            ) : filteredPublications.length === 0 ? (
              <div className="py-6 text-center text-gray-400 text-xs">
                <p>No assignments match "{assignmentSearchQuery}"</p>
                <button
                  type="button"
                  onClick={() => setAssignmentSearchQuery('')}
                  className="mt-1 text-blue-700 hover:underline font-semibold"
                >
                  Clear filter
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {selectedAssignment && (
          <div className="lg:col-span-3 mt-4 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-gray-100 pb-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wider bg-blue-50 text-blue-900 border border-blue-200">
                    STUDENT RESPONSES
                  </span>
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Maximum Mark: {selectedAssignment.maxMark ?? 20} pts
                  </span>
                </div>
                <h3 className="font-bold text-gray-900 text-base">
                  Assignment: {selectedAssignment.title}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {selectedAssignment.subject?.name || selectedAssignment.subject || 'Subject'} {selectedAssignment.targetClass ? `• ${selectedAssignment.targetClass}` : ''} ({selectedSubmissions.length} submission{selectedSubmissions.length === 1 ? '' : 's'})
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                  <input
                    type="text"
                    placeholder="Search student or adm no..."
                    value={submissionSearchQuery}
                    onChange={(e) => setSubmissionSearchQuery(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-8 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-900/20"
                  />
                  {submissionSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setSubmissionSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                    >
                      <FiX className="text-sm" />
                    </button>
                  )}
                </div>
                <button 
                  type="button" 
                  onClick={() => {
                    setSelectedAssignment(null);
                    setSelectedSubmissions([]);
                    setSubmissionSearchQuery('');
                  }} 
                  className="text-xs text-gray-400 hover:text-gray-700 font-semibold shrink-0 cursor-pointer"
                >
                  Close list
                </button>
              </div>
            </div>

            {loadingSubmissions ? (
              <div className="py-12 text-center">
                <div className="animate-spin w-8 h-8 border-2 border-blue-900 border-t-transparent rounded-full mx-auto mb-3"></div>
                <p className="text-sm font-semibold text-gray-700">Fetching student responses…</p>
                <p className="text-xs text-gray-400 mt-1">Retrieving submissions for {selectedAssignment.title}</p>
              </div>
            ) : selectedSubmissions.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-gray-50 text-gray-400 flex items-center justify-center mx-auto mb-2 border border-gray-100">
                  <FiFileText className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-gray-700">No submissions yet.</p>
                <p className="text-xs text-gray-400 mt-1">Students have not submitted answers for this assignment yet.</p>
              </div>
            ) : filteredSubmissions.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-xs">
                <p>No student submissions match "{submissionSearchQuery}"</p>
                <button
                  type="button"
                  onClick={() => setSubmissionSearchQuery('')}
                  className="mt-1 text-blue-700 hover:underline font-semibold"
                >
                  Clear filter
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredSubmissions.map((submission) => {
                  const isGraded = Boolean(submission.isGraded || (submission.grades && submission.grades.length > 0) || submission.grade);
                  const scoreDisplay = submission.grade
                    ? `${submission.grade.score}/${submission.grade.maxScore}`
                    : (submission.grades && submission.grades[0])
                    ? `${submission.grades[0].score}/${submission.grades[0].maxScore}`
                    : null;
                  const studentName = submission.studentName || `${submission.student?.firstName || ''} ${submission.student?.lastName || ''}`.trim() || 'Student';
                  const admissionNo = submission.admissionNo || submission.student?.admissionNo || '';

                  return (
                    <div key={submission.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/50 p-2 rounded-xl transition">
                      <div>
                        <p className="font-bold text-sm text-gray-900">
                          {studentName}
                          <span className="text-xs font-normal text-gray-400 ml-2">({admissionNo || 'No ID'})</span>
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Submitted: {new Date(submission.submittedAt || submission.createdAt).toLocaleString()}
                          {submission.fileName ? ` • File: ${submission.fileName}` : ''}
                          {submission.content ? ' • Written answer provided' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${isGraded ? 'bg-green-100 text-green-800' : 'bg-blue-50 text-blue-800'}`}>
                          {isGraded ? `Graded (${scoreDisplay})` : 'Submitted'}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenSubmission(submission, 'view')}
                          className="px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold shadow-sm transition cursor-pointer"
                        >
                          View Response
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenSubmission(submission, 'edit')}
                          className="px-2.5 py-1.5 rounded-lg bg-blue-900 hover:bg-blue-950 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
                        >
                          {isGraded ? 'Edit Grade' : 'Grade / Review'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Review Submission Modal */}
        <ReviewSubmissionModal
          submission={reviewSubmission}
          isOpen={!!reviewSubmission}
          initialMode={submissionModalMode}
          onClose={() => setReviewSubmission(null)}
          onGraded={(subId, score, maxScore, feedback) => {
            setSelectedSubmissions((prev) => prev.map((s) => s.id === subId ? {
              ...s,
              isGraded: true,
              feedback,
              grade: { score, maxScore },
              grades: [{ score, maxScore, id: 'graded', feedback }],
            } : s));
            queryClient.invalidateQueries({ queryKey: ['assignments', 'teacher'] });
            queryClient.invalidateQueries({ queryKey: ['teachers', 'dashboard'] });
          }}
        />

        {/* Edit Assignment Modal */}
        <EditAssignmentModal
          isOpen={!!editingAssignment}
          onClose={() => setEditingAssignment(null)}
          assignment={editingAssignment}
          teachingAssignments={teachingAssignments}
          onSuccess={(updated) => {
            queryClient.invalidateQueries({ queryKey: ['assignments', 'teacher'] });
            queryClient.invalidateQueries({ queryKey: ['teachers', 'dashboard'] });
            setMessage(`Assignment "${updated.title}" updated successfully.`);
            setTimeout(() => setMessage(''), 4000);
          }}
        />
      </div>
    </div>
  );
}
