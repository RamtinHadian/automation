import { CrmActivity, Deal, DealStage } from '../types';
import { isoToJalaliParts, jalaliPartsToIso, todayIso } from './taskDates';

/** What management decided: monthly targets, how likely each stage is to end in a sale, and the rules of the sales process. */
export interface Targets {
  defaultTarget?: number;
  perUser?: Record<string, number>;
  probabilities?: Partial<Record<DealStage, number>>;
}
export interface Rules {
  proposalNeedsProforma?: boolean;
  /** Toman: a sale of this size or more is closed by a manager (0 = no limit). */
  bigDealAdminOnly?: number;
  kindDiscount?: Partial<Record<'PERSON' | 'COMPANY' | 'SHOP', number>>;
}

export const OPEN_STAGE_IDS: DealStage[] = ['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION'];
export const DEFAULT_PROB: Record<string, number> = { NEW: 10, CONTACTED: 25, PROPOSAL: 50, NEGOTIATION: 75 };

export const probOf = (t: Targets | null | undefined, stage: DealStage) => (t?.probabilities?.[stage] ?? DEFAULT_PROB[stage] ?? 0) / 100;
export const targetOf = (t: Targets | null | undefined, userId: string) => t?.perUser?.[userId] ?? t?.defaultTarget ?? 0;

export type Month = [number, number]; // Jalali year, month (1-12)
export const monthNow = (): Month => {
  const p = isoToJalaliParts(todayIso());
  return p ? [p[0], p[1]] : [1405, 1];
};
export const addMonths = ([y, m]: Month, d: number): Month => {
  const i = y * 12 + (m - 1) + d;
  return [Math.floor(i / 12), (i % 12) + 1];
};
/** [first day, first day of the next month) of a Jalali month as yyyy-mm-dd. */
export const monthRange = (mo: Month): [string, string] => {
  const next = addMonths(mo, 1);
  return [jalaliPartsToIso(mo[0], mo[1], 1), jalaliPartsToIso(next[0], next[1], 1)];
};
export const localDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-CA') : '');
export const inRange = (iso: string | undefined, [a, b]: [string, string]) => {
  const d = localDay(iso);
  return !!d && d >= a && d < b;
};

export interface PersonStat {
  id: string;
  won: number;
  wonCount: number;
  prevWon: number;
  target: number;
  openCount: number;
  openAmount: number;
  followDone: number;
  overdue: number;
  stalled: number;
  lostCount: number;
  topLostReason: string;
  /** what the open opportunities expected to close in this month are worth, weighted by the chance of each stage */
  expected: number;
}

export const personStats = (ids: string[], deals: Deal[], activities: CrmActivity[], month: Month, targets: Targets | null, stalledDays = 7): PersonStat[] => {
  const range = monthRange(month);
  const prev = monthRange(addMonths(month, -1));
  const today = todayIso();
  const limit = Date.now() - stalledDays * 86400000;
  return ids.map((id) => {
    const mine = deals.filter((d) => d.ownerId === id);
    const won = mine.filter((d) => d.stage === 'WON' && inRange(d.closedAt || d.updatedAt, range));
    const open = mine.filter((d) => OPEN_STAGE_IDS.includes(d.stage));
    const lost = mine.filter((d) => d.stage === 'LOST' && inRange(d.closedAt || d.updatedAt, range));
    const reasons = new Map<string, number>();
    for (const d of lost) reasons.set(d.lostReason || 'دلیل ثبت نشده', (reasons.get(d.lostReason || 'دلیل ثبت نشده') || 0) + 1);
    const acts = activities.filter((a) => a.type === 'FOLLOWUP' && a.ownerId === id);
    return {
      id,
      won: won.reduce((s, d) => s + (d.amount || 0), 0),
      wonCount: won.length,
      prevWon: mine.filter((d) => d.stage === 'WON' && inRange(d.closedAt || d.updatedAt, prev)).reduce((s, d) => s + (d.amount || 0), 0),
      target: targetOf(targets, id),
      openCount: open.length,
      openAmount: open.reduce((s, d) => s + (d.amount || 0), 0),
      followDone: acts.filter((a) => a.done && inRange(a.doneAt, range)).length,
      overdue: acts.filter((a) => !a.done && a.dueDate && a.dueDate < today).length,
      stalled: open.filter((d) => new Date(d.updatedAt || d.createdAt).getTime() < limit).length,
      lostCount: lost.length,
      topLostReason: [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '',
      expected: open.filter((d) => d.expectedClose && d.expectedClose >= range[0] && d.expectedClose < range[1]).reduce((s, d) => s + (d.amount || 0) * probOf(targets, d.stage), 0),
    };
  });
};

/** Same rule as the server's: why this stage change is not allowed (empty = allowed). */
export const ruleViolation = (rules: Rules | null | undefined, isAdmin: boolean, from: DealStage | undefined, to: DealStage, amount: number, proformaNumber?: string): string => {
  if (isAdmin || !from || from === to || (to !== 'NEGOTIATION' && to !== 'WON') || !rules) return '';
  if (rules.proposalNeedsProforma && !proformaNumber) return 'طبق قوانین فرایند فروش، این فرصت باید اول پیش‌فاکتور داشته باشد.';
  if (to === 'WON' && rules.bigDealAdminOnly && amount >= rules.bigDealAdminOnly) return 'بستن فروش‌های بالای سقف تعیین‌شده را مدیر انجام می‌دهد.';
  return '';
};
