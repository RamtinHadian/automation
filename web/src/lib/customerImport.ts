import { jalaliToGregorian } from './taskDates';
// Reading a customer list exported from accounting software (Excel / CSV) and turning rows into customers.

export type ImportField =
  | 'name' | 'firstName' | 'lastName' | 'company' | 'kind' | 'fatherName' | 'nationalCode' | 'idNumber' | 'birthDate' | 'gender'
  | 'companyType' | 'nationalId' | 'economicCode' | 'registrationNumber' | 'registrationDate' | 'repName' | 'repPosition' | 'repMobile'
  | 'shopType' | 'licenseNumber' | 'mobile' | 'mobile2' | 'phone' | 'phone2' | 'faxNumber' | 'email' | 'website'
  | 'province' | 'city' | 'postalCode' | 'address' | 'source' | 'tags' | 'interest' | 'notes';

/** Every field a customer has in Hoormand that a spreadsheet can hold: the keys are the header texts the column is recognised by. */
export const IMPORT_FIELDS: { id: ImportField; label: string; keys: string[] }[] = [
  { id: 'name', label: 'نام مشتری * (یا عنوان / نام کامل)', keys: ['نام مشتری', 'نام و نام خانوادگی', 'نام طرف حساب', 'عنوان مشتری', 'عنوان', 'طرف حساب', 'نام شخص', 'نام', 'name', 'customer'] },
  { id: 'lastName', label: 'نام خانوادگی (در صورت جدا بودن، به نام اضافه می‌شود)', keys: ['نام خانوادگی', 'family', 'last name', 'lastname'] },
  { id: 'firstName', label: 'نام کوچک (اگر ستون جدا دارد)', keys: ['نام کوچک', 'first name', 'firstname'] },
  { id: 'company', label: 'شرکت / سازمان', keys: ['نام شرکت', 'شرکت', 'سازمان', 'company'] },
  { id: 'kind', label: 'نوع مشتری (حقیقی / حقوقی / فروشگاه)', keys: ['نوع مشتری', 'نوع شخص', 'نوع', 'kind', 'type'] },
  { id: 'fatherName', label: 'نام پدر', keys: ['نام پدر', 'پدر', 'father'] },
  { id: 'nationalCode', label: 'کد ملی', keys: ['کد ملی', 'کدملی', 'شماره ملی', 'national code'] },
  { id: 'idNumber', label: 'شمارهٔ شناسنامه', keys: ['شماره شناسنامه', 'شناسنامه'] },
  { id: 'birthDate', label: 'تاریخ تولد', keys: ['تاریخ تولد', 'تولد', 'birth'] },
  { id: 'gender', label: 'جنسیت', keys: ['جنسیت', 'gender', 'sex'] },
  { id: 'companyType', label: 'نوع شرکت', keys: ['نوع شرکت', 'نوع شخصیت حقوقی'] },
  { id: 'nationalId', label: 'شناسه ملی (۱۱ رقمی)', keys: ['شناسه ملی', 'شناسهٔ ملی', 'national id'] },
  { id: 'economicCode', label: 'کد اقتصادی', keys: ['کد اقتصادی', 'شماره اقتصادی', 'economic'] },
  { id: 'registrationNumber', label: 'شمارهٔ ثبت', keys: ['شماره ثبت', 'شمارهٔ ثبت', 'ثبت'] },
  { id: 'registrationDate', label: 'تاریخ ثبت', keys: ['تاریخ ثبت'] },
  { id: 'repName', label: 'نام نمایندهٔ شرکت', keys: ['نام نماینده', 'نماینده', 'رابط', 'مسئول'] },
  { id: 'repPosition', label: 'سمت نماینده', keys: ['سمت نماینده', 'سمت'] },
  { id: 'repMobile', label: 'موبایل نماینده', keys: ['موبایل نماینده', 'همراه نماینده'] },
  { id: 'shopType', label: 'نوع فروشگاه / صنف', keys: ['نوع فروشگاه', 'صنف', 'زمینه فعالیت', 'زمینهٔ فعالیت'] },
  { id: 'licenseNumber', label: 'شمارهٔ پروانهٔ کسب', keys: ['پروانه کسب', 'شماره پروانه', 'پروانه'] },
  { id: 'mobile', label: 'موبایل', keys: ['موبایل', 'همراه', 'تلفن همراه', 'شماره همراه', 'mobile', 'cell'] },
  { id: 'mobile2', label: 'موبایل دوم', keys: ['موبایل 2', 'موبایل دوم', 'همراه 2', 'همراه دوم'] },
  { id: 'phone', label: 'تلفن ثابت', keys: ['تلفن', 'شماره تماس', 'تلفن ثابت', 'تلفن 1', 'phone', 'tel'] },
  { id: 'phone2', label: 'تلفن دوم', keys: ['تلفن 2', 'تلفن دوم', 'شماره تماس 2'] },
  { id: 'faxNumber', label: 'فکس', keys: ['فکس', 'fax'] },
  { id: 'email', label: 'ایمیل', keys: ['ایمیل', 'پست الکترونیک', 'email', 'mail'] },
  { id: 'website', label: 'وب‌سایت', keys: ['وب سایت', 'وبسایت', 'سایت', 'website', 'web'] },
  { id: 'province', label: 'استان', keys: ['استان', 'province', 'state'] },
  { id: 'city', label: 'شهر', keys: ['شهر', 'city'] },
  { id: 'postalCode', label: 'کد پستی', keys: ['کد پستی', 'کدپستی', 'postal', 'zip'] },
  { id: 'address', label: 'آدرس', keys: ['آدرس', 'نشانی', 'address'] },
  { id: 'source', label: 'روش آشنایی / منبع', keys: ['روش آشنایی', 'منبع', 'source'] },
  { id: 'tags', label: 'برچسب‌ها (با ویرگول جدا)', keys: ['برچسب', 'تگ', 'گروه', 'گروه مشتری', 'tags', 'group'] },
  { id: 'interest', label: 'دنبال چه چیزی است', keys: ['نیاز', 'علاقه', 'دنبال', 'interest'] },
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
    ['﻿', 'نام,نام خانوادگی,شرکت,کد ملی,موبایل,تلفن,ایمیل,استان,شهر,آدرس,توضیحات' + String.fromCharCode(13, 10), 'علی,رضایی,شرکت نمونه,0012345678,09121234567,02112345678,ali@example.com,تهران,تهران,خیابان ولیعصر,مشتری قدیمی' + String.fromCharCode(13, 10)],
    { type: 'text/csv;charset=utf-8' }
  );

/** A date written in the Persian calendar («1370/05/12», «۱۳۷۰-۵-۱۲») or as an ISO date → ISO (Gregorian), or undefined. */
export const importDate = (v: unknown): string | undefined => {
  const t = normText(v).replace(/[./]/g, '-');
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (!m) return undefined;
  const y = Number(m[1]);
  const [gy, gm, gd] = y < 1700 ? jalaliToGregorian(y, Number(m[2]), Number(m[3])) : [y, Number(m[2]), Number(m[3])];
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
};
export const importGender = (v: unknown): 'M' | 'F' | undefined => {
  const t = normText(v);
  if (/^(م|مرد|آقا|آقای|male|m)$/i.test(t)) return 'M';
  if (/^(ز|زن|خانم|female|f)$/i.test(t)) return 'F';
  return undefined;
};
export const importKind = (v: unknown): 'PERSON' | 'COMPANY' | 'SHOP' | undefined => {
  const t = normText(v);
  if (!t) return undefined;
  if (/حقوقی|شرکت|سازمان|company/i.test(t)) return 'COMPANY';
  if (/فروشگاه|مغازه|صنف|shop/i.test(t)) return 'SHOP';
  if (/حقیقی|شخص|person/i.test(t)) return 'PERSON';
  return undefined;
};

/**
 * Brings any customer sheet (the export of an accounting program, an old list…) to Hoormand's standard: one column for every customer field, in the
 * order of IMPORT_FIELDS, headed with the field's own name. Returns null when no «name» column can be found. `unknown` lists the headers that no field took.
 */
export const standardize = (rows: string[][]): { rows: string[][]; unknown: string[] } | null => {
  if (rows.length < 2) return null;
  const map = guessMapping(rows[0]);
  if (map.name < 0 && map.company < 0 && map.firstName < 0) return null;
  const taken = new Set(Object.values(map).filter((i) => i >= 0));
  const unknown = rows[0].map((h, i) => (!taken.has(i) && String(h || '').trim() ? String(h).trim() : '')).filter(Boolean);
  const header = IMPORT_FIELDS.map((f) => f.keys[0]);
  const body = rows.slice(1).map((r) => IMPORT_FIELDS.map((f) => (map[f.id] >= 0 ? String(r[map[f.id]] ?? '').trim() : '')));
  return { rows: [header, ...body], unknown };
};

/** The standard sheet as an Excel file that Hoormand reads back without any mapping. */
export async function downloadStandardSheet(rows: string[][], name = 'مشتریان-استاندارد-هورمند.xlsx') {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'مشتریان');
  XLSX.writeFile(wb, name);
}
