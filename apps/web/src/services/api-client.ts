const STORAGE_TOKEN_KEY = 'dream5_access_token';

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (configured && configured.trim().length > 0) {
    return configured.trim().replace(/\/+$/, '');
  }
  return 'http://localhost:3101';
}

export function resolveApiAssetUrl(assetPath: string | null | undefined): string | null {
  if (!assetPath || assetPath.trim().length === 0) {
    return null;
  }
  const trimmed = assetPath.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
    return trimmed;
  }
  return `${getApiBaseUrl()}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

export function isDevToolsEnabled(): boolean {
  return import.meta.env.VITE_DEV_TOOLS_ENABLED === 'true';
}

export function getStoredAccessToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage.getItem(STORAGE_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAccessToken(token: string | null): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (token) {
      window.localStorage.setItem(STORAGE_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(STORAGE_TOKEN_KEY);
    }
  } catch {
    // Ignorado si localStorage no está disponible
  }
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly messages: readonly string[];

  public constructor(statusCode: number, message: string | readonly string[]) {
    const messages = Array.isArray(message) ? message : [message];
    super(messages.join(' · '));
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.messages = messages;
  }
}

export async function apiFetch<T>(
  path: string,
  options: {
    readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    readonly body?: unknown;
  } = {},
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const token = getStoredAccessToken();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers: Record<string, string> = {};
  if (options.body !== undefined && !isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    credentials: 'include',
    headers,
    ...(options.body !== undefined
      ? { body: isFormData ? (options.body as BodyInit) : JSON.stringify(options.body) }
      : {}),
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const errObj =
      parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    const rawMsg = errObj?.['message'];
    const msg =
      typeof rawMsg === 'string' || Array.isArray(rawMsg)
        ? (rawMsg as string | readonly string[])
        : `Error HTTP ${String(response.status)}`;
    throw new ApiError(response.status, msg);
  }

  return parsed as T;
}
