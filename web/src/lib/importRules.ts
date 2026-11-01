import type { Customer } from '../types';

/**
 * The rules of the customer import: WHAT is carried over from the sheet (groups of fields) and HOW (what happens to a person who is already in the system,
 * to duplicates, to a different name, to the address). The company's default is kept in the system settings; whoever imports can change it for this one import.
 * The name and the phone numbers are always carried (they are what a person is recognised by).
 */
export type RuleGroupId = 'identity' | 'company' | 'contact' | 'address' | 'extra';

export interface ImportRulesConfig {
  /** which groups of the sheet's columns are carried over */
  fields: Record<RuleGroupId, boolean>;
  /** a person who is already in the system (same mobile / code): leave as he is, fill only what he lacks, or replace with the sheet's values */
  existing: 'none' | 'fill' | 'overwrite';
  /** the same mobile / national code as somebody already there (or an earlier row): not added a second time */
  skipDup: boolean;
  /** the address of a person already there is made the same as the sheet's */
  syncAddr: boolean;
  /** a person who is there with another name: ask one by one, or never touch the name */
  nameReview: 'ask' | 'never';
  /** a person with the very same name is in the system but not this number: offer to add the number to him instead of making a second person of that name */
  sameName: 'ask' | 'off';
}

type CustomerKey = keyof Customer;

export const RULE_GROUPS: { id: RuleGroupId; label: string; hint: string; keys: CustomerKey[] }[] = [
  { id: 'identity', label: 'مشخصات شخص', hint: 'نام و نام خانوادگی جدا، نام پدر، کد ملی، شمارهٔ شناسنامه، تاریخ تولد، جنسیت', keys: ['firstName', 'lastName', 'fatherName', 'nationalCode', 'idNumber', 'birthDate', 'gender'] },
  { id: 'company', label: 'مشخصات شرکت و فروشگاه', hint: 'نوع، شناسهٔ ملی، کد اقتصادی، شمارهٔ ثبت، نمایندهٔ شرکت، نام شرکت', keys: ['company', 'kind', 'companyType', 'nationalId', 'economicCode', 'registrationNumber', 'registrationDate', 'repName', 'repPosition', 'repMobile', 'shopType', 'licenseNumber'] },
  { id: 'contact', label: 'راه‌های ارتباطی', hint: 'ایمیل، وب‌سایت، فکس', keys: ['email', 'website', 'faxNumber'] },
  { id: 'address', label: 'نشانی', hint: 'استان، شهر، کد پستی، نشانی کامل', keys: ['province', 'city', 'postalCode', 'address'] },
  { id: 'extra', label: 'برچسب، منبع، یادداشت و اطلاعات سپیدار', hint: 'برچسب‌ها، منبع آشنایی، توضیحات، علاقه‌مندی، اطلاعات سپیدار', keys: ['tags', 'source', 'notes', 'interest', 'sepidarInfo'] },
];

export const DEFAULT_RULES: ImportRulesConfig = {
  fields: { identity: true, company: true, contact: true, address: true, extra: true },
  existing: 'none',
  skipDup: true,
  syncAddr: true,
  nameReview: 'ask',
  sameName: 'ask',
};

export const resolveRules = (cfg?: Partial<ImportRulesConfig> | null): ImportRulesConfig => ({
  ...DEFAULT_RULES,
  ...(cfg || {}),
  fields: { ...DEFAULT_RULES.fields, ...(cfg?.fields || {}) },
});

const KEY_LABEL: Partial<Record<CustomerKey, string>> = {
  firstName: 'نام', lastName: 'نام خانوادگی', fatherName: 'نام پدر', nationalCode: 'کد ملی', idNumber: 'شمارهٔ شناسنامه', birthDate: 'تاریخ تولد', gender: 'جنسیت',
  company: 'شرکت', kind: 'نوع', companyType: 'نوع شرکت', nationalId: 'شناسهٔ ملی', economicCode: 'کد اقتصادی', registrationNumber: 'شمارهٔ ثبت', registrationDate: 'تاریخ ثبت',
  repName: 'نمایندهٔ شرکت', repPosition: 'سمت نماینده', repMobile: 'موبایل نماینده', shopType: 'نوع فروشگاه', licenseNumber: 'شمارهٔ پروانه',
  email: 'ایمیل', website: 'وب‌سایت', faxNumber: 'فکس', province: 'استان', city: 'شهر', postalCode: 'کد پستی', address: 'نشانی',
  tags: 'برچسب', source: 'منبع', notes: 'توضیحات', interest: 'علاقه‌مندی', sepidarInfo: 'اطلاعات سپیدار',
};

const empty = (v: unknown): boolean => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);

/** The customer made from a row with every group that the rules do not carry over left empty (the name, the numbers and the system's own fields stay). */
export const applyFieldRules = (c: Customer, rules: ImportRulesConfig): Customer => {
  const out: Customer = { ...c };
  for (const g of RULE_GROUPS) {
    if (rules.fields[g.id]) continue;
    for (const k of g.keys) {
      const cur = (out as unknown as Record<string, unknown>)[k as string];
      (out as unknown as Record<string, unknown>)[k as string] = Array.isArray(cur) ? [] : k === 'tags' ? [] : typeof cur === 'string' ? '' : undefined;
    }
  }
  return out;
};

/**
 * What would change on a person who is already there, by the rules: «fill» writes only what he lacks; «overwrite» also replaces what differs (tags are
 * added to, never taken away). The name, the numbers and the address are handled by their own rules and are not touched here.
 */
export const patchFor = (existing: Customer, cand: Customer, mode: 'fill' | 'overwrite'): { values: Partial<Customer>; labels: string[] } => {
  const values: Record<string, unknown> = {};
  const labels: string[] = [];
  for (const g of RULE_GROUPS) {
    for (const k of g.keys) {
      if (k === 'address') continue;
      const cv = (cand as unknown as Record<string, unknown>)[k as string];
      if (empty(cv)) continue;
      const ev = (existing as unknown as Record<string, unknown>)[k as string];
      if (k === 'tags') {
        const merged = [...new Set([...(Array.isArray(ev) ? (ev as string[]) : []), ...(cv as string[])])];
        if (merged.length !== (Array.isArray(ev) ? (ev as string[]).length : 0)) {
          values.tags = merged;
          labels.push(KEY_LABEL.tags as string);
        }
        continue;
      }
      if (mode === 'fill' ? empty(ev) : JSON.stringify(ev) !== JSON.stringify(cv)) {
        values[k as string] = cv;
        labels.push(KEY_LABEL[k] || String(k));
      }
    }
  }
  return { values: values as Partial<Customer>, labels };
};

/** A name without the titles in front of it («جناب آقای»، «دکتر»…) and without the half-spaces: two spellings of one name give one key. */
export const nameKey = (v: unknown): string =>
  String(v ?? '')
    .replace(/[۰-۹]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\s]+/g, ' ')
    .replace(/(^| )(جناب|آقای|آقا|سرکار|خانم|دکتر|مهندس|حاج|حاجی|استاد|سید)(?= |$)/g, ' ')
    .replace(/[()\-–_.،,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
