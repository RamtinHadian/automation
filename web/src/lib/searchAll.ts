import { fold } from './customerSearch';
import { gregorianToJalali } from './jalali';

export { fold };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Every text and number an object holds (also what is nested inside it) goes into `out`; dates also in Persian (1405/07/25), numbers also without separators. */
function flatten(v: unknown, out: string[], depth = 0) {
  if (v == null || depth > 6) return;
  if (typeof v === 'string') {
    if (v.startsWith('data:')) return; // an attached picture or file, not text
    let t: string = v;
    if (t.length > 300 && t.includes('<')) t = t.replace(/<[^>]*>/g, ' '); // the body of a letter is HTML: only its words are searched
    if (t.length > 20000) t = t.slice(0, 20000);
    out.push(t);
    const m = ISO_DATE.exec(t);
    if (m) {
      const [jy, jm, jd] = gregorianToJalali(+m[1], +m[2], +m[3]);
      out.push(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`, `${jy}/${jm}/${jd}`);
    }
    // a number written with a leading zero or separators («0912…», «۰۲۱-…») is also found without them
    const digits = t.replace(/\D/g, '');
    if (digits.length >= 6 && digits !== t) out.push(digits.replace(/^0+/, ''));
    else if (/^0\d{5,}$/.test(t)) out.push(t.replace(/^0+/, ''));
  } else if (typeof v === 'number') {
    out.push(String(v));
  } else if (Array.isArray(v)) {
    for (const x of v) flatten(x, out, depth + 1);
  } else if (typeof v === 'object') {
    for (const x of Object.values(v as Record<string, unknown>)) flatten(x, out, depth + 1);
  }
}

const cache = new WeakMap<object, string>();

/** One folded line with everything the object holds (kept per object, so typing in the search box stays quick). */
export function searchLine(obj: unknown): string {
  if (obj == null || typeof obj !== 'object') return fold(obj);
  const hit = cache.get(obj as object);
  if (hit !== undefined) return hit;
  const parts: string[] = [];
  flatten(obj, parts);
  const line = fold(parts.join(' '));
  cache.set(obj as object, line);
  return line;
}

/**
 * Does the object match what was typed? Every word of the query must be found somewhere in the object (any field, nested lists too, in any order).
 * `extra` is anything shown next to the object that is not stored in it (a warehouse name, a customer's name…).
 */
export function matchesAll(obj: unknown, query: string, ...extra: unknown[]): boolean {
  const q = fold(query).trim();
  if (!q) return true;
  let line = searchLine(obj);
  if (extra.length) {
    const more: string[] = [];
    for (const e of extra) flatten(e, more);
    line += ' ' + fold(more.join(' '));
  }
  return q.split(/\s+/).every((tok) => line.includes(tok));
}
