import React, { useState } from 'react';
import { Search, RefreshCw, FileCheck, CheckCircle, Clock, Eye, AlertCircle, Award, UserCheck, X, Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useOutletContext } from 'react-router-dom';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { getTermsForReportCards } from '../../api/reportCards';
import {
  getAdminSections,
  getAdminSectionReportCards,
  downloadAdminSectionsSummaryPdf,
  downloadAdminSectionReportCardsPdf,
  AdminSectionSummary,
  AdminReportCardStudent,
} from '../../api/adminReports';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const AdminReportCards = () => {
  const { searchQuery: globalSearchQuery } = useOutletContext<{ searchQuery: string }>();
  const [localSearch, setLocalSearch] = useState('');
  
  const { academicYears, activeAcademicYearId, isLoading: isLoadingYears } = useAcademicYear();
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');
  const academicYearId = selectedAcademicYearId || activeAcademicYearId;
  const [termId, setTermId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  
  const [selectedSection, setSelectedSection] = useState<AdminSectionSummary | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [modalStudentSearch, setModalStudentSearch] = useState('');

  const [isDownloadingSummary, setIsDownloadingSummary] = useState(false);
  const [isDownloadingSectionCards, setIsDownloadingSectionCards] = useState(false);


  const queryClient = useQueryClient();
  
  const { data: terms = [] } = useQuery({
    queryKey: ['reportCardTerms', academicYearId],
    queryFn: () => getTermsForReportCards(academicYearId),
    enabled: !!academicYearId,
  });

  const {
    data: sections = [],
    isLoading: isLoadingSections,
    isRefetching: isRefetchingSections,
  } = useQuery({
    queryKey: ['adminSections', academicYearId],
    queryFn: () => getAdminSections(academicYearId),
    enabled: !!academicYearId,
  });

  const {
    data: reportCards = [],
    isLoading: isLoadingReportCards,
  } = useQuery({
    queryKey: ['adminSectionReportCards', selectedSection?.id, academicYearId],
    queryFn: () => getAdminSectionReportCards(selectedSection!.id, academicYearId),
    enabled: isReviewModalOpen && !!selectedSection?.id && !!academicYearId,
  });

  const rawSearch = localSearch || globalSearchQuery || '';
  const effectiveSearch = rawSearch.trim().toLowerCase();
  
  const filteredSections = sections.filter((sec) => {
    const teacherName = (sec.homeroomTeacher || '').toLowerCase();
    const sectionName = (sec.displayName || '').toLowerCase();
    const gradeName = (sec.gradeLevelName || '').toLowerCase();
    const statusText = (sec.status || '').toLowerCase();

    const matchesSearch =
      !effectiveSearch ||
      sectionName.includes(effectiveSearch) ||
      teacherName.includes(effectiveSearch) ||
      gradeName.includes(effectiveSearch) ||
      statusText.includes(effectiveSearch);

    const matchesStatus = statusFilter === 'All' || sec.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleReviewClick = (section: AdminSectionSummary) => {
    setSelectedSection(section);
    setModalStudentSearch('');
    setIsReviewModalOpen(true);
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['adminSections', academicYearId] });
    if (selectedSection) {
      queryClient.invalidateQueries({ queryKey: ['adminSectionReportCards', selectedSection.id, academicYearId] });
    }
  };

  const classAvg = reportCards.length > 0
    ? (reportCards.reduce((sum, r) => sum + r.overallAverage, 0) / reportCards.length).toFixed(1)
    : '0.0';

  const topStudent = reportCards.find(r => r.overallRank === 1);

  const handleDownloadSummaryPdf = async () => {
    if (filteredSections.length === 0) {
      toast.warning('No section report data matches the current filters to download.');
      return;
    }
    setIsDownloadingSummary(true);
    try {
      await downloadAdminSectionsSummaryPdf(academicYearId, statusFilter, localSearch || globalSearchQuery);
      toast.success('Section report summary PDF downloaded successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download report summary PDF');
    } finally {
      setIsDownloadingSummary(false);
    }
  };

  const handleDownloadSectionCardsPdf = async () => {
    if (!selectedSection) return;
    if (reportCards.length === 0) {
      toast.warning('No student report cards available to download for this section.');
      return;
    }
    setIsDownloadingSectionCards(true);
    try {
      await downloadAdminSectionReportCardsPdf(
        selectedSection.id,
        academicYearId,
        modalStudentSearch,
        `Student_Report_${selectedSection.displayName || selectedSection.name}.pdf`,
      );
      toast.success('Compiled report cards PDF downloaded successfully.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download report cards PDF');
    } finally {
      setIsDownloadingSectionCards(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900">Report Card Review</h2>
          <p className="text-sm text-gray-500">Review and inspect term and yearly report cards submitted by Home Room Teachers.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadSummaryPdf}
            disabled={isDownloadingSummary || isLoadingSections}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-900 text-white rounded-2xl text-xs font-bold uppercase tracking-wider hover:bg-blue-800 transition-all shadow-sm disabled:opacity-50"
            title="Download Summary Report PDF"
          >
            {isDownloadingSummary ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download PDF
          </button>
          <button
            onClick={handleRefresh}
            disabled={isLoadingSections || isRefetchingSections}
            className="p-3 bg-gray-50 border border-gray-100 rounded-2xl text-gray-400 hover:text-blue-900 hover:bg-blue-50 transition-all disabled:opacity-50"
            title="Refresh Report Cards Data"
          >
            <RefreshCw className={cn("w-4 h-4", (isLoadingSections || isRefetchingSections) && "animate-spin text-blue-900")} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Academic Year</label>
          <select
            value={academicYearId}
            onChange={(e) => { setSelectedAcademicYearId(e.target.value); setTermId(''); }}
            disabled={isLoadingYears}
            className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-900/20 outline-none transition-all"
          >
            <option value="">Select Year</option>
            {academicYears.map((y: any) => (
              <option key={y.id} value={y.id}>
                {y.year} {y.isCurrent ? '(Current)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Term Filter</label>
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            disabled={!academicYearId}
            className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-900/20 outline-none transition-all disabled:opacity-50"
          >
            <option value="">All Terms</option>
            {terms.map((t: any) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Search</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search section or teacher..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full h-12 pl-11 pr-10 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:bg-white transition-all font-medium"
            />
            {localSearch && (
              <button
                onClick={() => setLocalSearch('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200/50 transition-colors"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-900/20 outline-none transition-all"
          >
            <option value="All">All Statuses</option>
            <option value="Submitted">Submitted</option>
            <option value="Pending Review">Pending Review</option>
            <option value="Draft">Draft</option>
          </select>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Section</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Home Room Teacher</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Enrolled Students</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Subjects</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoadingSections ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-400 gap-2">
                      <RefreshCw className="w-8 h-8 animate-spin text-blue-900" />
                      <p className="text-sm font-semibold">Loading section report cards...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredSections.length > 0 ? (
                filteredSections.map((sec) => (
                  <tr key={sec.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4 text-sm font-black text-gray-900">{sec.displayName}</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-700">
                      {sec.homeroomTeacher ? (
                        <span className="flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                          {sec.homeroomTeacher}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {sec.enrolledCount} {sec.enrolledCount === 1 ? 'student' : 'students'}
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-500">
                      {sec.submittedSubjects} / {sec.totalSubjects} submitted
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 w-max",
                        sec.status === 'Submitted' ? "bg-green-100 text-green-700" : 
                        sec.status === 'Pending Review' ? "bg-amber-100 text-amber-700" :
                        "bg-gray-100 text-gray-500"
                      )}>
                        {sec.status === 'Submitted' && <CheckCircle className="w-3 h-3" />}
                        {sec.status === 'Pending Review' && <Clock className="w-3 h-3" />}
                        {sec.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleReviewClick(sec)}
                        className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2"
                      >
                        <Eye className="w-4 h-4" /> View Report Cards
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-400">
                      <FileCheck className="w-12 h-12 mb-3 opacity-20" />
                      <p className="text-sm font-bold text-gray-900">
                        {effectiveSearch ? 'No matching report submissions' : 'No report submissions found'}
                      </p>
                      <p className="text-xs mt-1 text-gray-500">
                        {effectiveSearch ? (
                          <>
                            No class sections match &ldquo;<span className="font-semibold text-gray-700">{rawSearch.trim()}</span>&rdquo;.
                          </>
                        ) : academicYearId ? (
                          'No class sections match the selected filter.'
                        ) : (
                          'Please select an academic year to view report submissions.'
                        )}
                      </p>
                      {localSearch && (
                        <button
                          onClick={() => setLocalSearch('')}
                          className="mt-3 px-3.5 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
                        >
                          Clear search
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review / View Report Cards Modal */}
      {isReviewModalOpen && selectedSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] w-full max-w-6xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="text-xl font-black text-gray-900">
                  Compiled Report Cards: {selectedSection.displayName}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Homeroom Teacher: {selectedSection.homeroomTeacher || 'Unassigned'} • {selectedSection.enrolledCount} Enrolled Students
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadSectionCardsPdf}
                  disabled={isDownloadingSectionCards || isLoadingReportCards || reportCards.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-800 transition-all shadow-sm disabled:opacity-50"
                  title="Download Section Report Cards PDF"
                >
                  {isDownloadingSectionCards ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  Download PDF
                </button>
                <span className={cn(
                  "px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest",
                  selectedSection.status === 'Submitted' ? "bg-green-100 text-green-700" : 
                  selectedSection.status === 'Pending Review' ? "bg-amber-100 text-amber-700" :
                  "bg-gray-100 text-gray-500"
                )}>
                  {selectedSection.status}
                </span>
              </div>
            </div>

            {/* Quick KPI stats row */}
            {reportCards.length > 0 && (
              <div className="grid grid-cols-3 gap-4 px-6 py-4 bg-gray-50/50 border-b border-gray-100">
                <div className="bg-white p-3.5 rounded-xl border border-gray-100 flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center shrink-0">
                    <FileCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Students</p>
                    <p className="text-lg font-black text-gray-900">{reportCards.length}</p>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-gray-100 flex items-center gap-3">
                  <div className="w-9 h-9 bg-emerald-50 text-emerald-700 rounded-lg flex items-center justify-center shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Class Average</p>
                    <p className="text-lg font-black text-emerald-700">{classAvg}%</p>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-gray-100 flex items-center gap-3">
                  <div className="w-9 h-9 bg-amber-50 text-amber-700 rounded-lg flex items-center justify-center shrink-0">
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Top Student</p>
                    <p className="text-sm font-black text-gray-900 truncate">
                      {topStudent ? `${topStudent.firstName} ${topStudent.lastName} (${topStudent.overallAverage}%)` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Student Search Toolbar */}
            {reportCards.length > 0 && (() => {
              const filteredModalCount = reportCards.filter((student: AdminReportCardStudent) => {
                if (!modalStudentSearch.trim()) return true;
                const q = modalStudentSearch.trim().toLowerCase();
                const fullName = `${student.firstName || ''} ${student.lastName || ''}`.toLowerCase();
                const adm = (student.admissionNo || '').toLowerCase();
                return fullName.includes(q) || adm.includes(q);
              }).length;

              return (
                <div className="px-6 py-3 bg-white border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs font-semibold text-gray-500">
                    Showing <span className="font-bold text-gray-900">{filteredModalCount}</span> of {reportCards.length} students
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search student by name or ID..."
                      value={modalStudentSearch}
                      onChange={(e) => setModalStudentSearch(e.target.value)}
                      className="w-full h-9 pl-9 pr-8 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:bg-white transition-all font-medium"
                    />
                    {modalStudentSearch && (
                      <button
                        onClick={() => setModalStudentSearch('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full"
                        title="Clear student search"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
            
            <div className="p-6 overflow-y-auto flex-1">
              {isLoadingReportCards ? (
                <div className="py-16 text-center text-gray-400">
                  <RefreshCw className="w-10 h-10 animate-spin mx-auto mb-3 text-blue-900" />
                  <p className="text-sm font-bold text-gray-700">Loading compiled report cards...</p>
                </div>
              ) : reportCards.length === 0 ? (
                <div className="border border-gray-200 rounded-2xl p-12 text-center text-gray-500">
                  <AlertCircle className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="font-bold text-gray-900">No Report Cards Compiled</p>
                  <p className="text-sm mt-1 text-gray-500">
                    No active students with compiled results found for {selectedSection.displayName}.
                  </p>
                </div>
              ) : (() => {
                const filteredModalStudents = reportCards.filter((student: AdminReportCardStudent) => {
                  if (!modalStudentSearch.trim()) return true;
                  const q = modalStudentSearch.trim().toLowerCase();
                  const fullName = `${student.firstName || ''} ${student.lastName || ''}`.toLowerCase();
                  const adm = (student.admissionNo || '').toLowerCase();
                  return fullName.includes(q) || adm.includes(q);
                });

                if (filteredModalStudents.length === 0) {
                  return (
                    <div className="border border-gray-200 rounded-2xl p-12 text-center text-gray-500">
                      <Search className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                      <p className="font-bold text-gray-900 text-sm">
                        No students found matching &ldquo;{modalStudentSearch.trim()}&rdquo;
                      </p>
                      <p className="text-xs mt-1 text-gray-500">
                        Check the student name or admission number spelling.
                      </p>
                      <button
                        onClick={() => setModalStudentSearch('')}
                        className="mt-3 px-3.5 py-1.5 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
                      >
                        Clear search
                      </button>
                    </div>
                  );
                }

                return (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-200">
                        <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest w-16">Rank</th>
                        <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Admission No</th>
                        <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Student Name</th>
                        <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Subject Breakdown</th>
                        <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Total</th>
                        <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Average</th>
                        <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Absences</th>
                        <th className="px-4 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Conduct</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredModalStudents.map((student: AdminReportCardStudent) => (
                        <tr key={student.studentId} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3 text-sm font-black text-gray-900">
                            {student.overallRank === 1 ? (
                              <span className="flex items-center gap-1 text-amber-600">
                                <Award className="w-4 h-4" /> #{student.overallRank}
                              </span>
                            ) : (
                              `#${student.overallRank}`
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-600">
                            {student.admissionNo || '—'}
                          </td>
                          <td className="px-4 py-3 text-sm font-black text-gray-900">
                            {student.firstName} {student.lastName}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {student.subjectResults && student.subjectResults.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {student.subjectResults.map((subj) => (
                                  <span key={subj.subjectId} className="px-2 py-0.5 bg-blue-50 text-blue-900 rounded-md text-xs font-semibold">
                                    {subj.subjectName}: {subj.yearlyAvg !== null ? `${subj.yearlyAvg}%` : (subj.sem1Avg !== null ? `${subj.sem1Avg}%` : '—')}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs italic">No subject results</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm font-black text-right text-gray-900">
                            {student.overallTotal}
                          </td>
                          <td className="px-4 py-3 text-sm font-black text-right text-blue-900">
                            {student.overallAverage}%
                          </td>
                          <td className="px-4 py-3 text-sm text-center font-medium text-gray-600">
                            {student.absentDays} {student.absentDays === 1 ? 'day' : 'days'}
                          </td>
                          <td className="px-4 py-3 text-sm text-center">
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-xs font-bold">
                              {student.conduct || 'A'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                );
              })()}
            </div>
            
            <div className="p-6 border-t border-gray-100 flex justify-between items-center bg-gray-50">
              <span className="text-xs text-gray-500 font-medium">
                {reportCards.length} compiled report {reportCards.length === 1 ? 'card' : 'cards'}
              </span>
              <button 
                onClick={() => setIsReviewModalOpen(false)} 
                className="px-6 py-2.5 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReportCards;
