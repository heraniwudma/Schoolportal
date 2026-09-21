import React from 'react';
import { useAuth } from '../../context/AuthContext';
import StudentExams from '../../pages/student/OnlineExams';
import TeacherExams from '../../pages/teacher/ExamCreation';

const ExamsWrapper = ({ searchQuery = '' }: { searchQuery?: string }) => {
  const { user } = useAuth();
  return user?.role === 'teacher' ? <TeacherExams /> : <StudentExams searchQuery={searchQuery} />;
};

export default ExamsWrapper;
