import { ClaimResolution, ClaimStatus, Warranty, WarrantyClaim } from '../types';
import { isoToJalaliParts, jalaliPartsToIso, todayIso, formatTaskDate } from './taskDates';
import { toPersianDigits } from './jalali';

/** A Persian month has 31 days (first six), 30 days (next five) and 29 (30 in a leap year) days. */
const monthLength = (jy: number, jm: number): number => {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  const p = isoToJalaliParts(jalaliPartsToIso(jy, 12, 30));
  return p && p[1] === 12 && p[2] === 30 ? 30 : 29;
};

const addDays = (iso: string, days: number): string => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const daysBetween = (fromIso: string, toIso: string): number =>
  Math.round((new Date(toIso + 'T12:00:00').getTime() - new Date(fromIso + 'T12:00:00').getTime()) / 86400000);

/** Last day of a warranty that starts on `startIso` and lasts `months` Persian months (a year = 12 months, ending the day before the anniversary). */
export const warrantyEnd = (startIso: string, months: number): string => {
  const p = isoToJalaliParts(startIso);
  if (!p) return startIso;
  const total = p[0] * 12 + (p[1] - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const d = Math.min(p[2], monthLength(y, m));
  return addDays(jalaliPartsToIso(y, m, d), -1);
};

export type WarrantyState = 'ACTIVE' | 'SOON' | 'EXPIRED' | 'VOID';

export const SOON_DAYS = 30;

export const warrantyState = (w: Warranty, today = todayIso()): WarrantyState => {
  if (w.status === 'VOID') return 'VOID';
  if (w.endDate < today) return 'EXPIRED';
  if (daysBetween(today, w.endDate) <= SOON_DAYS) return 'SOON';
  return 'ACTIVE';
};

export const STATE_LABEL: Record<WarrantyState, { label: string; cls: string }> = {
  ACTIVE: { label: 'فعال', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  SOON: { label: 'نزدیک به پایان', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  EXPIRED: { label: 'پایان‌یافته', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  VOID: { label: 'باطل‌شده', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const remainingText = (w: Warranty, today = todayIso()): string => {
  const s = warrantyState(w, today);
  if (s === 'VOID') return 'باطل شده است';
  const d = daysBetween(today, w.endDate);
  if (d < 0) return `${toPersianDigits(-d)} روز از پایان گذشته`;
  if (d === 0) return 'امروز پایان می‌یابد';
  return `${toPersianDigits(d)} روز مانده`;
};

export const CLAIM_STATUS: Record<ClaimStatus, { label: string; cls: string }> = {
  RECEIVED: { label: 'دریافت شد', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  REVIEW: { label: 'در حال بررسی', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  APPROVED: { label: 'تأیید شد', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  REJECTED: { label: 'رد شد', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  RESOLVED: { label: 'انجام شد', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  CLOSED: { label: 'بسته شد', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

/** The same flow the server enforces (claimNext in warranty.go): the buttons offered after each status. */
export const NEXT_STATUS: Record<ClaimStatus, ClaimStatus[]> = {
  RECEIVED: ['REVIEW', 'REJECTED'],
  REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['RESOLVED'],
  RESOLVED: ['CLOSED'],
  REJECTED: ['REVIEW', 'CLOSED'],
  CLOSED: ['REVIEW'],
};

export const NEXT_BUTTON: Record<ClaimStatus, string> = {
  RECEIVED: 'ثبت شد',
  REVIEW: 'شروع بررسی',
  APPROVED: 'تأیید (مشمول گارانتی)',
  REJECTED: 'رد درخواست',
  RESOLVED: 'ثبت اقدام انجام‌شده',
  CLOSED: 'بستن (تحویل مشتری)',
};

export const RESOLUTION: Record<ClaimResolution, string> = { REPLACE: 'تعویض کالا', REPAIR: 'تعمیر', CREDIT: 'اعتبار / برگشت وجه', OTHER: 'سایر' };

export const COVERAGE_TEXT: Record<WarrantyClaim['coverage'], string> = {
  IN: 'در محدودهٔ گارانتی',
  EXPIRED: 'خارج از گارانتی (زمان تمام شده بود)',
  KM: 'خارج از گارانتی (کیلومتر بیشتر از سقف)',
};

export const isOpenClaim = (c: WarrantyClaim) => c.status !== 'CLOSED' && c.status !== 'REJECTED' && c.status !== 'RESOLVED';

/** A code like G-1405-0007 isolated as left-to-right, so its parts keep their order inside right-to-left text. */
export const codeText = (s: string) => '⁦' + toPersianDigits(s) + '⁩';

export const dayText = (iso?: string) => (iso ? formatTaskDate(iso.slice(0, 10)) : '');

/** Compress a photo to at most 1280 px on its long side as a JPEG data URL (so a claim stays light). */
export const shrinkImage = (file: File, maxSide = 1280, quality = 0.72): Promise<string> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const g = c.getContext('2d');
      if (!g) {
        URL.revokeObjectURL(url);
        reject(new Error('canvas'));
        return;
      }
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    img.src = url;
  });
