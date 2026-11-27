import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';
import { formatMoney, unitName } from '../../lib/money';
import { matchesAll } from '../../lib/searchAll';

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const n = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

/**
 * A page of its own: WHO was given a price (proforma) or bought (invoice) for one product in the week of the weekly report — with a search box for the person's
 * name (also company, phone, number, seller). «این هفته» / «همهٔ زمان‌ها» switches the period.
 */
export const WeeklyPeopleDialog: React.FC<{
  product: { code: string; title: string; unit: string };
  kind: 'priced' | 'sold';
  from: string;
  to: string;
  showMoney: boolean;
  onClose: () => void;
}> = ({ product, kind, from, to, showMoney, onClose }) => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  useEffect(() => {
    let live = true;
    api.productCustomers(product.code).then((r) => live && setRows(kind === 'priced' ? r.priced : r.sold)).catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [product.code, kind]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const inWeek = (x: Row) => {
    const d = s(x.at).slice(0, 10);
    return !!d && d >= from && d <= to;
  };
  const shown = useMemo(() => {
    const base = (rows || []).filter((x) => all || inWeek(x));
    if (!q.trim()) return base;
    return base.filter((x) => matchesAll({ name: s(x.customerName), company: s(x.company), phones: list(x.phones), number: s(x.number), owner: s(x.owner), city: s(x.city) }, q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, all, from, to]);
  const people = new Set(shown.map((x) => s(x.customerId))).size;
  const tone = kind === 'priced' ? { head: 'from-amber-600 to-amber-800', chip: 'bg-amber-50 text-amber-900 border-amber-200' } : { head: 'from-emerald-600 to-emerald-800', chip: 'bg-emerald-50 text-emerald-900 border-emerald-200' };
  return createPortal(
    <div className="fixed inset-0 z-[355] bg-[#F4F1EC] flex flex-col report-detail-in" dir="rtl" data-weekly-people>
      <div className={`text-white shrink-0 bg-gradient-to-l ${tone.head}`}>
        <div className="w-full max-w-[1100px] mx-auto px-4 py-4 flex items-center gap-3 flex-wrap">
          <button type="button" onClick={onClose} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-white/15 hover:bg-white/25 cursor-pointer">بازگشت ←</button>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-base truncate">{kind === 'priced' ? 'چه کسانی قیمت گرفته‌اند' : 'چه کسانی خریده‌اند'}: {product.title}</h2>
            <div className="text-[11px] font-bold opacity-90" dir="ltr">{toPersianDigits(product.code)}</div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl bg-white/15 hover:bg-white/25 cursor-pointer" aria-label="بستن"><X className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="w-full max-w-[1100px] mx-auto px-4 pt-4 pb-3 flex flex-wrap items-center gap-2 shrink-0">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#B8A39C] absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام شخص، شرکت، تلفن، شماره سند یا فروشنده…" className="w-full pr-10 pl-4 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#D34A32]/20" data-weekly-people-search />
        </div>
        <div className="flex gap-1.5">
          {([[false, `این هفته (${formatTaskDate(from)} تا ${formatTaskDate(to)})`], [true, 'همهٔ زمان‌ها']] as const).map(([v, l]) => (
            <button key={String(v)} type="button" onClick={() => setAll(v)} className={`px-3 py-2 rounded-xl text-[11px] font-black border cursor-pointer ${all === v ? 'bg-[#3A241F] text-white border-[#3A241F]' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>{l}</button>
          ))}
        </div>
        <span className={`text-[11px] font-black rounded-full px-3 py-1.5 border ${tone.chip}`}>{toPersianDigits(shown.length)} سند · {toPersianDigits(people)} نفر</span>
      </div>
      <div className="w-full max-w-[1100px] mx-auto px-4 pb-6 flex-1 min-h-0 overflow-y-auto space-y-2" data-weekly-people-list>
        {!rows ? <div className="text-center text-xs font-bold text-[#8C6F66] py-12">در حال دریافت…</div> : shown.length === 0 ? (
          <div className="text-center text-xs font-bold text-[#8C6F66] py-12 bg-white rounded-2xl border border-dashed border-[#EBDBCE]">{q.trim() ? 'کسی با این نام پیدا نشد.' : all ? 'هنوز کسی نیست.' : 'در این هفته کسی نیست؛ «همهٔ زمان‌ها» را بزنید.'}</div>
        ) : shown.map((x, i) => {
          const phones = list(x.phones).slice(0, 3);
          const place = [s(x.company), s(x.city)].filter(Boolean).join(' · ');
          return (
            <div key={i} className="rounded-2xl border border-[#EBDBCE] bg-white p-3.5 space-y-1.5" data-weekly-people-row>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-black text-[13px] text-[#3A241F]">{s(x.customerName)}{place ? <span className="mr-2 text-[11px] font-bold text-[#8C6F66]">{place}</span> : null}</span>
                <span className="text-[11px] font-bold text-[#6B5048]">{x.kind === 'OFFICIAL' ? 'رسمی · ' : x.kind === 'UNOFFICIAL' ? 'غیررسمی · ' : ''}{toPersianDigits(s(x.number))}{s(x.at) ? ` · ${formatTaskDate(s(x.at).slice(0, 10))}` : ''}</span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] font-bold text-[#503730]">
                <span>تعداد: {toPersianDigits(n(x.qty))} {product.unit}</span>
                {showMoney && n(x.unitPrice) > 0 && <span>قیمت واحد: {formatMoney(n(x.unitPrice))} {unitName()}</span>}
                {showMoney && n(x.discountPercent) > 0 && <span>تخفیف کل: {toPersianDigits(n(x.discountPercent))}٪</span>}
                {s(x.owner) && <span>فروشنده: {s(x.owner)}</span>}
                {s(x.dealTitle) && <span>فرصت: {s(x.dealTitle)}</span>}
              </div>
              {phones.length > 0 && <div className="text-[11px] font-bold text-[#6B5048]" dir="ltr">{phones.map((t) => toPersianDigits(t)).join('  ·  ')}</div>}
              {s(x.lostReason) && <div className="text-[11px] font-bold text-rose-700">دلیل از دست رفتن: {s(x.lostReason)}</div>}
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
};
