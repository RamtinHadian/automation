import { Customer, Deal } from '../types';
import { isoToJalaliParts } from './taskDates';

export interface ClubTier {
  id: string;
  name: string;
  minPoints: number;
  discountPercent: number;
}
export interface ClubConfig {
  enabled: boolean;
  tomanPerPoint: number;
  dormantDays: number;
  tiers: ClubTier[];
}

export const DEFAULT_CLUB: ClubConfig = {
  enabled: true,
  tomanPerPoint: 1000000,
  dormantDays: 60,
  tiers: [
    { id: 'ta', name: 'نقره‌ای', minPoints: 0, discountPercent: 0 },
    { id: 'tb', name: 'طلایی', minPoints: 20, discountPercent: 3 },
    { id: 'tc', name: 'ویژه', minPoints: 100, discountPercent: 5 },
  ],
};

export const TIER_TONES = [
  'bg-slate-100 text-slate-700 border-slate-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-violet-100 text-violet-800 border-violet-200',
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-sky-100 text-sky-800 border-sky-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-teal-100 text-teal-800 border-teal-200',
];

export const normalizeClub = (raw?: Partial<ClubConfig> | null): ClubConfig => {
  const tiers = raw?.tiers && raw.tiers.length ? [...raw.tiers].sort((a, b) => a.minPoints - b.minPoints) : DEFAULT_CLUB.tiers;
  return {
    enabled: raw?.enabled !== false,
    tomanPerPoint: raw?.tomanPerPoint && raw.tomanPerPoint > 0 ? raw.tomanPerPoint : DEFAULT_CLUB.tomanPerPoint,
    dormantDays: raw?.dormantDays && raw.dormantDays > 0 ? raw.dormantDays : DEFAULT_CLUB.dormantDays,
    tiers,
  };
};

export interface Member {
  customer: Customer;
  total: number;
  count: number;
  points: number;
  last: string;
  tierIndex: number;
  tier: ClubTier;
  next?: ClubTier;
  toNext: number;
}

/** Points come from what the customer really bought: the sum of their won sales. */
export const buildMembers = (customers: Customer[], deals: Deal[], cfg: ClubConfig): Member[] => {
  const won = new Map<string, { total: number; count: number; last: string }>();
  for (const d of deals) {
    if (d.stage !== 'WON') continue;
    const r = won.get(d.customerId) || { total: 0, count: 0, last: '' };
    r.total += d.amount || 0;
    r.count++;
    const t = d.closedAt || d.updatedAt || '';
    if (t > r.last) r.last = t;
    won.set(d.customerId, r);
  }
  const out: Member[] = [];
  for (const c of customers) {
    const r = won.get(c.id);
    if (!r) continue;
    const points = Math.floor(r.total / cfg.tomanPerPoint);
    let tierIndex = 0;
    cfg.tiers.forEach((t, i) => {
      if (points >= t.minPoints) tierIndex = i;
    });
    const next = cfg.tiers[tierIndex + 1];
    out.push({ customer: c, ...r, points, tierIndex, tier: cfg.tiers[tierIndex], next, toNext: next ? Math.max(0, next.minPoints - points) : 0 });
  }
  return out.sort((a, b) => b.points - a.points);
};

/** Jalali month (1-12) and day of a customer's birth date, if there is one. */
export const birthMonthDay = (iso?: string): [number, number] | null => {
  const p = iso ? isoToJalaliParts(iso.slice(0, 10)) : null;
  return p ? [p[1], p[2]] : null;
};
