import { CrmActivity, Customer, Deal } from '../types';

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** One spelling for search: Latin digits, Persian letters, no half-spaces, lower case. */
export const fold = (s: unknown): string =>
  String(s ?? '')
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ۀ/g, 'ه')
    .replace(/[‌‏‎]/g, '')
    .toLowerCase();

const KIND_TEXT: Record<string, string> = { PERSON: 'شخص حقیقی', COMPANY: 'شرکت حقوقی', SHOP: 'فروشگاه مغازه' };
const STATUS_TEXT: Record<string, string> = { LEAD: 'مشتری بالقوه', ACTIVE: 'مشتری فعال', INACTIVE: 'غیرفعال' };
const ACT_TEXT: Record<string, string> = { NOTE: 'یادداشت', CALL: 'تماس', MEETING: 'جلسه', FOLLOWUP: 'پیگیری', MISSING: 'کالای ناموجود', QUOTE: 'قیمت داده شد استعلام' };

/** The person in charge is not a search word (searching a colleague's name must not list all of that colleague's customers). */
const NOT_SEARCHED = new Set(['ownerId', 'ownerName', 'ownerIds', 'ownerNames']);

/** Every text a customer is stored with (and what is attached to it) joined into one searchable line. */
function flatten(v: unknown, out: string[]) {
  if (v == null) return;
  if (typeof v === 'string' || typeof v === 'number') out.push(String(v));
  else if (Array.isArray(v)) v.forEach((x) => flatten(x, out));
  else if (typeof v === 'object') Object.entries(v as Record<string, unknown>).forEach(([k, x]) => !NOT_SEARCHED.has(k) && flatten(x, out));
}

export function buildCustomerIndex(customers: Customer[], deals: Deal[], activities: CrmActivity[]): Map<string, string> {
  const dealsBy = new Map<string, Deal[]>();
  for (const d of deals) (dealsBy.get(d.customerId) || dealsBy.set(d.customerId, []).get(d.customerId)!).push(d);
  const actsBy = new Map<string, CrmActivity[]>();
  for (const a of activities) (actsBy.get(a.customerId) || actsBy.set(a.customerId, []).get(a.customerId)!).push(a);
  const index = new Map<string, string>();
  for (const c of customers) {
    const parts: string[] = [];
    flatten(c, parts);
    parts.push(KIND_TEXT[c.kind || 'PERSON'] || '', STATUS_TEXT[c.status] || '', c.gender === 'M' ? 'آقا' : c.gender === 'F' ? 'خانم' : '');
    // numbers also without the leading zero, so «9121234567» finds «09121234567»
    for (const p of c.phones || []) parts.push(String(p).replace(/\D/g, '').replace(/^0+/, ''));
    for (const d of dealsBy.get(c.id) || []) {
      parts.push(d.title, d.productCode || '', d.notes || '', d.proformaNumber || '');
      for (const it of d.items || []) parts.push(it.title, it.code || '', it.description || '');
    }
    for (const a of actsBy.get(c.id) || []) parts.push(ACT_TEXT[a.type] || '', a.text, a.itemName || '', a.spec || '', a.productCode || '');
    index.set(c.id, fold(parts.join(' ')));
  }
  return index;
}

/** Every word of the query must be found somewhere in the customer's line (in any order). */
export function matchesQuery(line: string | undefined, query: string): boolean {
  const q = fold(query).trim();
  if (!q) return true;
  if (!line) return false;
  return q.split(/\s+/).every((tok) => tokenHit(line, tok));
}

const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reCache = new Map<string, RegExp>();

/**
 * One typed word against a folded line. A word with letters must be found as the START of a word, with its letters exactly in the order typed
 * («یشم» finds «یشمی…» and not «پیشمرگ» or a name that merely holds those three letters); a number is found anywhere (the middle of a phone number).
 */
export function tokenHit(line: string, tok: string): boolean {
  if (!tok) return true;
  if (/[0-9]/.test(tok)) return line.includes(tok);
  let re = reCache.get(tok);
  if (!re) {
    re = new RegExp('(^|[\\s\\-/:()،,.؛;«»"\'_|#])' + esc(tok));
    if (reCache.size > 500) reCache.clear();
    reCache.set(tok, re);
  }
  return re.test(line);
}
