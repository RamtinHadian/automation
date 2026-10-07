import { PlanColor, SupportSub, SupportTicket, TicketChannel, TicketPriority, TicketStatus } from '../types';
import { todayIso } from './taskDates';
import { toPersianDigits } from './jalali';
import { daysBetween, SOON_DAYS } from './warranty';

export { warrantyEnd as subEnd, dayText, codeText } from './warranty';

export type SubState = 'ACTIVE' | 'SOON' | 'EXPIRED' | 'CANCELLED';

export const subState = (s: SupportSub, today = todayIso()): SubState => {
  if (s.status === 'CANCELLED') return 'CANCELLED';
  if (s.endDate < today) return 'EXPIRED';
  if (daysBetween(today, s.endDate) <= SOON_DAYS) return 'SOON';
  return 'ACTIVE';
};

export const SUB_STATE: Record<SubState, { label: string; cls: string }> = {
  ACTIVE: { label: 'فعال', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  SOON: { label: 'نزدیک به پایان', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  EXPIRED: { label: 'پایان‌یافته', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  CANCELLED: { label: 'لغوشده', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const subRemaining = (s: SupportSub, today = todayIso()): string => {
  if (s.status === 'CANCELLED') return 'لغو شده است';
  const d = daysBetween(today, s.endDate);
  if (d < 0) return `${toPersianDigits(-d)} روز از پایان گذشته`;
  if (d === 0) return 'امروز پایان می‌یابد';
  return `${toPersianDigits(d)} روز مانده`;
};

export const PLAN_COLOR: Record<PlanColor, { name: string; chip: string; bar: string }> = {
  slate: { name: 'خاکستری', chip: 'bg-slate-100 text-slate-700 border-slate-300', bar: 'bg-slate-500' },
  teal: { name: 'سبزآبی', chip: 'bg-teal-50 text-teal-800 border-teal-300', bar: 'bg-teal-600' },
  amber: { name: 'کهربایی', chip: 'bg-amber-50 text-amber-800 border-amber-300', bar: 'bg-amber-500' },
  rose: { name: 'صورتی', chip: 'bg-rose-50 text-rose-700 border-rose-300', bar: 'bg-rose-500' },
  indigo: { name: 'نیلی', chip: 'bg-indigo-50 text-indigo-700 border-indigo-300', bar: 'bg-indigo-500' },
  emerald: { name: 'سبز', chip: 'bg-emerald-50 text-emerald-700 border-emerald-300', bar: 'bg-emerald-600' },
};

export const TICKET_STATUS: Record<TicketStatus, { label: string; cls: string }> = {
  OPEN: { label: 'باز', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  IN_PROGRESS: { label: 'در حال پیگیری', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  WAITING: { label: 'منتظر مشتری', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  RESOLVED: { label: 'حل شد', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CLOSED: { label: 'بسته شد', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

/** The same flow the server enforces (ticketNext in support.go). */
export const TICKET_NEXT: Record<TicketStatus, TicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'WAITING', 'RESOLVED'],
  IN_PROGRESS: ['WAITING', 'RESOLVED'],
  WAITING: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: ['IN_PROGRESS'],
};

export const TICKET_BUTTON: Record<TicketStatus, string> = {
  OPEN: 'باز',
  IN_PROGRESS: 'شروع پیگیری',
  WAITING: 'منتظر پاسخ مشتری',
  RESOLVED: 'حل شد',
  CLOSED: 'بستن درخواست',
};

export const PRIORITY: Record<TicketPriority, { label: string; cls: string }> = {
  LOW: { label: 'کم', cls: 'bg-slate-50 text-slate-600 border-slate-200' },
  NORMAL: { label: 'عادی', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  HIGH: { label: 'مهم', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  URGENT: { label: 'فوری', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const CHANNEL: Record<TicketChannel, string> = { PHONE: 'تلفن', CHAT: 'پیام / گفتگو', EMAIL: 'ایمیل', VISIT: 'حضوری', OTHER: 'سایر' };

export const isOpenTicket = (t: SupportTicket) => t.status !== 'RESOLVED' && t.status !== 'CLOSED';

/** SLA of one ticket: has the first answer / the solution come on time (or is it already late)? */
export type Sla = { kind: 'ok' | 'late' | 'done' | 'doneLate' | 'none'; label: string };

export const hoursText = (ms: number): string => {
  const m = Math.round(Math.abs(ms) / 60000);
  if (m < 60) return `${toPersianDigits(m)} دقیقه`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${toPersianDigits(h)} ساعت${m % 60 ? ` و ${toPersianDigits(m % 60)} دقیقه` : ''}`;
  return `${toPersianDigits(Math.floor(h / 24))} روز`;
};

export const responseSla = (t: SupportTicket, now = Date.now()): Sla => {
  const due = new Date(t.responseDue).getTime();
  if (t.firstResponseAt) {
    const at = new Date(t.firstResponseAt).getTime();
    return at <= due ? { kind: 'done', label: 'پاسخ به‌موقع' } : { kind: 'doneLate', label: `پاسخ با ${hoursText(at - due)} تأخیر` };
  }
  if (!isOpenTicket(t)) return { kind: 'none', label: '' };
  return now > due ? { kind: 'late', label: `${hoursText(now - due)} از مهلت پاسخ گذشته` } : { kind: 'ok', label: `${hoursText(due - now)} تا مهلت پاسخ` };
};

export const resolveSla = (t: SupportTicket, now = Date.now()): Sla => {
  const due = new Date(t.resolveDue).getTime();
  if (t.resolvedAt) {
    const at = new Date(t.resolvedAt).getTime();
    return at <= due ? { kind: 'done', label: 'حل به‌موقع' } : { kind: 'doneLate', label: `حل با ${hoursText(at - due)} تأخیر` };
  }
  if (!isOpenTicket(t)) return { kind: 'none', label: '' };
  return now > due ? { kind: 'late', label: `${hoursText(now - due)} از مهلت حل گذشته` } : { kind: 'ok', label: `${hoursText(due - now)} تا مهلت حل` };
};

export const SLA_CLS: Record<Sla['kind'], string> = {
  ok: 'text-[#8C6F66]',
  late: 'text-rose-600',
  done: 'text-emerald-700',
  doneLate: 'text-amber-700',
  none: 'text-[#8C6F66]',
};

/** Site visits of a subscription that tickets have used (a resolved ticket marked «بازدید حضوری»). */
export const visitsUsed = (s: SupportSub, tickets: SupportTicket[]) => tickets.filter((t) => t.subId === s.id && t.visit && t.resolvedAt).length;
