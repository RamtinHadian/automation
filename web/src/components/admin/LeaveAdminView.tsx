import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, CalendarCheck2, Download, Search, Share2 } from 'lucide-react';
import { api, LeaveRequest } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, unitName } from '../../lib/money';
import { formatTaskDate } from '../../lib/taskDates';
import { matchesAll } from '../../lib/searchAll';
import { downloadCsv } from '../../lib/csv';
import { BoxCard, BoxGrid, BoxStats } from '../common/BoxCard';
import { SubTabs } from '../common/SubTabs';

const STATUS: Record<LeaveRequest['status'], [string, string]> = {
  PENDING: ['در انتظار تایید', 'bg-amber-50 text-amber-800 border-amber-200'],
  APPROVED: ['تایید شد', 'bg-emerald-50 text-emerald-800 border-emerald-200'],
  REJECTED: ['رد شد', 'bg-rose-50 text-rose-800 border-rose-200'],
};

const dayCount = (from: string, to: string) => Math.max(1, Math.round((new Date(to + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / 86400000) + 1);

/** The console's view of the leave and advance-payment forms: everything that was asked, who decided, who it was sent on to. */
export const LeaveAdminView: React.FC = () => {
  const [items, setItems] = useState<LeaveRequest[] | null>(null);
  const [kind, setKind] = useState<'all' | 'leave' | 'advance'>('all');
  const [status, setStatus] = useState<'all' | LeaveRequest['status']>('all');
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    api.leaves('all').then((r) => setItems(r.leaves)).catch(() => setItems([]));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const isAdv = (l: LeaveRequest) => l.kind === 'advance';
  const shown = useMemo(
    () => (items || []).filter((l) => (kind === 'all' || (kind === 'advance') === isAdv(l)) && (status === 'all' || l.status === status) && matchesAll(l, q)),
    [items, kind, status, q]
  );
  const stats = useMemo(() => {
    const all = items || [];
    const adv = all.filter(isAdv);
    return {
      pending: all.filter((l) => l.status === 'PENDING').length,
      leaves: all.filter((l) => !isAdv(l) && l.status === 'APPROVED').length,
      advances: adv.filter((l) => l.status === 'APPROVED').length,
      money: adv.filter((l) => l.status === 'APPROVED').reduce((s, l) => s + (l.amount || 0), 0),
    };
  }, [items]);

  const exportCsv = () =>
    downloadCsv('مرخصی-و-مساعده.csv', [
      ['نوع', 'همکار', 'واحد', 'از تاریخ', 'تا تاریخ', 'مبلغ', 'قسط', 'وضعیت', 'تصمیم‌گیرنده', 'ارجاع شد به', 'توضیح'],
      ...shown.map((l) => [l.typeLabel, l.userName, l.departmentName || '', l.fromDate, l.toDate, l.amount || '', l.installments || '', STATUS[l.status][0], l.decidedByName || '', (l.forwardNames || []).join('، '), l.reason || '']),
    ]);

  return (
    <div className="space-y-4" data-leave-admin>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-black text-lg text-[#3A241F]">مرخصی و مساعده</h2>
          <p className="text-xs text-[#8C6F66] mt-0.5">همهٔ فرم‌های مرخصی و مساعدهٔ همکاران، با تصمیم‌گیرنده و کسانی که بعد از تایید برایشان ارجاع شده است.</p>
        </div>
        <button type="button" onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl border border-[#EBDBCE] bg-white text-[11px] font-black cursor-pointer">
          <Download className="w-4 h-4" />
          خروجی اکسل
        </button>
      </div>

      <BoxStats
        items={[
          ['در انتظار تایید', toPersianDigits(stats.pending), 'border-amber-200 bg-amber-50 text-amber-800'],
          ['مرخصی تاییدشده', toPersianDigits(stats.leaves), 'border-emerald-200 bg-emerald-50 text-emerald-800'],
          ['مساعدهٔ تاییدشده', toPersianDigits(stats.advances), 'border-sky-200 bg-sky-50 text-sky-800'],
          [`جمع مساعده‌ها (${unitName()})`, formatMoney(stats.money), 'border-violet-200 bg-violet-50 text-violet-800'],
        ]}
      />

      <SubTabs
        tone="maroon"
        value={kind}
        onChange={(k) => setKind(k as typeof kind)}
        tabs={[
          { id: 'all', label: 'همه' },
          { id: 'leave', label: 'مرخصی', Icon: CalendarCheck2 },
          { id: 'advance', label: 'مساعده', Icon: Banknote },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        {([['all', 'همهٔ وضعیت‌ها'], ['PENDING', 'در انتظار'], ['APPROVED', 'تاییدشده'], ['REJECTED', 'ردشده']] as const).map(([k, t]) => (
          <button key={k} type="button" onClick={() => setStatus(k)} className={`px-3 py-1.5 rounded-xl text-[11px] font-black cursor-pointer border ${status === k ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>
            {t}
          </button>
        ))}
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#8C6F66]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در همهٔ اطلاعات: نام، واحد، مبلغ، تاریخ، توضیح…" className="w-full pr-9 pl-3 py-2.5 min-h-[40px] bg-white border border-[#EBDBCE] rounded-xl text-xs outline-hidden" />
        </div>
      </div>

      {items === null ? (
        <div className="py-12 text-center text-xs font-bold text-[#8C6F66]">در حال دریافت…</div>
      ) : (
        <BoxGrid empty="موردی پیدا نشد.">
          {shown.map((l) => (
            <BoxCard
              key={l.id}
              icon={isAdv(l) ? <Banknote className="w-5 h-5" /> : <CalendarCheck2 className="w-5 h-5" />}
              tone={isAdv(l) ? 'amber' : 'emerald'}
              title={`${l.userName} · ${l.typeLabel}`}
              sub={[l.departmentName, isAdv(l) ? `نیاز تا ${formatTaskDate(l.needDate || l.fromDate)}` : `${formatTaskDate(l.fromDate)}${l.toDate !== l.fromDate ? ' تا ' + formatTaskDate(l.toDate) : ''}`].filter(Boolean).join(' · ')}
              badge={STATUS[l.status]}
              facts={[
                isAdv(l) ? ['مبلغ', `${formatMoney(l.amount || 0)} ${unitName()}`] : ['مدت', l.type === 'HOURLY' ? `${toPersianDigits(l.fromTime || '')} تا ${toPersianDigits(l.toTime || '')}` : `${toPersianDigits(dayCount(l.fromDate, l.toDate))} روز`],
                isAdv(l) ? ['قسط', l.installments && l.installments > 1 ? `${toPersianDigits(l.installments)} ماه` : 'یک‌جا'] : ['ثبت', formatTaskDate(l.createdAt.slice(0, 10))],
                ...(l.decidedByName ? [[l.status === 'APPROVED' ? 'تایید توسط' : 'رد توسط', l.decidedByName] as [string, React.ReactNode]] : []),
                ...(l.forwardNames && l.forwardNames.length ? [['ارجاع شد به', <span key="f" className="flex items-start gap-1"><Share2 className="w-3 h-3 mt-0.5 shrink-0 text-sky-700" />{l.forwardNames.join('، ')}</span>] as [string, React.ReactNode]] : []),
              ]}
            />
          ))}
        </BoxGrid>
      )}
    </div>
  );
};
