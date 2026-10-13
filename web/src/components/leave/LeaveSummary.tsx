import React, { useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, XCircle } from 'lucide-react';
import { LeaveRequest } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, isoToJalaliParts, JALALI_MONTHS, todayIso } from '../../lib/taskDates';

const TYPE_LABEL: Record<string, string> = { ANNUAL: 'استحقاقی', SICK: 'استعلاجی', UNPAID: 'بدون حقوق', HOURLY: 'ساعتی', MISSION: 'ماموریت', OTHER: 'سایر' };
const TYPE_BAR: Record<string, string> = { ANNUAL: 'bg-emerald-500', SICK: 'bg-rose-500', UNPAID: 'bg-amber-500', HOURLY: 'bg-sky-500', MISSION: 'bg-violet-500', OTHER: 'bg-slate-400' };

const dayIso = (d: Date) => d.toLocaleDateString('en-CA');
const hoursBetween = (a?: string, b?: string) => {
  if (!a || !b) return 0;
  const [ah, am] = a.split(':').map(Number);
  const [bh, bm] = b.split(':').map(Number);
  return Math.max(0, (bh * 60 + bm - (ah * 60 + am)) / 60);
};
const fa = (n: number) => toPersianDigits(Number.isInteger(n) ? n : n.toFixed(1));

/** The leave a person has taken: totals of the Persian year by kind and by month, and what is still waiting or was refused. */
export const LeaveSummary: React.FC<{ leaves: LeaveRequest[] }> = ({ leaves }) => {
  const nowYear = isoToJalaliParts(todayIso())?.[0] || 1405;
  const [year, setYear] = useState(nowYear);

  const data = useMemo(() => {
    const byType: Record<string, number> = {};
    const byMonth = Array.from({ length: 12 }, () => 0);
    let hours = 0;
    const rows: LeaveRequest[] = [];
    for (const l of leaves) {
      if (l.status !== 'APPROVED') continue;
      let touches = false;
      if (l.type === 'HOURLY') {
        const p = isoToJalaliParts(l.fromDate);
        if (p && p[0] === year) {
          const h = hoursBetween(l.fromTime, l.toTime);
          hours += h;
          byMonth[p[1] - 1] += h / 8; // eight working hours make one day
          touches = true;
        }
      } else {
        const d = new Date(l.fromDate + 'T12:00:00');
        const end = new Date((l.toDate || l.fromDate) + 'T12:00:00');
        for (let i = 0; d <= end && i < 400; i++, d.setDate(d.getDate() + 1)) {
          const p = isoToJalaliParts(dayIso(d));
          if (p && p[0] === year) {
            byType[l.type] = (byType[l.type] || 0) + 1;
            byMonth[p[1] - 1] += 1;
            touches = true;
          }
        }
      }
      if (touches) rows.push(l);
    }
    const inYear = (l: LeaveRequest) => isoToJalaliParts(l.fromDate)?.[0] === year;
    return {
      byType,
      byMonth,
      hours,
      rows: rows.sort((a, b) => b.fromDate.localeCompare(a.fromDate)),
      pending: leaves.filter((l) => l.status === 'PENDING' && inYear(l)).length,
      rejected: leaves.filter((l) => l.status === 'REJECTED' && inYear(l)).length,
    };
  }, [leaves, year]);

  const totalDays = Object.entries(data.byType).reduce((s, [, n]) => s + n, 0);
  const maxMonth = Math.max(1, ...data.byMonth);
  const types = Object.entries(data.byType).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4" data-leave-summary>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-black text-[#3A241F]">
          <CalendarDays className="w-4 h-4 text-[#6E1B1B]" />
          خلاصهٔ مرخصی‌های من
        </div>
        <div className="flex items-center bg-white border border-[#EBDBCE] rounded-xl">
          <button type="button" onClick={() => setYear(year - 1)} className="p-2 cursor-pointer" title="سال قبل"><ChevronRight className="w-4 h-4" /></button>
          <span className="px-3 text-xs font-black min-w-[64px] text-center text-[#3A241F]">{toPersianDigits(year)}</span>
          <button type="button" onClick={() => setYear(year + 1)} disabled={year >= nowYear} className="p-2 cursor-pointer disabled:opacity-30" title="سال بعد"><ChevronLeft className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ['روز مرخصی تاییدشده', fa(totalDays), 'text-emerald-700 bg-emerald-50 border-emerald-200', CheckCircle2],
          ['ساعت مرخصی ساعتی', fa(Math.round(data.hours * 10) / 10), 'text-sky-700 bg-sky-50 border-sky-200', Clock],
          ['در انتظار تایید', fa(data.pending), 'text-amber-800 bg-amber-50 border-amber-200', Clock],
          ['ردشده', fa(data.rejected), 'text-rose-700 bg-rose-50 border-rose-200', XCircle],
        ] as const).map(([k, v, tone, Ic]) => (
          <div key={k} className={`rounded-2xl border px-3.5 py-3 ${tone}`}>
            <div className="flex items-center gap-1.5 text-[11px] font-bold"><Ic className="w-4 h-4" />{k}</div>
            <div className="text-xl font-black mt-0.5">{v}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-[#EBDBCE] bg-white p-4 space-y-2.5">
          <div className="text-xs font-black text-[#3A241F]">به تفکیک نوع</div>
          {types.length === 0 && data.hours === 0 && <div className="text-[11px] text-[#8C6F66] py-3 text-center">در این سال مرخصی تاییدشده‌ای ندارید.</div>}
          {types.map(([t, n]) => (
            <div key={t}>
              <div className="flex justify-between text-[11px] font-bold text-[#3A241F]"><span>{TYPE_LABEL[t] || t}</span><span>{fa(n)} روز</span></div>
              <div className="h-2 rounded-full bg-[#FAF5F1] overflow-hidden mt-1"><div className={`h-full rounded-full ${TYPE_BAR[t] || 'bg-slate-400'}`} style={{ width: `${Math.round((n / Math.max(1, totalDays)) * 100)}%` }} /></div>
            </div>
          ))}
          {data.hours > 0 && (
            <div>
              <div className="flex justify-between text-[11px] font-bold text-[#3A241F]"><span>ساعتی</span><span>{fa(Math.round(data.hours * 10) / 10)} ساعت</span></div>
              <div className="h-2 rounded-full bg-[#FAF5F1] overflow-hidden mt-1"><div className={`h-full rounded-full ${TYPE_BAR.HOURLY}`} style={{ width: '100%' }} /></div>
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-[#EBDBCE] bg-white p-4">
          <div className="text-xs font-black text-[#3A241F] mb-3">به تفکیک ماه (برحسب روز)</div>
          <div className="flex items-end gap-1.5 h-32" dir="rtl">
            {data.byMonth.map((n, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full" title={`${JALALI_MONTHS[i]}: ${fa(Math.round(n * 10) / 10)} روز`}>
                <span className="text-[9px] font-black text-[#8C6F66]">{n ? fa(Math.round(n * 10) / 10) : ''}</span>
                <div className="w-full rounded-t-md bg-[#6E1B1B]/80" style={{ height: `${Math.max(n ? 6 : 2, Math.round((n / maxMonth) * 88))}%`, opacity: n ? 1 : 0.15 }} />
                <span className="text-[8px] font-bold text-[#8C6F66] truncate max-w-full">{JALALI_MONTHS[i].slice(0, 4)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {data.rows.length > 0 && (
        <section className="rounded-2xl border border-[#EBDBCE] bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[#EBDBCE] text-xs font-black text-[#3A241F]">مرخصی‌های تاییدشده در سال {toPersianDigits(year)}</div>
          <div className="divide-y divide-[#EBDBCE]/60">
            {data.rows.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[11px] font-bold text-[#3A241F]">
                <span className="min-w-0 truncate">{TYPE_LABEL[l.type] || l.typeLabel}{l.reason ? ` · ${l.reason}` : ''}</span>
                <span className="shrink-0 text-[#8C6F66]">
                  {formatTaskDate(l.fromDate)}
                  {l.type === 'HOURLY' ? ` · ${toPersianDigits(l.fromTime || '')} تا ${toPersianDigits(l.toTime || '')}` : l.toDate && l.toDate !== l.fromDate ? ` تا ${formatTaskDate(l.toDate)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
