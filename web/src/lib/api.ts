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
  /** The phone system recorded this call and the file is available. */
  hasRecording?: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  text: string;
  important?: boolean;
  pinned?: boolean;
  authorId: string;
  authorName: string;
  createdAt: string;
  /** shown on top of every page until bannerUntil */
  banner?: boolean;
  bannerDays?: number;
  bannerUntil?: string;
  eventDate?: string;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  departmentName?: string;
  type: string;
  typeLabel: string;
  fromDate: string;
  toDate: string;
  fromTime?: string;
  toTime?: string;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  decidedByName?: string;
  decidedAt?: string;
  note?: string;
}

export interface LicenseStatus {
  mode: 'active' | 'grace' | 'expired' | 'none';
  licensed: boolean;
  readOnly: boolean;
  customer?: string;
  serial?: string;
  expires?: string;
  daysLeft: number;
  maxUsers: number;
  installId: string;
}

export interface ChatMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  at: string;
  read: boolean;
}

export interface ChatConversation {
  userId: string;
  lastText: string;
  lastAt: string;
  lastFromMe: boolean;
  lastRead: boolean;
  unread: number;
}

export interface BackupInfo {
  enabled: boolean;
  pending: boolean;
  items: { name: string; size: number; at: string; kind: 'auto' | 'manual' | 'prerestore' | 'uploaded' }[];
  status: { result: 'ok' | 'error'; at: string; text: string; net?: 'ok' | 'error' | 'off'; netText?: string } | null;
  nettest: { result: 'ok' | 'error'; at: string; text: string } | null;
  nettestPending: boolean;
  cloud: { result: 'ok' | 'error'; at: string; text: string } | null;
  cloudPending: boolean;
  restore: { result: 'ok' | 'error'; at: string; text: string } | null;
}

export interface BackupSettings {
  scheduleEnabled?: boolean;
  scheduleMode?: 'daily' | 'interval' | 'window';
  scheduleFrom?: string;
  scheduleTo?: string;
  scheduleEveryMinutes?: number;
  scheduleTime?: string;
  scheduleDays?: number[];
  scheduleEveryHours?: number;
  netEnabled?: boolean;
  netHost?: string;
  netShare?: string;
  netFolder?: string;
  netUser?: string;
  netDomain?: string;
  hasPassword?: boolean;
  cloudEnabled?: boolean;
  cloudType?: 'drive' | 'onedrive';
  cloudFolder?: string;
  hasCloudToken?: boolean;
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
    cache: method === 'GET' ? 'no-store' : undefined,
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
  adminFileInfo: () => request<{ sizes: Record<string, number>; totalBytes: number; retentionDays: number }>('GET', '/api/admin/files/info'),
  adminFilePurge: (id: string) => request<{ ok: true }>('POST', `/api/admin/files/${encodeURIComponent(id)}/purge`),
  adminFileKeep: (id: string, keep: boolean) => request<{ ok: true }>('POST', `/api/admin/files/${encodeURIComponent(id)}/keep`, { keep }),
  announcements: () => request<{ announcements: Announcement[]; canPost: boolean }>('GET', '/api/announcements'),
  announcementCreate: (b: { title: string; text: string; important: boolean; pinned: boolean; banner?: boolean; bannerDays?: number; eventDate?: string }) => request<{ ok: true; id: string }>('POST', '/api/announcements', b),
  announcementDelete: (id: string) => request<{ ok: true }>('DELETE', `/api/announcements/${encodeURIComponent(id)}`),
  announcementPin: (id: string, pinned: boolean) => request<{ ok: true }>('POST', `/api/announcements/${encodeURIComponent(id)}/pin`, { pinned }),
  leaves: (scope: 'mine' | 'all') => request<{ leaves: LeaveRequest[]; canDecide: boolean }>('GET', '/api/leaves?scope=' + scope),
  leaveCreate: (b: { type: string; fromDate: string; toDate: string; fromTime?: string; toTime?: string; reason: string }) => request<{ ok: true; id: string }>('POST', '/api/leaves', b),
  leaveDecide: (id: string, status: 'APPROVED' | 'REJECTED', note: string) => request<{ ok: true }>('POST', `/api/leaves/${encodeURIComponent(id)}/decide`, { status, note }),
  leaveCancel: (id: string) => request<{ ok: true }>('DELETE', `/api/leaves/${encodeURIComponent(id)}`),
  netWatch: () => request<any>('GET', '/api/admin/netwatch'),
  voipRecordingSetup: () => request<{ key: string; mountedDir: string; mountedFiles: number }>('GET', '/api/voip/recording-setup'),
  /** The recording of a call as a playable blob (the request carries the login, so a plain <audio src> cannot be used). */
  voipRecording: async (id: string): Promise<Blob> => {
    const res = await fetch('/api/voip/recording/' + encodeURIComponent(id), { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'ضبط مکالمه در دسترس نیست.');
    }
    return res.blob();
  },
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
  statsData: () => request<{ staff: User[]; transfers: FileTransfer[]; tasks: Task[]; reports: DailyReport[]; customers: Customer[]; deals: Deal[]; missing?: CrmActivity[] }>('GET', '/api/stats-data'),
  backups: () => request<BackupInfo>('GET', '/api/backups'),
  backupSettings: () => request<BackupSettings>('GET', '/api/backups/settings'),
  backupSaveSettings: (b: BackupSettings & { netPassword: string; cloudToken?: string }) => request<BackupSettings>('PUT', '/api/backups/settings', b),
  backupNetTest: () => request<{ ok: true }>('POST', '/api/backups/net-test'),
  backupCloudTest: () => request<{ ok: true }>('POST', '/api/backups/cloud-test'),
  backupRestore: (file: string) => request<{ ok: true }>('POST', '/api/backups/restore', { file, confirm: true }),
  restoreStatus: async () => (await (await fetch('/api/backups/restore-status')).json()) as { restoring: boolean; result?: 'ok' | 'error'; text?: string },
  backupBrowse: (b: { host: string; path: string; user: string; domain: string; password: string }) => request<{ id: string }>('POST', '/api/backups/browse', b),
  backupBrowseResult: () => request<{ pending?: boolean; id?: string; result?: 'ok' | 'error'; text?: string; items?: string[] }>('GET', '/api/backups/browse'),
  backupUpload: async (file: File) => {
    const res = await fetch('/api/backups/upload', { method: 'POST', headers: { Authorization: `Bearer ${getToken() || ''}`, 'Content-Type': 'application/octet-stream' }, body: file });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, json.error || 'upload failed');
    return json as { name: string; at: string };
  },
  chatConversations: () => request<{ conversations: ChatConversation[] }>('GET', '/api/chat/conversations'),
  chatMessages: (withId: string) => request<{ messages: ChatMessage[] }>('GET', '/api/chat/messages?with=' + encodeURIComponent(withId)),
  chatSend: (to: string, text: string) => request<ChatMessage>('POST', '/api/chat/messages', { to, text }),
  chatRead: (withId: string) => request<{ ok: true }>('POST', '/api/chat/read', { with: withId }),
  version: async () => (await (await fetch('/api/version', { cache: 'no-store' })).json()) as { version: string; date?: string },
  licenseStatus: async () => (await (await fetch('/api/license/status')).json()) as LicenseStatus,
  licenseActivate: async (code: string) => {
    const res = await fetch('/api/license/activate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, json.error || 'activation failed');
    return json as LicenseStatus;
  },
  licenseRenew: (code: string) => request<LicenseStatus>('POST', '/api/license/renew', { code }),
  backupNow: () => request<{ ok: true }>('POST', '/api/backups'),
  backupDownload: async (name: string) => {
    const res = await fetch('/api/backups/' + encodeURIComponent(name), { headers: { Authorization: `Bearer ${getToken() || ''}` } });
    if (!res.ok) throw new ApiError(res.status, 'download failed');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
  voipStats: () => request<{ byDay: VoipStatRow[]; byExt: VoipStatRow[] }>('GET', '/api/voip/stats'),
  voipLog: () => request<{ enabled: boolean; connected: boolean; eventCount: number; lastEvent: string | null; entries: { at: string; text: string }[]; capture?: { running: boolean; secondsLeft: number; lines: string[] } }>('GET', '/api/voip/log'),
  voipCapture: () => request<{ ok: true }>('POST', '/api/voip/capture'),
  voipTestPopup: () => request<{ ok: true }>('POST', '/api/voip/test-popup'),
  voipCall: (to: string) => request<{ ok: true }>('POST', '/api/voip/call', { to }),
  notifications: () => request<{ notifications: AppNotification[] }>('GET', '/api/notifications'),
  markNotificationsRead: (ids?: string[]) => request<{ ok: true }>('POST', '/api/notifications/read', { ids }),
  clearNotifications: () => request<{ ok: true }>('DELETE', '/api/notifications'),
  remove: (collection: CollectionName, id: string) =>
    request<{ ok: true }>('DELETE', `/api/${collection}/${encodeURIComponent(id)}`),

};
