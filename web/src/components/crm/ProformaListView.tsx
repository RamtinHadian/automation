import React, { useMemo, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import { Deal } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, unitName } from '../../lib/money';
import { formatTaskDate, isoToJalaliParts, JALALI_MONTHS } from '../../lib/taskDates';
import { ChartCard, Columns, compact, Donut, SERIES } from '../admin/charts';
import { toDisplay } from '../../lib/money';

/**
 * «پیش‌فاکتورها»: every proforma of the opportunities this person may see, whatever its state (not yet sent, waiting for the signature,
 * signed, rejected). Opening one uses the same window as everywhere else, so its own rules (who may change or sign it) still apply.
 * The list is made from the opportunities the server already filtered by the CRM rules.
 */
type St = 'ALL' | 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
const STATE: Record<Exclude<St, 'ALL'>, { label: string; cls: string }> = {
  DRAFT: { label: 'ارسال نشده', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  PENDING: { label: 'منتظر امضا', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  APPROVED: { label: 'امضا شده', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'رد شده', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};
const STATE_COLOR: Record<Exclude<St, 'ALL'>, string> = { DRAFT: '#2a78d6', PENDING: '#eda100', APPROVED: '#1baf7a', REJECTED: '#e34948' };
const stateOf = (d: Deal): Exclude<St, 'ALL'> => (d.proformaApproval?.status === 'PENDING' ? 'PENDING' : d.proformaApproval?.status === 'APPROVED' ? 'APPROVED' : d.proformaApproval?.status === 'REJECTED' ? 'REJECTED' : 'DRAFT');

export const ProformaListView: React.FC<{ deals: Deal[]; canMoney: boolean; onOpen: (d: Deal) => void }> = ({ deals, canMoney, onOpen }) => {
  const [st, setSt] = useState<St>('ALL');
  const [q, setQ] = useState('');
  const list = useMemo(() => deals
    .filter((d) => (d.proformaNumber || (d.items || []).length > 0) && !d.mergedInto)
    .filter((d) => !q || [d.proformaNumber, d.customerName, d.title, d.ownerName].some((x) => (x || '').includes(q)))
    .sort((a, b) => (b.proformaAt || b.updatedAt || '').localeCompare(a.proformaAt || a.updatedAt || '')), [deals, q]);
  const shown = list.filter((d) => st === 'ALL' || stateOf(d) === st);
  // the last six months (Jalali), the sum (or the count when the person may not see money) of the proformas of each
  const months = useMemo(() => {
    const keys: { key: string; label: string }[] = [];
    const seen = new Set<string>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.now() - i * 30.4 * 86400000);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const j = isoToJalaliParts(iso);
      if (!j) continue;
      const key = `${j[0]}-${j[1]}`;
      if (!seen.has(key)) { seen.add(key); keys.push({ key, label: JALALI_MONTHS[j[1] - 1] }); }
    }
    return keys;
  }, []);
  const perMonth = useMemo(() => months.map((m) => {
    const rows = list.filter((d) => { const j = isoToJalaliParts((d.proformaAt || d.updatedAt || '').slice(0, 10)); return !!j && `${j[0]}-${j[1]}` === m.key; });
    return canMoney ? rows.reduce((sum, d) => sum + toDisplay(d.amount), 0) : rows.length;
  }), [months, list, canMoney]);
  const PRIMARY = 'var(--theme-primary, #6E1B1B)';
  const count = (k: Exclude<St, 'ALL'>) => list.filter((d) => stateOf(d) === k).length;

  const tone = (i: number) => (i % 2 === 0 ? 'color-mix(in srgb, var(--theme-badge-bg, #F6D9CD) 55%, #fff)' : 'var(--theme-light-bg, #FAF5F1)');
  return (
    <div className="space-y-3" data-proforma-list>
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-3">
        <ChartCard title={canMoney ? 'جمع پیش‌فاکتورها در ماه' : 'تعداد پیش‌فاکتور در ماه'} subtitle="شش ماه اخیر، به تاریخ صدور">
          <Columns stacked labels={months.map((m) => m.label)} series={months.map((m, i) => ({ name: m.label, color: SERIES[i % SERIES.length], values: perMonth.map((v, j) => (j === i ? v : 0)) }))} height={150} format={canMoney ? compact : undefined} />
        </ChartCard>
        <ChartCard title="وضعیت پیش‌فاکتورها" subtitle={`${toPersianDigits(list.length)} پیش‌فاکتور`}>
          <Donut data={(Object.keys(STATE) as Exclude<St, 'ALL'>[]).map((k) => ({ label: STATE[k].label, value: count(k), color: STATE_COLOR[k] }))} centerLabel="پیش‌فاکتور" size={120} />
        </ChartCard>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 flex-1">
          <button type="button" onClick={() => setSt('ALL')} className={`px-2.5 py-1 rounded-lg text-[10.5px] font-black border cursor-pointer ${st === 'ALL' ? 'text-white border-transparent' : 'bg-white text-[#8C6F66] border-[#EBDBCE]'}`} style={st === 'ALL' ? { background: PRIMARY } : undefined}>همه ({toPersianDigits(list.length)})</button>
          {(Object.keys(STATE) as Exclude<St, 'ALL'>[]).map((k) => (
            <button key={k} type="button" onClick={() => setSt(k)} className={`px-2.5 py-1 rounded-lg text-[10.5px] font-black border cursor-pointer ${st === k ? 'text-white border-transparent' : 'bg-white text-[#8C6F66] border-[#EBDBCE]'}`} style={st === k ? { background: PRIMARY } : undefined}>{STATE[k].label} ({toPersianDigits(count(k))})</button>
          ))}
        </div>
        <div className="relative w-full sm:w-56"><Search className="w-3.5 h-3.5 text-[#8C6F66] absolute right-3 top-1/2 -translate-y-1/2" /><input className="w-full px-3 pr-8 py-1.5 bg-white border border-[#EBDBCE] rounded-lg text-[11px] font-bold text-[#3A241F] focus:outline-none focus:ring-2 focus:ring-violet-300" placeholder="شماره، مشتری یا مسئول…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {shown.length === 0 ? (
        <div className="text-center text-[11px] font-bold text-gray-400 py-8 border border-dashed border-[#EBDBCE] rounded-2xl bg-white">پیش‌فاکتوری پیدا نشد. از «صدور پیش‌فاکتور» بالای صفحه یا از روی یک فرصت فروش بسازید.</div>
      ) : (
        <div className="border border-[#EBDBCE] rounded-2xl overflow-hidden">
          {shown.slice(0, 300).map((d, i) => {
            const s = STATE[stateOf(d)];
            return (
              <button key={d.id} type="button" onClick={() => onOpen(d)} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-right cursor-pointer hover:brightness-95 transition" style={{ background: tone(i) }}>
                <FileText className="w-3.5 h-3.5 text-[#8C6F66] shrink-0" />
                <div className="flex-1 min-w-0 flex items-baseline gap-2">
                  <span className="font-black text-[11.5px] text-[#3A241F] truncate">{d.customerName}</span>
                  {d.proformaNumber && <span className="text-[10px] text-[#8C6F66] font-bold shrink-0" dir="ltr">{toPersianDigits(d.proformaNumber)}</span>}
                  <span className="hidden md:inline text-[10.5px] font-bold text-[#8C6F66] truncate">{d.title}</span>
                </div>
                <span className="hidden sm:inline text-[10.5px] font-bold text-[#8C6F66] shrink-0">{d.ownerName}{d.proformaAt ? ` · ${formatTaskDate(d.proformaAt)}` : ''}</span>
                {canMoney && <span className="text-[11px] font-black text-[#3A241F] shrink-0 w-32 text-left">{formatMoney(d.amount)} {unitName()}</span>}
                <span className={`shrink-0 text-[9.5px] font-black rounded-full px-2 py-0.5 border ${s.cls}`}>{s.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
