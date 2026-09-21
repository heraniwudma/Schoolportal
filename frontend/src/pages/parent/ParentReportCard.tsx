import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParent } from '../../context/ParentContext';
import { getChildReportCard } from '../../api/parents';
import { 
  Award, 
  ShieldCheck, 
  GraduationCap, 
  Calendar, 
  Users, 
  AlertCircle, 
  RefreshCw,
  FileCheck
} from 'lucide-react';
import { ChildSelector } from '../../components/parent/ChildSelector';
import { APP_NAME } from '../../config/branding';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../i18n/LanguageContext';

const ParentReportCard: React.FC = () => {
  const { 
    childrenList, 
    selectedChild, 
    selectedChildId, 
    isLoading: parentLoading, 
    error: parentError, 
    refetchChildren 
  } = useParent();
  const { t } = useTranslation();

  const [selectedTermId, setSelectedTermId] = useState<string>('');

  // When child changes, reset selectedTermId so it picks the new child's default term
  useEffect(() => {
    setSelectedTermId('');
  }, [selectedChildId]);

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

  // Query child report card
  const {
    data: reportCardResponse,
    isLoading: reportCardLoading,
    isError: reportCardError,
    error: fetchError,
    refetch: refetchReportCard,
  } = useQuery({
    queryKey: ['parent-child-report-card-page', selectedChildId, selectedTermId],
    queryFn: () => (selectedChildId ? getChildReportCard(selectedChildId, selectedTermId || undefined) : null),
    enabled: !!selectedChildId,
  });

  // Auto-sync selectedTermId from API response if not explicitly picked
  useEffect(() => {
    if (reportCardResponse?.selectedTermId && !selectedTermId) {
      setSelectedTermId(reportCardResponse.selectedTermId);
    }
  }, [reportCardResponse?.selectedTermId, selectedTermId]);

  if (parentLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-900 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-gray-500">{t('parent.reportCard.loading')}</span>
        </div>
      </div>
    );
  }

  if (parentError) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="p-6 bg-red-50 border border-red-200 rounded-3xl text-red-700 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-bold text-red-900">{t('parent.reportCard.loadError')}</h3>
            <p className="text-sm text-red-700">{parentError}</p>
            <button
              onClick={() => void refetchChildren()}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('common.actions.tryAgain')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Case 0: Zero linked children
  if (childrenList.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="p-10 bg-white rounded-3xl shadow-sm border border-gray-100 space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-900 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
            <Users className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{t('parent.reportCard.emptyTitle')}</h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
            {t('parent.reportCard.emptyDesc')}
          </p>
          <div className="pt-2">
            <Link
              to="/account"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors"
            >
              {t('common.nav.myAccount')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const childName = selectedChild?.fullName || 'Student';
  const availableTerms = reportCardResponse?.availableTerms || [];
  const currentReportCard = reportCardResponse?.reportCard;
  const academicInfo = currentReportCard?.academicInfo;
  const subjects = currentReportCard?.subjects || [];
  const overall = currentReportCard?.overall;
  const attendance = currentReportCard?.attendance;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Print restriction banner rendered only in print media */}
      <div className="report-card-print-restriction-notice">
        <h3 className="text-base font-bold text-red-800 uppercase tracking-wider">
          {t('parent.reportCard.printRestrictedTitle')}
        </h3>
        <p className="text-xs text-red-700 mt-1">
          {t('parent.reportCard.printRestrictedMessage')}
        </p>
      </div>

      {/* Top Action Bar (hidden on print) */}
      <div className="no-print bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900">{t('parent.reportCard.title')}</h2>
          <p className="text-sm text-gray-500">{t('parent.reportCard.subtitle')}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {childrenList.length > 1 && (
            <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl border border-gray-200/70">
              <span className="text-xs font-semibold text-gray-500 pl-2">{t('common.childSelector.studentLabel')}</span>
              <ChildSelector />
            </div>
          )}

          <span className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs font-bold select-none shadow-xs">
            <ShieldCheck className="w-4 h-4 text-blue-700" />
            {t('parent.reportCard.viewOnlyBadge')}
          </span>
        </div>
      </div>

      {/* Term Selection Bar (hidden on print) */}
      {availableTerms.length > 0 && (
        <div className="no-print bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-900" />
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{t('parent.reportCard.selectTerm')}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {availableTerms.map((term) => {
              const isSelected = (selectedTermId || reportCardResponse?.selectedTermId) === term.id;
              return (
                <button
                  key={term.id}
                  type="button"
                  onClick={() => setSelectedTermId(term.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-blue-900 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {term.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* API Error State */}
      {reportCardError && (
        <div className="no-print p-6 bg-red-50 border border-red-200 rounded-2xl text-red-700 flex items-start gap-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-bold text-red-900">{t('parent.reportCard.apiError')}</h4>
            <p className="text-xs text-red-700">{(fetchError as Error)?.message || 'Network error occurred.'}</p>
            <button
              onClick={() => void refetchReportCard()}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> {t('common.actions.retry')}
            </button>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {reportCardLoading && (
        <div className="bg-white rounded-3xl p-12 shadow-sm border border-gray-100 text-center space-y-4">
          <div className="w-10 h-10 border-4 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-sm font-medium text-gray-600">{t('parent.reportCard.generating', { name: childName })}</p>
        </div>
      )}

      {/* Empty State: No Published Report Card */}
      {!reportCardLoading && !reportCardError && !currentReportCard && (
        <div className="bg-white rounded-3xl p-12 shadow-sm border border-gray-100 text-center space-y-4 max-w-lg mx-auto">
          <div className="w-16 h-16 bg-blue-50 text-blue-900 rounded-2xl flex items-center justify-center mx-auto">
            <FileCheck className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-gray-900">{t('parent.reportCard.noPublishedTitle')}</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            {availableTerms.length === 0
              ? t('parent.reportCard.noTerms', { name: childName })
              : t('parent.reportCard.notComputed')}
          </p>
        </div>
      )}

      {/* Official Report Card Secure Document */}
      {!reportCardLoading && !reportCardError && currentReportCard && (
        <div 
          className="report-card-secure-view select-none bg-white rounded-3xl shadow-xl border border-gray-200 overflow-hidden"
          onContextMenu={(e) => e.preventDefault()}
          onCopy={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
        >
          {/* Header Banner */}
          <div className="p-8 bg-[#1e3a8a] text-white flex flex-col md:flex-row justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm flex-shrink-0">
                <GraduationCap className="w-10 h-10 text-white" />
              </div>
              <div className="space-y-1">
                <h1 className="text-2xl font-black tracking-tight">{APP_NAME}</h1>
                <p className="text-blue-200 text-xs font-bold uppercase tracking-widest">{t('parent.reportCard.officialHeading')}</p>
                <div className="flex items-center gap-3 text-xs text-blue-100 font-medium pt-2 flex-wrap">
                  <span>{t('parent.reportCard.academicYearLabel')} <strong>{academicInfo?.academicYear || t('parent.reportCard.currentLabel')}</strong></span>
                  <span className="w-px h-3 bg-white/30" />
                  <span>{t('parent.reportCard.termLabel')} <strong>{academicInfo?.term || t('parent.reportCard.currentTermLabel')}</strong></span>
                </div>
              </div>
            </div>

            <div className="text-left md:text-right flex flex-col justify-end space-y-1 border-t md:border-t-0 border-white/10 pt-4 md:pt-0">
              <span className="text-[11px] font-bold text-blue-200 uppercase tracking-wider">{t('parent.reportCard.studentInfoHeading')}</span>
              <h3 className="text-lg font-bold">
                {currentReportCard.student.firstName} {currentReportCard.student.lastName}
              </h3>
              <p className="text-xs text-blue-100">
                {t('parent.reportCard.admissionNoLabel')} <span className="font-mono font-bold">{currentReportCard.student.admissionNo}</span>
              </p>
              <p className="text-xs text-blue-100">
                {t('parent.reportCard.classLabel')} <span className="font-bold">{academicInfo?.grade} • {academicInfo?.section}</span>
              </p>
            </div>
          </div>

          {/* Document Content */}
          <div className="p-8 space-y-8">
            {/* Subject Grades Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border border-gray-200 rounded-xl overflow-hidden">
                <thead>
                  <tr className="bg-gray-50/90 text-xs font-bold text-gray-600 uppercase tracking-wider border-b border-gray-200">
                    <th className="px-5 py-3.5 border-r border-gray-200">{t('parent.reportCard.colSubjectName')}</th>
                    <th className="px-5 py-3.5 border-r border-gray-200 text-center">{t('parent.reportCard.colCode')}</th>
                    <th className="px-5 py-3.5 border-r border-gray-200 text-center">{t('parent.reportCard.colMarksObtained')}</th>
                    <th className="px-5 py-3.5 border-r border-gray-200 text-center">{t('parent.reportCard.colMaxMarks')}</th>
                    <th className="px-5 py-3.5 border-r border-gray-200 text-center bg-blue-50/50 text-blue-900">{t('parent.reportCard.colScorePercent')}</th>
                    <th className="px-5 py-3.5 text-center font-black bg-blue-900 text-white">{t('parent.reportCard.colGrade')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-sm">
                  {subjects.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-gray-500">
                        {t('parent.reportCard.noSubjectGrades')}
                      </td>
                    </tr>
                  )}
                  {subjects.map((sub, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3.5 font-bold text-gray-900 border-r border-gray-200">
                        {sub.name}
                      </td>
                      <td className="px-5 py-3.5 text-center text-xs font-mono text-gray-500 border-r border-gray-200">
                        {sub.code || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-center font-semibold text-gray-800 border-r border-gray-200">
                        {sub.score}
                      </td>
                      <td className="px-5 py-3.5 text-center text-gray-500 border-r border-gray-200">
                        {sub.maxScore}
                      </td>
                      <td className="px-5 py-3.5 text-center font-bold text-blue-900 bg-blue-50/30 border-r border-gray-200">
                        {sub.percentage}%
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-block px-3 py-0.5 rounded-full text-xs font-black bg-blue-50 text-blue-900 border border-blue-200">
                          {sub.gradeLetter}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Performance Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Overall Standing Card */}
              <div className="p-6 bg-gradient-to-br from-blue-900 to-indigo-900 text-white rounded-2xl shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-200 uppercase tracking-widest">{t('parent.reportCard.termAcademicStanding')}</span>
                  <Award className="w-6 h-6 text-blue-200" />
                </div>
                <div className="my-4">
                  <div className="text-4xl font-black">{overall?.percentage ?? 0}%</div>
                  <p className="text-xs text-blue-200 mt-1">{t('parent.reportCard.cumulativeWeightedAverage')}</p>
                </div>
                <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs font-semibold">
                  <span className="text-blue-100">{t('parent.reportCard.overallGradeLetter')}</span>
                  <span className="px-3 py-0.5 bg-white text-blue-900 rounded-md font-black text-sm">
                    {overall?.gradeLetter || '—'}
                  </span>
                </div>
              </div>

              {/* Attendance Summary Card */}
              <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{t('parent.reportCard.termAttendanceSummary')}</span>
                  <Calendar className="w-5 h-5 text-gray-400" />
                </div>
                <div className="grid grid-cols-2 gap-3 my-3">
                  <div className="p-3 bg-white rounded-xl border border-gray-100">
                    <span className="text-[10px] text-gray-400 font-bold block uppercase">{t('parent.reportCard.totalSchoolDays')}</span>
                    <span className="text-lg font-black text-gray-900">{attendance?.total ?? 0}</span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-gray-100">
                    <span className="text-[10px] text-emerald-600 font-bold block uppercase">{t('parent.reportCard.daysPresent')}</span>
                    <span className="text-lg font-black text-emerald-700">{attendance?.present ?? 0}</span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-gray-100">
                    <span className="text-[10px] text-rose-600 font-bold block uppercase">{t('parent.reportCard.daysAbsent')}</span>
                    <span className="text-lg font-black text-rose-700">{attendance?.absent ?? 0}</span>
                  </div>
                  <div className="p-3 bg-white rounded-xl border border-gray-100">
                    <span className="text-[10px] text-blue-600 font-bold block uppercase">{t('parent.reportCard.attendanceRate')}</span>
                    <span className="text-lg font-black text-blue-900">{attendance?.percentage ?? 0}%</span>
                  </div>
                </div>
                <div className="text-[11px] text-gray-500 font-medium">
                  {t('parent.reportCard.attendanceRecordedFrom', { term: academicInfo?.term || t('parent.reportCard.currentTermLabel') })}
                </div>
              </div>
            </div>

            {/* Official Certification / Signatures Footer */}
            <div className="pt-8 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-8 text-center text-xs text-gray-500">
              <div className="space-y-4">
                <div className="w-48 h-px bg-gray-300 mx-auto mt-8"></div>
                <p className="font-bold text-gray-700 uppercase tracking-wider">{t('parent.reportCard.classTeacherSignature')}</p>
              </div>
              <div className="space-y-4">
                <div className="w-48 h-px bg-gray-300 mx-auto mt-8"></div>
                <p className="font-bold text-gray-700 uppercase tracking-wider">{t('parent.reportCard.principalSignature')}</p>
              </div>
            </div>

            <div className="text-center pt-2 text-[10px] text-gray-400 italic">
              {t('parent.reportCard.generatedOnNotice', { date: new Date().toLocaleDateString(), appName: APP_NAME })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentReportCard;
