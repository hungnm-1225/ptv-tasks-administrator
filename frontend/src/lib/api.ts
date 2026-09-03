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

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  // 1. Tự động trích xuất Supabase JWT Access Token để gắn Authorization Bearer
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

  // 2. Thiết lập AbortController để xử lý timeout chống treo request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: options?.signal || controller.signal,
    });

    clearTimeout(timeoutId);

    // 3. Xử lý phản hồi lỗi chi tiết
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

    // Nếu response rỗng (ví dụ 204 No Content)
    if (response.status === 204) {
      return {} as T;
    }

    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new ApiError(`Request timeout sau ${DEFAULT_TIMEOUT_MS / 1000}s tới: ${endpoint}`, 408);
    }
    throw error;
  }
}