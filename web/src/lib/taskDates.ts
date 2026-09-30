import { gregorianToJalali, toPersianDigits } from './jalali';

export const JALALI_MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
  jy += 1595;
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const months = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  while (gm < 13 && gd > months[gm]) gd -= months[gm++];
  return [gy, gm, gd];
}

const pad = (n: number) => String(n).padStart(2, '0');

export const isoToJalaliParts = (iso: string): [number, number, number] | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? gregorianToJalali(+m[1], +m[2], +m[3]) : null;
};

export const jalaliPartsToIso = (jy: number, jm: number, jd: number) => {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${pad(gm)}-${pad(gd)}`;
};

export const formatTaskDate = (iso?: string) => {
  const p = iso ? isoToJalaliParts(iso.slice(0, 10)) : null;
  return p ? `${toPersianDigits(p[2])} ${JALALI_MONTHS[p[1] - 1]} ${toPersianDigits(p[0])}` : '';
};

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const isOverdue = (dueDate: string | undefined, done: boolean) => !!dueDate && !done && dueDate < todayIso();
