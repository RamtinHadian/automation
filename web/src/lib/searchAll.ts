import { fold, tokenHit } from './customerSearch';
import { gregorianToJalali } from './jalali';

export { fold };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Every text and number an object holds (also what is nested inside it) goes into `out`; dates also in Persian (1405/07/25), numbers also without separators. */
interface Meta {
  /** the Persian dates (year-month-day, no zero) that are stored in the object as real dates, not written inside a text */
  dates: Set<string>;
  /** the clock times (HH:MM, Tehran) of the stored date-times */
  times: Set<string>;
}

const TEHRAN_MIN = 3 * 60 + 30;

function flatten(v: unknown, out: string[], depth = 0, meta?: Meta) {
  if (v == null || depth > 6) return;
  if (typeof v === 'string') {
    if (v.startsWith('data:')) return; // an attached picture or file, not text
    let t: string = v;
    if (t.length > 300 && t.includes('<')) t = t.replace(/<[^>]*>/g, ' '); // the body of a letter is HTML: only its words are searched
    if (t.length > 20000) t = t.slice(0, 20000);
    out.push(t);
    const m = ISO_DATE.exec(t);
    if (m) {
      let gy = +m[1];
      let gm = +m[2];
      let gd = +m[3];
      // a date-time with a zone (…Z) is a moment: the day and the clock are the ones in Tehran
      if (/T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(t)) {
        const at = new Date(t);
        if (!Number.isNaN(at.getTime())) {
          const tz = new Date(at.getTime() + TEHRAN_MIN * 60000);
          gy = tz.getUTCFullYear();
          gm = tz.getUTCMonth() + 1;
          gd = tz.getUTCDate();
          const hhmm = `${String(tz.getUTCHours()).padStart(2, '0')}:${String(tz.getUTCMinutes()).padStart(2, '0')}`;
          out.push(hhmm);
          meta?.times.add(hhmm);
        }
      }
      const [jy, jm, jd] = gregorianToJalali(gy, gm, gd);
      out.push(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`, `${jy}/${jm}/${jd}`);
      meta?.dates.add(`${jy}-${jm}-${jd}`);
    }
    // a number written with a leading zero or separators («0912…», «۰۲۱-…») is also found without them
    const digits = t.replace(/\D/g, '');
    if (digits.length >= 6 && digits !== t) out.push(digits.replace(/^0+/, ''));
    else if (/^0\d{5,}$/.test(t)) out.push(t.replace(/^0+/, ''));
  } else if (typeof v === 'number') {
    out.push(String(v));
  } else if (Array.isArray(v)) {
    for (const x of v) flatten(x, out, depth + 1, meta);
  } else if (typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) flatten(x, out, depth + 1, meta);
  }
}

const cache = new WeakMap<object, { line: string; meta: Meta }>();

function searchData(obj: object): { line: string; meta: Meta } {
  const hit = cache.get(obj);
  if (hit) return hit;
  const parts: string[] = [];
  const meta: Meta = { dates: new Set(), times: new Set() };
  flatten(obj, parts, 0, meta);
  const made = { line: fold(parts.join(' ')), meta };
  cache.set(obj, made);
  return made;
}

/** One folded line with everything the object holds (kept per object, so typing in the search box stays quick). */
export function searchLine(obj: unknown): string {
  if (obj == null || typeof obj !== 'object') return fold(obj);
  return searchData(obj as object).line;
}

const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const monthNo = (name: string) => MONTHS.indexOf(name) + 1;
const MONTH_RE = MONTHS.join('|');

interface DateReq {
  y?: number;
  m?: number;
  d?: number;
  /** «27/07»: day and month in either order; the second reading is tried when the first does not fit */
  alt?: { m: number; d: number };
}

/** The dates and times written in the query («1405/07/27», «27 مهر», «27 مهر 1405», «مهر 1405», «27/07», «14:30») become conditions; the rest stays plain words. */
function parseQuery(query: string): { words: string[]; dates: DateReq[]; times: string[] } {
  let q = fold(query).trim();
  const dates: DateReq[] = [];
  const times: string[] = [];
  // `make` says false when what looks like a date is not one (a phone number written with dashes): then it stays a plain word
  const take = (re: RegExp, make: (m: RegExpExecArray) => boolean | void) => {
    q = q.replace(re, (...args) => {
      const m = args.slice(0, args.length - 2) as unknown as RegExpExecArray;
      return make(m) === false ? (args[0] as string) : ' ';
    });
  };
  const okMD = (m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31;
  take(/(?<![\d/:.-])(\d{1,2}):(\d{2})(?![\d:])/g, (m) => {
    if (+m[1] > 23 || +m[2] > 59) return false;
    times.push(`${m[1].padStart(2, '0')}:${m[2]}`);
  });
  take(/(?<![\d/.-])(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})(?![\d/])/g, (m) => {
    let [y, mo, d] = [+m[1], +m[2], +m[3]];
    if (y >= 1700 && y <= 2200 && okMD(mo, d)) [y, mo, d] = gregorianToJalali(y, mo, d); // a Gregorian date is turned into the Persian one
    if (y < 1300 || y > 1500 || !okMD(mo, d)) return false;
    dates.push({ y, m: mo, d });
  });
  take(new RegExp(`(?<![\\d])(\\d{1,2})\\s*(${MONTH_RE})(?:\\s*(\\d{4}))?(?![\\d\u0600-\u06FF])`, 'g'), (m) => {
    if (+m[1] < 1 || +m[1] > 31) return false;
    dates.push({ d: +m[1], m: monthNo(m[2]), y: m[3] ? +m[3] : undefined });
  });
  take(new RegExp(`(?<![\u0600-\u06FF])(${MONTH_RE})\\s*(\\d{4})(?![\\d/])`, 'g'), (m) => {
    dates.push({ m: monthNo(m[1]), y: +m[2] });
  });
  take(/(?<![\d/.:-])(\d{1,2})[/.-](\d{1,2})(?![\d/.:-])/g, (m) => {
    const a = +m[1];
    const b = +m[2];
    if (a > 12 && b <= 12) dates.push({ d: a, m: b });
    else if (b > 12 && a <= 12) dates.push({ m: a, d: b });
    else if (a <= 12 && b <= 12) dates.push({ d: a, m: b, alt: { m: a, d: b } }); // 07/05: the 7th of Ordibehesht or the 5th of Mehr
    else return false; // not a date (say 40/50): it stays a plain word
  });
  return { words: q.split(/\s+/).filter(Boolean), dates, times };
}

const hasDate = (set: Set<string>, r: { y?: number; m?: number; d?: number }) => {
  for (const x of set) {
    const [y, m, d] = x.split('-').map(Number);
    if ((r.y === undefined || y === r.y) && (r.m === undefined || m === r.m) && (r.d === undefined || d === r.d)) return true;
  }
  return false;
};

/**
 * Does the object match what was typed? Every word of the query must be found somewhere in the object (any field, nested lists too, in any order).
 * `extra` is anything shown next to the object that is not stored in it (a warehouse name, a customer's name…).
 */
export function matchesAll(obj: unknown, query: string, ...extra: unknown[]): boolean {
  if (!fold(query).trim()) return true;
  const { words, dates, times } = parseQuery(query);
  let line = searchLine(obj);
  const meta: Meta = obj != null && typeof obj === 'object' ? searchData(obj as object).meta : { dates: new Set(), times: new Set() };
  if (extra.length) {
    const more: string[] = [];
    const extraMeta: Meta = { dates: new Set(meta.dates), times: new Set(meta.times) };
    for (const e of extra) flatten(e, more, 0, extraMeta);
    line += ' ' + fold(more.join(' '));
    meta.dates = extraMeta.dates;
    meta.times = extraMeta.times;
  }
  for (const r of dates) if (!hasDate(meta.dates, r) && !(r.alt && hasDate(meta.dates, r.alt))) return false;
  for (const t of times) if (!meta.times.has(t)) return false;
  return words.every((tok) => tokenHit(line, tok) || (MONTHS.includes(tok) && hasDate(meta.dates, { m: monthNo(tok) })));
}
