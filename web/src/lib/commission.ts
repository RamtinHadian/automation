import { Deal } from '../types';
import { isoToJalaliParts } from './taskDates';

/** One commission rule: a base percent, and optional steps: when the sales of the month reach «from», the WHOLE month is paid with that step's percent. */
export interface CommissionTier { from: number; percent: number }
export interface CommissionRule { percent: number; tiers?: CommissionTier[] }
export interface CommissionRules { defaultRule: CommissionRule; perUser: Record<string, CommissionRule> }
export interface CommissionPayment { id: string; userId: string; userName: string; period: string; amount: number; note?: string; at: string; byName?: string }

export const periodKey = (jy: number, jm: number) => `${jy}-${jm}`;

/** The Persian month a sale belongs to: the day the opportunity became «فروش موفق» (closedAt, or the last change when it has none). */
export const saleMonth = (d: Deal): string | null => {
  const iso = (d.closedAt || d.updatedAt || '').slice(0, 10);
  const p = iso ? isoToJalaliParts(iso) : null;
  return p ? periodKey(p[0], p[1]) : null;
};

export const ruleOf = (rules: CommissionRules, userId: string): CommissionRule => rules.perUser?.[userId] || rules.defaultRule || { percent: 0, tiers: [] };

/** The percent that applies to a month whose sales are `sales`. */
export const percentFor = (rule: CommissionRule, sales: number): number => {
  let p = rule.percent || 0;
  for (const t of [...(rule.tiers || [])].sort((a, b) => a.from - b.from)) if (sales >= t.from) p = t.percent;
  return p;
};

export interface CommissionRow {
  userId: string;
  deals: Deal[];
  sales: number;
  percent: number;
  commission: number;
}

/** Per salesperson, for one Persian month: the won opportunities (main opportunities only: those merged into a proforma of another are counted there), the sales, the percent and the commission. */
export function commissionOf(deals: Deal[], rules: CommissionRules, period: string): CommissionRow[] {
  const by = new Map<string, Deal[]>();
  for (const d of deals) {
    if (d.stage !== 'WON' || d.mergedInto || saleMonth(d) !== period || !d.ownerId) continue;
    (by.get(d.ownerId) || by.set(d.ownerId, []).get(d.ownerId)!).push(d);
  }
  return [...by.entries()].map(([userId, list]) => {
    const sales = list.reduce((s, d) => s + (d.amount || 0), 0);
    const percent = percentFor(ruleOf(rules, userId), sales);
    return { userId, deals: list, sales, percent, commission: Math.round((sales * percent) / 100) };
  });
}
