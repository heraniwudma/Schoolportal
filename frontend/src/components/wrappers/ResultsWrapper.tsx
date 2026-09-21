import React from 'react';
import { useAuth } from '../../context/AuthContext';
import StudentResults from '../../pages/student/Results';
import TeacherResults from '../../pages/teacher/ResultsGradeEntry';

const ResultsWrapper = ({ searchQuery = '' }: { searchQuery?: string }) => {
  const { user } = useAuth();
  return user?.role === 'teacher' ? <TeacherResults /> : <StudentResults searchQuery={searchQuery} />;
};

export default ResultsWrapper;
