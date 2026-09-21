import React from 'react';
import { useAuth } from '../../context/AuthContext';
import ClassSchedule from '../../pages/student/ClassSchedule';
import TeacherSchedule from '../../pages/teacher/TeacherSchedule';

interface ScheduleWrapperProps {
  searchQuery?: string;
}

const ScheduleWrapper: React.FC<ScheduleWrapperProps> = ({ searchQuery = '' }) => {
  const { user } = useAuth();

  if (user?.role === 'teacher') {
    return <TeacherSchedule searchQuery={searchQuery} />;
  }

  return <ClassSchedule searchQuery={searchQuery} />;
};

export default ScheduleWrapper;
