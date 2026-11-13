import { BASE } from './base';
let csrf = '';
let onUnauthorized: (reason: string) => void = () => undefined;

export const setCsrf = (token: string): void => {
  csrf = token;
};
export const setUnauthorizedHandler = (handler: (reason: string) => void): void => {
  onUnauthorized = handler;
};

export interface ApiResult {
  success?: boolean;
  message?: string;
  [key: string]: any;
}

/** JSON request to the API. Never throws on an HTTP error: the body carries success/message. */
export async function api<T = ApiResult>(path: string, options: { method?: string; body?: unknown; quiet401?: boolean } = {}): Promise<T> {
  const method = options.method ?? (options.body === undefined ? 'GET' : 'POST');
  let response: Response;
  try {
    response = await fetch(`${BASE}/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }) },
      body: method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
    });
  } catch {
    return { success: false, offline: true, message: 'Offline: cannot reach the queue server. Try again when the connection is back.' } as T;
  }
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = { success: false, message: `Unexpected response (${response.status}).` };
  }
  if (data && typeof data === 'object' && data.csrf) {
    csrf = data.csrf;
  }
  if (response.status === 401 && !options.quiet401 && data?.reason) {
    onUnauthorized(String(data.reason));
  }
  return data as T;
}

export const query = (params: Record<string, string | number | undefined | null>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};
