import { LetterNumberingSettings } from '../types';
import { toPersianDigits } from './jalali';

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
  const year = toPersianDigits((cfg.year || '1405').trim());

  switch (cfg.formatPattern) {
    case 'PREFIX_YEAR_NUM':
      return prefix ? `${prefix}/${year}/${num}` : `${year}/${num}`;
    case 'YEAR_NUM_PREFIX':
      return prefix ? `${year}/${num}/${prefix}` : `${year}/${num}`;
    case 'NUM_PREFIX_YEAR':
      return prefix ? `${num}/${prefix}/${year}` : `${num}/${year}`;
    case 'PREFIX_NUM':
      return prefix ? `${prefix}/${num}` : `${num}`;
    default:
      return prefix ? `${prefix}/${year}/${num}` : `${year}/${num}`;
  }
}
