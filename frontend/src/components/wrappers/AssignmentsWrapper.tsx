import React from 'react';
import { useAuth } from '../../context/AuthContext';
import StudentAssignments from '../../pages/student/Assignments';
import TeacherAssignments from '../../pages/teacher/AssignmentPublishing';

const AssignmentsWrapper = () => {
  const { user } = useAuth();

  return user?.role === 'teacher' ? <TeacherAssignments /> : <StudentAssignments searchQuery="" />;
};

export default AssignmentsWrapper;
