import React from 'react';
import { useAuth } from '../../context/AuthContext';
import StudentMaterials from '../../pages/student/Materials';
import AdminMaterials from '../../pages/admin/MaterialsManagement';
import TeacherMaterials from '../../pages/teacher/Materials';

const MaterialsWrapper = ({ searchQuery = '' }: { searchQuery?: string }) => {
  const { user } = useAuth();
  if (user?.role === 'admin') return <AdminMaterials />;
  if (user?.role === 'teacher') return <TeacherMaterials />;
  return <StudentMaterials searchQuery={searchQuery} />;
};

export default MaterialsWrapper;
