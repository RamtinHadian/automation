import { CrmActivity, Customer, Deal, DealStage, User } from '../types';

/**
 * The sales analysis of the team: one row per salesperson, built from the opportunities, the customers and what each person did (calls,
 * meetings, notes, quotes, follow-ups). The measures are the ones the well-known sales-management books build on: conversion and win rate,
 * the average deal and the length of the sales cycle, sales velocity, a pipeline that is healthy (not stale) and weighted by stage,
 * and the daily activity of prospecting. How they are worked out is written under the report.
 */

export const OPEN_STAGES: DealStage[] = ['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION'];
/** The chance a deal in each stage is taken as having when the open pipeline is weighted (a common starting point; it is only used for the forecast). */
export const STAGE_PROB: Record<string, number> = { NEW: 0.1, CONTACTED: 0.25, PROPOSAL: 0.5, NEGOTIATION: 0.7 };
export const STALE_DAYS = 14;
const DAY = 86400000;

export type Profile = 'STAR' | 'BUSY' | 'SELECTIVE' | 'ATTENTION' | 'UNKNOWN';
export const PROFILE_INFO: Record<Profile, { label: string; tone: string; hint: string }> = {
  STAR: { label: 'ستاره', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200', hint: 'هم زیاد تلاش می‌کند هم خوب نتیجه می‌گیرد' },
  BUSY: { label: 'پرتلاش، نتیجهٔ کم', tone: 'bg-amber-50 text-amber-800 border-amber-200', hint: 'فعالیت زیاد ولی تبدیل پایین؛ مشکل مهارت فروش است نه تلاش' },
  SELECTIVE: { label: 'گزینشی', tone: 'bg-sky-50 text-sky-800 border-sky-200', hint: 'تبدیل خوب ولی فعالیت کم؛ قیف را با تلاش بیشتر پر کند' },
  ATTENTION: { label: 'نیازمند توجه', tone: 'bg-rose-50 text-rose-800 border-rose-200', hint: 'هم فعالیت کم است هم نتیجه؛ مربی‌گری نزدیک لازم است' },
  UNKNOWN: { label: 'دادهٔ کم', tone: 'bg-slate-50 text-slate-600 border-slate-200', hint: 'هنوز فروش بسته‌شده‌ای در این بازه نیست تا قضاوت شود' },
};

export interface RepRow {
  id: string;
  name: string;
  created: number;
  won: number;
  lost: number;
  winRate: number | null;
  wonValue: number;
  avgDeal: number | null;
  cycleDays: number | null;
  open: number;
  openValue: number;
  weighted: number;
  stale: number;
  overdueClose: number;
  stageOpen: Record<string, number>;
  calls: number;
  meetings: number;
  notes: number;
  quotes: number;
  followups: number;
  followupsOverdue: number;
  activities: number;
  activeDays: number;
  newCustomers: number;
  proformas: number;
  velocity: number | null;
  topLoss: string;
  topCustomerShare: number | null;
  score: number;
  profile: Profile;
  tips: Tip[];
}

export interface Tip {
  tone: 'good' | 'warn' | 'info';
  text: string;
  /** the idea from the books the advice rests on */
  basis: string;
}

export interface TeamAnalysis {
  rows: RepRow[];
  total: { created: number; won: number; lost: number; winRate: number | null; wonValue: number; avgDeal: number | null; cycleDays: number | null; open: number; openValue: number; weighted: number; stale: number; velocity: number | null; activities: number };
  lossReasons: { label: string; count: number; value: number }[];
  staleDeals: { id: string; title: string; customerName: string; ownerName: string; amount: number; stage: DealStage; idleDays: number }[];
  concentration: { top: { name: string; value: number }[]; share1: number; share3: number; share5: number; totalValue: number } | null;
  /** last 30 days won vs the weighted open pipeline: how many months of sales the pipeline holds */
  coverageMonths: number | null;
}

const isCustomer = (c: Customer) => !c.contactType;
const closeTime = (d: Deal) => new Date(d.closedAt || d.updatedAt).getTime();
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const pct = (n: number) => Math.round(n * 100);

export function analyzeTeam(input: { staff: User[]; deals: Deal[]; customers: Customer[]; activities: CrmActivity[]; days: number; today?: Date }): TeamAnalysis {
  const now = (input.today || new Date()).getTime();
  const since = now - input.days * DAY;
  const todayIso = new Date(now).toISOString().slice(0, 10);
  const staffById = new Map(input.staff.map((u) => [u.id, u]));
  const customerIds = new Set(input.customers.filter(isCustomer).map((c) => c.id));
  const deals = input.deals.filter((d) => !d.customerId || customerIds.has(d.customerId) || !input.customers.some((c) => c.id === d.customerId));
  const acts = input.activities.filter((a) => a.type !== 'MISSING');

  // who is on the list: everybody who owns an opportunity or did something in the period (and is still a person of the company)
  const ids = new Set<string>();
  for (const d of deals) if (d.ownerId) ids.add(d.ownerId);
  for (const a of acts) if (a.authorId && new Date(a.createdAt).getTime() >= since) ids.add(a.authorId);
  const people = [...ids].filter((id) => staffById.has(id) && staffById.get(id)!.isActive !== false);

  const lossAll = new Map<string, { count: number; value: number }>();
  const rows: RepRow[] = people.map((id) => {
    const u = staffById.get(id)!;
    const mine = deals.filter((d) => d.ownerId === id);
    const wonD = mine.filter((d) => d.stage === 'WON' && closeTime(d) >= since);
    const lostD = mine.filter((d) => d.stage === 'LOST' && closeTime(d) >= since);
    const openD = mine.filter((d) => OPEN_STAGES.includes(d.stage));
    const staleD = openD.filter((d) => now - new Date(d.updatedAt).getTime() > STALE_DAYS * DAY);
    const stageOpen: Record<string, number> = {};
    for (const d of openD) stageOpen[d.stage] = (stageOpen[d.stage] || 0) + 1;
    const wonValue = wonD.reduce((s, d) => s + (d.amount || 0), 0);
    const decided = wonD.length + lostD.length;
    const winRate = decided ? wonD.length / decided : null;
    const cycle = avg(wonD.map((d) => Math.max(0, (closeTime(d) - new Date(d.createdAt).getTime()) / DAY)));
    const avgDeal = wonD.length ? wonValue / wonD.length : null;
    const created = mine.filter((d) => new Date(d.createdAt).getTime() >= since).length;
    const myActs = acts.filter((a) => a.authorId === id && new Date(a.createdAt).getTime() >= since);
    const count = (t: string) => myActs.filter((a) => a.type === t).length;
    const fu = acts.filter((a) => a.type === 'FOLLOWUP' && a.ownerId === id);
    const reasons = new Map<string, number>();
    for (const d of lostD) {
      const r = (d.lostReason || 'بدون دلیل ثبت‌شده').trim();
      reasons.set(r, (reasons.get(r) || 0) + 1);
      const cur = lossAll.get(r) || { count: 0, value: 0 };
      lossAll.set(r, { count: cur.count + 1, value: cur.value + (d.amount || 0) });
    }
    const topLoss = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const byCustomer = new Map<string, number>();
    for (const d of wonD) byCustomer.set(d.customerId, (byCustomer.get(d.customerId) || 0) + (d.amount || 0));
    const topC = Math.max(0, ...byCustomer.values());
    return {
      id, name: u.fullName, created, won: wonD.length, lost: lostD.length, winRate, wonValue, avgDeal, cycleDays: cycle,
      open: openD.length, openValue: openD.reduce((s, d) => s + (d.amount || 0), 0),
      weighted: openD.reduce((s, d) => s + (d.amount || 0) * (STAGE_PROB[d.stage] || 0), 0),
      stale: staleD.length, overdueClose: openD.filter((d) => d.expectedClose && d.expectedClose < todayIso).length, stageOpen,
      calls: count('CALL'), meetings: count('MEETING'), notes: count('NOTE'), quotes: count('QUOTE'), followups: count('FOLLOWUP'),
      followupsOverdue: fu.filter((a) => !a.done && a.dueDate && a.dueDate < todayIso).length,
      activities: myActs.length,
      activeDays: new Set(myActs.map((a) => a.createdAt.slice(0, 10))).size,
      newCustomers: input.customers.filter((c) => isCustomer(c) && c.ownerId === id && new Date(c.createdAt).getTime() >= since).length,
      proformas: mine.filter((d) => d.proformaNumber && new Date(d.createdAt).getTime() >= since).length,
      velocity: created && winRate && avgDeal && cycle ? (created * winRate * avgDeal) / Math.max(1, cycle) : null,
      topLoss, topCustomerShare: wonValue ? topC / wonValue : null,
      score: 0, profile: 'UNKNOWN', tips: [],
    };
  });

  // the company as a whole (the yardstick every person is held against)
  const sum = (f: (r: RepRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const wonN = sum((r) => r.won);
  const lostN = sum((r) => r.lost);
  const wonV = sum((r) => r.wonValue);
  const allWon = deals.filter((d) => d.stage === 'WON' && closeTime(d) >= since && staffById.has(d.ownerId));
  const cycleAll = avg(allWon.map((d) => Math.max(0, (closeTime(d) - new Date(d.createdAt).getTime()) / DAY)));
  const winAll = wonN + lostN ? wonN / (wonN + lostN) : null;
  const avgAll = wonN ? wonV / wonN : null;
  const createdAll = sum((r) => r.created);
  const total = {
    created: createdAll, won: wonN, lost: lostN, winRate: winAll, wonValue: wonV, avgDeal: avgAll, cycleDays: cycleAll,
    open: sum((r) => r.open), openValue: sum((r) => r.openValue), weighted: sum((r) => r.weighted), stale: sum((r) => r.stale),
    velocity: createdAll && winAll && avgAll && cycleAll ? (createdAll * winAll * avgAll) / Math.max(1, cycleAll) : null,
    activities: sum((r) => r.activities),
  };

  // profile, score and advice for every person
  const actsMedian = median(rows.filter((r) => r.activities > 0).map((r) => r.activities));
  const maxActs = Math.max(1, ...rows.map((r) => r.activities));
  const maxWon = Math.max(1, ...rows.map((r) => r.won));
  for (const r of rows) {
    const hiAct = r.activities >= actsMedian && r.activities > 0;
    const hiConv = r.winRate !== null && winAll !== null ? r.winRate >= winAll : null;
    r.profile = hiConv === null ? 'UNKNOWN' : hiAct && hiConv ? 'STAR' : hiAct ? 'BUSY' : hiConv ? 'SELECTIVE' : 'ATTENTION';
    // the index: results 40 (win rate and the number of wins), activity 30, pipeline discipline 30 (not stale, follow-ups kept)
    const result = ((r.winRate ?? 0) + r.won / maxWon) / 2;
    const act = r.activities / maxActs;
    const open = r.open + r.followups;
    const discipline = 1 - Math.min(1, (r.stale + r.followupsOverdue) / Math.max(1, open));
    r.score = Math.round(100 * (0.4 * result + 0.3 * act + 0.3 * discipline));
    r.tips = tipsFor(r, total, actsMedian);
  }
  rows.sort((a, b) => b.score - a.score);

  const staleDeals = deals
    .filter((d) => OPEN_STAGES.includes(d.stage) && now - new Date(d.updatedAt).getTime() > STALE_DAYS * DAY)
    .map((d) => ({ id: d.id, title: d.title, customerName: d.customerName, ownerName: staffById.get(d.ownerId)?.fullName || d.ownerName, amount: d.amount || 0, stage: d.stage, idleDays: Math.floor((now - new Date(d.updatedAt).getTime()) / DAY) }))
    .sort((a, b) => b.idleDays - a.idleDays)
    .slice(0, 12);

  const byCust = new Map<string, { name: string; value: number }>();
  for (const d of allWon) {
    const cur = byCust.get(d.customerId) || { name: d.customerName, value: 0 };
    byCust.set(d.customerId, { name: cur.name, value: cur.value + (d.amount || 0) });
  }
  const top = [...byCust.values()].sort((a, b) => b.value - a.value);
  const topSum = (n: number) => top.slice(0, n).reduce((s, x) => s + x.value, 0);
  const concentration = wonV > 0 ? { top: top.slice(0, 5), share1: topSum(1) / wonV, share3: topSum(3) / wonV, share5: topSum(5) / wonV, totalValue: wonV } : null;

  const last30Won = deals.filter((d) => d.stage === 'WON' && closeTime(d) >= now - 30 * DAY).reduce((s, d) => s + (d.amount || 0), 0);
  return {
    rows,
    total,
    lossReasons: [...lossAll.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.count - a.count),
    staleDeals,
    concentration,
    coverageMonths: last30Won > 0 ? total.weighted / last30Won : null,
  };
}

/** Advice for one person, each line with the idea from the books it rests on. */
function tipsFor(r: RepRow, t: TeamAnalysis['total'], actsMedian: number): Tip[] {
  const tips: Tip[] = [];
  const decided = r.won + r.lost;
  if (t.winRate !== null && r.winRate !== null && decided >= 3 && r.winRate < t.winRate - 0.1) {
    tips.push({ tone: 'warn', text: `نرخ موفقیت ${pct(r.winRate)}٪ است و از میانگین شرکت (${pct(t.winRate)}٪) پایین‌تر. پیش از ارائهٔ قیمت، پرسش‌های «مشکل» و «پیامد» بیشتر بپرسد تا نیاز مشتری عمیق شود و دلیل باخت‌ها${r.topLoss ? ` («${r.topLoss}»)` : ''} را با مدیر مرور کند.`, basis: 'SPIN Selling (نیل رکهم): پرسش‌های موقعیت، مشکل، پیامد و نیاز-سود' });
  }
  if (r.winRate !== null && t.winRate !== null && decided >= 3 && r.winRate >= t.winRate + 0.1 && r.won >= 3) {
    tips.push({ tone: 'good', text: `نرخ موفقیت ${pct(r.winRate)}٪ بالاتر از میانگین شرکت است. روش کارش (چه می‌پرسد، چطور قیمت می‌دهد، چطور پیگیری می‌کند) را بنویسید و در جلسهٔ تیم به بقیه آموزش دهد.`, basis: 'The Sales Acceleration Formula (مارک روبرج): مربی‌گری بر پایهٔ داده و تکرار رفتار برنده‌ها' });
  }
  if (actsMedian > 0 && r.activities < actsMedian * 0.5) {
    tips.push({ tone: 'warn', text: `در این بازه فقط ${r.activities} فعالیت (تماس، جلسه، یادداشت، قیمت، پیگیری) ثبت کرده؛ نصف میانهٔ تیم هم نیست. هر روز زمان ثابتی برای جست‌وجوی مشتری تازه و پیگیری بگذارد و ثبت در سامانه را همان لحظه انجام دهد.`, basis: 'Fanatical Prospecting (جب بلانت): کار روزانهٔ ثابت روی قیف، قانون «سی روز»' });
  }
  if (r.open > 0 && (r.stale >= 3 || r.stale / r.open >= 0.3)) {
    tips.push({ tone: 'warn', text: `${r.stale} از ${r.open} فرصت باز بیش از ${STALE_DAYS} روز بی‌حرکت مانده. برای هر کدام همین هفته گام بعدی با تاریخ مشخص ثبت کند یا آن را ببندد تا قیف واقعی بماند.`, basis: 'Gap Selling (کینان): بزرگ‌ترین رقیب «تصمیم نگرفتن» است؛ Sandler: قرارداد صریح برای گام بعد' });
  }
  if (r.followupsOverdue > 0) {
    tips.push({ tone: 'warn', text: `${r.followupsOverdue} پیگیری از موعدش گذشته و انجام نشده؛ اول این‌ها را تمام کند.`, basis: 'Predictable Revenue (آرون راس): قیف قابل‌پیش‌بینی با پیگیری منظم' });
  }
  if (r.overdueClose > 0) {
    tips.push({ tone: 'info', text: `${r.overdueClose} فرصت از «تاریخ پیش‌بینی بستن»‌اش گذشته؛ تاریخ را واقعی کند یا مرحله را به‌روز کند تا پیش‌بینی فروش دقیق بماند.`, basis: 'پیش‌بینی فروش بر پایهٔ مرحله و تاریخ واقعی (روش‌های استاندارد مدیریت قیف)' });
  }
  if (t.cycleDays !== null && r.cycleDays !== null && r.won >= 3 && r.cycleDays > t.cycleDays * 1.3) {
    tips.push({ tone: 'warn', text: `متوسط ${Math.round(r.cycleDays)} روز تا بستن فروش می‌گذرد؛ میانگین شرکت ${Math.round(t.cycleDays)} روز است. در هر تماس به‌جای «منتظر می‌مانیم»، گام بعدی را خودش پیشنهاد دهد و کنترل روند را در دست بگیرد.`, basis: 'The Challenger Sale (دیکسون و آدامسون): آموزش دادن، متناسب‌سازی و در دست گرفتن کنترل فروش' });
  }
  if (r.quotes >= 5 && r.winRate !== null && t.winRate !== null && r.winRate < t.winRate) {
    tips.push({ tone: 'warn', text: `${r.quotes} قیمت داده ولی تبدیل پایین است. قیمت را با «ارزش» همراه کند (چه مشکلی را حل می‌کند و چه هزینه‌ای را کم می‌کند) و پس از قیمت‌دادن تماس پیگیری را همان هفته بگذارد.`, basis: 'The Challenger Sale و Never Split the Difference (کریس واس): گفت‌وگو بر پایهٔ ارزش و مذاکرهٔ هدایت‌شده، نه تخفیف زودهنگام' });
  }
  if (r.topCustomerShare !== null && r.topCustomerShare >= 0.6 && r.won >= 2) {
    tips.push({ tone: 'info', text: `${pct(r.topCustomerShare)}٪ فروش موفقش از یک مشتری است؛ وابستگی زیاد خطرناک است. چند مشتری تازه به قیف اضافه کند.`, basis: 'اصل ۸۰/۲۰ (ریچارد کوچ): تمرکز بر مشتریان کلیدی ولی بدون وابستگی' });
  }
  if (r.open === 0) {
    tips.push({ tone: 'warn', text: 'هیچ فرصت بازی ندارد؛ فروش ماه‌های بعد از همین حالا تهی می‌شود. همین هفته فرصت‌های تازه از مشتریان فعلی و مشتریان جدید بسازد.', basis: 'Predictable Revenue: فروش آینده را قیف امروز می‌سازد' });
  }
  if (tips.length === 0) {
    tips.push({ tone: 'info', text: 'نشانهٔ نگران‌کننده‌ای در این بازه نیست؛ همین روند را نگه دارد و به‌طور منظم با مدیر مرور کند.', basis: 'مرور منظم عملکرد بر پایهٔ داده' });
  }
  return tips;
}
