// Reading a customer list exported from accounting software (Excel / CSV) and turning rows into customers.

export type ImportField = 'name' | 'company' | 'mobile' | 'phone' | 'email' | 'address' | 'notes';

export const IMPORT_FIELDS: { id: ImportField; label: string; keys: string[] }[] = [
  { id: 'name', label: 'نام مشتری *', keys: ['نام مشتری', 'نام و نام خانوادگی', 'نام طرف حساب', 'طرف حساب', 'نام شخص', 'نام', 'name', 'customer'] },
  { id: 'company', label: 'شرکت / سازمان', keys: ['نام شرکت', 'شرکت', 'سازمان', 'company'] },
  { id: 'mobile', label: 'موبایل', keys: ['موبایل', 'همراه', 'تلفن همراه', 'شماره همراه', 'mobile', 'cell'] },
  { id: 'phone', label: 'تلفن ثابت', keys: ['تلفن', 'شماره تماس', 'تلفن ثابت', 'تلفن 1', 'phone', 'tel'] },
  { id: 'email', label: 'ایمیل', keys: ['ایمیل', 'پست الکترونیک', 'email', 'mail'] },
  { id: 'address', label: 'آدرس', keys: ['آدرس', 'نشانی', 'address'] },
  { id: 'notes', label: 'توضیحات', keys: ['توضیحات', 'یادداشت', 'شرح', 'description', 'note'] },
];

/** Persian / Arabic-Indic digits → latin, Arabic ya/kaf → Persian, collapse whitespace. */
export const normText = (v: unknown): string =>
  String(v ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/‌/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** «+98 912 123 4567», «۹۸۹۱۲…», «9121234567» → «09121234567»; other numbers keep their digits. */
export const normPhone = (v: unknown): string => {
  let s = normText(v).replace(/[^0-9+]/g, '');
  if (!s) return '';
  if (s.startsWith('+98')) s = '0' + s.slice(3);
  else if (s.startsWith('0098')) s = '0' + s.slice(4);
  else if (/^98\d{10}$/.test(s)) s = '0' + s.slice(2);
  else if (/^9\d{9}$/.test(s)) s = '0' + s;
  else if (/^[1-8]\d{9}$/.test(s)) s = '0' + s; // a landline written without its leading zero: «2133445566» -> «02133445566»
  return s.length >= 5 ? s : '';
};

/** Mobile (09…) or landline: decided from the number itself, in any of the ways the phone system or a person writes it. */
export const isMobileNumber = (v: unknown): boolean => /^09\d{9}$/.test(normPhone(v));

/** The caller's name from the phone system, or '' when it is only the number again (many phone systems send the number as the name). */
export const callerNameOnly = (name: unknown, number: unknown): string => {
  const n = normText(name);
  if (!n || /^(<unknown>|unknown|anonymous)$/i.test(n)) return '';
  if (/^[0-9+()\-\s]+$/.test(n) && n.replace(/\D/g, '').length >= 5) return '';
  if (n.replace(/\D/g, '') !== '' && n.replace(/\D/g, '') === normText(number).replace(/\D/g, '')) return '';
  return n;
};

/** Best-guess column for every field from the header texts (-1 = none). Each column is used once. */
export const guessMapping = (headers: string[]): Record<ImportField, number> => {
  const h = headers.map((x) => normText(x).toLowerCase());
  const used = new Set<number>();
  const out = {} as Record<ImportField, number>;
  // exact header matches first, then «contains»
  for (const mode of ['exact', 'contains'] as const) {
    for (const f of IMPORT_FIELDS) {
      if (out[f.id] !== undefined && out[f.id] >= 0) continue;
      let idx = -1;
      for (const k of f.keys) {
        const key = normText(k).toLowerCase();
        idx = h.findIndex((x, i) => !used.has(i) && (mode === 'exact' ? x === key : x.includes(key)));
        if (idx >= 0) break;
      }
      out[f.id] = idx;
      if (idx >= 0) used.add(idx);
    }
  }
  for (const f of IMPORT_FIELDS) if (out[f.id] === undefined) out[f.id] = -1;
  return out;
};

/** Reads the first sheet of an .xlsx / .xls / .csv file as rows of text. */
export async function readTable(file: File): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const isText = /\.(csv|txt|tsv)$/i.test(file.name);
  const buf = await file.arrayBuffer();
  const wb = isText
    ? XLSX.read(new TextDecoder('utf-8').decode(buf).replace(/^﻿/, ''), { type: 'string' })
    : XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: false, blankrows: false });
  return rows.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some((c) => c !== ''));
}

/** A tiny sample file (CSV with BOM so Excel shows Persian correctly). */
export const sampleCsv = (): Blob =>
  new Blob(
    ['﻿', 'نام مشتری,شرکت,موبایل,تلفن,ایمیل,آدرس,توضیحات\r\n', 'علی رضایی,شرکت نمونه,09121234567,02112345678,ali@example.com,تهران,مشتری قدیمی\r\n'],
    { type: 'text/csv;charset=utf-8' }
  );
