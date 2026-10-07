import type { NotificationKind } from './notifications';
import { NotifyRule, NotifySettings } from '../types';

/** What each kind of notification sounds like until an admin chooses otherwise. */
export const DEFAULT_KIND_SOUND: Record<NotificationKind, string> = {
  file: 'bell',
  letter: 'formal',
  task: 'cheerful',
  alert: 'alert',
  call: 'ring',
  chat: 'droplet',
};

export const KIND_LABEL: Record<NotificationKind, string> = {
  file: 'فایل',
  letter: 'نامه',
  task: 'وظیفه و گزارش و مشتریان',
  alert: 'هشدار و حذف',
  call: 'تماس تلفنی',
  chat: 'گفتگو (چت)',
};

export const KINDS: NotificationKind[] = ['file', 'letter', 'task', 'alert', 'call', 'chat'];

/** Every event the system announces, by the label shown on the notification. */
export const EVENTS: { label: string; kind: NotificationKind; group: string }[] = [
  { label: 'فایل جدید', kind: 'file', group: 'فایل' },
  { label: 'دریافت شد', kind: 'file', group: 'فایل' },
  { label: 'نامه جدید', kind: 'letter', group: 'نامه' },
  { label: 'جهت امضا', kind: 'letter', group: 'نامه' },
  { label: 'ویرایش نامه', kind: 'letter', group: 'نامه' },
  { label: 'امضا شد', kind: 'letter', group: 'نامه' },
  { label: 'ارجاع', kind: 'letter', group: 'نامه' },
  { label: 'رد شد', kind: 'alert', group: 'هشدار' },
  { label: 'فایل حذف شد', kind: 'alert', group: 'هشدار' },
  { label: 'نامه حذف شد', kind: 'alert', group: 'هشدار' },
  { label: 'وظیفه حذف شد', kind: 'alert', group: 'هشدار' },
  { label: 'تغییر حساب', kind: 'alert', group: 'هشدار' },
  { label: 'وظیفه جدید', kind: 'task', group: 'وظایف' },
  { label: 'واگذار شد', kind: 'task', group: 'وظایف' },
  { label: 'نظر جدید', kind: 'task', group: 'وظایف' },
  { label: 'موعد امروز', kind: 'task', group: 'وظایف' },
  { label: 'موعد گذشته', kind: 'task', group: 'وظایف' },
  { label: 'گزارش روزانه', kind: 'task', group: 'وظایف' },
  { label: 'پیگیری جدید', kind: 'task', group: 'مشتریان' },
  { label: 'پیگیری امروز', kind: 'task', group: 'مشتریان' },
  { label: 'پیگیری عقب‌افتاده', kind: 'task', group: 'مشتریان' },
  { label: 'فرصت فروش', kind: 'task', group: 'مشتریان' },
  { label: 'تغییر مرحله', kind: 'task', group: 'مشتریان' },
  { label: 'پیش‌فاکتور', kind: 'task', group: 'مشتریان' },
  { label: 'سابقهٔ جدید', kind: 'task', group: 'مشتریان' },
  { label: 'فروش موفق', kind: 'task', group: 'مشتریان' },
  { label: 'اتصال به ربات', kind: 'task', group: 'مشتریان' },
  { label: 'پیام جدید', kind: 'chat', group: 'گفتگو' },
  { label: 'تماس ورودی', kind: 'call', group: 'تلفن' },
  { label: 'تماس بی‌پاسخ', kind: 'call', group: 'تلفن' },
];

export const DEFAULT_NOTIFY: Required<Pick<NotifySettings, 'enabled' | 'volume' | 'popupSeconds'>> = { enabled: true, volume: 0.8, popupSeconds: 9 };

export interface ResolvedRule {
  enabled: boolean;
  sound: string;
  popup: boolean;
  os: boolean;
  push: boolean;
}

/** The rule for one notification: the event's own settings, else its kind's, else the defaults. Missing switches mean «on». */
export function resolveRule(cfg: NotifySettings | undefined, kind: NotificationKind, label?: string): ResolvedRule {
  const k: NotifyRule = cfg?.kinds?.[kind] || {};
  const e: NotifyRule = (label && cfg?.events?.[label]) || {};
  const pick = <T,>(a: T | undefined, b: T | undefined, d: T): T => (a !== undefined ? a : b !== undefined ? b : d);
  const sound = e.sound && e.sound !== 'inherit' ? e.sound : k.sound || DEFAULT_KIND_SOUND[kind] || 'bell';
  return {
    enabled: (cfg?.enabled ?? true) && pick(e.enabled, k.enabled, true),
    sound,
    // a missed call was already announced by its ringing pop-up: by default it only goes to the bell list, the phone and the sound
    popup: pick(e.popup, k.popup, label !== 'تماس بی‌پاسخ'),
    os: pick(e.os, k.os, true),
    push: pick(e.push, k.push, true),
  };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = (hhmm || '0:0').split(':').map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
};

/** True while the organisation's quiet hours are on (sound is muted; pop-ups still appear). */
export function inQuietHours(cfg: NotifySettings | undefined, now = new Date()): boolean {
  const q = cfg?.quiet;
  if (!q?.enabled) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const a = toMinutes(q.from);
  const b = toMinutes(q.to);
  return a <= b ? cur >= a && cur < b : cur >= a || cur < b;
}
