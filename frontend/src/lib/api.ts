/**
 * Lightweight authenticated API client.
 * All requests go through the NestJS backend — the frontend never
 * touches the Supabase database directly.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const TOKEN_KEY = 'school_portal_token';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// Example fetch setup in src/api/api.ts
export const fetchHomeroomAssignments = async (academicYearId?: string) => {
  const timestamp = Date.now();
  const token = getToken();
  const response = await fetch(`${BASE_URL}/teacher-assignments/homeroom?academicYearId=${academicYearId || ''}&_t=${timestamp}`, {
    headers: {
      'Cache-Control': 'no-cache, no-store',
      'Pragma': 'no-cache',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
  });
  if (!response.ok) throw new ApiError(response.status, await parseError(response));
  return response.json();
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[]; error?: string };
    if (Array.isArray(body.message)) {
      if (body.message.length === 1) return body.message[0];
      return `Validation failed:\n• ${body.message.join('\n• ')}`;
    }
    if (typeof body.message === 'string' && body.message.trim()) {
      return body.message;
    }
    if (typeof body.error === 'string' && body.error.trim()) {
      return body.error;
    }
    return `Request failed with status ${res.status}`;
  } catch {
    return `Request failed with status ${res.status}`;
  }
}

// In-flight GET request deduplication cache to prevent cascading duplicate fetches
const inFlightGetRequests = new Map<string, Promise<any>>();

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  const isFormData = body instanceof FormData;
  
  const headers: Record<string, string> = {};
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch (netErr: any) {
    console.error(`[API] ${method} ${path} network error:`, netErr.message ?? netErr);
    throw netErr;
  }

  if (!res.ok) {
    const msg = await parseError(res);
    throw new ApiError(res.status, msg);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function deduplicatedGet<T>(path: string): Promise<T> {
  const existing = inFlightGetRequests.get(path);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = request<T>('GET', path).finally(() => {
    inFlightGetRequests.delete(path);
  });

  inFlightGetRequests.set(path, promise);
  return promise;
}

export const api = {
  get: <T>(path: string) => deduplicatedGet<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export async function downloadFile(path: string, fallbackFilename = 'download.csv'): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers,
  });

  if (!res.ok) {
    const msg = await parseError(res);
    throw new ApiError(res.status, msg);
  }

  let filename = fallbackFilename;
  const disposition = res.headers.get('content-disposition');
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    }
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

