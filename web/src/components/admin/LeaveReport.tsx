import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Clock, Users } from 'lucide-react';
import { api, LeaveRequest } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';
import { C, ChartCard, HBars, Kpi, fa } from './charts';

const TYPE_LABEL: Record<string, string> = { ANNUAL: 'استحقاقی', SICK: 'استعلاجی', UNPAID: 'بدون حقوق', HOURLY: 'ساعتی', MISSION: 'ماموریت', OTHER: 'سایر' };
const dayIso = (d: Date) => d.toLocaleDateString('en-CA');
const hoursOf = (a?: string, b?: string) => {
  if (!a || !b) return 0;
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return Math.max(0, (bh * 60 + bm - (ah * 60 + am)) / 60);
};

/**
 * The leave report: what the managing director sees for the whole company, and a unit manager for the people of his unit (the server decides who is
 * in the list: «scope=all»). Nothing is drawn for anybody else.
 */
export const LeaveReport: React.FC<{ range: number; rangeLabel: string }> = ({ range, rangeLabel }) => {
  const [leaves, setLeaves] = useState<LeaveRequest[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.leaves('all').then((r) => alive && setLeaves(r.leaves.filter((l) => (l.kind || 'leave') === 'leave'))).catch(() => alive && setLeaves(null));
    load();
    const t = window.setInterval(load, 60000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);

  const s = useMemo(() => {
    if (!leaves) return null;
    const to = new Date(); to.setHours(12, 0, 0, 0);
    const from = new Date(to); from.setDate(from.getDate() - range + 1);
    const fromIso = dayIso(from), toIso = dayIso(to);
    const people = new Map<string, { name: string; days: number; hours: number }>();
    const byType: Record<string, number> = {};
    let days = 0, hours = 0;
    const inRange: LeaveRequest[] = [];
    for (const l of leaves) {
      if (l.status !== 'APPROVED') continue;
      let mine = 0, h = 0;
      if (l.type === 'HOURLY') {
        if (l.fromDate >= fromIso && l.fromDate <= toIso) { h = hoursOf(l.fromTime, l.toTime); byType.HOURLY = (byType.HOURLY || 0) + h / 8; }
      } else {
        const d = new Date(l.fromDate + 'T12:00:00');
        const end = new Date((l.toDate || l.fromDate) + 'T12:00:00');
        for (let i = 0; d <= end && i < 400; i++, d.setDate(d.getDate() + 1)) {
          const iso = dayIso(d);
          if (iso >= fromIso && iso <= toIso) { mine++; byType[l.type] = (byType[l.type] || 0) + 1; }
        }
      }
      if (!mine && !h) continue;
      days += mine; hours += h;
      const p = people.get(l.userId) || { name: l.userName, days: 0, hours: 0 };
      p.days += mine + h / 8; p.hours += h;
      people.set(l.userId, p);
      inRange.push(l);
    }
    const today = dayIso(to);
    return {
      days: days + hours / 8,
      pending: leaves.filter((l) => l.status === 'PENDING').length,
      awayNow: leaves.filter((l) => l.status === 'APPROVED' && l.type !== 'HOURLY' && l.fromDate <= today && (l.toDate || l.fromDate) >= today),
      people: [...people.values()].sort((a, b) => b.days - a.days).slice(0, 10),
      byType: Object.entries(byType).sort((a, b) => b[1] - a[1]),
      recent: inRange.sort((a, b) => b.fromDate.localeCompare(a.fromDate)).slice(0, 8),
      count: inRange.length,
    };
  }, [leaves, range]);

  if (!s) return null; // not allowed (or still loading): no card
  const r1 = (n: number) => fa(Math.round(n * 10) / 10);
  return (
    <div className="space-y-3" data-leave-report>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi accent={C.green} icon={<CalendarCheck className="w-5 h-5" />} label={`روز مرخصی (${rangeLabel})`} value={r1(s.days)} sub={`${toPersianDigits(s.count)} درخواست تأییدشده`} />
        <Kpi accent={C.yellow} icon={<Clock className="w-5 h-5" />} label="مرخصی منتظر تصمیم" value={fa(s.pending)} sub="درخواست بی‌پاسخ" />
        <Kpi accent={C.violet} icon={<Users className="w-5 h-5" />} label="امروز در مرخصی" value={fa(s.awayNow.length)} sub={s.awayNow.slice(0, 3).map((l) => l.userName).join('، ') || 'کسی نیست'} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <ChartCard title="مرخصی هر نفر" subtitle={`روز مرخصیِ تأییدشده (${rangeLabel} اخیر)`} legend={[]}>
          <HBars format={(v) => r1(v)} rows={s.people.map((p) => ({ label: p.name, segments: [{ value: p.days, color: C.green, name: 'روز' }], note: p.hours ? `${r1(p.hours)} ساعت` : undefined }))} empty="در این دوره مرخصی‌ای ثبت نشده است." />
        </ChartCard>
        <ChartCard title="نوع مرخصی" subtitle="سهم هر نوع از روزها" legend={[]}>
          <HBars format={(v) => r1(v)} rows={s.byType.map(([k, v]) => ({ label: TYPE_LABEL[k] || k, segments: [{ value: v, color: C.blue, name: 'روز' }] }))} empty="در این دوره مرخصی‌ای ثبت نشده است." />
        </ChartCard>
      </div>
      {s.recent.length > 0 && (
        <div className="rounded-3xl border border-[#EBDBCE] bg-white p-4">
          <div className="font-black text-[12px] text-[#3A241F] mb-2">آخرین مرخصی‌ها</div>
          <div className="space-y-1.5">
            {s.recent.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 text-[11.5px] font-bold text-[#3A241F]">
                <span className="truncate">{l.userName}{l.departmentName ? ` · ${l.departmentName}` : ''}</span>
                <span className="shrink-0 text-[#8C6F66]">{TYPE_LABEL[l.type] || l.typeLabel} · {formatTaskDate(l.fromDate)}{l.toDate && l.toDate !== l.fromDate ? ` تا ${formatTaskDate(l.toDate)}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
