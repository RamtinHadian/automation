import { CrmActivity, Customer } from '../types';
import { normText } from './customerImport';

/** Products customers asked for and the shop did not have, grouped by name for the management report. */
export interface MissingItem {
  name: string;
  /** how many times it was asked for */
  count: number;
  /** total of the quantities people wrote down (when they did) */
  qty: number;
  customers: string[];
  lastAt: string;
}

export interface MissingStats {
  items: MissingItem[];
  /** number of requests in the period */
  total: number;
  /** number of different customers who asked */
  customerCount: number;
  /** requests per day, oldest first, one entry for each of the last `days` days (yyyy-mm-dd) */
  perDay: { day: string; value: number }[];
}

// «میل لنگ سانز»، «میل‌لنگ  سانز» and «ميل لنگ سانز» are one product
const keyOf = (s: string) => normText(s).toLowerCase().replace(/[\s‌‌-]+/g, '');

export const missingStats = (rows: CrmActivity[], customers: Customer[], days: number): MissingStats => {
  const since = Date.now() - days * 86400000;
  const nameOf = new Map(customers.map((c) => [c.id, c.name || c.company || '']));
  const groups = new Map<string, { names: Map<string, number>; item: MissingItem }>();
  const people = new Set<string>();
  const perDayMap = new Map<string, number>();
  let total = 0;
  for (const a of rows) {
    if (a.type !== 'MISSING') continue;
    const label = normText(a.itemName || a.text || '');
    if (!label) continue;
    const at = new Date(a.createdAt).getTime();
    if (!(at >= since)) continue;
    total++;
    people.add(a.customerId);
    const day = new Date(at).toISOString().slice(0, 10);
    perDayMap.set(day, (perDayMap.get(day) || 0) + 1);
    const key = keyOf(label);
    let g = groups.get(key);
    if (!g) {
      g = { names: new Map(), item: { name: label, count: 0, qty: 0, customers: [], lastAt: a.createdAt } };
      groups.set(key, g);
    }
    g.names.set(label, (g.names.get(label) || 0) + 1);
    g.item.count++;
    g.item.qty += a.qty && a.qty > 0 ? a.qty : 0;
    const who = nameOf.get(a.customerId) || '';
    if (who && !g.item.customers.includes(who)) g.item.customers.push(who);
    if (a.createdAt > g.item.lastAt) g.item.lastAt = a.createdAt;
  }
  const items = [...groups.values()].map((g) => {
    // show the spelling people used most
    g.item.name = [...g.names.entries()].sort((x, y) => y[1] - x[1])[0][0];
    return g.item;
  });
  items.sort((x, y) => y.count - x.count || y.lastAt.localeCompare(x.lastAt));
  const perDay: { day: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    perDay.push({ day, value: perDayMap.get(day) || 0 });
  }
  return { items, total, customerCount: people.size, perDay };
};
