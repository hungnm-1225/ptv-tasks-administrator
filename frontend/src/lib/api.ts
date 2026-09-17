// frontend/src/lib/api.ts
import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';
const DEFAULT_TIMEOUT_MS = 30000; // 30s timeout để phòng chống treo mạng trên Render

export interface ApiErrorDetail {
  message: string;
  status: number;
  details?: any;
}

export class ApiError extends Error {
  status: number;
  details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export interface FetchApiOptions extends RequestInit {
  timeoutMs?: number;
}

export async function fetchApi<T>(endpoint: string, options?: FetchApiOptions): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (err) {
    console.warn('[fetchApi] Không thể lấy Supabase session token:', err);
  }

  // 🎯 Sử dụng timeout riêng nếu có (VD: 90s cho cào dữ liệu), nếu không dùng mặc định 30s
  const timeoutDuration = options?.timeoutMs || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: options?.signal || controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = `API Error ${response.status}`;
      let errorDetails: any = null;

      try {
        const errorJson = await response.json();
        errorMessage = errorJson.detail || errorJson.message || errorMessage;
        errorDetails = errorJson;
      } catch {
        const rawText = await response.text();
        if (rawText) errorMessage = `${errorMessage}: ${rawText}`;
      }

      throw new ApiError(errorMessage, response.status, errorDetails);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new ApiError(`Request timeout sau ${timeoutDuration / 1000}s tới: ${endpoint}`, 408);
    }
    throw error;
  }
}