import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Banknote, ChevronDown, Search, ShoppingBag, TrendingUp, Users } from 'lucide-react';
import { Deal } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { isoToJalaliParts, JALALI_MONTHS } from '../../lib/taskDates';
import { formatMoney, toDisplay, unitName } from '../../lib/money';
import { C, compact, Columns, HBars } from './charts';

const RANGES = [
  { days: 30, label: '۳۰ روز' },
  { days: 90, label: '۹۰ روز' },
  { days: 180, label: '۶ ماه' },
  { days: 365, label: 'یک سال' },
  { days: 0, label: 'همه' },
];
const DAY = 86400000;
const compactM = (n: number) => compact(toDisplay(n));
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const wonDate = (d: Deal) => d.closedAt || d.updatedAt || d.createdAt || '';
const dayText = (iso: string) => {
  const p = isoToJalaliParts(isoDay(new Date(iso)));
  return p ? `${toPersianDigits(p[2])} ${JALALI_MONTHS[p[1] - 1]} ${toPersianDigits(p[0])}` : '';
};

/**
 * «نمودار فروش»: opened from the sales chart of the reports. The sales (won opportunities) of the chosen period over time, and below it who bought how
 * much: every customer with the number of purchases, the total and the share, each opening to its own purchases. A second tab does the same by seller.
 * Only for those who may see the money (the managing director and whoever was given the right).
 */
export const SalesDrillDown: React.FC<{ deals: Deal[]; initialDays: number; initialBy?: 'customer' | 'owner'; onClose: () => void }> = ({ deals, initialDays, initialBy = 'customer', onClose }) => {
  const [days, setDays] = useState(RANGES.some((r) => r.days === initialDays) ? initialDays : 90);
  const [by, setBy] = useState<'customer' | 'owner'>(initialBy);
  const [q, setQ] = useState('');
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const won = useMemo(() => {
    const from = days ? Date.now() - days * DAY : 0;
    return deals.filter((d) => d.stage === 'WON' && (!days || new Date(wonDate(d)).getTime() >= from)).sort((a, b) => wonDate(b).localeCompare(wonDate(a)));
  }, [deals, days]);

  const total = won.reduce((s, d) => s + (d.amount || 0), 0);
  const avg = won.length ? Math.round(total / won.length) : 0;

  // sales over time: a column per Jalali month (per day for a period of a month or less)
  const series = useMemo(() => {
    const perDay = days > 0 && days <= 31;
    const map = new Map<string, { label: string; value: number }>();
    const keyOf = (d: Deal) => {
      const iso = isoDay(new Date(wonDate(d)));
      const p = isoToJalaliParts(iso);
      if (!p) return { key: iso, label: iso };
      return perDay ? { key: iso, label: toPersianDigits(p[2]) } : { key: `${p[0]}-${String(p[1]).padStart(2, '0')}`, label: JALALI_MONTHS[p[1] - 1] };
    };
    [...won].reverse().forEach((d) => {
      const { key, label } = keyOf(d);
      const cur = map.get(key) || { label, value: 0 };
      cur.value += d.amount || 0;
      map.set(key, cur);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
  }, [won, days]);

  const groups = useMemo(() => {
    const m = new Map<string, { key: string; name: string; sub: string; total: number; deals: Deal[] }>();
    won.forEach((d) => {
      const key = by === 'customer' ? d.customerId || d.customerName || '—' : d.ownerId || d.ownerName || '—';
      const name = by === 'customer' ? d.customerName || '—' : d.ownerName || '—';
      const cur = m.get(key) || { key, name, sub: '', total: 0, deals: [] };
      cur.total += d.amount || 0;
      cur.deals.push(d);
      m.set(key, cur);
    });
    const list = [...m.values()].sort((a, b) => b.total - a.total);
    const needle = q.trim();
    return needle ? list.filter((g) => g.name.includes(needle)) : list;
  }, [won, by, q]);

  const top = groups.slice(0, 10);

  return (
    <div className="fixed inset-0 z-[80] bg-[#F5F1EC] overflow-y-auto" dir="rtl" data-sales-drilldown onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 sm:px-6 py-3 bg-white/95 backdrop-blur border-b border-[#EBDBCE]">
        <button type="button" onClick={onClose} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] hover:bg-[#EBDBCE] cursor-pointer"><ArrowRight className="w-4 h-4" />بازگشت به گزارشات</button>
        <h2 className="font-black text-sm text-[#3A241F] flex items-center gap-2 flex-1"><TrendingUp className="w-4 h-4 text-emerald-600" />نمودار فروش</h2>
        <div className="flex items-center gap-1 flex-wrap">
          {RANGES.map((r) => (
            <button key={r.days} type="button" onClick={() => setDays(r.days)} className={`px-3 py-1.5 rounded-lg text-[11px] font-black border cursor-pointer ${days === r.days ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-[#EBDBCE] p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center"><Banknote className="w-5 h-5" /></span>
            <div><div className="text-[11px] font-bold text-[#8C6F66]">جمع فروش موفق ({unitName()})</div><div className="text-lg font-black text-[#3A241F]">{formatMoney(total)}</div></div>
          </div>
          <div className="bg-white rounded-2xl border border-[#EBDBCE] p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-violet-50 text-violet-700 flex items-center justify-center"><ShoppingBag className="w-5 h-5" /></span>
            <div><div className="text-[11px] font-bold text-[#8C6F66]">تعداد فروش</div><div className="text-lg font-black text-[#3A241F]">{toPersianDigits(won.length)}</div></div>
          </div>
          <div className="bg-white rounded-2xl border border-[#EBDBCE] p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center"><Users className="w-5 h-5" /></span>
            <div><div className="text-[11px] font-bold text-[#8C6F66]">میانگین هر فروش ({unitName()})</div><div className="text-lg font-black text-[#3A241F]">{formatMoney(avg)}</div></div>
          </div>
        </div>

        <section className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-5 space-y-3">
          <div>
            <h3 className="font-black text-[13px] text-[#3A241F]">فروش در طول زمان</h3>
            <p className="text-[11px] text-[#8C6F66] mt-0.5">مجموع مبلغ فروش موفق در هر {days > 0 && days <= 31 ? 'روز' : 'ماه'} ({unitName()})</p>
          </div>
          {series.length ? <Columns labels={series.map((s) => s.label)} series={[{ name: 'فروش', color: C.green, values: series.map((s) => s.value) }]} format={(v) => compactM(v)} /> : <div className="py-10 text-center text-xs font-bold text-[#8C6F66]">در این دوره فروش موفقی ثبت نشده است.</div>}
        </section>

        <section className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <h3 className="font-black text-[13px] text-[#3A241F]">{by === 'customer' ? 'هر مشتری چقدر خریده؟' : 'هر فروشنده چقدر فروخته؟'}</h3>
              <p className="text-[11px] text-[#8C6F66] mt-0.5">با زدن روی هر ردیف، فروش‌های همان {by === 'customer' ? 'مشتری' : 'فروشنده'} دیده می‌شود.</p>
            </div>
            <div className="flex items-center gap-1 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl p-1">
              {([['customer', 'به تفکیک مشتری'], ['owner', 'به تفکیک فروشنده']] as const).map(([k, t]) => (
                <button key={k} type="button" onClick={() => { setBy(k); setOpenKey(null); }} className={`px-3 py-1.5 rounded-lg text-[11px] font-black cursor-pointer ${by === k ? 'bg-white text-[#6E1B1B] shadow-2xs' : 'text-[#8C6F66]'}`}>{t}</button>
              ))}
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#8C6F66] absolute right-3 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام…" className="pr-8 pl-3 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] w-44 focus:outline-none focus:border-[#C98B6A]" />
            </div>
          </div>

          {top.length > 0 && (
            <HBars format={(v) => compactM(v)} rows={top.map((g) => ({ label: g.name, segments: [{ value: g.total, color: C.green }], note: `${toPersianDigits(g.deals.length)} خرید` }))} empty="" />
          )}

          <div className="border border-[#EBDBCE] rounded-2xl overflow-hidden" data-sales-table>
            <div className="grid grid-cols-[2rem_1fr_5rem_9rem_5rem] gap-2 px-3 py-2 bg-[#FAF5F1] text-[10.5px] font-black text-[#8C6F66]">
              <span>#</span><span>{by === 'customer' ? 'مشتری' : 'فروشنده'}</span><span className="text-center">تعداد</span><span className="text-left">جمع ({unitName()})</span><span className="text-left">سهم</span>
            </div>
            {groups.length === 0 && <div className="py-8 text-center text-xs font-bold text-[#8C6F66]">موردی پیدا نشد.</div>}
            {groups.map((g, i) => {
              const open = openKey === g.key;
              const share = total ? Math.round((g.total / total) * 1000) / 10 : 0;
              return (
                <div key={g.key} className="border-t border-[#F0E6DC]">
                  <button type="button" onClick={() => setOpenKey(open ? null : g.key)} className="w-full grid grid-cols-[2rem_1fr_5rem_9rem_5rem] gap-2 px-3 py-2.5 items-center text-right hover:bg-[#FDFAF7] cursor-pointer" data-sales-row>
                    <span className="text-[11px] font-black text-[#8C6F66]">{toPersianDigits(i + 1)}</span>
                    <span className="text-[12px] font-black text-[#3A241F] truncate flex items-center gap-1.5"><ChevronDown className={`w-3.5 h-3.5 text-[#8C6F66] transition-transform ${open ? 'rotate-180' : ''}`} />{g.name}</span>
                    <span className="text-center text-[12px] font-bold text-[#3A241F]">{toPersianDigits(g.deals.length)}</span>
                    <span className="text-left text-[12px] font-black text-emerald-700">{formatMoney(g.total)}</span>
                    <span className="text-left text-[11px] font-bold text-[#8C6F66]">{toPersianDigits(share)}٪</span>
                  </button>
                  {open && (
                    <div className="px-4 pb-3 pt-1 bg-[#FDFAF7] space-y-1.5">
                      {g.deals.map((d) => (
                        <div key={d.id} className="flex items-center gap-3 text-[11.5px] font-bold text-[#3A241F] border-b border-dashed border-[#EBDBCE] last:border-0 py-1.5">
                          <span className="flex-1 min-w-0 truncate">{d.title}{by === 'owner' ? ` · ${d.customerName}` : ` · ${d.ownerName || ''}`}</span>
                          <span className="text-[#8C6F66] shrink-0">{dayText(wonDate(d))}</span>
                          <span className="text-emerald-700 font-black shrink-0 w-28 text-left">{formatMoney(d.amount || 0)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
