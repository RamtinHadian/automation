import React, { useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, Download, Filter, MessageSquare, Moon, Tag, Target, Users, XCircle, ShieldAlert, Coins } from 'lucide-react';
import { CrmActivity, Customer, Deal, User } from '../../types';
import { downloadCsv } from '../../lib/csv';
import { api } from '../../lib/api';
import { matchesQuery } from '../../lib/customerSearch';
import { formatMoney, toDisplay, unitName } from '../../lib/money';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, todayIso } from '../../lib/taskDates';
import { JalaliDateField } from '../tasks/TasksView';
import { field, label } from './crmUi';

type Kind = 'buyers' | 'interactions' | 'quotes' | 'dormant' | 'needs' | 'lost' | 'quality' | 'profit';

const REPORTS: [Kind, string, React.ElementType][] = [
  ['buyers', 'خریداران در بازه', BadgeDollarSign],
  ['interactions', 'تعامل‌ها و کارها', MessageSquare],
  ['quotes', 'قیمت‌های داده‌شده', Tag],
  ['dormant', 'مشتریان بی‌پیگیری', Moon],
  ['needs', 'نیاز مشتریان', Target],
  ['lost', 'دلایل ازدست‌رفتن فروش', XCircle],
  ['quality', 'کیفیت اطلاعات', ShieldAlert],
];
const ACT_LABEL: Record<string, string> = { NOTE: 'یادداشت', CALL: 'تماس', MEETING: 'جلسه', FOLLOWUP: 'پیگیری', MISSING: 'کالای ناموجود', QUOTE: 'قیمت داده شد' };

const dayIso = (offset: number) => {
  const d = new Date(Date.now() + offset * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const localDay = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-CA') : '');
const when = (iso?: string) => (iso ? `${formatTaskDate(localDay(iso))} · ${toPersianDigits(new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}` : '—');

const Cell: React.FC<{ children: React.ReactNode; strong?: boolean; className?: string }> = ({ children, strong, className }) => <td className={`px-3 py-2 text-[11px] ${strong ? 'font-black text-[#3A241F]' : 'font-bold text-[#5A4640]'} ${className || ''}`}>{children}</td>;

export const CrmReports: React.FC<{ customers: Customer[]; deals: Deal[]; activities: CrmActivity[]; staff: User[]; index: Map<string, string>; onOpenCustomer: (id: string) => void; isAdmin?: boolean }> = ({ customers, deals, activities, staff, index, onOpenCustomer, isAdmin }) => {
  const [kind, setKind] = useState<Kind>('buyers');
  const [from, setFrom] = useState<string | undefined>(dayIso(-30));
  const [to, setTo] = useState<string | undefined>(todayIso());
  const [q, setQ] = useState('');
  const [who, setWho] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [notBought, setNotBought] = useState(false);
  const [dormantDays, setDormantDays] = useState(60);

  const byId = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const inRange = (iso?: string) => {
    const d = localDay(iso);
    return !!d && (!from || d >= from) && (!to || d <= to);
  };
  const nameOf = (id: string) => byId.get(id)?.name || '—';
  const okCustomer = (id: string) => matchesQuery(index.get(id), q);

  // ---- who bought in the period ----
  const buyers = useMemo(() => {
    const won = deals.filter((d) => d.stage === 'WON' && inRange(d.closedAt || d.updatedAt) && okCustomer(d.customerId) && (!who || d.ownerId === who));
    const map = new Map<string, { id: string; count: number; total: number; last: string; items: Set<string> }>();
    for (const d of won) {
      const r = map.get(d.customerId) || { id: d.customerId, count: 0, total: 0, last: '', items: new Set<string>() };
      r.count++;
      r.total += d.amount || 0;
      const t = d.closedAt || d.updatedAt;
      if (t > r.last) r.last = t;
      (d.items || []).forEach((i) => r.items.add(i.title));
      if (!(d.items || []).length) r.items.add(d.title);
      map.set(d.customerId, r);
    }
    if (notBought) {
      const bought = new Set(map.keys());
      return customers.filter((c) => !bought.has(c.id) && okCustomer(c.id) && (!who || c.ownerId === who)).map((c) => ({ id: c.id, count: 0, total: 0, last: '', items: new Set<string>() }));
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, customers, from, to, q, who, notBought, index]);

  const acts = useMemo(
    () =>
      activities
        .filter((a) => inRange(a.createdAt) && (!who || a.authorId === who) && okCustomer(a.customerId))
        .filter((a) => (kind === 'quotes' ? a.type === 'QUOTE' : types.length === 0 || types.includes(a.type)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activities, from, to, q, who, types, kind, index],
  );

  const dormant = useMemo(() => {
    const last = new Map<string, string>();
    for (const a of activities) if (!last.has(a.customerId) || a.createdAt > last.get(a.customerId)!) last.set(a.customerId, a.createdAt);
    for (const d of deals) if (d.stage === 'WON') last.set(d.customerId, (last.get(d.customerId) || '') > (d.closedAt || d.updatedAt) ? last.get(d.customerId)! : d.closedAt || d.updatedAt);
    const limit = Date.now() - dormantDays * 86400000;
    return customers
      .filter((c) => okCustomer(c.id) && (!who || c.ownerId === who))
      .map((c) => ({ c, last: last.get(c.id) || c.createdAt }))
      .filter((r) => new Date(r.last).getTime() < limit)
      .sort((a, b) => a.last.localeCompare(b.last));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, activities, deals, dormantDays, q, who, index]);

  // lost opportunities in the period, and how many were lost for each reason
  const lost = useMemo(() => deals.filter((d) => d.stage === 'LOST' && inRange(d.closedAt || d.updatedAt) && okCustomer(d.customerId) && (!who || d.ownerId === who)).sort((a, b) => (b.closedAt || b.updatedAt).localeCompare(a.closedAt || a.updatedAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deals, from, to, q, who, index]);
  const lostByReason = useMemo(() => {
    const m = new Map<string, { n: number; sum: number }>();
    for (const d of lost) {
      const k = d.lostReason || 'دلیل ثبت نشده';
      const r = m.get(k) || { n: 0, sum: 0 };
      r.n++;
      r.sum += d.amount || 0;
      m.set(k, r);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [lost]);

  // gaps in the file that a manager should have cleaned: a customer nobody can phone or nobody looks after, an opportunity without a price
  const quality = useMemo(() => {
    const rows: { id: string; customerId: string; what: string; issue: string; who: string }[] = [];
    const touched = new Set(activities.map((a) => a.customerId));
    for (const c of customers) {
      if (!okCustomer(c.id) || (who && c.ownerId !== who)) continue;
      if (!c.phones || c.phones.length === 0) rows.push({ id: 'p' + c.id, customerId: c.id, what: c.name, issue: 'مشتری بدون شمارهٔ تلفن', who: c.ownerName });
      if (!c.ownerId) rows.push({ id: 'o' + c.id, customerId: c.id, what: c.name, issue: 'مشتری بدون مسئول', who: '—' });
      else if (!touched.has(c.id)) rows.push({ id: 't' + c.id, customerId: c.id, what: c.name, issue: 'مشتری بدون هیچ سابقهٔ تعامل', who: c.ownerName });
    }
    for (const d of deals) {
      if (!okCustomer(d.customerId) || (who && d.ownerId !== who)) continue;
      const open = d.stage !== 'WON' && d.stage !== 'LOST';
      if (open && !d.amount) rows.push({ id: 'a' + d.id, customerId: d.customerId, what: `${d.title} (${d.customerName})`, issue: 'فرصت باز بدون مبلغ', who: d.ownerName });
      if (d.stage === 'PROPOSAL' && !d.proformaNumber) rows.push({ id: 'f' + d.id, customerId: d.customerId, what: `${d.title} (${d.customerName})`, issue: 'مرحلهٔ پیشنهاد بدون پیش‌فاکتور', who: d.ownerName });
      if (open && d.expectedClose && d.expectedClose < todayIso()) rows.push({ id: 'e' + d.id, customerId: d.customerId, what: `${d.title} (${d.customerName})`, issue: 'تاریخ پیش‌بینی بستن گذشته است', who: d.ownerName });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, deals, activities, q, who, index]);

  // profit per customer: what the won sales brought in against what the products cost (products with a cost price only)
  const [products, setProducts] = useState<{ code: string; cost?: number }[]>([]);
  useEffect(() => {
    if (kind === 'profit' && isAdmin && products.length === 0) api.crmProducts().then((r) => setProducts(r.products)).catch(() => {});
  }, [kind, isAdmin, products.length]);
  const profit = useMemo(() => {
    const cost = new Map(products.filter((p) => p.code && p.cost).map((p) => [p.code, p.cost as number]));
    const map = new Map<string, { id: string; deals: number; revenue: number; knownRevenue: number; cost: number; unknown: number }>();
    for (const d of deals) {
      if (d.stage !== 'WON' || !inRange(d.closedAt || d.updatedAt) || !okCustomer(d.customerId) || (who && d.ownerId !== who)) continue;
      const r = map.get(d.customerId) || { id: d.customerId, deals: 0, revenue: 0, knownRevenue: 0, cost: 0, unknown: 0 };
      r.deals++;
      const k = 1 - (d.discountPercent || 0) / 100;
      if (d.items && d.items.length) {
        for (const it of d.items) {
          const rev = Math.max(0, (it.qty || 0) * (it.unitPrice || 0) - (it.discount || 0)) * k;
          r.revenue += rev;
          const c = it.code ? cost.get(it.code) : undefined;
          if (c !== undefined) { r.knownRevenue += rev; r.cost += c * (it.qty || 0); } else r.unknown++;
        }
      } else { r.revenue += d.amount || 0; r.unknown++; }
      map.set(d.customerId, r);
    }
    return [...map.values()].map((r) => ({ ...r, profit: r.knownRevenue - r.cost })).sort((a, b) => b.profit - a.profit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, products, from, to, q, who, index]);

  const needs = useMemo(() => {
    const miss = new Map<string, string[]>();
    for (const a of activities) if (a.type === 'MISSING' && inRange(a.createdAt)) miss.set(a.customerId, [...(miss.get(a.customerId) || []), a.itemName || a.text]);
    return customers
      .filter((c) => okCustomer(c.id) && (!who || c.ownerId === who) && ((c.interest || '').trim() || miss.has(c.id)))
      .map((c) => ({ c, interest: (c.interest || '').trim(), missing: miss.get(c.id) || [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, activities, from, to, q, who, index]);

  const pickRange = (days: number) => {
    setFrom(dayIso(-days));
    setTo(todayIso());
  };
  const needsRange = kind === 'buyers' || kind === 'interactions' || kind === 'quotes' || kind === 'needs' || kind === 'lost' || kind === 'profit';
  const chip = (on: boolean) => `px-3 py-1.5 rounded-xl text-[11px] font-black border cursor-pointer ${on ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`;

  const exportCsv = () => {
    if (kind === 'buyers') downloadCsv('خریداران.csv', [['مشتری', 'تعداد خرید', `مبلغ (${unitName()})`, 'آخرین خرید', 'کالاها'], ...buyers.map((r) => [nameOf(r.id), r.count, toDisplay(r.total), r.last ? localDay(r.last) : '', [...r.items].join('، ')])]);
    else if (kind === 'dormant') downloadCsv('مشتریان-بی-پیگیری.csv', [['مشتری', 'آخرین تعامل', 'مسئول'], ...dormant.map((r) => [r.c.name, localDay(r.last), r.c.ownerName])]);
    else if (kind === 'profit') downloadCsv('سود-مشتریان.csv', [['مشتری', 'تعداد فروش', `فروش (${unitName()})`, `بهای تمام‌شده (${unitName()})`, `سود (${unitName()})`, 'حاشیه سود', 'ردیف بدون قیمت خرید'], ...profit.map((r) => [nameOf(r.id), r.deals, toDisplay(r.revenue), toDisplay(r.cost), toDisplay(r.profit), r.knownRevenue ? Math.round((r.profit / r.knownRevenue) * 100) + '٪' : '', r.unknown])]);
    else if (kind === 'quality') downloadCsv('کیفیت-اطلاعات.csv', [['مورد', 'مشکل', 'مسئول'], ...quality.map((r) => [r.what, r.issue, r.who])]);
    else if (kind === 'lost') downloadCsv('دلایل-ازدست-رفتن-فروش.csv', [['تاریخ', 'مشتری', 'فرصت', `مبلغ (${unitName()})`, 'دلیل', 'توضیح', 'مسئول'], ...lost.map((d) => [localDay(d.closedAt || d.updatedAt), nameOf(d.customerId), d.title, toDisplay(d.amount), d.lostReason || '', d.lostNote || '', d.ownerName])]);
    else if (kind === 'needs') downloadCsv('نیاز-مشتریان.csv', [['مشتری', 'دنبال چه می‌گردد', 'کالاهای ناموجود'], ...needs.map((r) => [r.c.name, r.interest, r.missing.join('، ')])]);
    else downloadCsv(kind === 'quotes' ? 'قیمت-ها.csv' : 'تعامل-ها.csv', [['تاریخ', 'مشتری', 'نوع', 'کالا', 'مشخصات', 'تعداد', `قیمت (${unitName()})`, 'متن', 'ثبت‌کننده'], ...acts.map((a) => [localDay(a.createdAt), nameOf(a.customerId), ACT_LABEL[a.type], a.itemName || '', a.spec || '', a.qty || '', a.price ? toDisplay(a.price) : '', a.text, a.authorName])]);
  };

  const th = 'px-3 py-2 text-[10px] font-black text-[#8C6F66] text-right whitespace-nowrap';
  const total = kind === 'buyers' ? buyers.reduce((s, r) => s + r.total, 0) : 0;
  const rowCount = kind === 'buyers' ? buyers.length : kind === 'dormant' ? dormant.length : kind === 'needs' ? needs.length : kind === 'lost' ? lost.length : kind === 'quality' ? quality.length : kind === 'profit' ? profit.length : acts.length;
  const quoteAvg = useMemo(() => {
    if (kind !== 'quotes') return [];
    const m = new Map<string, { n: number; sum: number; min: number; max: number }>();
    for (const a of acts) {
      const k = a.itemName || '—';
      const r = m.get(k) || { n: 0, sum: 0, min: Infinity, max: 0 };
      r.n++;
      r.sum += a.price || 0;
      r.min = Math.min(r.min, a.price || 0);
      r.max = Math.max(r.max, a.price || 0);
      m.set(k, r);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6);
  }, [acts, kind]);
  const perStaff = useMemo(() => {
    if (kind !== 'interactions') return [];
    const m = new Map<string, number>();
    for (const a of acts) m.set(a.authorName, (m.get(a.authorName) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [acts, kind]);

  return (
    <div className="space-y-3" data-crm-reports>
      <div className="flex flex-wrap gap-1.5">
        {REPORTS.filter(([k]) => k !== 'profit' || isAdmin).map(([k, t, Icon]) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`${chip(kind === k)} flex items-center gap-1.5 min-h-[40px]`}>
            <Icon className="w-4 h-4" />
            {t}
          </button>
        ))}
      </div>

      <div className="bg-white border border-[#EBDBCE] rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center gap-2 text-xs font-black text-[#3A241F]"><Filter className="w-4 h-4 text-violet-600" />فیلتر و جستجوی پیشرفته</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {needsRange && (
            <>
              <div><span className={label}>از تاریخ</span><JalaliDateField value={from} onChange={setFrom} /></div>
              <div><span className={label}>تا تاریخ</span><JalaliDateField value={to} onChange={setTo} /></div>
            </>
          )}
          <div className={needsRange ? '' : 'sm:col-span-2'}>
            <span className={label}>جستجو در همهٔ اطلاعات مشتری</span>
            <input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام، شماره، شهر، کالا، متن یادداشت…" />
          </div>
          <div>
            <span className={label}>{kind === 'buyers' || kind === 'dormant' || kind === 'needs' ? 'مسئول مشتری' : 'کارمند ثبت‌کننده'}</span>
            <select className={field} value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">همه</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </select>
          </div>
        </div>
        {needsRange && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-black text-[#8C6F66]">بازهٔ سریع:</span>
            {([['امروز', 0], ['۷ روز', 7], ['۳۰ روز', 30], ['۹۰ روز', 90], ['یک سال', 365]] as const).map(([t, d]) => (
              <button key={t} type="button" onClick={() => pickRange(d)} className="px-2.5 py-1 rounded-lg border border-[#EBDBCE] bg-[#FAF5F1] text-[11px] font-black cursor-pointer">{t}</button>
            ))}
            <button type="button" onClick={() => { setFrom(undefined); setTo(undefined); }} className="px-2.5 py-1 rounded-lg border border-[#EBDBCE] text-[11px] font-black cursor-pointer">همهٔ زمان‌ها</button>
          </div>
        )}
        {kind === 'buyers' && (
          <label className="flex items-center gap-2 text-[11px] font-black text-[#3A241F] cursor-pointer">
            <input type="checkbox" checked={notBought} onChange={(e) => setNotBought(e.target.checked)} className="accent-violet-600" />
            برعکس: مشتریانی که در این بازه خرید نکرده‌اند
          </label>
        )}
        {kind === 'interactions' && (
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ACT_LABEL).map(([k, t]) => (
              <button key={k} type="button" onClick={() => setTypes((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]))} className={chip(types.includes(k))}>{t}</button>
            ))}
            {types.length > 0 && <button type="button" onClick={() => setTypes([])} className="text-[11px] font-black text-[#8C6F66] underline cursor-pointer">همه</button>}
          </div>
        )}
        {kind === 'dormant' && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-black text-[#8C6F66]">بدون تعامل و خرید در:</span>
            {[30, 60, 90, 180, 365].map((d) => (
              <button key={d} type="button" onClick={() => setDormantDays(d)} className={chip(dormantDays === d)}>{toPersianDigits(d)} روز اخیر</button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-xs font-black text-[#3A241F]">
          <Users className="w-4 h-4 text-violet-600" />
          {toPersianDigits(rowCount)} مورد
          {kind === 'buyers' && !notBought && <span className="text-emerald-700">· جمع فروش: {formatMoney(total)} {unitName()}</span>}
        </div>
        <button type="button" onClick={exportCsv} disabled={rowCount === 0} className="mr-auto flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-200 disabled:opacity-40 cursor-pointer">
          <Download className="w-4 h-4" />
          خروجی اکسل
        </button>
      </div>

      {kind === 'lost' && lostByReason.length > 0 && (
        <div className="flex flex-wrap gap-2" data-lost-summary>
          {lostByReason.map(([reason, r]) => (
            <span key={reason} className="text-[11px] font-black rounded-full border border-rose-200 bg-rose-50 text-rose-800 px-3 py-1.5">
              {reason}: {toPersianDigits(r.n)} مورد · {formatMoney(r.sum)} {unitName()}
            </span>
          ))}
        </div>
      )}
      {kind === 'quotes' && quoteAvg.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
          {quoteAvg.map(([name, r]) => (
            <div key={name} className="bg-white border border-[#EBDBCE] rounded-xl px-3 py-2">
              <div className="text-[11px] font-black text-[#3A241F] truncate">{name}</div>
              <div className="text-[10px] font-bold text-[#8C6F66]">{toPersianDigits(r.n)} بار · میانگین {formatMoney(r.sum / r.n)} · از {formatMoney(r.min)} تا {formatMoney(r.max)}</div>
            </div>
          ))}
        </div>
      )}
      {kind === 'interactions' && perStaff.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {perStaff.map(([n, c]) => (
            <span key={n} className="px-3 py-1 rounded-full bg-violet-50 border border-violet-200 text-[11px] font-black text-violet-900">{n}: {toPersianDigits(c)}</span>
          ))}
        </div>
      )}

      <div className="bg-white border border-[#EBDBCE] rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-[#FAF5F1]">
            {kind === 'buyers' && <tr><th className={th}>مشتری</th><th className={th}>تعداد خرید</th><th className={th}>مبلغ ({unitName()})</th><th className={th}>آخرین خرید</th><th className={th}>کالاها</th></tr>}
            {(kind === 'interactions' || kind === 'quotes') && <tr><th className={th}>زمان</th><th className={th}>مشتری</th><th className={th}>{kind === 'quotes' ? 'کالا و مشخصات' : 'نوع'}</th><th className={th}>{kind === 'quotes' ? 'تعداد' : 'شرح'}</th>{kind === 'quotes' && <th className={th}>قیمت ({unitName()})</th>}<th className={th}>ثبت‌کننده</th></tr>}
            {kind === 'dormant' && <tr><th className={th}>مشتری</th><th className={th}>آخرین تعامل یا خرید</th><th className={th}>چند روز</th><th className={th}>مسئول</th></tr>}
            {kind === 'profit' && <tr><th className={th}>مشتری</th><th className={th}>فروش</th><th className={th}>بهای تمام‌شده</th><th className={th}>سود</th><th className={th}>حاشیه</th><th className={th}>ردیف بدون قیمت خرید</th></tr>}
            {kind === 'quality' && <tr><th className={th}>مورد</th><th className={th}>مشکل</th><th className={th}>مسئول</th></tr>}
            {kind === 'lost' && <tr><th className={th}>تاریخ</th><th className={th}>مشتری</th><th className={th}>فرصت</th><th className={th}>مبلغ ({unitName()})</th><th className={th}>دلیل</th><th className={th}>مسئول</th></tr>}
            {kind === 'needs' && <tr><th className={th}>مشتری</th><th className={th}>دنبال چه کالایی می‌گردد</th><th className={th}>ناموجودهایی که خواسته</th></tr>}
          </thead>
          <tbody className="divide-y divide-[#F3E8DF]">
            {kind === 'buyers' && buyers.slice(0, 500).map((r) => (
              <tr key={r.id} onClick={() => onOpenCustomer(r.id)} className="hover:bg-[#FAF5F1] cursor-pointer">
                <Cell strong>{nameOf(r.id)}</Cell><Cell>{toPersianDigits(r.count)}</Cell><Cell strong>{formatMoney(r.total)}</Cell><Cell>{r.last ? formatTaskDate(localDay(r.last)) : '—'}</Cell><Cell className="max-w-[280px] truncate">{[...r.items].slice(0, 4).join('، ')}</Cell>
              </tr>
            ))}
            {(kind === 'interactions' || kind === 'quotes') && acts.slice(0, 500).map((a) => (
              <tr key={a.id} onClick={() => onOpenCustomer(a.customerId)} className="hover:bg-[#FAF5F1] cursor-pointer align-top">
                <Cell className="whitespace-nowrap">{when(a.createdAt)}</Cell><Cell strong>{nameOf(a.customerId)}</Cell>
                {kind === 'quotes' ? <Cell>{a.itemName || a.text}{a.spec ? ` (${a.spec})` : ''}</Cell> : <Cell>{ACT_LABEL[a.type]}</Cell>}
                {kind === 'quotes' ? <Cell>{a.qty ? toPersianDigits(a.qty) : '—'}</Cell> : <Cell className="max-w-[360px]">{a.text}</Cell>}
                {kind === 'quotes' && <Cell strong>{formatMoney(a.price || 0)}{a.askedPrice ? ` (مشتری ${formatMoney(a.askedPrice)})` : ''}</Cell>}
                <Cell>{a.authorName}</Cell>
              </tr>
            ))}
            {kind === 'profit' && profit.slice(0, 500).map((r) => (
              <tr key={r.id} onClick={() => onOpenCustomer(r.id)} className="hover:bg-[#FAF5F1] cursor-pointer">
                <Cell strong>{nameOf(r.id)}</Cell><Cell>{formatMoney(r.revenue)}</Cell><Cell>{r.cost ? formatMoney(r.cost) : '—'}</Cell><Cell strong className={r.profit > 0 ? 'text-emerald-700' : ''}>{r.knownRevenue ? formatMoney(r.profit) : '—'}</Cell><Cell>{r.knownRevenue ? toPersianDigits(Math.round((r.profit / r.knownRevenue) * 100)) + '٪' : '—'}</Cell><Cell className={r.unknown ? 'text-amber-800' : ''}>{r.unknown ? toPersianDigits(r.unknown) : '۰'}</Cell>
              </tr>
            ))}
            {kind === 'quality' && quality.slice(0, 500).map((r) => (
              <tr key={r.id} onClick={() => onOpenCustomer(r.customerId)} className="hover:bg-[#FAF5F1] cursor-pointer">
                <Cell strong>{r.what}</Cell><Cell className="text-amber-800">{r.issue}</Cell><Cell>{r.who}</Cell>
              </tr>
            ))}
            {kind === 'lost' && lost.slice(0, 500).map((d) => (
              <tr key={d.id} onClick={() => onOpenCustomer(d.customerId)} className="hover:bg-[#FAF5F1] cursor-pointer align-top">
                <Cell className="whitespace-nowrap">{formatTaskDate(localDay(d.closedAt || d.updatedAt))}</Cell><Cell strong>{nameOf(d.customerId)}</Cell><Cell>{d.title}</Cell><Cell>{formatMoney(d.amount)}</Cell><Cell className="max-w-[300px]">{d.lostReason || '—'}{d.lostNote ? ` (${d.lostNote})` : ''}</Cell><Cell>{d.ownerName}</Cell>
              </tr>
            ))}
            {kind === 'dormant' && dormant.slice(0, 500).map((r) => (
              <tr key={r.c.id} onClick={() => onOpenCustomer(r.c.id)} className="hover:bg-[#FAF5F1] cursor-pointer">
                <Cell strong>{r.c.name}</Cell><Cell>{formatTaskDate(localDay(r.last))}</Cell><Cell>{toPersianDigits(Math.floor((Date.now() - new Date(r.last).getTime()) / 86400000))}</Cell><Cell>{r.c.ownerName}</Cell>
              </tr>
            ))}
            {kind === 'needs' && needs.slice(0, 500).map((r) => (
              <tr key={r.c.id} onClick={() => onOpenCustomer(r.c.id)} className="hover:bg-[#FAF5F1] cursor-pointer align-top">
                <Cell strong>{r.c.name}</Cell><Cell>{r.interest || '—'}</Cell><Cell>{r.missing.length ? r.missing.join('، ') : '—'}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
        {rowCount === 0 && <div className="text-center text-xs font-bold text-gray-400 py-12">موردی با این فیلترها پیدا نشد.</div>}
      </div>
      <div className="text-[10px] font-bold text-[#8C6F66]">با کلیک روی هر ردیف، پروندهٔ مشتری باز می‌شود.</div>
    </div>
  );
};
