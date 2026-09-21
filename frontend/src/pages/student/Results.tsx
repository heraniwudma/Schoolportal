import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, TrendingUp, BookOpen, Award, Search, X } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { getMyResults, StudentGradeItem, StudentSubjectResultItem } from '../../api/students';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { cn } from '../../lib/utils';

function getLetter(pct: number): string {
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

const Results = ({ searchQuery: propSearchQuery = '' }: { searchQuery?: string } = {}) => {
  const outletCtx = useOutletContext<{ searchQuery?: string } | null>();
  const [localSearch, setLocalSearch] = useState('');
  const effectiveSearch = (localSearch || propSearchQuery || outletCtx?.searchQuery || '').trim().toLowerCase();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-results'],
    queryFn: getMyResults,
  });

  const [activeTab, setActiveTab] = useState<'subjectResults' | 'grades'>('subjectResults');

  const grades: StudentGradeItem[] = data?.grades || [];
  const subjectResults: StudentSubjectResultItem[] = data?.subjectResults || [];

  const filteredSubjectResults = subjectResults.filter((result) => {
    if (!effectiveSearch) return true;
    const nameMatch = (result.subjectName || '').toLowerCase().includes(effectiveSearch);
    const codeMatch = (result.subjectCode || '').toLowerCase().includes(effectiveSearch);
    const termMatch = (result.term || '').toLowerCase().includes(effectiveSearch);
    const statusMatch = (result.status || '').toLowerCase().includes(effectiveSearch);
    const marks = Number(result.marks) || 0;
    const letter = getLetter(marks).toLowerCase();
    const gradeMatch = letter === effectiveSearch;
    return nameMatch || codeMatch || termMatch || statusMatch || gradeMatch;
  });

  const filteredGrades = grades.filter((grade) => {
    if (!effectiveSearch) return true;
    const nameMatch = (grade.subject || '').toLowerCase().includes(effectiveSearch);
    const qtrMatch = (grade.quarter || '').toLowerCase().includes(effectiveSearch);
    const score = Number(grade.score) || 0;
    const letter = getLetter(score).toLowerCase();
    const gradeMatch = letter === effectiveSearch;
    return nameMatch || qtrMatch || gradeMatch;
  });

  const hasSubjectResults = subjectResults.length > 0;
  const hasGrades = grades.length > 0;

  // Determine current viewing list
  const showSubjectResults = activeTab === 'subjectResults' ? (hasSubjectResults || !hasGrades) : false;

  const totalScore = showSubjectResults
    ? filteredSubjectResults.reduce((sum, r) => sum + (Number(r.marks) || 0), 0)
    : filteredGrades.reduce((sum, g) => sum + (Number(g.score) || 0), 0);

  const count = showSubjectResults ? filteredSubjectResults.length : filteredGrades.length;
  const average = count > 0 ? totalScore / count : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Academic Results</h2>
          <p className="text-sm text-gray-500">Your published subject marks and assessment scores.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search subjects, codes, or grades..."
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

          {hasSubjectResults && hasGrades && (
            <div className="flex bg-gray-100 p-1 rounded-xl shrink-0">
              <button
                onClick={() => setActiveTab('subjectResults')}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                  activeTab === 'subjectResults' ? "bg-white text-blue-900 shadow-xs" : "text-gray-600 hover:text-gray-900"
                )}
              >
                Subject Results ({filteredSubjectResults.length})
              </button>
              <button
                onClick={() => setActiveTab('grades')}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                  activeTab === 'grades' ? "bg-white text-blue-900 shadow-xs" : "text-gray-600 hover:text-gray-900"
                )}
              >
                Assessment Grades ({filteredGrades.length})
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {showSubjectResults ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead className="font-bold">Subject</TableHead>
                  <TableHead className="font-bold">Code</TableHead>
                  <TableHead className="font-bold">Term / Quarter</TableHead>
                  <TableHead className="font-bold text-center">Marks Obtained</TableHead>
                  <TableHead className="font-bold text-center">Grade</TableHead>
                  <TableHead className="font-bold text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-gray-500">
                      Loading your academic results...
                    </TableCell>
                  </TableRow>
                )}
                {isError && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-red-600">
                      Could not load academic results from server.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && !isError && subjectResults.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-gray-500">
                      No finalized subject results have been published for your section yet.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && !isError && subjectResults.length > 0 && filteredSubjectResults.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-gray-500">
                      <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="font-bold text-gray-800">No subject results match your search</p>
                      <p className="text-xs text-gray-400 mt-1">No results matching "{localSearch || propSearchQuery || outletCtx?.searchQuery}".</p>
                      <button
                        onClick={() => setLocalSearch('')}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Clear search
                      </button>
                    </TableCell>
                  </TableRow>
                )}
                {filteredSubjectResults.map((result) => {
                  const marks = Number(result.marks) || 0;
                  const letterGrade = getLetter(marks);

                  return (
                    <TableRow key={result.id} className="hover:bg-gray-50/50 transition-colors">
                      <TableCell className="font-black text-gray-900">
                        {result.subjectName || '—'}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-gray-500">
                        {result.subjectCode || '—'}
                      </TableCell>
                      <TableCell className="font-medium text-gray-700">
                        {result.term || 'Term 1'}
                      </TableCell>
                      <TableCell className="text-center font-black text-gray-900">
                        <span className="text-base">{marks}</span>
                        <span className="text-xs text-gray-400 font-semibold ml-1">/ 100</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          "px-2.5 py-1 rounded-md text-xs font-black",
                          letterGrade === 'A' ? "bg-green-100 text-green-700" :
                          letterGrade === 'B' ? "bg-blue-100 text-blue-700" :
                          letterGrade === 'C' ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        )}>
                          {letterGrade}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {result.status || 'SUBMITTED'}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead className="font-bold">Subject</TableHead>
                  <TableHead className="font-bold">Quarter</TableHead>
                  <TableHead className="font-bold text-center">Components (Mid/Asgn/Quiz/CW/Final)</TableHead>
                  <TableHead className="font-bold text-center">Total Score</TableHead>
                  <TableHead className="font-bold text-center">Grade</TableHead>
                  <TableHead className="font-bold text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-gray-500">
                      Loading your assessments...
                    </TableCell>
                  </TableRow>
                )}
                {isError && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-red-600">
                      Could not load assessments from server.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && !isError && grades.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-gray-500">
                      No assessment grades recorded yet.
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && !isError && grades.length > 0 && filteredGrades.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-gray-500">
                      <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="font-bold text-gray-800">No assessment grades match your search</p>
                      <p className="text-xs text-gray-400 mt-1">No assessments matching "{localSearch || propSearchQuery || outletCtx?.searchQuery}".</p>
                      <button
                        onClick={() => setLocalSearch('')}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Clear search
                      </button>
                    </TableCell>
                  </TableRow>
                )}
                {filteredGrades.map((grade) => {
                  const score = Number(grade.score) || 0;
                  const letterGrade = getLetter(score);

                  return (
                    <TableRow key={grade.id} className="hover:bg-gray-50/50 transition-colors">
                      <TableCell className="font-black text-gray-900">
                        {grade.subject || '—'}
                      </TableCell>
                      <TableCell className="font-medium text-gray-700">{grade.quarter || '—'}</TableCell>
                      <TableCell className="text-center text-xs text-gray-600 font-medium">
                        Mid: {grade.mid ?? 0} | Asgn: {grade.assignment ?? 0} | Quiz: {grade.quiz ?? 0} | CW: {grade.classwork ?? 0} | Final: {grade.final ?? 0}
                      </TableCell>
                      <TableCell className="text-center font-black text-gray-900">
                        <div>{score} / 100</div>
                        <div className="text-xs text-gray-400 font-semibold">{score.toFixed(1)}%</div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={cn(
                          "px-2.5 py-1 rounded-md text-xs font-black",
                          letterGrade === 'A' ? "bg-green-100 text-green-700" :
                          letterGrade === 'B' ? "bg-blue-100 text-blue-700" :
                          letterGrade === 'C' ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        )}>
                          {letterGrade}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs text-gray-500">
                        {grade.createdAt ? new Date(grade.createdAt).toLocaleDateString() : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="bg-[#1e3a8a] text-white p-6 rounded-2xl shadow-lg h-fit space-y-4">
          <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-blue-200" />
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-blue-200">Overall Average</h3>
            <p className="text-4xl font-black mt-1 tracking-tight">{average.toFixed(1)}%</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-blue-100 font-semibold pt-2 border-t border-white/10">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Calculated across {count} subject {count === 1 ? 'record' : 'records'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Results;
