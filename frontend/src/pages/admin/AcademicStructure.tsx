import React, { useState } from 'react';
import { Layers, Plus, Edit2, Trash2, GraduationCap, Users, Calendar, CheckCircle, Loader2, Search, X } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createAcademicYear, createGradeLevel, createSection, getSubjects, createSubject } from '../../api/academicStructure';
import { useAcademicYear } from '../../context/AcademicYearContext';
import { useGradeLevels, useSubjects } from '../../hooks/useAcademicStructure';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { PromotionDialog } from '../../components/admin/PromotionDialog';
import { AssignSubjectsDialog } from '../../components/admin/AssignSubjectsDialog';

const AcademicStructure = () => {
  const queryClient = useQueryClient();
  const outletContext = useOutletContext<{ searchQuery?: string }>();
  const globalSearchQuery = outletContext?.searchQuery || '';
  const [localSearch, setLocalSearch] = useState('');
  const {
    academicYears,
    activeAcademicYear,
    activeAcademicYearId,
    activateYear,
    isActivating,
    isLoading: loadingYears,
  } = useAcademicYear();

  const { data: gradeLevels = [], isLoading: loadingGrades, isError: errorGrades } = useGradeLevels(activeAcademicYearId);
  const { data: subjects = [], isLoading: loadingSubjects, isError: errorSubjects } = useSubjects();

  const isLoading = loadingYears || loadingGrades || loadingSubjects;
  const isError = errorGrades || errorSubjects;

  // State for dialogs
  const [isYearOpen, setIsYearOpen] = useState(false);
  const [isClassOpen, setIsClassOpen] = useState(false);
  const [isSectionOpen, setIsSectionOpen] = useState(false);
  const [isSubjectOpen, setIsSubjectOpen] = useState(false);

  const [selectedGradeId, setSelectedGradeId] = useState<string | null>(null);
  const [sectionFormGradeId, setSectionFormGradeId] = useState<string>('');

  // Forms state
  const [yearForm, setYearForm] = useState({ label: '', startDate: '', endDate: '' });
  const [classForm, setClassForm] = useState({ name: '', gradeNumber: '' });
  const [sectionForm, setSectionForm] = useState({ name: '' });
  const [subjectForm, setSubjectForm] = useState({ name: '', code: '' });

  const createYearMutation = useMutation({
    mutationFn: createAcademicYear,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academicYears'] });
      toast.success('Academic Year created successfully');
      setIsYearOpen(false);
      setYearForm({ label: '', startDate: '', endDate: '' });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to create academic year'),
  });

  const createClassMutation = useMutation({
    mutationFn: createGradeLevel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gradeLevels'] });
      toast.success('Class created successfully');
      setIsClassOpen(false);
      setClassForm({ name: '', gradeNumber: '' });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to create class'),
  });

  const createSectionMutation = useMutation({
    mutationFn: createSection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gradeLevels'] });
      toast.success('Section created successfully');
      setIsSectionOpen(false);
      setSectionForm({ name: '' });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to create section'),
  });

  const createSubjectMutation = useMutation({
    mutationFn: createSubject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      toast.success('Subject created successfully');
      setIsSubjectOpen(false);
      setSubjectForm({ name: '', code: '' });
    },
    onError: (e: any) => toast.error(e.message || 'Failed to create subject')
  });

  const currentYear = academicYears.find(y => y.isCurrent);
  const activeGradeLevels = gradeLevels.filter((g) => g.ClassSection && g.ClassSection.length > 0);
  const totalStudents = activeGradeLevels.reduce((acc, grade) => acc + (grade.StudentEnrollment?.length || 0), 0);

  const rawSearch = localSearch || globalSearchQuery || '';
  const q = rawSearch.trim().toLowerCase();

  const filteredGradeLevels = activeGradeLevels.filter((g) => {
    if (!q) return true;
    const gradeMatch = (g.name || '').toLowerCase().includes(q);
    const sectionMatch = (g.ClassSection || []).some((s: any) => (s.name || '').toLowerCase().includes(q));
    return gradeMatch || sectionMatch;
  });

  const filteredSubjects = subjects.filter((s) => {
    if (!q) return true;
    const nameMatch = (s.name || '').toLowerCase().includes(q);
    const codeMatch = (s.code || '').toLowerCase().includes(q);
    return nameMatch || codeMatch;
  });

  return (
    <div className="space-y-8 pb-20">
      
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-blue-900 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-gray-500 font-bold">Loading academic structure...</p>
        </div>
      )}

      {isError && !isLoading && (
        <div className="bg-red-50 text-red-600 p-6 rounded-2xl text-center border border-red-100">
          <p className="font-bold">Unable to load academic structure. Please try again.</p>
        </div>
      )}

      {!isLoading && !isError && (
        <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-gray-900">Academic Structure</h2>
          <p className="text-gray-500 mt-1">Configure classes, sections, and subject assignments.</p>
        </div>
        <div className="flex gap-3">
          <Dialog open={isSectionOpen && selectedGradeId === null} onOpenChange={(open) => {
            setIsSectionOpen(open);
            if (!open) {
              setSelectedGradeId(null);
              setSectionForm({ name: '' });
            }
          }}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-2 px-6 py-3 bg-blue-900 text-white rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-blue-800 transition-colors shadow-sm">
                <Plus className="w-4 h-4" />
                New Section
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Section to Academic Year</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label>Grade Level</Label>
                  <select
                    className="w-full h-11 px-3 mt-1 rounded-xl border border-gray-200 bg-gray-50 font-medium text-sm"
                    value={sectionFormGradeId || ''}
                    onChange={(e) => setSectionFormGradeId(e.target.value)}
                  >
                    <option value="">Select Grade Level</option>
                    {gradeLevels.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Section Code (e.g., A, B, North)</Label>
                  <Input value={sectionForm.name} onChange={e => setSectionForm({ name: e.target.value })} placeholder="A" />
                </div>
                <Button
                  onClick={() => {
                    const targetGradeId = sectionFormGradeId || selectedGradeId;
                    if (!targetGradeId) {
                      toast.error('Please select a grade level');
                      return;
                    }
                    createSectionMutation.mutate({ gradeLevelId: targetGradeId, name: sectionForm.name });
                  }}
                  disabled={createSectionMutation.isPending}
                >
                  Add Section
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isClassOpen} onOpenChange={setIsClassOpen}>
            <DialogTrigger asChild>
              <button className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-black text-gray-700 uppercase tracking-widest hover:bg-gray-50 transition-colors shadow-sm">
                <Plus className="w-4 h-4" />
                New Class
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Class / Grade Level</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label>Class Name (e.g., Grade 10)</Label>
                  <Input value={classForm.name} onChange={e => setClassForm({ ...classForm, name: e.target.value })} />
                </div>
                <div>
                  <Label>Grade Number (Optional)</Label>
                  <Input type="number" value={classForm.gradeNumber} onChange={e => setClassForm({ ...classForm, gradeNumber: e.target.value })} />
                </div>
                <Button onClick={() => createClassMutation.mutate({ name: classForm.name, gradeNumber: parseInt(classForm.gradeNumber) || undefined })} disabled={createClassMutation.isPending}>
                  Create Class
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="bg-white p-4 px-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search grade levels, sections, or core subjects..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full pl-10 pr-9 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
          {localSearch && (
            <button
              onClick={() => setLocalSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5 rounded-full hover:bg-gray-200/50 transition-colors"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
          <p className="text-sm font-bold text-gray-500 mb-1">Current Academic Year</p>
          <p className="text-xl font-black text-blue-900">{currentYear ? currentYear.year : 'None Set'}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
          <p className="text-sm font-bold text-gray-500 mb-1">Total Grades</p>
          <p className="text-xl font-black text-blue-900">{activeGradeLevels.length}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
          <p className="text-sm font-bold text-gray-500 mb-1">Total Sections</p>
          <p className="text-xl font-black text-blue-900">{activeGradeLevels.reduce((acc, g) => acc + g.ClassSection.length, 0)}</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
          <p className="text-sm font-bold text-gray-500 mb-1">Enrolled Students</p>
          <p className="text-xl font-black text-blue-900">{totalStudents}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Classes List */}
        <div className="lg:col-span-2 space-y-6">
          <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] px-2">Active Grade Levels</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredGradeLevels.map((c) => (
              <div key={c.id} className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 group hover:border-blue-900/20 transition-all">
                <div className="flex items-start justify-between mb-8">
                  <div className="w-16 h-16 bg-blue-900 rounded-[1.5rem] flex items-center justify-center text-white">
                    <GraduationCap className="w-8 h-8" />
                  </div>
                </div>
                <h4 className="text-2xl font-black text-gray-900 mb-2">{c.name}</h4>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-bold text-gray-600">{c.ClassSection.length} Sections</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-bold text-gray-600">{c.StudentEnrollment?.length || 0} Students</span>
                  </div>
                </div>
                <div className="mt-8 pt-8 border-t border-gray-100 flex gap-2 flex-wrap">
                  {c.ClassSection.map((s: any) => (
                    <span key={s.id} className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-xs font-black text-blue-900 border border-transparent hover:border-blue-900 transition-colors cursor-pointer">
                      {s.name}
                    </span>
                  ))}
                  
                  <Dialog open={isSectionOpen && selectedGradeId === c.id} onOpenChange={(open) => {
                    setIsSectionOpen(open);
                    if (open) {
                      setSelectedGradeId(c.id);
                      setSectionFormGradeId(c.id);
                    } else {
                      setSelectedGradeId(null);
                      setSectionForm({ name: '' });
                    }
                  }}>
                    <DialogTrigger asChild>
                      <button className="w-10 h-10 border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:text-blue-900 hover:border-blue-900 transition-all">
                        <Plus className="w-4 h-4" />
                      </button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Section to {c.name}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div>
                          <Label>Section Name (e.g., A, B, North)</Label>
                          <Input value={sectionForm.name} onChange={e => setSectionForm({ name: e.target.value })} />
                        </div>
                        <Button onClick={() => createSectionMutation.mutate({ gradeLevelId: c.id, name: sectionForm.name })} disabled={createSectionMutation.isPending}>
                          Add Section
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            ))}
            {filteredGradeLevels.length === 0 && !loadingGrades && (
              <div className="col-span-full py-10 text-center text-gray-400 font-bold">
                {q ? `No grade levels found matching "${rawSearch.trim()}"` : 'No active grade levels found for the selected academic year.'}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8">
          {/* Academic Years List */}
          <div className="space-y-6">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] px-2 flex justify-between items-center">
              Academic Years
              <Dialog open={isYearOpen} onOpenChange={setIsYearOpen}>
                <DialogTrigger asChild>
                  <button className="text-blue-600 hover:text-blue-800"><Plus className="w-4 h-4" /></button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Academic Year</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div>
                      <Label>Label (e.g. 2025/2026)</Label>
                      <Input value={yearForm.label} onChange={e => setYearForm({ ...yearForm, label: e.target.value })} />
                    </div>
                    <div>
                      <Label>Start Date</Label>
                      <Input type="date" value={yearForm.startDate} onChange={e => setYearForm({ ...yearForm, startDate: e.target.value })} />
                    </div>
                    <div>
                      <Label>End Date</Label>
                      <Input type="date" value={yearForm.endDate} onChange={e => setYearForm({ ...yearForm, endDate: e.target.value })} />
                    </div>
                    <Button onClick={() => createYearMutation.mutate(yearForm)} disabled={createYearMutation.isPending}>Create Year</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </h3>
            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 space-y-4">
              {academicYears.map((y) => (
                <div key={y.id} className={`flex items-center justify-between p-4 rounded-2xl border ${y.isCurrent ? 'border-blue-900 bg-blue-50/50' : 'border-gray-100'}`}>
                  <div>
                    <p className="text-sm font-black text-gray-900">{y.year}</p>
                    <p className="text-xs text-gray-500">{new Date(y.startDate).toLocaleDateString()} - {new Date(y.endDate).toLocaleDateString()}</p>
                  </div>
                  {y.isCurrent ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-blue-700 bg-blue-100 px-3 py-1 rounded-full"><CheckCircle className="w-3 h-3"/> Active</span>
                  ) : (
                    <button
                      onClick={() => activateYear(y.id)}
                      disabled={isActivating}
                      className="text-xs font-bold text-gray-400 hover:text-blue-600 disabled:opacity-50"
                    >
                      {isActivating ? 'Activating...' : 'Activate'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Subjects List */}
          <div className="space-y-6">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] px-2">Core Subjects</h3>
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
              <div className="space-y-6">
                {filteredSubjects.map((s) => (
                  <div key={s.id} className="flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-blue-900 font-bold text-xs uppercase">
                        {s.code.substring(0, 3)}
                      </div>
                      <div>
                        <p className="text-sm font-black text-gray-900">{s.name}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{s.code}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredSubjects.length === 0 && !loadingSubjects && (
                  <div className="text-center text-xs text-gray-400 font-bold">
                    {q ? `No subjects matching "${rawSearch.trim()}"` : 'No subjects found.'}
                  </div>
                )}
                
                <Dialog open={isSubjectOpen} onOpenChange={setIsSubjectOpen}>
                  <DialogTrigger asChild>
                    <button className="w-full py-4 border-2 border-dashed border-gray-100 rounded-2xl text-xs font-black text-gray-400 uppercase tracking-widest hover:border-blue-900 hover:text-blue-900 transition-all flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4" />
                      Add Subject
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Subject</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div>
                        <Label>Subject Name</Label>
                        <Input value={subjectForm.name} onChange={e => setSubjectForm({ ...subjectForm, name: e.target.value })} />
                      </div>
                      <div>
                        <Label>Course Code</Label>
                        <Input value={subjectForm.code} onChange={e => setSubjectForm({ ...subjectForm, code: e.target.value })} />
                      </div>
                      <Button onClick={() => createSubjectMutation.mutate(subjectForm)} disabled={createSubjectMutation.isPending}>Add Subject</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            
            <AssignSubjectsDialog />
            
          </div>
        </div>
      </div>
      
      <div className="mt-8 border-t border-gray-100 pt-8">
         <PromotionDialog />
      </div>
        </>
      )}

      <Toaster position="top-right" />
    </div>
  );
};

export default AcademicStructure;
