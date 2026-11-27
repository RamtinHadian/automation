import { Deal } from '../types';
import { isoToJalaliParts } from './taskDates';

/** One commission rule: a base percent, and optional steps: when the sales of the month reach «from», the WHOLE month is paid with that step's percent. */
export interface CommissionTier { from: number; percent: number }
/** A fixed-amount step: when the sales of the month reach «from», the fixed amount becomes `amount` (instead of the base fixed amount). */
export interface CommissionFixedTier { from: number; amount: number }
/**
 * `mode`: how the commission is worked out: «percent» (the default, as before), «fixed» (a fixed number, with steps if wanted) or «both» (the two added together).
 * Fixed: `fixed` is the base amount; `fixedTiers` raise it as the month's sales grow (the amount of the highest step reached is paid, not a sum of steps);
 * `fixedPer` says whether it is paid once for the month or for every won sale. Nothing fixed is paid to somebody with no sale in the month.
 */
export interface CommissionRule { percent: number; tiers?: CommissionTier[]; mode?: 'percent' | 'fixed' | 'both'; fixed?: number; fixedPer?: 'month' | 'deal'; fixedTiers?: CommissionFixedTier[] }
/** `recipients`: the people who may receive commission at all (chosen by the managers); nobody else gets any, whatever he sold */
/** A team: the commission is worked out from the sales of all its members together (with the team's own rule), then shared equally or by what each one sold. */
export interface CommissionGroup { id: string; name: string; memberIds: string[]; rule: CommissionRule; split: 'equal' | 'sales' }
export interface CommissionRules { defaultRule: CommissionRule; perUser: Record<string, CommissionRule>; recipients: string[]; groups: CommissionGroup[]; /** the finance manager: gets a copy of every payment order */ financeManagerId?: string }
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

export const ruleMode = (r: CommissionRule): 'percent' | 'fixed' | 'both' => (r.mode === 'fixed' || r.mode === 'both' ? r.mode : 'percent');

/** The fixed amount that applies to a month whose sales are `sales` (the highest step reached, else the base amount). */
export const fixedAmountFor = (rule: CommissionRule, sales: number): number => {
  let a = rule.fixed || 0;
  for (const t of [...(rule.fixedTiers || [])].sort((x, y) => x.from - y.from)) if (sales >= t.from) a = t.amount;
  return a;
};

/** Everything a rule gives for a month: the percent used, the percent part, the fixed part and the total. */
export function workOut(rule: CommissionRule, sales: number, dealCount: number) {
  const mode = ruleMode(rule);
  const percent = mode === 'fixed' ? 0 : percentFor(rule, sales);
  const percentPart = mode === 'fixed' ? 0 : Math.round((sales * percent) / 100);
  const each = mode === 'percent' || dealCount <= 0 || sales <= 0 ? 0 : fixedAmountFor(rule, sales);
  const fixed = each ? (rule.fixedPer === 'deal' ? each * dealCount : each) : 0;
  return { percent, percentPart, fixed, fixedEach: rule.fixedPer === 'deal' ? each : 0, total: percentPart + fixed };
}

export interface CommissionRow {
  /** the fixed part of the commission (0 when the rule is only a percent) and, when it is paid per sale, the amount of each sale */
  fixed?: number;
  fixedEach?: number;
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
      const w = workOut(ruleOf(rules, userId), sales, list.length);
      rows.push({ userId, deals: list, sales, percent: w.percent, fixed: w.fixed, fixedEach: w.fixedEach, commission: w.total });
      continue;
    }
    // a team's members are all added when the first of them is met (members of the team without a sale also get their share)
    if (doneTeams.has(g.id)) continue;
    doneTeams.add(g.id);
    const members = g.memberIds.filter((m) => teamOf.get(m)?.id === g.id);
    const pooled = members.reduce((s, m) => s + salesOf(m), 0);
    const pooledDeals = members.reduce((s, m) => s + (by.get(m) || []).length, 0);
    const w = workOut(g.rule, pooled, pooledDeals);
    const percent = w.percent;
    const total = w.total;
    for (const m of members) {
      const own = salesOf(m);
      const share = g.split === 'sales' ? (pooled > 0 ? Math.round((total * own) / pooled) : 0) : Math.round(total / Math.max(1, members.length));
      rows.push({ userId: m, deals: by.get(m) || [], sales: own, percent, fixed: total ? Math.round((w.fixed * share) / total) : 0, commission: share, groupName: g.name, groupSales: pooled });
    }
  }
  return rows;
}
