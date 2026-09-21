import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParent } from '../../context/ParentContext';
import { getChildAttendance, getChildResults, getChildAssignments } from '../../api/parents';
import { 
  Users, 
  GraduationCap, 
  CheckSquare, 
  ClipboardList, 
  Check, 
  Sparkles, 
  RefreshCw, 
  Phone, 
  MapPin, 
  ShieldCheck,
  AlertCircle,
  Search,
  X
} from 'lucide-react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useTranslation } from '../../i18n/LanguageContext';

// Micro-component to fetch and render quick stats for each child card
const ChildCardStats: React.FC<{ childId: string }> = ({ childId }) => {
  const { t } = useTranslation();
  const { data: attendance, isLoading: attLoading } = useQuery({
    queryKey: ['parent-child-attendance', childId],
    queryFn: () => getChildAttendance(childId),
  });

  const { data: results, isLoading: resLoading } = useQuery({
    queryKey: ['parent-child-results', childId],
    queryFn: () => getChildResults(childId),
  });

  const { data: assignments, isLoading: asgLoading } = useQuery({
    queryKey: ['parent-child-assignments', childId],
    queryFn: () => getChildAssignments(childId),
  });

  const attPercentage = attendance?.summary?.attendancePercentage;
  const avg = results?.overallAverage;
  const pendingCount = assignments?.pendingCount ?? 0;

  return (
    <div className="grid grid-cols-3 gap-2 py-3 px-3.5 bg-gray-50/90 rounded-2xl border border-gray-100/80 text-center">
      <div className="flex flex-col items-center justify-center">
        <span className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
          <CheckSquare className="w-3 h-3 text-emerald-600" />
          {t('parent.myChildren.statAttendance')}
        </span>
        <span className="text-sm font-black text-gray-900 mt-0.5">
          {attLoading ? '…' : attPercentage !== undefined ? `${attPercentage}%` : '100%'}
        </span>
      </div>

      <div className="flex flex-col items-center justify-center border-x border-gray-200/60 px-1">
        <span className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
          <GraduationCap className="w-3 h-3 text-purple-600" />
          {t('parent.myChildren.statAverage')}
        </span>
        <span className="text-sm font-black text-gray-900 mt-0.5">
          {resLoading ? '…' : avg !== undefined && results?.totalRecords ? `${avg}%` : '—'}
        </span>
      </div>

      <div className="flex flex-col items-center justify-center">
        <span className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
          <ClipboardList className="w-3 h-3 text-amber-600" />
          {t('parent.myChildren.statPending')}
        </span>
        <span className="text-sm font-black text-gray-900 mt-0.5">
          {asgLoading ? '…' : t('parent.myChildren.statAsgnCount', { count: pendingCount })}
        </span>
      </div>
    </div>
  );
};

const MyChildren: React.FC = () => {
  const outletCtx = useOutletContext<{ searchQuery?: string } | null>();
  const [localSearch, setLocalSearch] = useState('');
  const { childrenList, selectedChildId, setSelectedChildId, isLoading, error, refetchChildren } = useParent();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const effectiveSearch = (localSearch || outletCtx?.searchQuery || '').trim().toLowerCase();

  const filteredChildren = childrenList.filter((child) => {
    if (!effectiveSearch) return true;
    const nameMatch = (child.fullName || '').toLowerCase().includes(effectiveSearch);
    const admMatch = (child.admissionNo || '').toLowerCase().includes(effectiveSearch);
    const secMatch = (child.classSection?.name || child.currentEnrollment?.classSection || '').toLowerCase().includes(effectiveSearch);
    const gradeMatch = (child.classSection?.gradeLevel || child.currentEnrollment?.gradeLevel || '').toLowerCase().includes(effectiveSearch);
    return nameMatch || admMatch || secMatch || gradeMatch;
  });

  const handleNavigateWithActiveChild = (childId: string, path: string) => {
    setSelectedChildId(childId);
    navigate(path);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-900 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium text-gray-500">{t('parent.myChildren.loading')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="p-6 bg-red-50 border border-red-200 rounded-3xl text-red-700 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-bold text-red-900">{t('parent.myChildren.loadError')}</h3>
            <p className="text-sm text-red-700">{error}</p>
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

  // Case 0: Empty state (0 children linked)
  if (childrenList.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="p-10 bg-white rounded-3xl shadow-sm border border-gray-100 space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-900 rounded-2xl flex items-center justify-center mx-auto shadow-xs">
            <Users className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{t('parent.myChildren.emptyTitle')}</h2>
          <p className="text-gray-500 text-sm max-w-md mx-auto leading-relaxed">
            {t('parent.myChildren.emptyDesc')}
          </p>
          <div className="pt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => void refetchChildren()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-900 text-white rounded-xl text-sm font-semibold hover:bg-blue-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {t('parent.myChildren.refreshStatus')}
            </button>
            <Link
              to="/account"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors"
            >
              {t('common.nav.myAccount')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900">{t('parent.myChildren.title')}</h1>
            <span className="px-3 py-0.5 bg-blue-100 text-blue-900 font-bold text-xs rounded-full">
              {childrenList.length === 1
                ? t('parent.myChildren.studentCountSingular')
                : t('parent.myChildren.studentCount', { count: childrenList.length })}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {t('parent.myChildren.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, ID, or section..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-8 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900 transition-all text-gray-800 placeholder-gray-400 shadow-sm"
            />
            {localSearch && (
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

          <button
            type="button"
            onClick={() => void refetchChildren()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:border-gray-300 rounded-xl text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-all shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5 text-gray-500" />
            {t('common.actions.refresh')}
          </button>
        </div>
      </div>

      {/* Children Grid */}
      {filteredChildren.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-gray-200 space-y-3">
          <Search className="w-10 h-10 text-gray-300 mx-auto" />
          <h3 className="font-bold text-gray-800">No students match your search</h3>
          <p className="text-xs text-gray-400">
            No children found matching "{localSearch || outletCtx?.searchQuery}".
          </p>
          <button
            type="button"
            onClick={() => setLocalSearch('')}
            className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredChildren.map((child) => {
          const isSelected = child.id === selectedChildId;
          const sectionName = child.classSection?.name || child.currentEnrollment?.classSection || t('common.childSelector.enrolled');
          const gradeLevel = child.classSection?.gradeLevel || child.currentEnrollment?.gradeLevel || t('parent.myChildren.standard');
          const academicYear = child.currentEnrollment?.academicYear || '—';
          const roomNumber = child.classSection?.roomNumber;

          return (
            <div
              key={child.id}
              className={`bg-white rounded-3xl border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-sm ${
                isSelected
                  ? 'border-blue-600 ring-2 ring-blue-600/20 shadow-md'
                  : 'border-gray-200/80 hover:border-blue-300'
              }`}
            >
              {/* Card Header & Demographics */}
              <div className="p-6 space-y-5">
                {/* Child Identity Row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-900 to-blue-800 text-white flex items-center justify-center font-bold text-xl shadow-xs flex-shrink-0">
                      {child.avatarUrl ? (
                        <img src={child.avatarUrl} alt={child.fullName} className="w-full h-full object-cover rounded-2xl" />
                      ) : (
                        child.firstName.charAt(0)
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-black text-gray-900">{child.fullName}</h3>
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-bold text-[10px] rounded-md uppercase">
                          {child.status === 'ACTIVE' ? t('common.status.active') : child.status || t('common.status.active')}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">
                        {t('parent.myChildren.admissionId')} <span className="font-mono text-gray-700 font-semibold">{child.admissionNo}</span>
                      </p>
                    </div>
                  </div>

                  {/* Active Indicator Badge */}
                  {isSelected && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-900 text-white text-xs font-bold rounded-full shadow-xs">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      {t('parent.myChildren.activeBadge')}
                    </span>
                  )}
                </div>

                {/* Enrollment & Academic Info Pill Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                    <span className="text-gray-400 text-[10px] uppercase font-bold block">{t('parent.myChildren.classSection')}</span>
                    <span className="font-bold text-blue-950 mt-0.5 block">{sectionName}</span>
                  </div>
                  <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                    <span className="text-gray-400 text-[10px] uppercase font-bold block">{t('parent.myChildren.gradeLevel')}</span>
                    <span className="font-bold text-gray-900 mt-0.5 block">{gradeLevel}</span>
                  </div>
                  <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                    <span className="text-gray-400 text-[10px] uppercase font-bold block">{t('parent.myChildren.academicYear')}</span>
                    <span className="font-bold text-gray-700 mt-0.5 block truncate">{academicYear}</span>
                  </div>
                  <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                    <span className="text-gray-400 text-[10px] uppercase font-bold block">{t('parent.myChildren.roomAndGender')}</span>
                    <span className="font-bold text-gray-700 mt-0.5 block">
                      {roomNumber ? t('parent.myChildren.roomLabel', { room: roomNumber }) : t('parent.myChildren.standard')} • {child.gender || t('parent.myChildren.student')}
                    </span>
                  </div>
                </div>

                {/* Safe Extra Demographics if available */}
                {(child.emergencyContact || child.address) && (
                  <div className="space-y-1 text-xs text-gray-500 pt-1 border-t border-gray-100">
                    {child.emergencyContact && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span>{t('parent.myChildren.emergency', { contact: child.emergencyContact })}</span>
                      </div>
                    )}
                    {child.address && (
                      <div className="flex items-center gap-2 text-[11px]">
                        <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{t('parent.myChildren.address', { address: child.address })}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Real Quick Stats Widget */}
                <ChildCardStats childId={child.id} />
              </div>

              {/* Card Footer & Academic Shortcuts */}
              <div className="p-4 bg-gray-50/70 border-t border-gray-100 flex flex-col gap-3">
                {/* Active Student Switch Button */}
                {isSelected ? (
                  <div className="w-full py-2 px-3 bg-blue-50 border border-blue-200 rounded-xl text-xs font-bold text-blue-900 flex items-center justify-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-700" />
                    {t('parent.myChildren.currentlyActive')}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedChildId(child.id)}
                    className="w-full py-2 px-3 bg-white hover:bg-blue-900 hover:text-white border border-gray-200 hover:border-blue-900 rounded-xl text-xs font-bold text-gray-700 shadow-xs transition-all flex items-center justify-center gap-2 group"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-blue-600 group-hover:text-white transition-colors" />
                    {t('parent.myChildren.selectAsActive')}
                  </button>
                )}

                {/* Quick Academic Navigation Links */}
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleNavigateWithActiveChild(child.id, '/parent/results')}
                    className="py-1.5 px-2 bg-white hover:bg-purple-50 border border-gray-200 hover:border-purple-200 rounded-lg text-[11px] font-bold text-gray-700 hover:text-purple-700 transition-colors text-center"
                  >
                    {t('parent.myChildren.navResults')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigateWithActiveChild(child.id, '/parent/attendance')}
                    className="py-1.5 px-2 bg-white hover:bg-emerald-50 border border-gray-200 hover:border-emerald-200 rounded-lg text-[11px] font-bold text-gray-700 hover:text-emerald-700 transition-colors text-center"
                  >
                    {t('parent.myChildren.navAttendance')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigateWithActiveChild(child.id, '/parent/schedule')}
                    className="py-1.5 px-2 bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-lg text-[11px] font-bold text-gray-700 hover:text-indigo-700 transition-colors text-center"
                  >
                    {t('parent.myChildren.navSchedule')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleNavigateWithActiveChild(child.id, '/parent/report-card')}
                    className="py-1.5 px-2 bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-lg text-[11px] font-bold text-gray-700 hover:text-blue-700 transition-colors text-center"
                  >
                    {t('parent.myChildren.navReport')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};

export default MyChildren;
