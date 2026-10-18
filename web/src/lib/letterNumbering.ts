import { LetterNumberingSettings } from '../types';
import { gregorianToJalali, toPersianDigits } from './jalali';

export const DEFAULT_LETTER_NUMBERING: LetterNumberingSettings = {
  prefix: '۱۰',
  nextNumber: 1001,
  incrementStep: 1,
  year: '1405',
  formatPattern: 'PREFIX_YEAR_NUM',
  defaultFooterNote: 'سامانه مکاتبات و اسناد رسمی اداری',
  showFooterNote: true,
};

export function formatLetterNumber(settings?: LetterNumberingSettings): string {
  const cfg = settings || DEFAULT_LETTER_NUMBERING;
  const prefix = (cfg.prefix || '').trim();
  const num = toPersianDigits(cfg.nextNumber || 1001);
  const sep = cfg.separator === '-' ? '-' : '/';
  let year = toPersianDigits((cfg.year || '1405').trim());
  if (cfg.includeMonth) {
    // the month of today's Persian date, always two digits, so every month brings its own number into the letter number
    const d = new Date();
    const [, jm] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    year = `${year}${sep}${toPersianDigits(String(jm).padStart(2, '0'))}`;
  }

  const pad = (n: number, w: number) => toPersianDigits(String(n || 1001).padStart(w, '0'));
  const join = (...parts: string[]) => parts.filter(Boolean).join(sep);
  const num6 = pad(cfg.nextNumber, 6);
  switch (cfg.formatPattern) {
    case 'YEAR_NUM_PREFIX': return join(year, num, prefix);
    case 'NUM_PREFIX_YEAR': return join(num, prefix, year);
    case 'PREFIX_NUM': return join(prefix, num);
    case 'NUM_PREFIX': return join(num, prefix);
    case 'NUM_ONLY': return num;
    case 'YEAR_NUM': return join(year, num);
    case 'NUM_YEAR': return join(num, year);
    case 'PREFIX_NUM_YEAR': return join(prefix, num, year);
    case 'YEAR_PREFIX_NUM': return join(year, prefix, num);
    case 'NUM_YEAR_PREFIX': return join(num, year, prefix);
    case 'PREFIX_YEAR_NUM6': return join(prefix, year, num6);
    case 'YEAR_NUM6': return join(year, num6);
    case 'PREFIXYEAR_NUM': return `${prefix}${year}${sep}${num}`;
    case 'PREFIX_YEAR_NUM':
    default: return join(prefix, year, num);
  }
}

/** every ordering the console offers; the label is built from the parts so it follows the chosen separator */
export const NUMBER_PATTERNS: { id: NonNullable<LetterNumberingSettings['formatPattern']>; parts: string }[] = [
  { id: 'PREFIX_YEAR_NUM', parts: 'پیشوند · سال · شماره' },
  { id: 'YEAR_NUM_PREFIX', parts: 'سال · شماره · پیشوند' },
  { id: 'NUM_PREFIX_YEAR', parts: 'شماره · پیشوند · سال' },
  { id: 'PREFIX_NUM_YEAR', parts: 'پیشوند · شماره · سال' },
  { id: 'YEAR_PREFIX_NUM', parts: 'سال · پیشوند · شماره' },
  { id: 'NUM_YEAR_PREFIX', parts: 'شماره · سال · پیشوند' },
  { id: 'PREFIX_NUM', parts: 'پیشوند · شماره' },
  { id: 'NUM_PREFIX', parts: 'شماره · پیشوند' },
  { id: 'YEAR_NUM', parts: 'سال · شماره' },
  { id: 'NUM_YEAR', parts: 'شماره · سال' },
  { id: 'PREFIX_YEAR_NUM6', parts: 'پیشوند · سال · شماره شش‌رقمی' },
  { id: 'YEAR_NUM6', parts: 'سال · شماره شش‌رقمی' },
  { id: 'PREFIXYEAR_NUM', parts: 'پیشوندسال (چسبیده) · شماره' },
  { id: 'NUM_ONLY', parts: 'فقط شماره' },
];
