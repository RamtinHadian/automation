import { Customer, DailyReport, Deal, DealStage, FileTransfer, Task, User } from '../types';
import { isoToJalaliParts, JALALI_MONTHS } from './taskDates';
import { toPersianDigits } from './jalali';

export interface StatsInput {
  staff: User[];
  transfers: FileTransfer[];
  tasks: Task[];
  reports: DailyReport[];
  customers: Customer[];
  deals: Deal[];
}

const DAY = 86400000;

export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOf = (iso?: string) => (iso ? isoDay(new Date(iso)) : '');

/** «۹ مهر» */
export const shortDay = (iso: string) => {
  const p = isoToJalaliParts(iso);
  return p ? `${toPersianDigits(p[2])} ${JALALI_MONTHS[p[1] - 1]}` : iso;
};
export const monthName = (iso: string) => {
  const p = isoToJalaliParts(iso);
  return p ? JALALI_MONTHS[p[1] - 1] : iso;
};

export const STAGE_LABEL: Record<DealStage, string> = {
  NEW: 'جدید',
  CONTACTED: 'تماس گرفته شد',
  PROPOSAL: 'پیشنهاد ارسال شد',
  NEGOTIATION: 'مذاکره',
  WON: 'فروش موفق',
  LOST: 'از دست رفت',
};

export interface Stats {
  days: string[]; // oldest first
  kpi: {
    lettersSigned: number;
    lettersPending: number;
    lettersRejected: number;
    avgSignHours: number | null;
    filesSent: number;
    tasksCreated: number;
    tasksDone: number;
    tasksOpen: number;
    tasksOverdue: number;
    completionRate: number | null;
    newCustomers: number;
    pipelineValue: number;
    openDeals: number;
    wonValue: number;
    wonCount: number;
    winRate: number | null;
    proformas: number;
    proformaValue: number;
  };
  transfersPerDay: { files: number[]; letters: number[] };
  taskStatus: { id: string; label: string; value: number }[];
  taskLoad: { name: string; open: number; overdue: number }[];
  letterStatus: { label: string; value: number }[];
  funnel: { stage: DealStage; label: string; count: number; value: number }[];
  salesByOwner: { name: string; won: number; count: number }[];
  wonByMonth: { label: string; value: number }[];
  sources: { label: string; value: number }[];
  reportRate: { day: string; submitted: number; expected: number }[];
  missingReportsToday: string[];
  storageByDept: { name: string; used: number; quota: number }[];
}

/** All the numbers of the management dashboard, computed from what the admin's browser already holds. */
export function computeStats(input: StatsInput, rangeDays: number, now = new Date()): Stats {
  const { staff, transfers, tasks, reports, customers, deals } = input;
  const today = isoDay(now);
  const days: string[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) days.push(isoDay(new Date(now.getTime() - i * DAY)));
  const first = days[0];
  const inRange = (iso?: string) => {
    const d = dayOf(iso);
    return !!d && d >= first && d <= today;
  };
  const idx = new Map(days.map((d, i) => [d, i]));

  // ---- files and letters ----
  const files = transfers.filter((t) => !t.isOfficialLetter);
  const letters = transfers.filter((t) => t.isOfficialLetter);
  const perDay = { files: days.map(() => 0), letters: days.map(() => 0) };
  transfers.forEach((t) => {
    const i = idx.get(dayOf(t.sentAt));
    if (i !== undefined) (t.isOfficialLetter ? perDay.letters : perDay.files)[i]++;
  });
  const signed = letters.filter((l) => l.signatureStatus === 'SIGNED');
  const hours = signed
    .filter((l) => l.signedAt && l.sentAt && inRange(l.signedAt))
    .map((l) => (new Date(l.signedAt!).getTime() - new Date(l.sentAt).getTime()) / 3600000)
    .filter((h) => h >= 0);

  // ---- tasks ----
  const open = tasks.filter((t) => t.status !== 'DONE');
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today);
  const created = tasks.filter((t) => inRange(t.createdAt));
  const done = tasks.filter((t) => t.status === 'DONE' && inRange(t.completedAt || t.updatedAt));
  const name = new Map(staff.map((u) => [u.id, u.fullName]));
  const load = new Map<string, { open: number; overdue: number }>();
  open.forEach((t) =>
    t.assigneeIds.forEach((id) => {
      const cur = load.get(id) || { open: 0, overdue: 0 };
      cur.open++;
      if (t.dueDate && t.dueDate < today) cur.overdue++;
      load.set(id, cur);
    })
  );
  const statusLabel = { TODO: 'در انتظار', IN_PROGRESS: 'در حال انجام', REVIEW: 'در بازبینی', DONE: 'انجام شد' } as const;

  // ---- sales ----
  const openStages: DealStage[] = ['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION'];
  const openDeals = deals.filter((d) => openStages.includes(d.stage));
  const wonIn = deals.filter((d) => d.stage === 'WON' && inRange(d.closedAt || d.updatedAt));
  const lostIn = deals.filter((d) => d.stage === 'LOST' && inRange(d.closedAt || d.updatedAt));
  const byOwner = new Map<string, { won: number; count: number }>();
  wonIn.forEach((d) => {
    const cur = byOwner.get(d.ownerName || '—') || { won: 0, count: 0 };
    cur.won += d.amount;
    cur.count++;
    byOwner.set(d.ownerName || '—', cur);
  });
  const months: { key: string; label: string; value: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 30 * DAY);
    const p = isoToJalaliParts(isoDay(d));
    const key = p ? `${p[0]}-${p[1]}` : isoDay(d);
    if (!months.some((m) => m.key === key)) months.push({ key, label: p ? JALALI_MONTHS[p[1] - 1] : key, value: 0 });
  }
  deals
    .filter((d) => d.stage === 'WON')
    .forEach((d) => {
      const p = isoToJalaliParts(dayOf(d.closedAt || d.updatedAt));
      const m = p && months.find((x) => x.key === `${p[0]}-${p[1]}`);
      if (m) m.value += d.amount;
    });
  const src = new Map<string, number>();
  customers.forEach((c) => src.set(c.source || 'نامشخص', (src.get(c.source || 'نامشخص') || 0) + 1));
  const proformaDeals = deals.filter((d) => d.proformaNumber && inRange(d.proformaAt || d.updatedAt));

  // ---- daily reports: who should write one (people with the tasks menu) and who did ----
  const writers = staff.filter((u) => u.isActive && (u.canUseTasks || u.role !== 'STAFF'));
  const lastDays = days.slice(-7);
  const reportRate = lastDays.map((d) => ({ day: d, submitted: new Set(reports.filter((r) => r.date === d).map((r) => r.userId)).size, expected: writers.length }));
  const submittedToday = new Set(reports.filter((r) => r.date === today).map((r) => r.userId));

  // ---- storage ----
  const dept = new Map<string, { used: number; quota: number }>();
  staff.forEach((u) => {
    const cur = dept.get(u.departmentName) || { used: 0, quota: 0 };
    cur.used += u.storageUsedGB || 0;
    cur.quota += u.storageQuotaGB || 0;
    dept.set(u.departmentName, cur);
  });

  const decided = wonIn.length + lostIn.length;
  return {
    days,
    kpi: {
      lettersSigned: signed.filter((l) => inRange(l.signedAt)).length,
      lettersPending: letters.filter((l) => l.signatureStatus === 'PENDING_SIGNATURE').length,
      lettersRejected: letters.filter((l) => l.signatureStatus === 'REJECTED').length,
      avgSignHours: hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null,
      filesSent: files.filter((f) => inRange(f.sentAt)).length,
      tasksCreated: created.length,
      tasksDone: done.length,
      tasksOpen: open.length,
      tasksOverdue: overdue.length,
      completionRate: created.length ? Math.min(100, Math.round((done.length / created.length) * 100)) : null,
      newCustomers: customers.filter((c) => inRange(c.createdAt)).length,
      pipelineValue: openDeals.reduce((s, d) => s + d.amount, 0),
      openDeals: openDeals.length,
      wonValue: wonIn.reduce((s, d) => s + d.amount, 0),
      wonCount: wonIn.length,
      winRate: decided ? Math.round((wonIn.length / decided) * 100) : null,
      proformas: proformaDeals.length,
      proformaValue: proformaDeals.reduce((s, d) => s + d.amount, 0),
    },
    transfersPerDay: perDay,
    taskStatus: (['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const).map((s) => ({ id: s, label: statusLabel[s], value: tasks.filter((t) => t.status === s).length })),
    taskLoad: [...load.entries()]
      .map(([id, v]) => ({ name: name.get(id) || id, ...v }))
      .sort((a, b) => b.open - a.open)
      .slice(0, 8),
    letterStatus: [
      { label: 'امضا شده', value: signed.length },
      { label: 'در انتظار امضا', value: letters.filter((l) => l.signatureStatus === 'PENDING_SIGNATURE').length },
      { label: 'رد شده', value: letters.filter((l) => l.signatureStatus === 'REJECTED').length },
    ],
    funnel: (['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION', 'WON'] as DealStage[]).map((stage) => {
      const list = deals.filter((d) => d.stage === stage);
      return { stage, label: STAGE_LABEL[stage], count: list.length, value: list.reduce((s, d) => s + d.amount, 0) };
    }),
    salesByOwner: [...byOwner.entries()].map(([n, v]) => ({ name: n, ...v })).sort((a, b) => b.won - a.won).slice(0, 8),
    wonByMonth: months.map((m) => ({ label: m.label, value: m.value })),
    sources: [...src.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6),
    reportRate,
    missingReportsToday: writers.filter((u) => !submittedToday.has(u.id)).map((u) => u.fullName),
    storageByDept: [...dept.entries()].map(([n, v]) => ({ name: n, ...v })).sort((a, b) => b.used - a.used),
  };
}
