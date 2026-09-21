import { api } from '../lib/api';

export interface StudentAttendanceRecord {
  id: string;
  date: string;
  period: number | null;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  remarks: string | null;
  ClassSection: { name: string };
  User: { Teacher: { firstName: string; lastName: string } | null };
}

export const getMyAttendance = () =>
  api.get<StudentAttendanceRecord[]>('/students/me/attendance');

export interface StudentCourse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: string | null;
  grade: string;
}

export const getMyCourses = () => api.get<StudentCourse[]>('/students/me/courses');

export interface StudentScheduleEntry {
  id: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  ClassSection: { name: string; roomNumber: string | null };
  Subject: { name: string };
  Teacher: { firstName: string; lastName: string };
}

export const getMySchedule = () => api.get<StudentScheduleEntry[]>('/students/me/schedule');

export interface StudentGradeItem {
  id: string;
  subject: string;
  quarter: string;
  mid: number;
  assignment: number;
  quiz: number;
  classwork: number;
  final: number;
  score: number;
  createdAt: string;
}

export interface StudentSubjectResultItem {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  term: string;
  marks: number;
  status: string;
  updatedAt: string;
}

export interface StudentResultsResponse {
  grades: StudentGradeItem[];
  subjectResults: StudentSubjectResultItem[];
}

export const getMyResults = () => api.get<StudentResultsResponse>('/students/me/results');

export interface StudentAssignmentItem {
  id: string;
  title: string;
  subject?: string | null;
  instructions: string | null;
  dueDate: string;
  targetClass: string | null;
  classSectionId: string | null;
  attachmentUrl: string | null;
  createdAt: string;
  updatedAt: string;
  ClassSection?: { id: string; name: string } | null;
  Teacher?: { firstName: string; lastName: string } | null;
  submissions?: Array<{
    id: string;
    createdAt: string;
    updatedAt: string;
    content?: string | null;
    fileName: string | null;
    grades?: Array<{ id: string }>;
  }>;
}

export const getMyAssignments = () => api.get<StudentAssignmentItem[]>('/students/my-assignments');

