import React, { useState } from 'react';
import { Users, UserPlus, ClipboardList, Building2, Loader2, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useGradeLevels, useGradeSubjects } from '../../hooks/useAcademicStructure';
import { useTeachers } from '../../hooks/useTeachers';
import { teacherAssignmentsApi, TeacherAssignment, SubjectTeacherAssignment } from '../../api/teacherAssignments';
import { toast } from 'sonner';

export const TeacherAssignments = () => {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');

  // Centralized active academic year from context
  const { academicYears, activeAcademicYearId, isLoading: loadingYears } = useAcademicYear();
  const [selectedAcademicYearId, setSelectedAcademicYearId] = useState<string>('');

  const academicYearId = selectedAcademicYearId || activeAcademicYearId;

  // Grade levels and subjects scoped to chosen academic year
  const { data: gradeLevels = [], isLoading: loadingGrades } = useGradeLevels(academicYearId);
  const { data: gradeSubjects = [], isLoading: loadingSubjects } = useGradeSubjects();
  const { data: teachers = [], isLoading: loadingTeachers } = useTeachers();

  const { data: homeRoomAssignments = [], isLoading: loadingHR } = useQuery<TeacherAssignment[]>({
    queryKey: ['teacher-assignments', 'homeroom', academicYearId],
    queryFn: async () => {
      const res = await teacherAssignmentsApi.getHomeRoomAssignments(academicYearId || undefined);
      return Array.isArray(res) ? res : (res as any)?.data || [];
    },
    enabled: !!academicYearId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: subjectAssignments = [], isLoading: loadingSub } = useQuery<SubjectTeacherAssignment[]>({
    queryKey: ['teacher-assignments', 'subject', academicYearId],
    queryFn: async () => {
      const res = await teacherAssignmentsApi.getSubjectAssignments(academicYearId || undefined);
      return Array.isArray(res) ? res : (res as any)?.data || [];
    },
    enabled: !!academicYearId,
    staleTime: 5 * 60 * 1000,
  });

  const loading = (loadingYears || loadingGrades || loadingSubjects || loadingTeachers || loadingHR || loadingSub) && !academicYears.length;

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignmentType, setAssignmentType] = useState<'HomeRoom' | 'Subject'>('HomeRoom');

  const [selectedGradeId, setSelectedGradeId] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAssignClick = (type: 'HomeRoom' | 'Subject', editItem?: any) => {
    setAssignmentType(type);
    setSelectedGradeId('');
    setSelectedSectionId('');
    setSelectedSubjectId('');
    setSelectedTeacherId('');

    if (editItem) {
      const grade = gradeLevels.find(
        (g) =>
          g.id === editItem.gradeId ||
          g.name === editItem.grade ||
          g.name === `Grade ${editItem.grade}`
      );

      if (grade) {
        setSelectedGradeId(grade.id);
        const sections = grade.ClassSection || (grade as any).classSections || (grade as any).classSection || [];
        const section = sections.find(
          (s: any) =>
            s.id === editItem.classSectionId ||
            s.id === editItem.sectionId ||
            s.name === editItem.section
        );
        if (section) setSelectedSectionId(section.id);
      }

      if (type === 'Subject' && editItem.subject) {
        setSelectedSubjectId(editItem.subject.id || editItem.subjectId);
      }

      if (editItem.teacher) {
        setSelectedTeacherId(editItem.teacher.id || editItem.teacherId);
      }
    }

    setIsAssignModalOpen(true);
  };

  const handleSave = async () => {
    if (!selectedSectionId) return toast.error('Please select a section');
    if (assignmentType === 'Subject' && !selectedSubjectId) return toast.error('Please select a subject');
    if (assignmentType === 'Subject' && !selectedTeacherId) return toast.error('Please select a teacher');

    setIsSaving(true);
    try {
      if (assignmentType === 'HomeRoom') {
        await teacherAssignmentsApi.assignHomeRoomTeacher(
          selectedSectionId,
          selectedTeacherId || null,
          academicYearId
        );
        toast.success('Home Room teacher updated');
      } else {
        await teacherAssignmentsApi.assignSubjectTeacher({
          classSectionId: selectedSectionId,
          subjectId: selectedSubjectId,
          teacherId: selectedTeacherId,
          academicYearId: academicYearId,
        });
        toast.success('Subject teacher updated');
      }
      setIsAssignModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['teacher-assignments'] });
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save assignment');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnassignSubject = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this assignment?')) return;
    try {
      await teacherAssignmentsApi.removeSubjectTeacher(id);
      toast.success('Assignment removed');
      queryClient.invalidateQueries({ queryKey: ['teacher-assignments'] });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to remove assignment');
    }
  };

  // --- CHANGED AREA 3: Safely get the teacher's name ---
  const getTeacherDisplayName = (t?: any) => {
    if (!t) return '—';
    if (t.name) return t.name;
    if (t.fullName) return t.fullName;
    if (t.firstName || t.lastName) return `${t.firstName || ''} ${t.lastName || ''}`.trim();
    return '—';
  };

  // --- CHANGED AREA 4: Safely get sections, checking for different casing styles ---
  const selectedGrade = gradeLevels.find((g) => g.id === selectedGradeId);
  const sectionsForGrade = 
    selectedGrade?.ClassSection || 
    (selectedGrade as any)?.classSections || 
    (selectedGrade as any)?.classSection || 
    [];
  
  const subjectsForGradeMap = new Map();
  gradeSubjects
    .filter(
      (gs) =>
        gs.gradeLevelId === selectedGradeId &&
        (!gs.academicYearId || gs.academicYearId === academicYearId)
    )
    .forEach((gs) => {
      if (gs.Subject?.id) {
        subjectsForGradeMap.set(gs.Subject.id, gs.Subject);
      }
    });
  const subjectsForGrade = Array.from(subjectsForGradeMap.values());

  const totalTeachers = teachers.length;
  const homeRoomCount = homeRoomAssignments.filter((a) => a.teacher).length;
  const assignedTeacherIds = new Set([
    ...homeRoomAssignments.filter((a) => a.teacher).map((a) => a.teacher!.id),
    ...subjectAssignments.filter((a) => a.teacher).map((a) => a.teacher!.id),
  ]);
  const assignedCount = assignedTeacherIds.size;
  const unassignedCount = Math.max(0, totalTeachers - assignedCount);

  const query = searchQuery?.toLowerCase() || '';
  const filteredHomeRoom = homeRoomAssignments.filter((a) => {
    const teacherName = getTeacherDisplayName(a.teacher).toLowerCase();
    return (
      (a.grade || '').toLowerCase().includes(query) ||
      (a.section || '').toLowerCase().includes(query) ||
      teacherName.includes(query)
    );
  });

  const filteredSubject = subjectAssignments.filter((a) => {
    const teacherName = getTeacherDisplayName(a.teacher).toLowerCase();
    return (
      (a.grade || '').toLowerCase().includes(query) ||
      (a.section || '').toLowerCase().includes(query) ||
      (a.subject?.name || '').toLowerCase().includes(query) ||
      teacherName.includes(query)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900">Teacher Assignments</h2>
          <p className="text-sm text-gray-500">Assign home room teachers and subject teachers to classes and sections.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative min-w-[280px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search teacher, section, grade, or subject..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-12 pl-11 pr-4 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20 outline-none transition-all font-medium shadow-sm"
            />
          </div>
          <select
            value={academicYearId}
            onChange={(e) => setSelectedAcademicYearId(e.target.value)}
            className="h-12 px-4 rounded-xl border border-gray-200 bg-white font-bold text-gray-700 focus:bg-white focus:ring-2 focus:ring-blue-900/20 outline-none transition-all shadow-sm"
            disabled={loading}
          >
            {academicYears.map((ay) => (
              <option key={ay.id} value={ay.id}>
                {ay.year}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-gray-400" />
            <p className="text-sm font-bold text-gray-500">Total Teachers</p>
          </div>
          <p className="text-2xl font-black text-gray-900">{totalTeachers}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <ClipboardList className="w-5 h-5 text-blue-500" />
            <p className="text-sm font-bold text-gray-500">Assigned Teachers</p>
          </div>
          <p className="text-2xl font-black text-blue-600">{assignedCount}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="w-5 h-5 text-purple-500" />
            <p className="text-sm font-bold text-gray-500">Home Room Sections</p>
          </div>
          <p className="text-2xl font-black text-purple-600">{homeRoomCount}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-2">
            <UserPlus className="w-5 h-5 text-amber-500" />
            <p className="text-sm font-bold text-gray-500">Unassigned</p>
          </div>
          <p className="text-2xl font-black text-amber-600">{unassignedCount}</p>
        </div>
      </div>

      {/* Main Tables */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Section A - Home Room Assignments */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[400px]">
          <div className="p-6 border-b border-gray-100">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xl font-black text-gray-900">Home Room Teachers</h3>
              <button
                type="button"
                onClick={() => handleAssignClick('HomeRoom')}
                className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" /> Assign
              </button>
            </div>
            <p className="text-sm text-gray-500">Assign one home room teacher to each class section.</p>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Section</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Teacher</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-gray-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-900 mb-2" />
                      Loading homeroom assignments...
                    </td>
                  </tr>
                ) : filteredHomeRoom.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-gray-400">No home room assignments found</td>
                  </tr>
                ) : (
                  filteredHomeRoom.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">
                        {item.grade} - {item.section}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-700">
                        {getTeacherDisplayName(item.teacher)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest',
                            item.teacher ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          )}
                        >
                          {item.teacher ? 'Assigned' : 'Unassigned'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleAssignClick('HomeRoom', item)}
                          className="px-4 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors inline-block"
                        >
                          {item.teacher ? 'Edit' : 'Assign'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section B - Subject Teacher Assignments */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[400px]">
          <div className="p-6 border-b border-gray-100">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xl font-black text-gray-900">Subject Teachers</h3>
              <button
                type="button"
                onClick={() => handleAssignClick('Subject')}
                className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" /> Assign
              </button>
            </div>
            <p className="text-sm text-gray-500">Assign teachers to subjects for each class section.</p>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Section</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Subject</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Teacher</th>
                  <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-gray-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-900 mb-2" />
                      Loading subject assignments...
                    </td>
                  </tr>
                ) : filteredSubject.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-gray-400">No subject assignments found</td>
                  </tr>
                ) : (
                  filteredSubject.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm font-bold text-gray-900">
                        {item.grade} - {item.section}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-600">{item.subject?.name}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-700">
                        {getTeacherDisplayName(item.teacher)}
                      </td>
                      <td className="px-6 py-4 text-right flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleAssignClick('Subject', item)}
                          className="px-4 py-2 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors inline-block"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUnassignSubject(item.id)}
                          className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors inline-block"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Assignment Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/20 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xl font-black text-gray-900">
                Assign {assignmentType === 'HomeRoom' ? 'Home Room' : 'Subject'} Teacher
              </h3>
              <p className="text-sm text-gray-500 mt-1">Select the details to make the assignment.</p>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Grade</label>
                  <select
                    value={selectedGradeId}
                    onChange={(e) => {
                      setSelectedGradeId(e.target.value);
                      setSelectedSectionId('');
                      setSelectedSubjectId('');
                    }}
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-900/20 outline-none transition-all text-sm font-medium"
                  >
                    <option value="">Select Grade</option>
                    {gradeLevels.filter((g) => g.ClassSection && g.ClassSection.length > 0).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Section</label>
                  <select
                    value={selectedSectionId}
                    onChange={(e) => setSelectedSectionId(e.target.value)}
                    disabled={!selectedGradeId}
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-900/20 outline-none transition-all disabled:opacity-50 text-sm font-medium"
                  >
                    <option value="">Select Section</option>
                    {sectionsForGrade.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {assignmentType === 'Subject' && (
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Subject</label>
                  <select
                    value={selectedSubjectId}
                    onChange={(e) => setSelectedSubjectId(e.target.value)}
                    disabled={!selectedGradeId || subjectsForGrade.length === 0}
                    className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-900/20 outline-none transition-all disabled:opacity-50 text-sm font-medium"
                  >
                    <option value="">
                      {subjectsForGrade.length === 0 ? 'No subjects found for grade' : 'Select Subject'}
                    </option>
                    {subjectsForGrade.map((sub: any) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Teacher</label>
                <select
                  value={selectedTeacherId}
                  onChange={(e) => setSelectedTeacherId(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-900/20 outline-none transition-all text-sm font-medium"
                >
                  <option value="">{assignmentType === 'HomeRoom' ? 'Unassigned (None)' : 'Select Teacher'}</option>
                  {teachers.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {getTeacherDisplayName(t)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                disabled={isSaving}
                className="px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-3 bg-blue-900 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-800 transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {isSaving ? 'Saving...' : 'Save Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeacherAssignments;