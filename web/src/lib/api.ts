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

export interface VoipCall {
  id: string;
  startedAt: string;
  direction: 'in' | 'out' | 'internal';
  status: 'answered' | 'missed' | 'busy' | 'failed';
  ext: string;
  userId: string;
  userName: string;
  number: string;
  name: string;
  customerId: string;
  customerName: string;
  duration: number;
}

export interface VoipStatRow {
  key: string;
  total: number;
  answered: number;
  missed: number;
  seconds: number;
}

export interface SmsSettings {
  provider: '' | 'smsir' | 'kavenegar';
  sender: string;
  enabled: boolean;
  labels: string[];
  hasKey: boolean;
  keyTail: string;
}

export interface SmsLogRow {
  at: string;
  by: string;
  to: string;
  text: string;
  status: string;
  detail: string;
}

export interface MsgrBotInfo {
  enabled: boolean;
  hasToken: boolean;
  tokenTail: string;
  username: string;
}

export interface MsgrSettings {
  telegram: MsgrBotInfo;
  bale: MsgrBotInfo;
  proxy: string;
}

export interface UploadedSound {
  id: string;
  name: string;
  mime: string;
  size: number;
}

export interface DemoInfo {
  demo: boolean;
  resetHours?: number;
  accounts?: { name: string; title: string; identifier: string; password: string }[];
}

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
  demoInfo: () => request<DemoInfo>('GET', '/api/demo/info'),
  voipCalls: (o: { scope?: 'all' | 'mine'; customer?: string; limit?: number } = {}) => {
    const p = new URLSearchParams();
    if (o.scope === 'all') p.set('scope', 'all');
    if (o.customer) p.set('customer', o.customer);
    if (o.limit) p.set('limit', String(o.limit));
    return request<{ calls: VoipCall[] }>('GET', '/api/voip/calls' + (p.toString() ? '?' + p : ''));
  },
  msgrStatus: () => request<{ telegram: boolean; bale: boolean }>('GET', '/api/msgr/status'),
  msgrSettings: () => request<MsgrSettings>('GET', '/api/msgr/settings'),
  msgrSave: (b: { telegram: { enabled: boolean; token: string }; bale: { enabled: boolean; token: string }; proxy: string }) => request<MsgrSettings>('PUT', '/api/msgr/settings', b),
  msgrCheck: (channel: string, chatId: string) => request<{ username: string }>('POST', '/api/msgr/check', { channel, chatId }),
  msgrLink: (channel: string, customer: string) => request<{ link: string }>('GET', `/api/msgr/link?channel=${channel}&customer=${encodeURIComponent(customer)}`),
  msgrSendFile: async (f: { channel: string; chatId: string; customerId: string; caption: string; file: Blob; filename: string }) => {
    const fd = new FormData();
    fd.set('channel', f.channel);
    fd.set('chatId', f.chatId);
    fd.set('customerId', f.customerId);
    fd.set('caption', f.caption);
    fd.set('file', f.file, f.filename);
    const res = await fetch('/api/msgr/send', { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'ارسال نشد.');
    return j as { ok: true };
  },
  sounds: () => request<{ sounds: UploadedSound[] }>('GET', '/api/sounds'),
  soundUpload: async (file: File, name: string) => {
    const fd = new FormData();
    fd.set('file', file, file.name);
    fd.set('name', name);
    const res = await fetch('/api/sounds', { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || 'آپلود نشد.');
    return j as UploadedSound;
  },
  soundDelete: (id: string) => request<{ ok: true }>('DELETE', `/api/sounds/${encodeURIComponent(id)}`),
  notifyTest: (kind: string, label: string) => request<{ ok: true }>('POST', '/api/notify/test', { kind, label }),
  smsStatus: () => request<{ enabled: boolean }>('GET', '/api/sms/status'),
  smsSettings: () => request<SmsSettings>('GET', '/api/sms/settings'),
  smsSave: (b: { provider: string; sender: string; enabled: boolean; labels: string[]; apiKey: string }) => request<SmsSettings>('PUT', '/api/sms/settings', b),
  smsBalance: () => request<{ balance: string }>('GET', '/api/sms/balance'),
  smsLog: () => request<{ log: SmsLogRow[] }>('GET', '/api/sms/log'),
  smsTest: (to: string) => request<{ ok: true }>('POST', '/api/sms/test', { to }),
  smsSend: (b: { to: string; text: string; customerId?: string }) => request<{ ok: true }>('POST', '/api/sms/send', b),
  statsData: () => request<{ staff: User[]; transfers: FileTransfer[]; tasks: Task[]; reports: DailyReport[]; customers: Customer[]; deals: Deal[] }>('GET', '/api/stats-data'),
  voipStats: () => request<{ byDay: VoipStatRow[]; byExt: VoipStatRow[] }>('GET', '/api/voip/stats'),
  voipLog: () => request<{ enabled: boolean; connected: boolean; eventCount: number; lastEvent: string | null; entries: { at: string; text: string }[] }>('GET', '/api/voip/log'),
  voipTestPopup: () => request<{ ok: true }>('POST', '/api/voip/test-popup'),
  voipCall: (to: string) => request<{ ok: true }>('POST', '/api/voip/call', { to }),
  notifications: () => request<{ notifications: AppNotification[] }>('GET', '/api/notifications'),
  markNotificationsRead: (ids?: string[]) => request<{ ok: true }>('POST', '/api/notifications/read', { ids }),
  clearNotifications: () => request<{ ok: true }>('DELETE', '/api/notifications'),
  remove: (collection: CollectionName, id: string) =>
    request<{ ok: true }>('DELETE', `/api/${collection}/${encodeURIComponent(id)}`),

};
