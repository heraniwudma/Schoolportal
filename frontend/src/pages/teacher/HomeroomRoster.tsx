import React, { useEffect, useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { getAcademicYears } from '../../api/academicStructure';
import { api } from '../../lib/api';

type SubjectScore = { subjectId: string; subject: string; terms: Array<number | null>; semesterAverages: Array<number | null>; yearlyAverage: number | null };
type RosterRow = {
  studentId: string;
  admissionNo: string;
  studentName: string;
  subjectScores: SubjectScore[];
  sum: number | null;
  average: number | null;
  rank: number | null;
  absentDays: number;
  conduct: string | null;
  isComplete?: boolean;
  missingSubjects?: string[];
  requiredSubjectCount?: number;
  completedSubjectCount?: number;
  status?: string;
};
type ConsolidatedRoster = { section: { name: string; grade?: string; homeroomTeacher: string | null }; subjects: Array<{ id: string; name: string; code: string }>; students: RosterRow[] };

export default function HomeroomRoster() {
  const [localSearch, setLocalSearch] = useState('');
  const effectiveSearch = localSearch.trim().toLowerCase();

  const [data, setData] = useState<ConsolidatedRoster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [context, years] = await Promise.all([
          api.get<{ assignedSection: { id: string; academicYearId?: string } | null; academicYearId?: string }>('/teachers/me/homeroom-context'),
          getAcademicYears(),
        ]);
        const targetYearId = context.assignedSection?.academicYearId || context.academicYearId;
        const year = (targetYearId ? years.find((item) => item.id === targetYearId) : null) || years.find((item) => item.isCurrent) || years[0];
        if (!context.assignedSection || !year) throw new Error('No homeroom section or academic year is assigned');
        setData(await api.get<ConsolidatedRoster>(`/roster/consolidated?academicYearId=${year.id}&classSectionId=${context.assignedSection.id}`));
      } catch (err: any) { setError(err.message || 'Could not load the consolidated roster'); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const filteredStudents = useMemo(() => {
    if (!data?.students) return [];
    if (!effectiveSearch) return data.students;
    return data.students.filter((s) => {
      return (
        (s.studentName || '').toLowerCase().includes(effectiveSearch) ||
        (s.admissionNo || '').toLowerCase().includes(effectiveSearch) ||
        (s.conduct || '').toLowerCase().includes(effectiveSearch)
      );
    });
  }, [data?.students, effectiveSearch]);

  if (loading) return <p className="text-gray-500">Preparing consolidated roster...</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!data) return null;
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Consolidated Roster</h1>
          <p className="text-sm text-gray-500">{data.section.grade ? `${data.section.grade} - ` : ''}{data.section.name} | Submitted subject results</p>
        </div>
        <div className="relative min-w-[200px] sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            aria-label="Search students"
            placeholder="Search student, ID..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 shadow-xs"
          />
          {effectiveSearch && (
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
      </div>
      <div className="bg-white border rounded-xl overflow-auto">
        <table className="min-w-[1500px] w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-left">No.</th>
              <th className="p-3 text-left">Student</th>
              <th className="p-3 text-center">Status</th>
              {data.subjects.map((subject) => (
                <React.Fragment key={subject.id}>
                  <th className="p-3 text-center" colSpan={7}>{subject.name}</th>
                </React.Fragment>
              ))}
              <th className="p-3">Sum</th>
              <th className="p-3">Average</th>
              <th className="p-3">Rank</th>
              <th className="p-3">Abs D</th>
              <th className="p-3">Conduct</th>
            </tr>
            <tr>
              <th />
              <th />
              <th />
              {data.subjects.map((subject) => (
                <React.Fragment key={`${subject.id}-terms`}>
                  <th className="p-2">1st</th>
                  <th className="p-2">2nd</th>
                  <th className="p-2">3rd</th>
                  <th className="p-2">4th</th>
                  <th className="p-2">Sem A</th>
                  <th className="p-2">Sem B</th>
                  <th className="p-2">Year</th>
                </React.Fragment>
              ))}
              <th />
              <th />
              <th />
              <th />
              <th />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredStudents.length === 0 && data.students.length > 0 ? (
              <tr>
                <td colSpan={data.subjects.length * 7 + 8} className="p-8 text-center text-gray-500">
                  <div className="space-y-2">
                    <p className="font-bold text-gray-700">No students match &ldquo;{effectiveSearch}&rdquo;</p>
                    <button
                      type="button"
                      onClick={() => setLocalSearch('')}
                      className="px-3 py-1 bg-blue-50 text-blue-900 rounded-lg text-xs font-semibold hover:bg-blue-100"
                    >
                      Clear search
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              filteredStudents.map((student, index) => (
              <tr key={student.studentId}>
                <td className="p-3">{index + 1}</td>
                <td className="p-3 font-semibold whitespace-nowrap">{student.admissionNo} {student.studentName}</td>
                <td className="p-3 text-center">
                  {student.isComplete ? (
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-green-100 text-green-800">
                      Complete
                    </span>
                  ) : (
                    <div className="flex flex-col items-center">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800">
                        Incomplete
                      </span>
                      {student.missingSubjects && student.missingSubjects.length > 0 && (
                        <span className="text-[10px] text-red-600 mt-0.5 max-w-[130px] truncate" title={`Missing: ${student.missingSubjects.join(', ')}`}>
                          Missing: {student.missingSubjects.join(', ')}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                {student.subjectScores.map((score) => (
                  <React.Fragment key={score.subjectId}>
                    <>{score.terms.map((value, termIndex) => <td className="p-3 text-center" key={`${score.subject}-${termIndex}`}>{value ?? '-'}</td>)}</>
                    <td className="p-3 text-center">{score.semesterAverages[0] ?? '-'}</td>
                    <td className="p-3 text-center">{score.semesterAverages[1] ?? '-'}</td>
                    <td className="p-3 text-center font-semibold">{score.yearlyAverage ?? '-'}</td>
                  </React.Fragment>
                ))}
                <td className="p-3 text-center font-semibold">{student.sum != null ? student.sum : '—'}</td>
                <td className="p-3 text-center">{student.average != null ? student.average.toFixed(2) : '—'}</td>
                <td className="p-3 text-center font-bold">{student.rank != null ? student.rank : '—'}</td>
                <td className="p-3 text-center">{student.absentDays}</td>
                <td className="p-3 text-center">{student.conduct || '-'}</td>
              </tr>
            ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
