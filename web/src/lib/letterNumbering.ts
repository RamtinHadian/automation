import { LetterNumberingSettings } from '../types';
import { gregorianToJalali, toPersianDigits } from './jalali';

export const DEFAULT_LETTER_NUMBERING: LetterNumberingSettings = {
  prefix: '۱۰',
  nextNumber: 1001,
  incrementStep: 1,
  year: '1405',
  formatPattern: 'P_Y_N',
  defaultFooterNote: 'سامانه مکاتبات و اسناد رسمی اداری',
  showFooterNote: true,
};

type Tok = 'P' | 'Y' | 'M' | 'N' | 'N6' | 'PY' | 'YM';
const TOKEN_NAME: Record<Tok, string> = { P: 'پیشوند', Y: 'سال', M: 'ماه', N: 'شماره', N6: 'شماره شش‌رقمی', PY: 'پیشوندسال چسبیده', YM: 'سال‌ماه چسبیده' };

/** the first four orderings were stored under these names before the catalog grew */
const LEGACY: Record<string, string> = {
  PREFIX_YEAR_NUM: 'P_Y_N', YEAR_NUM_PREFIX: 'Y_N_P', NUM_PREFIX_YEAR: 'N_P_Y', PREFIX_NUM: 'P_N',
  NUM_PREFIX: 'N_P', NUM_ONLY: 'N', YEAR_NUM: 'Y_N', NUM_YEAR: 'N_Y', PREFIX_NUM_YEAR: 'P_N_Y', YEAR_PREFIX_NUM: 'Y_P_N',
  NUM_YEAR_PREFIX: 'N_Y_P', PREFIX_YEAR_NUM6: 'P_Y_N6', YEAR_NUM6: 'Y_N6', PREFIXYEAR_NUM: 'PY_N',
};

const perms = (t: Tok[]): Tok[][] => (t.length < 2 ? [t] : t.flatMap((x, i) => perms([...t.slice(0, i), ...t.slice(i + 1)]).map((r) => [x, ...r])));
const seq = (s: string) => s.split('_') as Tok[];

/** the 50 orderings the console offers, written as token lists: P prefix, Y year, M month, N number, N6 number in six digits, PY / YM glued parts */
const PATTERN_TOKENS: Tok[][] = [
  ...perms(['P', 'Y', 'N']),
  ...perms(['P', 'Y', 'N6']),
  ...['P_N', 'N_P', 'Y_N', 'N_Y', 'P_Y', 'Y_P', 'P_N6', 'N6_P', 'Y_N6', 'N6_Y', 'N', 'N6'].map(seq),
  ...['P_Y_M_N', 'P_Y_M_N6', 'Y_M_N', 'Y_M_N6', 'N_Y_M', 'Y_M_N_P', 'P_N_Y_M', 'N_P_Y_M', 'P_M_N', 'Y_P_M_N', 'N_Y_M_P', 'M_N', 'N_M', 'Y_M'].map(seq),
  ...['PY_N', 'N_PY', 'PY_N6', 'N6_PY', 'YM_N', 'N_YM', 'P_YM_N', 'P_N_YM', 'YM_N_P', 'N_P_YM', 'YM_N6', 'P_YM_N6'].map(seq),
];

export const NUMBER_PATTERNS: { id: string; parts: string }[] = PATTERN_TOKENS.map((t) => ({ id: t.join('_'), parts: t.map((x) => TOKEN_NAME[x]).join(' · ') }));

/** the stored pattern in the new token form (older settings hold names like 'PREFIX_YEAR_NUM') */
export const normalizePattern = (p?: string): string => LEGACY[p || ''] || p || 'P_Y_N';

export function formatLetterNumber(settings?: LetterNumberingSettings): string {
  const cfg = settings || DEFAULT_LETTER_NUMBERING;
  const prefix = (cfg.prefix || '').trim();
  const n = cfg.nextNumber || 1001;
  const sep = cfg.separator === '-' ? '-' : '/';
  const baseYear = toPersianDigits((cfg.year || '1405').trim());
  const d = new Date();
  const [, jm] = gregorianToJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const month = toPersianDigits(String(jm).padStart(2, '0'));
  const id = normalizePattern(cfg.formatPattern);
  const toks = id.split('_') as Tok[];
  // the old «include the month» switch puts the month after the year, unless the pattern already has a month of its own
  const ownMonth = toks.some((t) => t === 'M' || t === 'YM');
  const year = cfg.includeMonth && !ownMonth ? `${baseYear}${sep}${month}` : baseYear;
  const value: Record<Tok, string> = {
    P: prefix, Y: year, M: month, N: toPersianDigits(n), N6: toPersianDigits(String(n).padStart(6, '0')),
    PY: prefix ? `${prefix}${year}` : year, YM: `${baseYear}${month}`,
  };
  return toks.map((t) => value[t]).filter(Boolean).join(sep);
}
