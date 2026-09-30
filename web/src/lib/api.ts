import type { AppNotification } from './notifications';
import { User, FileTransfer, AuditLog, SystemSettings, Department, Task, DailyReport, Customer, Deal, CrmActivity } from '../types';

const TOKEN_KEY = 'app_token_v6';

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, json.error || `HTTP ${res.status}`);
  }
  return json as T;
}

export type CollectionName = 'staff' | 'departments' | 'transfers' | 'audit' | 'settings' | 'tasks' | 'reports' | 'customers' | 'deals' | 'activities';

export interface ServerState {
  me: User;
  staff: User[];
  departments: Department[];
  transfers: FileTransfer[];
  tasks: Task[];
  reports: DailyReport[];
  customers: Customer[];
  deals: Deal[];
  activities: CrmActivity[];
  auditLogs: AuditLog[];
  settings: SystemSettings | null;
}

export const api = {
  login: (identifier: string, password: string, adminOnly = false) =>
    request<{ token: string; user: User }>('POST', '/api/auth/login', { identifier, password, adminOnly }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('POST', '/api/auth/change-password', { currentPassword, newPassword }),
  state: () => request<ServerState>('GET', '/api/state'),
  upsert: (collection: CollectionName, id: string, data: unknown) =>
    request<{ ok: true }>('PUT', `/api/${collection}/${encodeURIComponent(id)}`, { data }),
  pushKey: () => request<{ publicKey: string }>('GET', '/api/push/key'),
  pushSubscribe: (subscription: unknown) => request<{ ok: true }>('POST', '/api/push/subscribe', { subscription }),
  pushUnsubscribe: (endpoint: string) => request<{ ok: true }>('POST', '/api/push/unsubscribe', { endpoint }),
  voipStatus: () => request<{ enabled: boolean; connected: boolean; extension: string }>('GET', '/api/voip/status'),
  voipCall: (to: string) => request<{ ok: true }>('POST', '/api/voip/call', { to }),
  notifications: () => request<{ notifications: AppNotification[] }>('GET', '/api/notifications'),
  markNotificationsRead: (ids?: string[]) => request<{ ok: true }>('POST', '/api/notifications/read', { ids }),
  clearNotifications: () => request<{ ok: true }>('DELETE', '/api/notifications'),
  remove: (collection: CollectionName, id: string) =>
    request<{ ok: true }>('DELETE', `/api/${collection}/${encodeURIComponent(id)}`),

};
