import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, X } from 'lucide-react';
import { Customer, Deal } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, unitName } from '../../lib/money';
import { formatDateTime, formatTaskDate } from '../../lib/taskDates';
import { bySeq, dealGroup } from './DealLinks';

const STAGES: { id: string; label: string; dot: string }[] = [
  { id: 'NEW', label: 'جدید', dot: '#94A3B8' },
  { id: 'CONTACTED', label: 'تماس گرفته شد', dot: '#0EA5E9' },
  { id: 'PROPOSAL', label: 'پیشنهاد ارسال شد', dot: '#8B5CF6' },
  { id: 'NEGOTIATION', label: 'مذاکره', dot: '#F59E0B' },
  { id: 'WON', label: 'فروش موفق', dot: '#10B981' },
  { id: 'LOST', label: 'از دست رفت', dot: '#F43F5E' },
];
const stageOf = (id: string) => STAGES.find((s) => s.id === id) || STAGES[0];

/** The page of all the opportunities of one customer: totals, a filter by stage, and every opportunity as a card (the linked ones together). */
export const CustomerDealsPage: React.FC<{ customer: Customer; deals: Deal[]; seesMoney: boolean; onClose: () => void }> = ({ customer, deals, seesMoney, onClose }) => {
  const [only, setOnly] = useState<string>('ALL');
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const sum = (xs: Deal[]) => xs.reduce((t, d) => t + (d.amount || 0), 0);
  const money = (n: number) => `${formatMoney(n)} ${unitName()}`;
  const open = deals.filter((d) => d.stage !== 'WON' && d.stage !== 'LOST');
  const per = STAGES.map((s) => ({ s, list: deals.filter((d) => d.stage === s.id) }));
  const shown = useMemo(() => {
    const list = deals.filter((d) => only === 'ALL' || d.stage === only).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const blocks: { key: string; members: Deal[] }[] = [];
    for (const d of list) {
      const g = d.groupId && list.filter((x) => x.groupId === d.groupId).length > 1 ? d.groupId : '';
      const at = g ? blocks.find((b) => b.key === g) : undefined;
      if (at) at.members.push(d);
      else blocks.push({ key: g || d.id, members: [d] });
    }
    return blocks;
  }, [deals, only]);

  const card = (d: Deal) => {
    const st = stageOf(d.stage);
    return (
      <div key={d.id} className="rounded-2xl bg-white/12 border border-white/20 p-3.5 space-y-2" data-deals-page-card>
        <div className="flex items-start justify-between gap-2">
          <div className="text-[13px] font-black leading-6 break-words">{d.title}</div>
          <span className="shrink-0 flex items-center gap-1.5 text-[10px] font-black rounded-full bg-white/90 text-[#3A241F] px-2.5 py-0.5"><span className="w-2 h-2 rounded-full" style={{ background: st.dot }} />{st.label}</span>
        </div>
        <div className="text-lg font-black">{money(d.amount || 0)}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-bold opacity-85">
          {d.productCode && <span dir="ltr">کد کالا: {toPersianDigits(d.productCode)}</span>}
          <span>مسئول: {d.ownerName}</span>
          {d.expectedClose && <span>بستن: {formatTaskDate(d.expectedClose)}</span>}
          {d.proformaNumber && <span>پیش‌فاکتور {toPersianDigits(d.proformaNumber)}</span>}
        </div>
        <div className="text-[10px] font-medium opacity-70">ایجاد: {formatDateTime(d.createdAt)}{d.stage === 'LOST' && d.lostReason ? ` · دلیل: ${d.lostReason}` : ''}</div>
      </div>
    );
  };

  const tiles: [string, string, string][] = [
    ['همهٔ فرصت‌ها', toPersianDigits(deals.length), seesMoney ? money(sum(deals)) : ''],
    ['باز', toPersianDigits(open.length), seesMoney ? money(sum(open)) : ''],
    ['فروش موفق', toPersianDigits(per[4].list.length), seesMoney ? money(sum(per[4].list)) : ''],
    ['از دست رفته', toPersianDigits(per[5].list.length), seesMoney ? money(sum(per[5].list)) : ''],
  ];
  const chips = [{ id: 'ALL', label: 'همه', n: deals.length, dot: '#fff' }, ...per.map((x) => ({ id: x.s.id, label: x.s.label, n: x.list.length, dot: x.s.dot }))].filter((x) => x.id === 'ALL' || x.n > 0);

  return createPortal(
    <div dir="rtl" onClick={onClose} className="fixed inset-0 z-[410] overflow-y-auto bg-[radial-gradient(circle_at_80%_0%,#8B5CF6,#2E1065_50%,#0B0418)] text-white cursor-pointer" data-customer-deals-page>
      <div onClick={(e) => e.stopPropagation()} className="max-w-6xl mx-auto px-4 py-6 space-y-5 cursor-default">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold opacity-75">فرصت‌های فروش</div>
            <h2 className="text-2xl font-black truncate">{customer.name}</h2>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-black cursor-pointer"><X className="w-4 h-4" />بستن</button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {tiles.map(([k, v, sub]) => (
            <div key={k} className="rounded-2xl bg-white/12 border border-white/20 px-4 py-3">
              <div className="text-[11px] font-bold opacity-80">{k}</div>
              <div className="text-2xl font-black">{v}</div>
              {sub && <div className="text-[11px] font-bold opacity-80">{sub}</div>}
            </div>
          ))}
        </div>

        {seesMoney && sum(deals) > 0 && (
          <div className="flex h-2.5 rounded-full overflow-hidden bg-white/10 gap-px" aria-hidden>
            {per.filter((x) => sum(x.list) > 0).map((x) => <span key={x.s.id} style={{ width: `${(sum(x.list) / sum(deals)) * 100}%`, background: x.s.dot }} />)}
          </div>
        )}

        <div className="flex flex-wrap gap-2" data-deals-page-filter>
          {chips.map((x) => (
            <button key={x.id} type="button" onClick={() => setOnly(x.id)} className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-black border cursor-pointer transition-colors ${only === x.id ? 'bg-white text-[#2E1065] border-white' : 'bg-white/10 border-white/25 hover:bg-white/20'}`} data-deals-page-chip={x.id}>
              <span className="w-2 h-2 rounded-full" style={{ background: x.dot }} />
              {x.label}
              <span className="opacity-70">{toPersianDigits(x.n)}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <div className="text-center text-sm font-bold opacity-70 py-12">فرصتی در این مرحله نیست.</div>
        ) : (
          <div className="space-y-4">
            {shown.map((b) => {
              if (b.members.length === 1) return <div key={b.key} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{card(b.members[0])}</div>;
              b.members.sort(bySeq);
              const grp = dealGroup(deals, b.members[0]);
              return (
                <div key={b.key} className="rounded-3xl p-3.5 space-y-3 border-2" style={{ borderColor: grp?.color.bar, background: `${grp?.color.bar}22` }} data-deals-page-group>
                  <div className="flex items-center justify-between gap-2 px-1">
                    <span className="flex items-center gap-2 text-xs font-black"><Link2 className="w-4 h-4" />فرصت‌های پیوسته · {toPersianDigits(b.members.length)} فرصت</span>
                    {seesMoney && <span className="text-xs font-black">جمع {money(sum(b.members))}</span>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{b.members.map(card)}</div>
                </div>
              );
            })}
          </div>
        )}
        <div className="text-center text-[11px] font-bold opacity-60 pb-4">برای بستن روی هر جای پس‌زمینه بزنید</div>
      </div>
    </div>,
    document.body,
  );
};
