export type DbRole = 'ADMIN' | 'TEACHER' | 'STUDENT' | 'PARENT';
export type StudentStatus = 'ACTIVE' | 'GRADUATED' | 'SUSPENDED' | 'TRANSFERRED';

export interface ClassSection {
  id: string;
  name: string;
  displayName?: string;
  GradeLevel?: { name: string } | null;
}

export interface StudentProfile {
  id: string;
  firstName: string;
  lastName: string;
  admissionNo: string;
  gender: string | null;
  dob: string | null;
  address: string | null;
  emergencyContact: string | null;
  status: StudentStatus;
  parentId?: string | null;
  ClassSection: ClassSection | null;
  Parent: ParentProfile | null;
}

export interface TeacherProfile {
  id: string;
  firstName: string;
  lastName: string;
  staffId: string | null;
  qualification: string | null;
  phoneNumber: string | null;
  address: string | null;
}

export interface ParentProfile {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  occupation: string | null;
  relationship: string | null;
  childrenCount?: number;
  Student?: Array<{ id: string; firstName: string; lastName: string; admissionNo: string }>;
}

export interface ManagedUser {
  id: string;
  loginId: string;
  email: string | null;
  role: DbRole;
  phoneNumber: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  Student: StudentProfile | null;
  Teacher: TeacherProfile | null;
  Parent: ParentProfile | null;
}

export interface UserStats {
  total: number;
  active: number;
  inactive: number;
  students: number;
  teachers: number;
  parents: number;
  admins: number;
}

export interface PaginatedUsers {
  data: ManagedUser[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ParentLookupOption {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string | null;
  relationship: string | null;
  User: {
    loginId: string;
    email: string | null;
  };
}

export interface StudentLookupItem {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  fullName: string;
  gender: string | null;
  status: StudentStatus;
  isActive: boolean;
  avatarUrl: string | null;
  classSectionId: string | null;
  classSectionName: string | null;
  gradeLevelName: string | null;
  parentId: string | null;
  parent: {
    id: string;
    fullName: string;
    loginId: string;
    phoneNumber: string | null;
    relationship: string | null;
  } | null;
}

export interface ParentLinkedChildrenResponse {
  parent: {
    id: string;
    userId: string;
    firstName: string;
    lastName: string;
    fullName: string;
    loginId: string;
    email: string | null;
    phoneNumber: string | null;
    relationship: string | null;
  };
  children: Array<{
    id: string;
    admissionNo: string;
    firstName: string;
    lastName: string;
    fullName: string;
    gender: string | null;
    status: StudentStatus;
    isActive: boolean;
    avatarUrl: string | null;
    classSectionName: string | null;
    gradeLevelName: string | null;
  }>;
}

export interface CreateUserPayload {
  loginId: string;
  password: string;
  role: DbRole;
  email?: string;
  phoneNumber?: string;
  firstName: string;
  lastName: string;
  // Student
  admissionNo?: string;
  classSectionId?: string;
  parentId?: string;
  gender?: string;
  dob?: string;
  address?: string;
  emergencyContact?: string;
  // Teacher
  staffId?: string;
  qualification?: string;
  // Parent
  occupation?: string;
  relationship?: string;
}

export interface UpdateUserPayload {
  loginId?: string;
  email?: string;
  phoneNumber?: string;
  isActive?: boolean;
  firstName?: string;
  lastName?: string;
  admissionNo?: string;
  classSectionId?: string;
  parentId?: string | null;
  gender?: string;
  dob?: string;
  address?: string;
  emergencyContact?: string;
  staffId?: string;
  qualification?: string;
  occupation?: string;
  relationship?: string;
}

/** Derive a human-readable display name from a ManagedUser record */
export function getUserDisplayName(u: ManagedUser): string {
  if (u.Student) return `${u.Student.firstName} ${u.Student.lastName}`.trim();
  if (u.Teacher) return `${u.Teacher.firstName} ${u.Teacher.lastName}`.trim();
  if (u.Parent) return `${u.Parent.firstName} ${u.Parent.lastName}`.trim();
  return u.loginId;
}

/** Derive profile ID (admissionNo / staffId / loginId) */
export function getUserProfileId(u: ManagedUser): string {
  if (u.Student) return u.Student.admissionNo;
  if (u.Teacher) return u.Teacher.staffId ?? u.loginId;
  return u.loginId;
}

export const ROLE_LABELS: Record<DbRole, string> = {
  ADMIN: 'Admin',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
  PARENT: 'Parent',
};

export const ROLE_COLORS: Record<DbRole, { bg: string; text: string }> = {
  ADMIN: { bg: 'bg-purple-50', text: 'text-purple-700' },
  TEACHER: { bg: 'bg-indigo-50', text: 'text-indigo-700' },
  STUDENT: { bg: 'bg-blue-50', text: 'text-blue-700' },
  PARENT: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
};
