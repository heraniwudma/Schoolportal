import React from 'react';
import { useAuth } from '../../context/AuthContext';
import StudentAttendance from '../../pages/student/Attendance';
import TeacherAttendance from '../../pages/teacher/AttendanceManagement';

const AttendanceWrapper = ({ searchQuery = '' }: { searchQuery?: string }) => {
  const { user } = useAuth();
  return user?.role === 'teacher' ? <TeacherAttendance /> : <StudentAttendance searchQuery={searchQuery} />;
};

export default AttendanceWrapper;
