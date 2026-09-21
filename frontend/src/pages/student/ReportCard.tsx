import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Award, GraduationCap, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { APP_NAME } from '../../config/branding';
import { getMyAttendance, getMyCourses, getMyResults, StudentSubjectResultItem, StudentGradeItem } from '../../api/students';
import { useAcademicYears } from '../../hooks/useAcademicStructure';
import { cn } from '../../lib/utils';

function getLetter(pct: number): string {
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

const ReportCard = () => {
  const { user } = useAuth();
  const { data: academicYears = [] } = useAcademicYears();
  const currentAcademicYear = academicYears.find((y) => y.isCurrent) || academicYears[0];

  // Intercept keyboard print (Ctrl+P / Cmd+P) and save (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P' || e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  const { data: courses = [], isLoading: coursesLoading, isError: coursesError } = useQuery({ 
    queryKey: ['my-courses'], 
    queryFn: getMyCourses 
  });
  const { data: resultsData, isLoading: resultsLoading, isError: resultsError } = useQuery({ 
    queryKey: ['my-results'], 
    queryFn: getMyResults 
  });
  const { data: attendance = [], isLoading: attendanceLoading, isError: attendanceError } = useQuery({ 
    queryKey: ['my-attendance'], 
    queryFn: getMyAttendance 
  });

  const subjectResults: StudentSubjectResultItem[] = resultsData?.subjectResults || [];
  const grades: StudentGradeItem[] = resultsData?.grades || [];

  const displaySubjectResults = subjectResults.length > 0 || grades.length === 0;

  const totalObtained = displaySubjectResults
    ? subjectResults.reduce((sum, r) => sum + (Number(r.marks) || 0), 0)
    : grades.reduce((sum, g) => sum + (Number(g.score) || 0), 0);

  const totalPossible = displaySubjectResults
    ? subjectResults.length * 100
    : grades.length * 100;

  const average = totalPossible > 0 ? (totalObtained / totalPossible) * 100 : null;

  const present = attendance.filter((record) => record.status === 'PRESENT').length;
  const absent = attendance.filter((record) => record.status === 'ABSENT').length;
  const late = attendance.filter((record) => record.status === 'LATE').length;
  const attendancePercentage = attendance.length ? (present / attendance.length) * 100 : null;

  const grade = courses[0]?.grade;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Print restriction banner rendered only in print media */}
      <div className="report-card-print-restriction-notice">
        <h3 className="text-base font-bold text-red-800 uppercase tracking-wider">Printing Restricted</h3>
        <p className="text-xs text-red-700 mt-1">
          This academic report card is a secure, view-only record. Printing, downloading, and exporting are restricted for student data privacy and record integrity.
        </p>
      </div>

      <div className="flex items-center justify-between no-print">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Academic Report Card</h2>
          <p className="text-sm text-gray-500">Official student academic performance record.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs font-bold select-none shadow-xs">
            <ShieldCheck className="w-4 h-4 text-blue-700" />
            View-Only Protected Document
          </span>
        </div>
      </div>

      <div 
        className="report-card-secure-view select-none bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden"
        onContextMenu={(e) => e.preventDefault()}
        onCopy={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
      >
        <div className="p-8 bg-[#1e3a8a] text-white flex flex-col md:flex-row justify-between gap-8">
          <div className="flex gap-6">
            <div className="w-24 h-24 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm shrink-0">
              <GraduationCap className="w-12 h-12 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-black mb-1">{APP_NAME}</h1>
              <p className="text-blue-200 text-sm font-bold uppercase tracking-widest">Official Academic Summary</p>
              <div className="mt-4 flex flex-wrap gap-4 text-xs text-blue-100 font-medium">
                <span>ACADEMIC YEAR: {currentAcademicYear?.year || 'Current'}</span>
                <span className="w-px h-4 bg-white/20" />
                <span>GRADE: {coursesLoading ? 'Loading...' : grade ?? 'Grade 10'}</span>
              </div>
            </div>
          </div>
          <div className="text-right flex flex-col justify-end">
            <p className="text-sm font-bold text-blue-200 uppercase mb-1">Student Information</p>
            <h2 className="text-xl font-bold">{user?.name ?? '—'}</h2>
            <p className="text-sm text-blue-100 italic">ID: {user?.idNumber ?? '—'}</p>
          </div>
        </div>

        <div className="p-8">
          {coursesError && <p className="mb-4 text-sm text-red-600">Could not load your enrolled grade information.</p>}
          {attendanceError && <p className="mb-4 text-sm text-red-600">Could not load your attendance summary.</p>}
          
          <Table className="border border-gray-100">
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="font-black text-gray-900 border-r border-gray-100">Subject</TableHead>
                <TableHead className="font-bold border-r border-gray-100">Code</TableHead>
                <TableHead className="font-bold border-r border-gray-100">Term</TableHead>
                <TableHead className="text-center font-black bg-blue-50 text-blue-900 border-r border-gray-200">Score</TableHead>
                <TableHead className="text-center font-bold border-r border-gray-100">Grade</TableHead>
                <TableHead className="text-right font-black bg-blue-900 text-white">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultsLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-gray-500">
                    Loading report results...
                  </TableCell>
                </TableRow>
              )}
              {resultsError && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-red-600">
                    Could not load report results.
                  </TableCell>
                </TableRow>
              )}
              {!resultsLoading && !resultsError && (displaySubjectResults ? subjectResults.length === 0 : grades.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-gray-500">
                    No finalized report card results are available for this academic period yet.
                  </TableCell>
                </TableRow>
              )}
              {displaySubjectResults ? (
                subjectResults.map((result) => {
                  const marks = Number(result.marks) || 0;
                  const letterGrade = getLetter(marks);

                  return (
                    <TableRow key={result.id} className="hover:bg-gray-50/50 transition-colors">
                      <TableCell className="font-black text-gray-900 border-r border-gray-100">
                        {result.subjectName || '—'}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-gray-500 border-r border-gray-100">
                        {result.subjectCode || '—'}
                      </TableCell>
                      <TableCell className="border-r border-gray-100">
                        {result.term || 'Term 1'}
                      </TableCell>
                      <TableCell className="text-center font-bold bg-blue-50/50 text-blue-900 border-r border-gray-200">
                        {marks} / 100 ({marks.toFixed(1)}%)
                      </TableCell>
                      <TableCell className="text-center font-black border-r border-gray-100">
                        <span className={cn(
                          "px-2.5 py-0.5 rounded text-xs",
                          letterGrade === 'A' ? "bg-green-100 text-green-700" :
                          letterGrade === 'B' ? "bg-blue-100 text-blue-700" :
                          letterGrade === 'C' ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        )}>
                          {letterGrade}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs font-bold text-gray-600">
                        {result.status || 'SUBMITTED'}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                grades.map((g) => {
                  const score = Number(g.score) || 0;
                  const letterGrade = getLetter(score);

                  return (
                    <TableRow key={g.id} className="hover:bg-gray-50/50 transition-colors">
                      <TableCell className="font-black text-gray-900 border-r border-gray-100">
                        {g.subject || '—'}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-gray-500 border-r border-gray-100">
                        Assessment
                      </TableCell>
                      <TableCell className="border-r border-gray-100">
                        {g.quarter || '—'}
                      </TableCell>
                      <TableCell className="text-center font-bold bg-blue-50/50 text-blue-900 border-r border-gray-200">
                        {score} / 100 ({score.toFixed(1)}%)
                      </TableCell>
                      <TableCell className="text-center font-black border-r border-gray-100">
                        <span className={cn(
                          "px-2.5 py-0.5 rounded text-xs",
                          letterGrade === 'A' ? "bg-green-100 text-green-700" :
                          letterGrade === 'B' ? "bg-blue-100 text-blue-700" :
                          letterGrade === 'C' ? "bg-amber-100 text-amber-700" :
                          "bg-red-100 text-red-700"
                        )}>
                          {letterGrade}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs font-bold text-gray-600">
                        RECORDED
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Attendance Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Attendance Records</span>
                  <span className="font-bold">{attendanceLoading ? '—' : attendanceError ? 'Not available' : attendance.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Present</span>
                  <span className="font-bold text-green-600">{attendanceLoading || attendanceError ? '—' : present}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Absent</span>
                  <span className="font-bold text-red-600">{attendanceLoading || attendanceError ? '—' : absent}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Late</span>
                  <span className="font-bold text-amber-600">{attendanceLoading || attendanceError ? '—' : late}</span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                  <span className="text-gray-600 font-semibold">Attendance Rate</span>
                  <span className="font-black text-blue-900">
                    {attendanceLoading || attendanceError || attendancePercentage === null ? 'Not available' : `${attendancePercentage.toFixed(1)}%`}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col justify-center items-center bg-blue-50/50 rounded-2xl border border-blue-100 p-8 text-center relative overflow-hidden">
              <Award className="w-16 h-16 text-blue-100 absolute -top-4 -right-4 rotate-12" />
              <h3 className="text-sm font-black text-blue-900 uppercase tracking-widest mb-2 relative z-10">Overall Performance Average</h3>
              <p className="text-5xl font-black text-blue-900 mb-2 relative z-10">
                {resultsLoading || resultsError || average === null ? '—' : `${average.toFixed(1)}%`}
              </p>
              <p className="text-xs font-bold text-blue-600 relative z-10">
                Based on {displaySubjectResults ? subjectResults.length : grades.length} recorded subject {((displaySubjectResults ? subjectResults.length : grades.length) === 1 ? 'result' : 'results')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportCard;
