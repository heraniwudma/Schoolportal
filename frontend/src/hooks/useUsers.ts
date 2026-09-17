import { useCallback, useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, downloadFile } from '../lib/api';
import {
  ClassSection,
  CreateUserPayload,
  ManagedUser,
  PaginatedUsers,
  ParentLookupOption,
  StudentLookupItem,
  ParentLinkedChildrenResponse,
  UpdateUserPayload,
  UserStats,
} from '../types/users';

export interface UserFilters {
  search: string;
  role: string;
  status: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  page: number;
  limit: number;
}

const DEFAULT_FILTERS: UserFilters = {
  search: '',
  role: '',
  status: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
  page: 1,
  limit: 15,
};

function buildQuery(filters: UserFilters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.role) params.set('role', filters.role);
  if (filters.status) params.set('status', filters.status);
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
  params.set('page', String(filters.page));
  params.set('limit', String(filters.limit));
  return params.toString();
}

export function useUsers() {
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<UserFilters>(DEFAULT_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
  const [classSections, setClassSections] = useState<ClassSection[]>([]);
  const [parentsList, setParentsList] = useState<ParentLookupOption[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Debounce search input to avoid issuing queries on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 350);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Active query filters with debounced search
  const activeQueryFilters = useMemo(
    () => ({
      ...filters,
      search: debouncedSearch,
    }),
    [filters, debouncedSearch],
  );

  // 1. Paginated Users Query with React Query
  const {
    data: usersData,
    isLoading: isUsersLoading,
    error: usersQueryError,
    refetch: refetchUsers,
  } = useQuery<PaginatedUsers>({
    queryKey: ['users', 'list', activeQueryFilters],
    queryFn: () => api.get<PaginatedUsers>(`/users?${buildQuery(activeQueryFilters)}`),
    placeholderData: keepPreviousData,
  });

  // 2. Statistics Query with React Query (runs independently of users table)
  const {
    data: statsData,
    isLoading: isStatsLoading,
    refetch: refetchStatsQuery,
  } = useQuery<UserStats>({
    queryKey: ['users', 'stats'],
    queryFn: () => api.get<UserStats>('/users/stats'),
  });

  const users = usersData?.data ?? [];
  const meta = usersData?.meta ?? { total: 0, page: filters.page, limit: filters.limit, totalPages: 1 };
  const stats = statsData ?? null;
  const isLoading = isUsersLoading || isRefreshing;
  const error = usersQueryError
    ? (usersQueryError instanceof ApiError ? usersQueryError.message : 'Failed to load users')
    : null;

  // Dropdown Lookups (lazy loaded on demand)
  const fetchClassSections = useCallback(async (academicYearId?: string) => {
    try {
      const url = academicYearId
        ? `/users/class-sections?academicYearId=${encodeURIComponent(academicYearId)}`
        : '/users/class-sections';
      const sections = await api.get<ClassSection[]>(url);
      setClassSections(sections);
      return sections;
    } catch {
      return [];
    }
  }, []);

  const fetchParentsList = useCallback(async () => {
    if (parentsList.length > 0) return parentsList;
    try {
      const list = await api.get<ParentLookupOption[]>('/users/parents-list');
      setParentsList(list);
      return list;
    } catch {
      return [];
    }
  }, [parentsList.length]);

  // Filter application helper
  const applyFilters = useCallback(
    (updates: Partial<UserFilters>) => {
      setFilters((prev) => {
        const next = { ...prev, ...updates };
        if (!('page' in updates)) {
          next.page = 1;
        }
        return next;
      });
    },
    [],
  );

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchUsers(),
        refetchStatsQuery(),
        parentsList.length > 0 ? fetchParentsList() : Promise.resolve(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [refetchUsers, refetchStatsQuery, parentsList.length, fetchParentsList]);

  const fetchStats = useCallback(async () => {
    const res = await refetchStatsQuery();
    return res.data;
  }, [refetchStatsQuery]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createUser = useCallback(
    async (payload: CreateUserPayload): Promise<ManagedUser> => {
      const created = await api.post<ManagedUser>('/users', payload);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      return created;
    },
    [queryClient],
  );

  const updateUser = useCallback(
    async (id: string, payload: UpdateUserPayload): Promise<ManagedUser> => {
      const updated = await api.patch<ManagedUser>(`/users/${id}`, payload);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      return updated;
    },
    [queryClient],
  );

  const activateUser = useCallback(
    async (id: string): Promise<ManagedUser> => {
      const updated = await api.patch<ManagedUser>(`/users/${id}/activate`);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      return updated;
    },
    [queryClient],
  );

  const deactivateUser = useCallback(
    async (id: string): Promise<ManagedUser> => {
      const updated = await api.patch<ManagedUser>(`/users/${id}/deactivate`);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      return updated;
    },
    [queryClient],
  );

  const resetPassword = useCallback(async (id: string, newPassword: string) => {
    return api.post<{ message: string }>(`/users/${id}/reset-password`, { newPassword });
  }, []);

  const deleteUser = useCallback(
    async (id: string) => {
      const result = await api.delete<{ message: string }>(`/users/${id}`);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      return result;
    },
    [queryClient],
  );

  const getStudentsLookup = useCallback(async () => {
    return api.get<StudentLookupItem[]>('/users/students-lookup');
  }, []);

  const getParentChildren = useCallback(async (parentId: string) => {
    return api.get<ParentLinkedChildrenResponse>(`/users/parents/${parentId}/children`);
  }, []);

  const linkParentChildren = useCallback(
    async (parentId: string, studentIds: string[]) => {
      const result = await api.put<ParentLinkedChildrenResponse>(
        `/users/parents/${parentId}/children`,
        { studentIds },
      );
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      return result;
    },
    [queryClient],
  );

  const exportUsers = useCallback(
    async (mode: 'all' | 'filtered') => {
      setIsExporting(true);
      try {
        let queryStr = '';
        if (mode === 'filtered') {
          const params = new URLSearchParams();
          if (filters.search) params.set('search', filters.search);
          if (filters.role) params.set('role', filters.role);
          if (filters.status) params.set('status', filters.status);
          if (filters.sortBy) params.set('sortBy', filters.sortBy);
          if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
          queryStr = params.toString();
        }
        const path = queryStr ? `/users/export?${queryStr}` : '/users/export';
        const defaultFilename = `users-${mode}-${new Date().toISOString().split('T')[0]}.csv`;
        await downloadFile(path, defaultFilename);
      } finally {
        setIsExporting(false);
      }
    },
    [filters],
  );

  return {
    users,
    meta,
    stats,
    classSections,
    parentsList,
    filters,
    isLoading,
    isStatsLoading,
    isExporting,
    error,
    applyFilters,
    refresh,
    fetchStats,
    fetchClassSections,
    fetchParentsList,
    createUser,
    updateUser,
    activateUser,
    deactivateUser,
    resetPassword,
    deleteUser,
    getStudentsLookup,
    getParentChildren,
    linkParentChildren,
    exportUsers,
  };
}
