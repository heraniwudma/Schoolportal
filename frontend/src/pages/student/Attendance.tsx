import React, { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../lib/api';

const StudentAttendance = ({ searchQuery: propSearchQuery = '' }: { searchQuery?: string } = {}) => {
  const outletCtx = useOutletContext<{ searchQuery?: string } | null>();
  const [localSearch, setLocalSearch] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const effectiveSearch = (localSearch || propSearchQuery || outletCtx?.searchQuery || '').trim().toLowerCase();

  const filteredRecords = attendanceRecords.filter((record: any) => {
    if (!effectiveSearch) return true;
    const dateStr = record?.date ? new Date(record.date).toLocaleDateString().toLowerCase() : '';
    const rawDateStr = (record?.date || '').toLowerCase();
    const periodStr = `period ${record?.period || 1}`.toLowerCase();
    const subjectStr = (record?.subject || record?.ClassSection?.name || record?.className || 'General Session').toLowerCase();
    const statusStr = (record?.status || 'PRESENT').toLowerCase();
    return (
      dateStr.includes(effectiveSearch) ||
      rawDateStr.includes(effectiveSearch) ||
      periodStr.includes(effectiveSearch) ||
      subjectStr.includes(effectiveSearch) ||
      statusStr.includes(effectiveSearch)
    );
  });

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setErrorMessage('');

    // api.get returns the data payload directly because of res.json() in api.ts
    api.get<any>('/students/me/attendance')
      .then((data) => {
        if (!isMounted) return;

        const recordsList = Array.isArray(data) 
          ? data 
          : Array.isArray(data?.records) 
            ? data.records 
            : Array.isArray(data?.data) 
              ? data.data 
              : [];

        setAttendanceRecords(recordsList);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch student attendance:", err);
        if (!isMounted) return;
        setErrorMessage(err?.message || 'Failed to load your attendance records.');
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Attendance History</h2>
          <p className="text-sm text-gray-500">View your personal attendance records and status.</p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search date, subject, status..."
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

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Attendance Log</h3>
          <span className="text-xs bg-blue-50 text-blue-600 font-semibold px-2.5 py-1 rounded-full">
            {filteredRecords.length} {filteredRecords.length === 1 ? 'Record' : 'Records'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-widest">
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Period</th>
                <th className="px-6 py-4">Subject / Class</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
                    Loading your attendance records...
                  </td>
                </tr>
              )}

              {errorMessage && !isLoading && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-red-600">
                    {errorMessage}
                  </td>
                </tr>
              )}

              {!isLoading && !errorMessage && attendanceRecords.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-500">
                    No attendance records found.
                  </td>
                </tr>
              )}

              {!isLoading && !errorMessage && attendanceRecords.length > 0 && filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                    <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="font-bold text-gray-800">No attendance records match your search</p>
                    <p className="text-xs text-gray-400 mt-1">
                      No records found matching "{localSearch || propSearchQuery || outletCtx?.searchQuery}".
                    </p>
                    <button
                      onClick={() => setLocalSearch('')}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                      Clear search
                    </button>
                  </td>
                </tr>
              )}

              {!isLoading && filteredRecords.map((record: any, index: number) => (
                <tr key={record?.id || index} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {record?.date ? new Date(record.date).toLocaleDateString() : 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    Period {record?.period || 1}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {record?.subject || record?.ClassSection?.name || record?.className || 'General Session'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      record?.status === 'PRESENT' ? 'bg-green-50 text-green-700 border border-green-200' :
                      record?.status === 'ABSENT' ? 'bg-red-50 text-red-700 border border-red-200' :
                      'bg-orange-50 text-orange-700 border border-orange-200'
                    }`}>
                      {record?.status || 'PRESENT'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StudentAttendance;
