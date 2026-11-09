import { Deal } from '../types';
import { isoToJalaliParts } from './taskDates';

/** One commission rule: a base percent, and optional steps: when the sales of the month reach «from», the WHOLE month is paid with that step's percent. */
export interface CommissionTier { from: number; percent: number }
export interface CommissionRule { percent: number; tiers?: CommissionTier[] }
/** `recipients`: the people who may receive commission at all (chosen by the managers); nobody else gets any, whatever he sold */
/** A team: the commission is worked out from the sales of all its members together (with the team's own rule), then shared equally or by what each one sold. */
export interface CommissionGroup { id: string; name: string; memberIds: string[]; rule: CommissionRule; split: 'equal' | 'sales' }
export interface CommissionRules { defaultRule: CommissionRule; perUser: Record<string, CommissionRule>; recipients: string[]; groups: CommissionGroup[] }
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
  /** set when the person is paid as a member of a team: the name of the team and the sales of the whole team */
  groupName?: string;
  groupSales?: number;
}

/** Everyone who may receive commission: the chosen people and the members of the teams. */
export const receivers = (rules: CommissionRules): Set<string> => new Set([...(rules.recipients || []), ...(rules.groups || []).flatMap((g) => g.memberIds)]);

/**
 * Per person, for one Persian month: the won opportunities (main opportunities only: those merged into a proforma of another are counted there), the sales, the percent and the commission.
 * A member of a team is paid from the team's pool (the first team he is in); the others by their own rule, or the general rule.
 */
export function commissionOf(deals: Deal[], rules: CommissionRules, period: string): CommissionRow[] {
  const allowed = receivers(rules);
  const by = new Map<string, Deal[]>();
  for (const d of deals) {
    if (d.stage !== 'WON' || d.mergedInto || saleMonth(d) !== period || !d.ownerId || !allowed.has(d.ownerId)) continue;
    (by.get(d.ownerId) || by.set(d.ownerId, []).get(d.ownerId)!).push(d);
  }
  const salesOf = (id: string) => (by.get(id) || []).reduce((s, d) => s + (d.amount || 0), 0);
  const teamOf = new Map<string, CommissionGroup>();
  for (const g of rules.groups || []) for (const m of g.memberIds) if (!teamOf.has(m)) teamOf.set(m, g);
  const rows: CommissionRow[] = [];
  const doneTeams = new Set<string>();
  for (const [userId, list] of by.entries()) {
    const g = teamOf.get(userId);
    const sales = salesOf(userId);
    if (!g) {
      const percent = percentFor(ruleOf(rules, userId), sales);
      rows.push({ userId, deals: list, sales, percent, commission: Math.round((sales * percent) / 100) });
      continue;
    }
    // a team's members are all added when the first of them is met (members of the team without a sale also get their share)
    if (doneTeams.has(g.id)) continue;
    doneTeams.add(g.id);
    const members = g.memberIds.filter((m) => teamOf.get(m)?.id === g.id);
    const pooled = members.reduce((s, m) => s + salesOf(m), 0);
    const percent = percentFor(g.rule, pooled);
    const total = Math.round((pooled * percent) / 100);
    for (const m of members) {
      const own = salesOf(m);
      const share = g.split === 'sales' ? (pooled > 0 ? Math.round((total * own) / pooled) : 0) : Math.round(total / Math.max(1, members.length));
      rows.push({ userId: m, deals: by.get(m) || [], sales: own, percent, commission: share, groupName: g.name, groupSales: pooled });
    }
  }
  return rows;
}
