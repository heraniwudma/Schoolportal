import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (userData: RegisterPayload) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isLoading: boolean;
  updateProfile: (updates: Partial<User>) => void;
}

interface RegisterPayload {
  name: string;
  idNumber: string;
  email?: string;
  password: string;
  confirmPassword: string;
  role: string;
  gender?: string;
  grade?: string;
  department?: string;
}

interface AuthApiUser {
  id: string;
  name: string;
  loginId: string;
  email: string | null;
  role: UserRole;
  avatarUrl?: string | null;
  Teacher?: { firstName: string; lastName: string } | null;
}

interface AuthApiResponse {
  accessToken: string;
  user: AuthApiUser;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = 'school_portal_user';
const TOKEN_STORAGE_KEY = 'school_portal_token';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const normalizeRole = (role: string): UserRole => {
  const normalized = role.toLowerCase();
  // Homeroom is a teacher assignment; represent it as a teacher in the UI.
  return normalized === 'homeroom_teacher' ? 'teacher' : normalized as UserRole;
};

const normalizeUser = (apiUser: AuthApiUser): User => ({
  id: apiUser.id,
  idNumber: apiUser.loginId,
  name: apiUser.Teacher ? `${apiUser.Teacher.firstName} ${apiUser.Teacher.lastName}`.trim() : (apiUser.name || apiUser.loginId),
  email: apiUser.email || undefined,
  role: normalizeRole(apiUser.role),
  avatar: apiUser.avatarUrl || undefined,
});

const parseApiErrorMessage = async (response: Response) => {
  try {
    const data = (await response.json()) as { message?: string | string[]; error?: string };
    if (Array.isArray(data.message)) {
      if (data.message.length === 1) return data.message[0];
      return `Validation failed:\n• ${data.message.join('\n• ')}`;
    }
    return data.message || data.error || 'Request failed';
  } catch {
    return 'Request failed';
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasRestoredSession = useRef(false);

  const clearStoredSession = () => {
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setUser(null);
    setToken(null);
  };

  useEffect(() => {
    // Do not retry automatically after a failed validation. In particular,
    // this prevents a stale admin token from creating repeated /auth/me calls
    // when the provider re-renders.
    if (hasRestoredSession.current) {
      setIsLoading(false);
      return;
    }
    hasRestoredSession.current = true;

    const initializeAuth = async () => {
      const savedUser = localStorage.getItem(USER_STORAGE_KEY);
      const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);

      if (!savedUser || !savedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${savedToken}`,
          },
        });

        if (!response.ok) {
          // Session expired or token invalid - clear stored data
          if (response.status === 401 || response.status === 403) {
            // Session expired silently
          }
          throw new Error('Session expired');
        }

        const profile = (await response.json()) as AuthApiUser;
        const normalized = normalizeUser(profile);
        setUser(normalized);
        setToken(savedToken);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalized));
      } catch {
        clearStoredSession();
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const login = async (
    identifier: string,
    password: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier,
          password,
        }),
      });

      if (!response.ok) {
        const errorMessage = await parseApiErrorMessage(response);
        if (!token) {
          clearStoredSession();
        }
        return { success: false, error: errorMessage };
      }

      const data = (await response.json()) as AuthApiResponse;
      const normalizedUser = normalizeUser(data.user);
      setUser(normalizedUser);
      setToken(data.accessToken);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalizedUser));
      localStorage.setItem(TOKEN_STORAGE_KEY, data.accessToken);

      return { success: true };
    } catch {
      return { success: false, error: 'An error occurred. Please check your connection and try again.' };
    }
  };

  const register = async (
    userData: RegisterPayload,
  ): Promise<{ success: boolean; error?: string }> => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const errorMessage = await parseApiErrorMessage(response);
      return { success: false, error: errorMessage };
    }

    const data = (await response.json()) as AuthApiResponse;
    const normalizedUser = normalizeUser(data.user);
    setUser(normalizedUser);
    setToken(data.accessToken);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(normalizedUser));
    localStorage.setItem(TOKEN_STORAGE_KEY, data.accessToken);

    return { success: true };
  };

  const logout = () => {
    clearStoredSession();
  };

  const updateProfile = (updates: Partial<User>) => {
    if (user) {
      const updated = { ...user, ...updates };
      setUser(updated);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated));
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isLoading, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
