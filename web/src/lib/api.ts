import type { StoredReport } from '../components/admin/AiSalesReport';
import type { AppNotification } from './notifications';
import { User, FileTransfer, AuditLog, SystemSettings, Department, Task, DailyReport, Customer, Deal, CrmActivity, Warranty, WarrantyClaim, SupportPlan, SupportSettings, SupportSub, SupportTicket, TicketStatus, WarrantySettings, ClaimStatus, ClaimResolution } from '../types';

const TOKEN_KEY = 'app_token_v6';

// Every browser tab keeps ITS OWN login (sessionStorage); localStorage only hands the last login to tabs opened later.
// With one shared token, signing in as somebody else in a second tab silently changed who the first tab acted as: the admin console
// then saved as an ordinary employee and the server answered «forbidden».
export const getToken = (): string | null => {
  try {
    const own = sessionStorage.getItem(TOKEN_KEY);
    if (own) return own;
    const shared = localStorage.getItem(TOKEN_KEY);
    if (shared) sessionStorage.setItem(TOKEN_KEY, shared); // this tab now belongs to that login
    return shared;
  } catch {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }
};

export const setToken = (token: string | null) => {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    /* storage unavailable */
  }
};

/** A key given to another program (the secret itself is never sent again after it was made). */
export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  actAs: string;
  actAsName: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  uses: number;
}

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
  hasTranscript?: boolean;
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
  /** a leave (default) or an advance payment */
  kind?: 'leave' | 'advance';
  amount?: number;
  installments?: number;
  needDate?: string;
  /** after the approval: who the request was sent on to */
  forwardIds?: string[];
  forwardNames?: string[];
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
  provider?: string;
  sender: string;
  footer: string;
  /** ready-made texts shown in the send window (null = the four originals) and the company's own texts */
  library: string[] | null;
  custom: { id: string; title: string; text: string }[];
  /** kinds of automatic messages to customers that are switched on */
  auto: string[];
  /** shown while no footer is written: the company's name */
  defaultFooter?: string;
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
  /** ISO time of the next automatic reset to the starting data. */
  nextResetAt?: string;
  accounts?: { name: string; title: string; identifier: string; password: string }[];
}

export interface WhProduct {
  id: string;
  code: string;
  title: string;
  unit: string;
  group?: string;
  /** «service» = a service (a licence, an installation…): it is sold and priced but has no stock, no warehouse documents */
  kind?: 'good' | 'service';
  /** everything the accounting program keeps about the product (name → text) */
  sepidar?: Record<string, string>;
  barcode?: string;
  minQty?: number;
  /** months of warranty the product carries (0 or missing = none) */
  warrantyMonths?: number;
  /** several named prices (retail, wholesale…) */
  prices?: { title: string; amount: number }[];
  note?: string;
  /** what the product costs the company (Toman, per unit); used for the profit report */
  cost?: number;
  active?: boolean;
  total: number;
  byWarehouse: Record<string, number>;
}
export interface WhWarehouse {
  id: string;
  title: string;
  code?: string;
  location?: string;
  keeperId?: string;
  note?: string;
  active?: boolean;
  /** everything the accounting program keeps about the warehouse (name → text) */
  sepidar?: Record<string, string>;
}
export type WhKind = 'receipt' | 'issue' | 'transfer' | 'adjust';
export interface WhDocLine {
  productId: string;
  code: string;
  title: string;
  unit: string;
  qty: number;
  before?: number;
  delta?: number;
}
export interface WhDoc {
  id: string;
  kind: WhKind;
  number: number;
  date: string;
  warehouseId: string;
  warehouseName: string;
  toWarehouseId?: string;
  toWarehouseName?: string;
  party?: string;
  customerId?: string;
  note?: string;
  reason?: string;
  lines: WhDocLine[];
  createdByName?: string;
  createdAt?: string;
  voided?: boolean;
  voidReason?: string;
  voidedByName?: string;
  /** a copy of a Sepidar sales invoice (goods that left the warehouse), shown read-only */
  source?: 'sepidar';
  /** a document of Sepidar: «issueReturn» is a return of a warehouse exit */
  subtype?: 'issue' | 'issueReturn';
}
export interface WhState {
  /** what this person may see (the permission table): the numbers of stock, the money, and which sorts of document */
  limits?: { qty: boolean; money: boolean; kinds: WhKind[] };
  warehouses: WhWarehouse[];
  products: WhProduct[];
  recent: WhDoc[];
  kinds: Record<WhKind, string>;
  mode: 'standalone' | 'sepidar';
  lastSyncAt?: string;
  source?: string;
}
export interface WhCard {
  product: WhProduct;
  rows: { date: string; kind: WhKind; number: number; docId: string; warehouseId: string; party: string; note: string; in: number; out: number; balance: number }[];
  balance: number;
}

export interface Reminder {
  id: string;
  title: string;
  note: string;
  dueAt: string;
  /** the day and the clock in Tehran */
  date: string;
  time: string;
  repeat: 'none' | 'daily' | 'weekly';
  status: 'pending' | 'fired' | 'done';
  firedAt?: string;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const token = getToken();
  const send = () =>
    fetch(url, {
      method,
      cache: method === 'GET' ? 'no-store' : undefined,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  // The server may be restarting for an update for a few seconds («Failed to fetch»): a request that can safely be sent twice (reading, saving the same
  // record, deleting) is tried again after 2 and 5 seconds; a new record (POST) is not repeated, because it could be created twice.
  const again = method === 'GET' || method === 'PUT' || method === 'DELETE';
  let res: Response;
  try {
    res = await send();
  } catch {
    res = undefined as unknown as Response;
    if (again) {
      for (const wait of [2000, 5000]) {
        await new Promise((r) => setTimeout(r, wait));
        try {
          res = await send();
          break;
        } catch {
          /* the next try */
        }
      }
    }
    if (!res) throw new ApiError(0, 'ارتباط با سرور برقرار نشد؛ شاید سرور همین حالا برای به‌روزرسانی چند ثانیه دوباره راه می‌افتد. کمی بعد دوباره امتحان کنید.');
  }
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
  voipStatus: () => request<{ enabled: boolean; connected: boolean; extension: string; areaCode?: string }>('GET', '/api/voip/status'),
  voipArea: () => request<{ code: string; city: string }>('GET', '/api/voip/area'),
  voipSetArea: (code: string, city: string) => request<{ code: string; city: string }>('PUT', '/api/voip/area', { code, city }),
  demoInfo: () => request<DemoInfo>('GET', '/api/demo/info'),
  adminFileInfo: () => request<{ sizes: Record<string, number>; totalBytes: number; retentionDays: number }>('GET', '/api/admin/files/info'),
  adminFilePurge: (id: string) => request<{ ok: true }>('POST', `/api/admin/files/${encodeURIComponent(id)}/purge`),
  adminFileKeep: (id: string, keep: boolean) => request<{ ok: true }>('POST', `/api/admin/files/${encodeURIComponent(id)}/keep`, { keep }),
  announcements: () => request<{ announcements: Announcement[]; canPost: boolean }>('GET', '/api/announcements'),
  announcementCreate: (b: { title: string; text: string; important: boolean; pinned: boolean; banner?: boolean; bannerDays?: number; eventDate?: string }) => request<{ ok: true; id: string }>('POST', '/api/announcements', b),
  announcementDelete: (id: string) => request<{ ok: true }>('DELETE', `/api/announcements/${encodeURIComponent(id)}`),
  announcementPin: (id: string, pinned: boolean) => request<{ ok: true }>('POST', `/api/announcements/${encodeURIComponent(id)}/pin`, { pinned }),
leaves: (scope: 'mine' | 'all' | 'forwarded') => request<{ leaves: LeaveRequest[]; canDecide: boolean }>('GET', '/api/leaves?scope=' + scope),
leaveCreate: (b: { kind?: 'leave' | 'advance'; type?: string; fromDate?: string; toDate?: string; fromTime?: string; toTime?: string; reason: string; amount?: number; installments?: number; needDate?: string }) => request<{ ok: true; to?: string[]; id: string }>('POST', '/api/leaves', b),
leaveDecide: (id: string, status: 'APPROVED' | 'REJECTED', note: string, forwardTo: string[] = []) => request<{ ok: true }>('POST', `/api/leaves/${encodeURIComponent(id)}/decide`, { status, note, forwardTo }),
  leaveCancel: (id: string) => request<{ ok: true }>('DELETE', `/api/leaves/${encodeURIComponent(id)}`),
  netWatch: () => request<any>('GET', '/api/admin/netwatch'),
  serverInfo: () => request<any>('GET', '/api/admin/server-info'),
  warrantyList: () => request<{ warranties: Warranty[]; claims: WarrantyClaim[]; settings: WarrantySettings; canManage: boolean }>('GET', '/api/warranty'),
  warrantySaveSettings: (b: WarrantySettings) => request<WarrantySettings>('PUT', '/api/warranty/settings', b),
  warrantyPut: (id: string, b: Partial<Warranty>) => request<Warranty>('PUT', `/api/warranty/items/${encodeURIComponent(id)}`, b),
  warrantyVoid: (id: string, reason: string) => request<{ ok: true }>('POST', `/api/warranty/items/${encodeURIComponent(id)}/void`, { reason }),
  claimCreate: (b: { warrantyId: string; description: string; reportedAt: string; vehicle: { model: string; plate: string; km: number }; handlerId?: string; photos: string[] }) => request<WarrantyClaim>('POST', '/api/warranty/claims', b),
  claimStatus: (id: string, b: { status: ClaimStatus; note?: string; resolution?: ClaimResolution; replacementSerial?: string; cost?: number }) => request<WarrantyClaim>('POST', `/api/warranty/claims/${encodeURIComponent(id)}/status`, b),
  claimNote: (id: string, text: string) => request<WarrantyClaim>('POST', `/api/warranty/claims/${encodeURIComponent(id)}/note`, { text }),
  claimAssign: (id: string, handlerId: string) => request<WarrantyClaim>('POST', `/api/warranty/claims/${encodeURIComponent(id)}/assign`, { handlerId }),
  supportList: () => request<{ plans: SupportPlan[]; subs: SupportSub[]; tickets: SupportTicket[]; canManage: boolean }>('GET', '/api/support'),
  supportPlanPut: (id: string, b: Partial<SupportPlan>) => request<SupportPlan>('PUT', `/api/support/plans/${encodeURIComponent(id)}`, b),
  supportSubPut: (id: string, b: Record<string, unknown>) => request<SupportSub>('PUT', `/api/support/subs/${encodeURIComponent(id)}`, b),
  supportSubCancel: (id: string, reason: string) => request<{ ok: true }>('POST', `/api/support/subs/${encodeURIComponent(id)}/cancel`, { reason }),
  ticketCreate: (b: Record<string, unknown>) => request<SupportTicket>('POST', '/api/support/tickets', b),
  ticketStatus: (id: string, b: { status: TicketStatus; note?: string; minutes?: number; visit?: boolean }) => request<SupportTicket>('POST', `/api/support/tickets/${encodeURIComponent(id)}/status`, b),
  ticketNote: (id: string, text: string, pub = false) => request<SupportTicket>('POST', `/api/support/tickets/${encodeURIComponent(id)}/note`, { text, public: pub }),
  supportGetSettings: () => request<SupportSettings>('GET', '/api/support/settings'),
  supportSaveSettings: (b: Record<string, unknown>) => request<SupportSettings>('PUT', '/api/support/settings', b),
  supportAiTest: () => request<{ reply: string }>('POST', '/api/support/ai-test', {}),
  ticketAssign: (id: string, handlerId: string) => request<SupportTicket>('POST', `/api/support/tickets/${encodeURIComponent(id)}/assign`, { handlerId }),
  reportAiSales: (rangeLabel: string, data: unknown) => request<StoredReport>('POST', '/api/reports/ai-sales', { rangeLabel, data }),
  customerCallReport: (id: string) => request<{ customer: Customer; deals: Deal[]; activities: CrmActivity[] }>('GET', `/api/customers/${encodeURIComponent(id)}/call-report`),
  customerAiGet: (id: string) => request<{ createdAt: string; analysis: Record<string, unknown> | null }>('GET', `/api/customers/${encodeURIComponent(id)}/ai-analysis`),
  customerAiRun: (id: string) => request<{ createdAt: string; analysis: Record<string, unknown> | null }>('POST', `/api/customers/${encodeURIComponent(id)}/ai-analysis`, {}),
  customerDupCheck: (phones: string[], codes: string[]) => request<{ phones: Record<string, { name: string; visible: boolean }>; codes: Record<string, { name: string; visible: boolean }> }>('POST', '/api/customers/dup-check', { phones, codes }),
  reportAiDaily: (b: { from: string; to: string; userId?: string }) => request<unknown>('POST', '/api/reports/ai-daily', b),
  reportAiHistory: () => request<{ reports: { id: string; createdAt: string; trigger: string; periodDays: number; headline?: string; mood?: string }[] }>('GET', '/api/reports/ai-history'),
  reportAiOne: (id: string) => request<StoredReport>('GET', `/api/reports/ai-history/${encodeURIComponent(id)}`),
  reportAiScheduleGet: () => request<{ enabled: boolean; everyDays: number; periodDays: number; lastRunAt?: string; lastError?: string }>('GET', '/api/reports/ai-schedule'),
  reportAiSchedulePut: (b: { enabled: boolean; everyDays: number; periodDays: number }) => request<{ enabled: boolean; everyDays: number; periodDays: number; lastRunAt?: string; lastError?: string }>('PUT', '/api/reports/ai-schedule', b),
  reportAiScheduleRun: () => request<StoredReport>('POST', '/api/reports/ai-schedule/run', {}),
  minutesTranscribeStart: async (blob: Blob, ext: 'wav' | 'mp3') => {
    const res = await fetch('/api/minutes/transcribe?ext=' + ext, { method: 'POST', headers: { Authorization: `Bearer ${getToken() || ''}`, 'Content-Type': 'application/octet-stream' }, body: blob });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, json.error || 'فرستادن صدا انجام نشد.');
    return json as { id: string };
  },
  minutesTranscribeGet: (id: string) => request<{ status: 'running' | 'done' | 'error'; text: string; error: string }>('GET', '/api/minutes/transcribe/' + id),
  minutesAi: (b: { mode: 'draft' | 'summary'; text: string; people?: string[] }) => request<{ draft?: { title?: string; agenda?: string[]; discussion?: string; decisions?: { text: string; owner?: string; dueInDays?: number | null }[] }; discussion?: string }>('POST', '/api/minutes/ai', b),
  letterAi: (b: { subject: string; instruction: string; currentText: string; recipient: string; sender: string; tone: string }) => request<{ draft: { subject?: string; paragraphs: string[] } }>('POST', '/api/letters/ai', b),
  voipTranscribe: (id: string) => request<{ status: string }>('POST', `/api/voip/transcribe/${encodeURIComponent(id)}`, {}),
  voipTranscript: (id: string) => request<{ status: 'none' | 'running' | 'done' | 'error'; text?: string; error?: string }>('GET', `/api/voip/transcript/${encodeURIComponent(id)}`),
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
  crmDuplicates: (b: { phones: string[]; nationalCode?: string; nationalId?: string; exceptId?: string }) =>
    request<{
      matches: { id: string; name: string; ownerName: string; mine: boolean }[];
      sepidar?: { sepidarId: number; name: string; code?: string; linkedCustomerId?: string }[];
      sepidarLinked?: { sepidarId: number; name: string } | null;
    }>('POST', '/api/crm/duplicates', b),
  crmSepidarLink: (customerId: string, sepidarId: number) => request<{ ok: true; name?: string }>('POST', '/api/crm/sepidar-link', { customerId, sepidarId }),
  crmMerge: (keepId: string, dropId: string) => request<{ ok: true; keepId: string }>('POST', '/api/crm/merge', { keepId, dropId }),
  crmTransfer: (b: { fromId: string; toId: string; customers: boolean; deals: boolean; followups: boolean }) => request<{ ok: true; customers: number; deals: number; followups: number }>('POST', '/api/crm/transfer', b),
  crmTargets: () => request<Record<string, unknown>>('GET', '/api/crm/targets'),
  crmTargetsSave: (b: unknown) => request<{ ok: true }>('PUT', '/api/crm/targets', b),
  crmRules: () => request<Record<string, unknown>>('GET', '/api/crm/rules'),
  crmRulesSave: (b: unknown) => request<{ ok: true }>('PUT', '/api/crm/rules', b),
  clubGet: () => request<Record<string, unknown>>('GET', '/api/crm/club'),
  clubSave: (c: unknown) => request<{ ok: true }>('PUT', '/api/crm/club', c),
  smsStatus: () => request<{ enabled: boolean; canSend: boolean; library: string[] | null; custom: { id: string; title: string; text: string }[] }>('GET', '/api/sms/status'),
  smsBulkStart: (b: { customerIds: string[]; templateKey: string }) => request<{ id: string; total: number; sent: number; failed: number; skipped: number; done: boolean; error: string }>('POST', '/api/sms/bulk', b),
  smsBulkProgress: (id: string) => request<{ id: string; total: number; sent: number; failed: number; skipped: number; done: boolean; error: string }>('GET', `/api/sms/bulk/${encodeURIComponent(id)}`),
  smsTemplates: () => request<{ templates: { key: string; title: string; when: string; sample: string }[] }>('GET', '/api/sms/templates'),
  smsSettings: () => request<SmsSettings>('GET', '/api/sms/settings'),
  smsSave: (b: { footer: string; auto: string[]; library: string[] | null; custom: { id: string; title: string; text: string }[]; sender: string; enabled: boolean; labels: string[]; apiKey: string }) => request<SmsSettings>('PUT', '/api/sms/settings', b),
  smsBalance: () => request<{ balance: string }>('GET', '/api/sms/balance'),
  smsLog: () => request<{ log: SmsLogRow[] }>('GET', '/api/sms/log'),
  apiKeys: () => request<{ keys: ApiKeyRow[]; scopes: Record<string, string> }>('GET', '/api/apikeys'),
  apiKeyCreate: (b: { name: string; scopes: string[]; actAs: string; expiresDays: number }) => request<{ key: string; id: string }>('POST', '/api/apikeys', b),
  apiKeyDelete: (id: string) => request<{ ok: true }>('DELETE', `/api/apikeys/${encodeURIComponent(id)}`),
  smsTest: (to: string) => request<{ ok: true }>('POST', '/api/sms/test', { to }),
  smsSend: (b: { to: string; templateKey: string; customerId: string }) => request<{ ok: true }>('POST', '/api/sms/send', b),
  statsData: () => request<{ staff: User[]; transfers: FileTransfer[]; tasks: Task[]; reports: DailyReport[]; customers: Customer[]; deals: Deal[]; missing?: CrmActivity[]; activities?: CrmActivity[]; warranties?: Warranty[]; warrantyClaims?: WarrantyClaim[]; supportSubs?: SupportSub[]; supportTickets?: SupportTicket[] }>('GET', '/api/stats-data'),
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
  voipCallCustomer: (customerId: string) => request<{ ok: true }>('POST', '/api/voip/call-customer', { customerId }),
  voipCall: (to: string, from?: string) => request<{ ok: true }>('POST', '/api/voip/call', from ? { to, from } : { to }),
  notifications: () => request<{ notifications: AppNotification[] }>('GET', '/api/notifications'),
  markNotificationsRead: (ids?: string[]) => request<{ ok: true }>('POST', '/api/notifications/read', { ids }),
  reminders: () => request<{ reminders: Reminder[]; now: string }>('GET', '/api/reminders'),
  reminderCreate: (b: Record<string, unknown>) => request<Reminder>('POST', '/api/reminders', b),
  reminderUpdate: (id: string, b: Record<string, unknown>) => request<{ ok: true }>('PUT', `/api/reminders/${encodeURIComponent(id)}`, b),
  reminderDelete: (id: string) => request<{ ok: true }>('DELETE', `/api/reminders/${encodeURIComponent(id)}`),
  reminderDone: (id: string) => request<{ ok: true }>('POST', `/api/reminders/${encodeURIComponent(id)}/done`, {}),
  reminderSnooze: (id: string, minutes: number) => request<{ ok: true }>('POST', `/api/reminders/${encodeURIComponent(id)}/snooze`, { minutes }),
  sepidar: () => request<Record<string, unknown>>('GET', '/api/sepidar'),
  sepidarFinance: (customerId: string, forCall = false) =>
    request<{
      linked: boolean;
      sepidarId?: number;
      title?: string;
      remainder?: number;
      creditRemainder?: number;
      balanceAt?: string;
      invoices?: { number: number; date: string; net: number }[];
      invoiceCount?: number;
      invoiceTotal?: number;
      invoicesAt?: string;
    }>('GET', `/api/sepidar/finance/${encodeURIComponent(customerId)}${forCall ? '?for=call' : ''}`),
  /** The files of the Sepidar program as a zip (managers), to copy onto the accounting computer by hand. */
  sepidarToolFiles: async (): Promise<Blob> => {
    const res = await fetch('/api/sepidar/tool-files', { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error('فایل‌ها دریافت نشد.');
    return res.blob();
  },
  sepidarConnected: () => request<{ connected: boolean; choice: 'yes' | 'no' | 'auto'; seen: boolean }>('GET', '/api/sepidar/connected'),
  sepidarSetSwitch: (value: 'yes' | 'no') => request<{ ok: true }>('PUT', '/api/sepidar/switch', { value }),
  sepidarPair: () => request<{ code: string; expiresAt: string }>('POST', '/api/sepidar/pair', {}),
  sepidarJob: (b: Record<string, unknown>) => request<{ id: string }>('POST', '/api/sepidar/jobs', b),
  sepidarCancel: (id: string) => request<{ ok: true }>('POST', `/api/sepidar/jobs/${encodeURIComponent(id)}/cancel`, {}),
  crmProducts: () => request<{ products: { id: string; code: string; title: string; unit: string; group?: string; kind?: string; warrantyMonths?: number; total: number; cost?: number; prices?: { title: string; amount: number }[] }[] }>('GET', '/api/crm/products'),
  warehouse: () => request<WhState>('GET', '/api/warehouse'),
  warehouseDocs: (q: Record<string, string>) => request<{ docs: WhDoc[] }>('GET', '/api/warehouse/docs?' + new URLSearchParams(q).toString()),
  warehouseCard: (product: string, warehouse = '') => request<WhCard>('GET', `/api/warehouse/card?product=${encodeURIComponent(product)}&warehouse=${encodeURIComponent(warehouse)}`),
  minutesList: () => request<{ minutes: import('../types').Minutes[] }>('GET', '/api/minutes'),
  minutesSave: (m: import('../types').Minutes) => request<{ ok: true }>('PUT', `/api/minutes/${encodeURIComponent(m.id)}`, m),
  minutesDelete: (id: string) => request<{ ok: true }>('DELETE', `/api/minutes/${encodeURIComponent(id)}`),
  whProductSave: (id: string, b: Record<string, unknown>) => request<{ ok: true }>('PUT', `/api/warehouse/products/${encodeURIComponent(id)}`, b),
  whProductDelete: (id: string) => request<{ ok: true }>('DELETE', `/api/warehouse/products/${encodeURIComponent(id)}`),
  whWarehouseSave: (id: string, b: Record<string, unknown>) => request<{ ok: true }>('PUT', `/api/warehouse/warehouses/${encodeURIComponent(id)}`, b),
  whWarehouseDelete: (id: string) => request<{ ok: true }>('DELETE', `/api/warehouse/warehouses/${encodeURIComponent(id)}`),
  whSepidarDocsImport: (type: 'issue' | 'issueReturn', rows: Record<string, string>[]) => request<{ added: number; updated: number; total: number }>('POST', '/api/warehouse/sepidar-docs', { type, rows }),
  whDocCreate: (b: Record<string, unknown>) => request<WhDoc>('POST', '/api/warehouse/docs', b),
  whDocVoid: (id: string, reason: string) => request<{ ok: true }>('POST', `/api/warehouse/docs/${encodeURIComponent(id)}/void`, { reason }),
  whSetMode: (mode: 'standalone' | 'sepidar') => request<{ ok: true }>('PUT', '/api/warehouse/mode', { mode }),
  clearNotifications: () => request<{ ok: true }>('DELETE', '/api/notifications'),
  remove: (collection: CollectionName, id: string) =>
    request<{ ok: true }>('DELETE', `/api/${collection}/${encodeURIComponent(id)}`),

};
