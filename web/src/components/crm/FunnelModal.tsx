import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, CalendarCheck, Filter, History, Maximize2, Sparkles, TrendingUp, UserPlus, X, ZoomIn, ZoomOut } from 'lucide-react';
import { CrmActivity, Customer, Deal, DealStage } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, toDisplay, unitName } from '../../lib/money';
import { formatTaskDate, isoToJalaliParts, JALALI_MONTHS, todayIso } from '../../lib/taskDates';
import { shortDay } from '../../lib/adminStats';
import { FunnelDark, FunnelRow } from './FunnelDark';
import { FunnelAiPage } from './FunnelAiPage';
import { C, ChartCard, Columns, compact, Donut, fa, HBars, SERIES, TrendChart } from '../admin/charts';

/**
 * The big window behind the «قیف فروش» card of the CRM summary: the funnel drawn the way the user picks it, the work still to come and
 * the work already done, a summary of the sales activity, where the leads come from, the sales through time and the leads through time.
 * Everything is worked out from what the CRM page already holds; nothing is fetched.
 */

const STAGES: { id: DealStage; label: string; color: string }[] = [
  { id: 'NEW', label: 'جدید', color: '#94a3b8' },
  { id: 'CONTACTED', label: 'تماس گرفته شد', color: '#0ea5e9' },
  { id: 'PROPOSAL', label: 'پیشنهاد ارسال شد', color: '#8b5cf6' },
  { id: 'NEGOTIATION', label: 'مذاکره', color: '#f59e0b' },
  { id: 'WON', label: 'فروش موفق', color: '#10b981' },
];
const ACTIVITY_LABEL: Record<string, string> = { NOTE: 'یادداشت', CALL: 'تماس', MEETING: 'جلسه', FOLLOWUP: 'پیگیری', MISSING: 'کالای ناموجود', QUOTE: 'قیمت داده شد' };
const ACTIVITY_CLS: Record<string, string> = {
  NOTE: 'bg-slate-100 text-slate-700', CALL: 'bg-emerald-100 text-emerald-700', MEETING: 'bg-sky-100 text-sky-700',
  FOLLOWUP: 'bg-violet-100 text-violet-700', MISSING: 'bg-rose-100 text-rose-700', QUOTE: 'bg-amber-100 text-amber-800',
};

type Kind = 'funnel' | 'bars' | 'columns' | 'donut';
type Grain = 'day' | 'week' | 'month';
const KIND_KEY = 'crm_funnel_kind';
const KINDS: { id: Kind; label: string }[] = [
  { id: 'funnel', label: 'قیف فروش' },
  { id: 'bars', label: 'میله‌ای افقی' },
  { id: 'columns', label: 'ستونی' },
  { id: 'donut', label: 'دایره‌ای' },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOf = (s?: string) => (s ? iso(new Date(s)) : '');
const DAY = 86400000;

/** the first day (Saturday) of the week a day belongs to */
const weekStart = (day: string) => {
  const d = new Date(day + 'T12:00:00');
  const back = (d.getDay() + 1) % 7; // Saturday = 0
  return iso(new Date(d.getTime() - back * DAY));
};
const bucketKey = (day: string, grain: Grain) => {
  if (grain === 'day') return day;
  if (grain === 'week') return weekStart(day);
  const p = isoToJalaliParts(day);
  return p ? `${p[0]}-${p[1]}` : day;
};
const bucketLabel = (key: string, grain: Grain) => {
  if (grain === 'day') return shortDay(key);
  if (grain === 'week') return shortDay(key);
  const [, m] = key.split('-').map(Number);
  return JALALI_MONTHS[m - 1] || key;
};


/**
 * Keeps a funnel inside the window: the drawing is measured and, when it is taller than the room left under the figures and the model chooser,
 * the whole drawing is scaled down evenly (its shape and the proportions of its texts are kept), so the funnel is seen at once without scrolling.
 */
export const FitBox: React.FC<{ children: React.ReactNode; design?: number; zoom?: number }> = ({ children, design, zoom = 1 }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ s: number; h: number }>({ s: 1, h: 0 });
  useLayoutEffect(() => {
    const el = inner.current, w = wrap.current;
    if (!el || !w) return;
    const measure = () => {
      const h = el.offsetHeight;
      if (design) {
        // «grow» mode: the drawing is laid out at its design width and enlarged to fill the width of the window (up to 1.6 times)
        setBox({ s: Math.max(0.3, Math.min(1.6, w.clientWidth / design) * zoom), h });
        return;
      }
      const room = Math.max(300, window.innerHeight - 350);
      setBox({ s: h > room ? room / h : 1, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(w);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [children, design, zoom]);
  return (
    <div ref={wrap} style={{ height: box.h ? box.h * box.s : undefined }} data-funnel-fit>
      <div ref={inner} style={{ transform: `scale(${box.s})`, transformOrigin: 'top center', width: design ? design : '100%', margin: design ? '0 auto' : undefined }}>{children}</div>
    </div>
  );
};

const Pick: React.FC<{ value: string; options: { id: string; label: string }[]; onChange: (v: string) => void; label?: string }> = ({ value, options, onChange, label }) => (
  <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={label}>
    {options.map((o) => (
      <button
        key={o.id}
        type="button"
        onClick={() => onChange(o.id)}
        className={`px-2.5 py-1 rounded-xl text-[11px] font-black border cursor-pointer ${value === o.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-[#8C6F66] border-[#EBDBCE] hover:text-[#3A241F]'}`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const FunnelModal: React.FC<{ customers: Customer[]; deals: Deal[]; activities: CrmActivity[]; onClose: () => void; canMoney?: boolean; canAi?: boolean; onOpenCustomer?: (id: string) => void }> = ({ customers, deals, activities, onClose, canMoney = true, canAi = false, onOpenCustomer }) => {
  const [aiOpen, setAiOpen] = useState(false);
  // the stretch magnifier: the funnel is made smaller or bigger by dragging a bar to the left or to the right (remembered)
  const [zoom, setZoomState] = useState<number>(() => {
    try { const v = Number(localStorage.getItem('crm_funnel_zoom')); return v >= 0.4 && v <= 1.3 ? v : 1; } catch { return 1; }
  });
  const setZoom = (v: number) => { setZoomState(v); try { localStorage.setItem('crm_funnel_zoom', String(v)); } catch { /* not remembered */ } };
  const [kind, setKindState] = useState<Kind>(() => {
    try { const v = localStorage.getItem(KIND_KEY); return (KINDS.some((k) => k.id === v) ? v : 'funnel') as Kind; } catch { return 'funnel'; }
  });
  const setKind = (k: Kind) => { setKindState(k); try { localStorage.setItem(KIND_KEY, k); } catch { /* the choice just is not remembered */ } };
  const [grain, setGrain] = useState<Grain>('month');
  const [range, setRange] = useState<number>(180);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const today = todayIso();
  const nameOf = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  // ---- the funnel ----
  const stageRows = useMemo(() => STAGES.map((s) => {
    const list = deals.filter((d) => d.stage === s.id && !d.mergedInto);
    return { ...s, count: list.length, amount: list.reduce((x, d) => x + d.amount, 0) };
  }), [deals]);
  const lostCount = deals.filter((d) => d.stage === 'LOST').length;
  const maxCount = Math.max(1, ...stageRows.map((s) => s.count));
  const maxAmount = Math.max(1, ...stageRows.map((s) => s.amount));

  // ---- work to come / work done ----
  const future = useMemo(() => {
    const rows: { key: string; day: string; type: string; text: string; who: string; name: string }[] = [];
    for (const a of activities) {
      if (a.type === 'FOLLOWUP' && !a.done && a.dueDate && a.dueDate >= today) {
        rows.push({ key: 'a' + a.id, day: a.dueDate, type: 'FOLLOWUP', text: a.text, who: a.ownerName, name: nameOf.get(a.customerId) || '' });
      }
    }
    for (const d of deals) {
      if (!['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION'].includes(d.stage) || !d.expectedClose || d.expectedClose < today) continue;
      rows.push({ key: 'd' + d.id, day: d.expectedClose, type: 'CLOSE', text: `بستن فرصت: ${d.title}`, who: d.ownerName, name: d.customerName });
    }
    return rows.sort((a, b) => a.day.localeCompare(b.day)).slice(0, 14);
  }, [activities, deals, today, nameOf]);

  const past = useMemo(() => {
    const rows = activities
      .filter((a) => !(a.type === 'FOLLOWUP' && !a.done))
      .map((a) => ({ key: a.id, day: a.type === 'FOLLOWUP' && a.doneAt ? dayOf(a.doneAt) : dayOf(a.createdAt), type: a.type, text: a.text, who: a.authorName, name: nameOf.get(a.customerId) || '' }))
      .filter((r) => r.day && r.day <= today);
    return rows.sort((a, b) => b.day.localeCompare(a.day)).slice(0, 14);
  }, [activities, today, nameOf]);

  // ---- summary of the last 30 days ----
  const summary = useMemo(() => {
    const from = iso(new Date(Date.now() - 30 * DAY));
    const inRange = (s?: string) => !!s && dayOf(s) >= from;
    const cnt = (t: string) => activities.filter((a) => a.type === t && inRange(a.createdAt)).length;
    const won = deals.filter((d) => d.stage === 'WON' && inRange(d.closedAt || d.updatedAt));
    return {
      calls: cnt('CALL'), meetings: cnt('MEETING'), notes: cnt('NOTE'), quotes: cnt('QUOTE'),
      followDone: activities.filter((a) => a.type === 'FOLLOWUP' && a.done && inRange(a.doneAt || a.createdAt)).length,
      newDeals: deals.filter((d) => inRange(d.createdAt)).length,
      newCustomers: customers.filter((c) => inRange(c.createdAt)).length,
      wonCount: won.length,
      wonAmount: won.reduce((s, d) => s + d.amount, 0),
      lost: deals.filter((d) => d.stage === 'LOST' && inRange(d.closedAt || d.updatedAt)).length,
    };
  }, [activities, deals, customers]);

  // ---- where the leads come from ----
  const sources = useMemo(() => {
    const from = iso(new Date(Date.now() - 30 * DAY));
    const map = new Map<string, { fresh: number; old: number }>();
    for (const c of customers) {
      const key = (c.source || '').trim() || (c.referrer?.name ? 'معرفی شده' : 'نامشخص');
      const row = map.get(key) || { fresh: 0, old: 0 };
      if (dayOf(c.createdAt) >= from) row.fresh += 1; else row.old += 1;
      map.set(key, row);
    }
    return [...map.entries()].map(([name, v]) => ({ name, ...v, total: v.fresh + v.old })).sort((a, b) => b.total - a.total);
  }, [customers]);

  // ---- through time ----
  const buckets = useMemo(() => {
    const keys: string[] = [];
    const seen = new Set<string>();
    for (let i = range - 1; i >= 0; i--) {
      const k = bucketKey(iso(new Date(Date.now() - i * DAY)), grain);
      if (!seen.has(k)) { seen.add(k); keys.push(k); }
    }
    return keys;
  }, [range, grain]);
  const spread = (days: (string | undefined)[], weight: (i: number) => number = () => 1) => {
    const idx = new Map(buckets.map((k, i) => [k, i]));
    const out = buckets.map(() => 0);
    days.forEach((d, i) => { if (!d) return; const j = idx.get(bucketKey(d, grain)); if (j !== undefined) out[j] += weight(i); });
    return out;
  };
  const wonDeals = useMemo(() => deals.filter((d) => d.stage === 'WON' && !d.mergedInto), [deals]);
  const salesSeries = useMemo(() => spread(wonDeals.map((d) => dayOf(d.closedAt || d.updatedAt)), (i) => toDisplay(wonDeals[i].amount)), [buckets, wonDeals, grain]); // eslint-disable-line react-hooks/exhaustive-deps
  const salesCount = useMemo(() => spread(wonDeals.map((d) => dayOf(d.closedAt || d.updatedAt))), [buckets, wonDeals, grain]); // eslint-disable-line react-hooks/exhaustive-deps
  const leadCustomers = useMemo(() => spread(customers.map((c) => dayOf(c.createdAt))), [buckets, customers, grain]); // eslint-disable-line react-hooks/exhaustive-deps
  const leadDeals = useMemo(() => spread(deals.map((d) => dayOf(d.createdAt))), [buckets, deals, grain]); // eslint-disable-line react-hooks/exhaustive-deps
  const labels = buckets.map((k) => bucketLabel(k, grain));
  const salesTotal = salesSeries.reduce((s, v) => s + v, 0);

  // ---- drawing of the funnel ----
  const funnelChart = () => {
    if (kind === 'funnel') {
      const rowsF: FunnelRow[] = stageRows.map((st, i) => {
        const reachedN = stageRows.slice(i).reduce((sum, r) => sum + r.count, 0);
        const first = Math.max(1, stageRows.reduce((sum, r) => sum + r.count, 0));
        return { id: st.id, label: st.label, count: st.count, amount: canMoney ? compact(toDisplay(st.amount)) : '', reached: reachedN, share: Math.round((reachedN / first) * 100), color: st.color };
      });
      return <FunnelDark rows={rowsF} unit={unitName()} showMoney={canMoney} />;
    }
    if (kind === 'bars') {
      return (
        <HBars
          rows={stageRows.map((s) => ({ label: `${s.label} (${toPersianDigits(s.count)})`, segments: [{ value: canMoney ? s.amount : s.count, color: s.color, name: s.label }], note: canMoney ? `${formatMoney(s.amount)} ${unitName()}` : undefined }))}
          format={(v) => (canMoney ? compact(v) : toPersianDigits(v))}
        />
      );
    }
    if (kind === 'columns') {
      return (
        <div className="space-y-3">
          <Columns stacked labels={stageRows.map((s) => s.label)} series={stageRows.map((s, i) => ({ name: s.label, color: s.color, values: stageRows.map((_, j) => (j === i ? s.count : 0)) }))} />
          {canMoney && <Columns stacked labels={stageRows.map((s) => s.label)} series={stageRows.map((s, i) => ({ name: s.label, color: s.color, values: stageRows.map((_, j) => (j === i ? toDisplay(s.amount) : 0)) }))} format={compact} />}
        </div>
      );
    }
    return <Donut data={stageRows.map((s) => ({ label: s.label, value: s.count, color: s.color }))} centerLabel="فرصت" size={190} />;
  };

  const activityList = (rows: typeof future, empty: string, closeLabel?: boolean) => (
    rows.length === 0 ? (
      <div className="text-center text-[11px] font-bold text-gray-400 py-6 border border-dashed border-[#EBDBCE] rounded-2xl">{empty}</div>
    ) : (
      <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-0.5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-start gap-2 bg-[#FAF5F1] rounded-xl px-3 py-2">
            <span className={`shrink-0 text-[10px] font-black rounded-lg px-1.5 py-0.5 mt-0.5 ${r.type === 'CLOSE' ? 'bg-emerald-100 text-emerald-700' : ACTIVITY_CLS[r.type] || ACTIVITY_CLS.NOTE}`}>{r.type === 'CLOSE' ? 'بستن فرصت' : ACTIVITY_LABEL[r.type] || r.type}</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-black text-[#3A241F] truncate">{r.name || '—'}</div>
              <div className="text-[11px] text-[#8C6F66] line-clamp-2">{r.text || (closeLabel ? '' : '—')}</div>
            </div>
            <div className="shrink-0 text-left text-[10px] font-bold text-[#8C6F66]">
              <div>{formatTaskDate(r.day)}</div>
              <div className="text-[#3A241F]">{r.who}</div>
            </div>
          </div>
        ))}
      </div>
    )
  );

  const kpi = (icon: React.ReactNode, label: string, value: string, tone = 'bg-white') => (
    <div className={`${tone} border border-[#EBDBCE] rounded-2xl p-3 flex items-center gap-2.5 min-w-0`}>
      <span className="w-9 h-9 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-black text-[#3A241F] truncate">{value}</div>
        <div className="text-[11px] font-bold text-[#8C6F66] truncate">{label}</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-2 sm:p-4" onMouseDown={onClose} data-funnel-modal>
      <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className={`bg-[#FAF5F1] rounded-3xl shadow-2xl w-full ${kind === 'funnel' ? 'max-w-[98vw]' : 'max-w-6xl'} max-h-[96vh] flex flex-col border border-[#EBDBCE] text-right`}>
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#EBDBCE] bg-white rounded-t-3xl">
          <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2"><Filter className="w-4 h-4 text-violet-700" />قیف فروش و تحلیل فعالیت‌ها</h3>
          <button type="button" onClick={onClose} aria-label="بستن" className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
            {kpi(<UserPlus className="w-4 h-4" />, 'مشتری تازه (۳۰ روز)', toPersianDigits(summary.newCustomers))}
            {kpi(<Filter className="w-4 h-4" />, 'فرصت تازه (۳۰ روز)', toPersianDigits(summary.newDeals))}
            {kpi(<TrendingUp className="w-4 h-4" />, canMoney ? `فروش موفق (${toPersianDigits(summary.wonCount)}) در ۳۰ روز` : 'فروش موفق در ۳۰ روز', canMoney ? `${formatMoney(summary.wonAmount)} ${unitName()}` : toPersianDigits(summary.wonCount))}
            {kpi(<CalendarCheck className="w-4 h-4" />, 'تماس و جلسه (۳۰ روز)', toPersianDigits(summary.calls + summary.meetings))}
            {kpi(<History className="w-4 h-4" />, 'از دست رفته (۳۰ روز)', toPersianDigits(summary.lost))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard
              className="xl:col-span-2"
              title="قیف فروش"
              subtitle={`همهٔ فرصت‌ها در هر مرحله · از دست رفته: ${toPersianDigits(lostCount)}`}
            >
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <label className="flex items-center gap-2 text-[11px] font-black text-[#8C6F66]">شکل نمودار:
                <select data-funnel-kind value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="px-3 py-1.5 bg-white border border-[#EBDBCE] rounded-xl text-xs font-black text-[#3A241F] cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-300">
                  {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
              </label>
              {canAi && (
                <button type="button" onClick={() => setAiOpen(true)} data-funnel-ai-btn className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 cursor-pointer"><Sparkles className="w-3.5 h-3.5" />تحلیل هوش مصنوعی</button>
              )}
              {kind === 'funnel' && (
                <div dir="ltr" className="flex items-center gap-2 text-[#8C6F66]" data-funnel-zoom>
                  <ZoomOut className="w-4 h-4" />
                  <input type="range" min={40} max={130} step={5} value={Math.round(zoom * 100)} onChange={(e) => setZoom(Number(e.target.value) / 100)} aria-label="کوچک و بزرگ کردن قیف" className="w-56 accent-violet-600 cursor-ew-resize" />
                  <ZoomIn className="w-4 h-4" />
                  <button type="button" onClick={() => setZoom(1)} title="برگشت به اندازهٔ اصلی" className="text-[11px] font-black text-violet-700 min-w-[44px] cursor-pointer">{toPersianDigits(Math.round(zoom * 100))}٪</button>
                </div>
              )}
              </div>
              {kind === 'bars' || kind === 'columns' || kind === 'donut' ? funnelChart() : <FitBox design={kind === 'funnel' ? 1030 : undefined} zoom={zoom}>{funnelChart()}</FitBox>}
            </ChartCard>

            <ChartCard title="فعالیت‌های آینده" subtitle="پیگیری‌های بازِ پیش‌رو و روز بستن فرصت‌ها">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#8C6F66]"><CalendarClock className="w-3.5 h-3.5" />از امروز به بعد</div>
              {activityList(future, 'فعالیت آینده‌ای ثبت نشده است.', true)}
            </ChartCard>
            <ChartCard title="فعالیت‌های گذشته" subtitle="تماس، جلسه، یادداشت، قیمت و پیگیری‌های انجام‌شده">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#8C6F66]"><History className="w-3.5 h-3.5" />تازه‌ترین‌ها</div>
              {activityList(past, 'هنوز فعالیتی ثبت نشده است.')}
            </ChartCard>

            <ChartCard className="xl:col-span-2" title="خلاصهٔ فعالیت‌های فروش (۳۰ روز اخیر)" subtitle="شمارِ آنچه تیم ثبت کرده است">
              <HBars
                rows={[
                  { label: 'تماس', segments: [{ value: summary.calls, color: C.aqua }] },
                  { label: 'جلسه', segments: [{ value: summary.meetings, color: C.blue }] },
                  { label: 'یادداشت', segments: [{ value: summary.notes, color: C.yellow }] },
                  { label: 'قیمت داده شد', segments: [{ value: summary.quotes, color: C.orange }] },
                  { label: 'پیگیری انجام‌شده', segments: [{ value: summary.followDone, color: C.magenta }] },
                ]}
              />
            </ChartCard>

            <ChartCard
              title="سرنخ‌ها بر اساس منبع آشنایی"
              subtitle="مشتری از چه راهی آمده؛ تازه (۳۰ روز اخیر) و قدیمی جدا شده است"
              legend={[{ label: 'تازه', color: C.orange }, { label: 'قدیمی', color: C.blue }]}
            >
              <Donut data={sources.slice(0, 8).map((s, i) => ({ label: s.name, value: s.total, color: SERIES[i % SERIES.length] }))} centerLabel="مشتری" size={170} />
              <HBars
                rows={sources.slice(0, 8).map((s) => ({ label: s.name, segments: [{ value: s.fresh, color: C.orange, name: 'تازه' }, { value: s.old, color: C.blue, name: 'قدیمی' }] }))}
                empty="منبع آشنایی ثبت نشده است."
              />
            </ChartCard>

            <ChartCard
              title="نمودار سرنخ‌ها"
              subtitle="مشتری تازه و فرصت تازه در طول زمان"
              legend={[{ label: 'مشتری تازه', color: C.blue }, { label: 'فرصت تازه', color: C.orange }]}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <Pick value={String(range)} onChange={(v) => setRange(Number(v))} label="بازه" options={[{ id: '30', label: '۳۰ روز' }, { id: '90', label: '۹۰ روز' }, { id: '180', label: '۶ ماه' }, { id: '365', label: 'یک سال' }]} />
                <Pick value={grain} onChange={(v) => setGrain(v as Grain)} label="دسته‌بندی" options={[{ id: 'day', label: 'روزانه' }, { id: 'week', label: 'هفتگی' }, { id: 'month', label: 'ماهانه' }]} />
              </div>
              <TrendChart labels={labels} series={[{ name: 'مشتری تازه', color: C.blue, values: leadCustomers }, { name: 'فرصت تازه', color: C.orange, values: leadDeals }]} />
            </ChartCard>

            <ChartCard
              className="xl:col-span-2"
              title="کل فروش بر اساس تاریخ"
              subtitle={`مبلغ فروش موفق در بازهٔ انتخاب‌شده: ${fa(salesTotal)} ${unitName()} · ${toPersianDigits(salesCount.reduce((s, v) => s + v, 0))} فروش`}
            >
              <Columns labels={labels} series={[{ name: canMoney ? `فروش موفق (${unitName()})` : 'تعداد فروش موفق', color: C.aqua, values: canMoney ? salesSeries : salesCount }]} format={canMoney ? compact : undefined} />
            </ChartCard>
          </div>
        </div>
      </div>
      {aiOpen && <FunnelAiPage onClose={() => setAiOpen(false)} onOpenCustomer={onOpenCustomer ? (id) => { setAiOpen(false); onClose(); onOpenCustomer(id); } : undefined} />}
    </div>
  );
};
