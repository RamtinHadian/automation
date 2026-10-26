import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, Copy, Gauge, Hourglass, Lightbulb, Loader2, Printer, Sparkles, Target, ThumbsUp, Timer, TrendingUp, Trophy, Wallet } from 'lucide-react';
import fontUrl from 'vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2?url';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { toDisplay, unitName } from '../../lib/money';
import { PROFILE_INFO, RepRow, STALE_DAYS, TeamAnalysis } from '../../lib/salesAnalysis';
import { C, ChartCard, compact, Donut, fa, HBars, Kpi } from './charts';

interface Person { name: string; rank?: number; grade?: string; verdict?: string; strengths?: string[]; weaknesses?: string[]; coaching?: string[] }
interface Report {
  headline?: string;
  mood?: 'good' | 'ok' | 'bad';
  summary?: string;
  comments?: Record<string, string>;
  team?: { strengths?: string[]; risks?: string[]; opportunities?: string[] };
  people?: Person[];
  actions?: { title: string; who?: string; why?: string; when?: string }[];
}

const MOOD = {
  good: { bar: 'from-emerald-700 to-teal-500', chip: 'خوب', hex: '#0f766e' },
  ok: { bar: 'from-amber-600 to-orange-500', chip: 'متوسط', hex: '#c2410c' },
  bad: { bar: 'from-rose-700 to-red-500', chip: 'نیازمند اقدام', hex: '#b91c1c' },
};
const GRADE_TONE = (g?: string) => (g === 'عالی' ? 'bg-emerald-100 text-emerald-800' : g === 'خوب' ? 'bg-sky-100 text-sky-800' : g === 'متوسط' ? 'bg-amber-100 text-amber-800' : g === 'نیازمند توجه' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600');
const arr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v) => typeof v === 'string') : []);
const tx = (s?: string) => toPersianDigits(s || '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const compactM = (n: number) => compact(toDisplay(n));
const pc = (x: number | null) => (x === null ? '—' : `${toPersianDigits(Math.round(x * 100))}٪`);
const STAGE_LABEL: Record<string, string> = { NEW: 'جدید', CONTACTED: 'تماس گرفته شد', PROPOSAL: 'پیشنهاد ارسال شد', NEGOTIATION: 'مذاکره' };
const STAGE_COLOR: Record<string, string> = { NEW: '#94a3b8', CONTACTED: '#0ea5e9', PROPOSAL: '#8b5cf6', NEGOTIATION: '#f59e0b' };

/** The numbers sent to the AI: what the analysis table already shows (money only for people who may see money), no phone numbers. */
function buildPayload(a: TeamAnalysis, days: number, seesTotals: boolean) {
  const t = a.total;
  const money = (n: number | null) => (!seesTotals || n === null ? undefined : toDisplay(n));
  return {
    periodDays: days,
    moneyUnit: seesTotals ? unitName() : undefined,
    staleDaysRule: STALE_DAYS,
    team: {
      created: t.created, won: t.won, lost: t.lost, winRatePercent: t.winRate === null ? null : Math.round(t.winRate * 100),
      soldValue: money(t.wonValue), avgDeal: money(t.avgDeal), cycleDays: t.cycleDays === null ? null : Math.round(t.cycleDays),
      openDeals: t.open, openValue: money(t.openValue), weightedForecast: money(t.weighted), staleOpenDeals: t.stale, activities: t.activities,
      pipelineCoverageMonths: a.coverageMonths === null ? null : Math.round(a.coverageMonths * 10) / 10,
    },
    lossReasons: a.lossReasons.slice(0, 6).map((l) => ({ reason: l.label, count: l.count })),
    topCustomerSharePercent: seesTotals && a.concentration ? Math.round(a.concentration.share1 * 100) : null,
    people: a.rows.map((r, i) => ({
      name: r.name, systemRank: i + 1, systemScore: r.score, systemProfile: PROFILE_INFO[r.profile].label,
      createdDeals: r.created, won: r.won, lost: r.lost, winRatePercent: r.winRate === null ? null : Math.round(r.winRate * 100),
      soldValue: money(r.wonValue), avgDeal: money(r.avgDeal), cycleDays: r.cycleDays === null ? null : Math.round(r.cycleDays),
      openDeals: r.open, staleOpenDeals: r.stale, overdueCloseDates: r.overdueClose,
      calls: r.calls, meetings: r.meetings, notes: r.notes, quotes: r.quotes, followups: r.followups, followupsOverdue: r.followupsOverdue,
      activeDays: r.activeDays, newCustomers: r.newCustomers, topLossReason: r.topLoss || null,
    })),
  };
}

/** The AI's words under a chart. */
const Insight: React.FC<{ text?: string }> = ({ text }) =>
  text && text.trim() ? (
    <div className="mt-3 flex gap-2 rounded-2xl bg-violet-50 border border-violet-200 px-3 py-2.5" data-ai-insight>
      <Sparkles className="w-3.5 h-3.5 text-violet-600 mt-1 shrink-0" />
      <p className="text-[11.5px] font-bold leading-7 text-violet-950">{tx(text)}</p>
    </div>
  ) : null;

const Bullets: React.FC<{ items: string[]; tone: string }> = ({ items, tone }) => (
  <ul className="space-y-1.5">{items.map((x, i) => <li key={i} className={`text-[11.5px] font-bold leading-6 flex gap-1.5 ${tone}`}><span className="mt-2 w-1.5 h-1.5 rounded-full bg-current shrink-0" /><span>{tx(x)}</span></li>)}</ul>
);

/** A small ring with a number in it (the system's score of a person, 0 to 100). */
const Ring: React.FC<{ value: number; color: string; size?: number }> = ({ value, color, size = 54 }) => {
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EBDBCE" strokeWidth="5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${(Math.min(100, Math.max(0, value)) / 100) * circ} ${circ}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-black text-[#3A241F]">{toPersianDigits(Math.round(value))}</span>
    </div>
  );
};
const scoreColor = (s: number) => (s >= 70 ? '#0f766e' : s >= 45 ? '#d97706' : '#dc2626');

/** One print page: the same charts drawn with plain HTML bars so that it prints well everywhere. */
/** The whole report as one web page (its own browser tab): charts drawn with plain HTML bars, the AI's words under them, a print button. */
const reportHtml = (rep: Report, a: TeamAnalysis, rangeLabel: string, seesTotals: boolean): string => {
  const li = (xs: string[]) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(tx(x))}</li>`).join('')}</ul>` : '');
  const bars = (title: string, rows: { label: string; v: number; text: string }[], color: string, comment?: string) => {
    if (!rows.length) return '';
    const max = Math.max(...rows.map((r) => r.v), 1);
    return `<div class="ch"><h3>${esc(title)}</h3>${rows.map((r) => `<div class="b"><span class="l">${esc(tx(r.label))}</span><span class="t"><i style="width:${Math.max(2, (r.v / max) * 100)}%;background:${color}"></i></span><span class="n">${esc(tx(r.text))}</span></div>`).join('')}${comment ? `<p class="ins">${esc(tx(comment))}</p>` : ''}</div>`;
  };
  const cm = rep.comments || {};
  const rows = a.rows;
  const t = a.total;
  const kp = [
    ['نرخ موفقیت تیم', pc(t.winRate)], ['فروش موفق', `${toPersianDigits(t.won)}`], ['فرصت بی‌حرکت', `${toPersianDigits(t.stale)}`],
    ['فعالیت ثبت‌شده', `${toPersianDigits(t.activities)}`], ...(seesTotals ? [[`مبلغ فروش (${unitName()})`, compactM(t.wonValue)]] : []),
  ];
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>گزارش هوشمند تحلیل فروش</title><style>
@font-face{font-family:'Vazirmatn';src:url('${location.origin}${fontUrl}') format('woff2');font-weight:100 900}
@page{size:A4;margin:12mm}@media screen{body{max-width:980px;margin:0 auto;padding:18px;background:#fdfaf7}.toolbar{text-align:left;margin-bottom:10px}.toolbar button{font-family:inherit;background:#6E1B1B;color:#fff;border:0;border-radius:10px;padding:8px 18px;font-weight:800;cursor:pointer}}@media print{.toolbar{display:none}}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:'Vazirmatn',Tahoma,sans-serif;color:#2b1d19;line-height:1.9;font-size:12px}
.hd h1,h2,h3,b,button{font-family:'Vazirmatn',Tahoma,sans-serif}.hd{background:linear-gradient(135deg,#6E1B1B,#C0392B);color:#fff;border-radius:14px;padding:18px 22px}.hd small{opacity:.85}.hd h1{margin:4px 0 0;font-size:20px}
h2{font-size:14px;margin:18px 0 6px;color:#6E1B1B;border-right:4px solid #D34A32;padding-right:8px}
.k{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.k div{flex:1 1 18%;border:1px solid #EBDBCE;border-radius:10px;padding:8px 10px;text-align:center}.k b{display:block;font-size:16px}.k small{color:#8C6F66}
.ch{border:1px solid #EBDBCE;border-radius:12px;padding:10px 14px;margin:10px 0;page-break-inside:avoid}.ch h3{margin:0 0 6px;font-size:12.5px}
.b{display:flex;align-items:center;gap:8px;margin:3px 0}.l{width:110px;font-size:11px;font-weight:700}.t{flex:1;background:#f6eee9;border-radius:6px;height:12px;display:block}.t i{display:block;height:12px;border-radius:6px}.n{width:70px;font-size:11px;font-weight:800;text-align:left}
.ins{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:6px 10px;margin:8px 0 0;color:#3b0764;font-weight:600}
.p{border:1px solid #EBDBCE;border-radius:12px;padding:10px 14px;margin:8px 0;page-break-inside:avoid}.p h3{margin:0 0 4px;font-size:13px}.g{display:inline-block;background:#f3e8e2;border-radius:99px;padding:0 10px;font-size:11px;margin-right:6px}ul{margin:2px 0;padding-right:18px}
.c{display:flex;gap:10px}.c>div{flex:1;border-radius:10px;padding:8px 12px}.s{background:#ecfdf5}.r{background:#fef2f2}.o{background:#eff6ff}
.a{border-bottom:1px dashed #EBDBCE;padding:5px 0}.ft{margin-top:18px;font-size:10px;color:#8C6F66;text-align:center}
</style></head><body>
<div class="toolbar"><button onclick="print()">چاپ / ذخیره PDF</button></div>
<div class="hd"><small>گزارش هوشمند تحلیل فروش همکاران · ${esc(tx(rangeLabel))}</small><h1>${esc(tx(rep.headline || 'تحلیل عملکرد تیم فروش'))}</h1></div>
<p>${esc(tx(rep.summary || ''))}</p>
<div class="k">${kp.map(([l, v]) => `<div><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join('')}</div>
<h2>نمودارها و تحلیل</h2>
${bars('امتیاز کلی هر فروشنده (۰ تا ۱۰۰)', rows.map((r) => ({ label: r.name, v: r.score, text: toPersianDigits(r.score) })), '#6E1B1B', cm.score)}
${bars('نرخ موفقیت', rows.filter((r) => r.winRate !== null).map((r) => ({ label: r.name, v: Math.round((r.winRate || 0) * 100), text: pc(r.winRate) })), '#0f766e', cm.winRate)}
${seesTotals ? bars(`مبلغ فروش موفق (${unitName()})`, rows.filter((r) => r.wonValue > 0).map((r) => ({ label: r.name, v: r.wonValue, text: compactM(r.wonValue) })), '#2a78d6', cm.sales) : ''}
${bars('فعالیت (تماس، جلسه، یادداشت، قیمت، پیگیری)', rows.map((r) => ({ label: r.name, v: r.activities, text: toPersianDigits(r.activities) })), '#4a3aa7', cm.activity)}
${bars('فرصت‌های باز و بی‌حرکت', rows.filter((r) => r.open > 0).map((r) => ({ label: r.name, v: r.open, text: `${toPersianDigits(r.open)} / ${toPersianDigits(r.stale)} بی‌حرکت` })), '#f59e0b', cm.pipeline)}
${bars('متوسط چرخهٔ فروش (روز)', rows.filter((r) => r.cycleDays !== null).map((r) => ({ label: r.name, v: Math.round(r.cycleDays || 0), text: toPersianDigits(Math.round(r.cycleDays || 0)) })), '#eb6834', cm.cycle)}
${bars('دلایل از دست رفتن فروش', a.lossReasons.slice(0, 6).map((l) => ({ label: l.label, v: l.count, text: toPersianDigits(l.count) })), '#e34948', cm.losses)}
<h2>تیم در یک نگاه</h2><div class="c"><div class="s"><b>نقاط قوت</b>${li(arr(rep.team?.strengths))}</div><div class="r"><b>خطرها</b>${li(arr(rep.team?.risks))}</div><div class="o"><b>فرصت‌ها</b>${li(arr(rep.team?.opportunities))}</div></div>
<h2>کارنامهٔ هر نفر</h2>
${(rep.people || []).map((p) => `<div class="p"><h3>${esc(tx(String(p.rank ?? '')))}. ${esc(tx(p.name))}<span class="g">${esc(p.grade || '')}</span></h3><div>${esc(tx(p.verdict || ''))}</div>${p.strengths?.length ? `<b>قوت‌ها</b>${li(arr(p.strengths))}` : ''}${p.weaknesses?.length ? `<b>ضعف‌ها</b>${li(arr(p.weaknesses))}` : ''}${p.coaching?.length ? `<b>توصیهٔ مربی‌گری</b>${li(arr(p.coaching))}` : ''}</div>`).join('')}
<h2>اقدام‌های پیشنهادی</h2>${(rep.actions || []).map((x, i) => `<div class="a"><b>${esc(tx(String(i + 1)))}. ${esc(tx(x.title))}</b> — ${esc(tx(x.who || ''))} · ${esc(tx(x.when || ''))}<br>${esc(tx(x.why || ''))}</div>`).join('')}
<div class="ft">نمودارها از داده‌های ثبت‌شده در هورمند و شرح‌ها را هوش مصنوعی نوشته است؛ پیش از تصمیم‌گیری با واقعیت تطبیق دهید.</div>
</body></html>`;
  return html;
};

const noteHtml = (msg: string, tone: 'wait' | 'error') => `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>گزارش هوشمند تحلیل فروش</title><style>@font-face{font-family:'Vazirmatn';src:url('${location.origin}${fontUrl}') format('woff2');font-weight:100 900}body{font-family:'Vazirmatn',Tahoma,sans-serif;background:#fdfaf7;color:#3A241F;display:flex;align-items:center;justify-content:center;min-height:90vh;text-align:center;line-height:2}.c{max-width:520px;padding:28px;border:1px solid ${tone === 'error' ? '#fecaca' : '#ddd6fe'};background:${tone === 'error' ? '#fef2f2' : '#f5f3ff'};border-radius:20px}.s{width:34px;height:34px;border:4px solid #ddd6fe;border-top-color:#6d28d9;border-radius:50%;margin:0 auto 12px;animation:r 1s linear infinite}@keyframes r{to{transform:rotate(360deg)}}</style></head><body><div class="c">${tone === 'wait' ? '<div class="s"></div>' : ''}<b>${esc(msg)}</b></div></body></html>`;
const showInTab = (w: Window, html: string) => {
  w.document.open();
  w.document.write(html);
  w.document.close();
};

/** «گزارش هوشمند»: charts of the team's real numbers, the AI's reading under each chart, a card per person and the actions. */
export const AiSalesReport: React.FC<{ analysis: TeamAnalysis; days: number; rangeLabel: string; seesTotals: boolean }> = ({ analysis: a, days, rangeLabel, seesTotals }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rep, setRep] = useState<Report | null>(null);
  // the tab is opened by the click itself (so the browser allows it) and shows the report as soon as it is written
  const run = async () => {
    const w = window.open('', '_blank');
    if (w) showInTab(w, noteHtml('در حال تحلیل اعداد فروش با هوش مصنوعی… این صفحه تا دو دقیقه منتظر می‌ماند و خودش گزارش را نشان می‌دهد.', 'wait'));
    setBusy(true);
    setErr('');
    try {
      const r = await api.reportAiSales(rangeLabel, buildPayload(a, days, seesTotals));
      if (!r.report) throw new Error('پاسخ هوش مصنوعی قابل خواندن نبود؛ دوباره امتحان کنید.');
      setRep(r.report as Report);
      if (w && !w.closed) showInTab(w, reportHtml(r.report as Report, a, rangeLabel, seesTotals));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'تحلیل انجام نشد.';
      setErr(msg);
      if (w && !w.closed) showInTab(w, noteHtml(msg, 'error'));
    } finally {
      setBusy(false);
    }
  };
  const openTab = () => {
    if (!rep) return;
    const w = window.open('', '_blank');
    if (w) showInTab(w, reportHtml(rep, a, rangeLabel, seesTotals));
  };
  const mood = MOOD[rep?.mood || 'ok'] || MOOD.ok;
  const cm = rep?.comments || {};
  const t = a.total;
  const rowOf = useMemo(() => new Map(a.rows.map((r) => [r.name, r] as const)), [a.rows]);
  const stageTotals = Object.keys(STAGE_LABEL).map((k) => ({ label: STAGE_LABEL[k], value: a.rows.reduce((s, r) => s + (r.stageOpen[k] || 0), 0), color: STAGE_COLOR[k] }));
  const byScore = [...a.rows].sort((x, y) => y.score - x.score);
  const wonLost = [{ label: 'فروش موفق', value: t.won, color: C.aqua }, { label: 'از دست رفته', value: t.lost, color: C.red }];

  return (
    <div className="space-y-3" data-ai-sales-report>
      <div className="rounded-3xl border border-violet-200 bg-gradient-to-l from-violet-50 to-white p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className="font-black text-sm text-violet-900 flex items-center gap-2"><Sparkles className="w-4 h-4" />گزارش هوشمند با هوش مصنوعی</div>
          <p className="text-[11px] font-bold text-violet-800/80 leading-6 mt-0.5">گزارش در یک صفحهٔ تازه باز می‌شود. نمودار هر معیار از اعداد واقعی ساخته می‌شود و هوش مصنوعی زیر هر نمودار توضیح می‌دهد چه می‌بینیم و چه کنیم؛ بعدش خلاصهٔ مدیریتی، کارنامهٔ هر نفر و اقدام‌های پیشنهادی. فقط عددهای جدول (بدون شمارهٔ تلفن و مشخصات مشتری) به سرویس فرستاده می‌شود.</p>
        </div>
        <button type="button" disabled={busy} onClick={run} data-ai-sales-run className="px-5 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-xs font-black cursor-pointer flex items-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {busy ? 'در حال تحلیل… (تا دو دقیقه)' : rep ? 'تحلیل دوباره' : 'ساخت گزارش هوشمند'}
        </button>
      </div>
      {err && <div className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{err}</div>}
      {rep && (
        <article className="rounded-3xl border border-[#EBDBCE] bg-[#FDFAF7] overflow-hidden" data-ai-sales-result>
          <header className={`bg-gradient-to-l ${mood.bar} text-white px-5 py-6`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[10px] font-black opacity-90">گزارش هوشمند تحلیل فروش · {rangeLabel}</span>
              <span className="text-[10px] font-black bg-white/20 rounded-full px-3 py-0.5">وضع تیم: {mood.chip}</span>
            </div>
            <h4 className="font-black text-lg sm:text-2xl mt-2 leading-9">{tx(rep.headline)}</h4>
            {rep.summary && <p className="text-[12.5px] font-bold leading-8 mt-2 text-white/95 max-w-4xl">{tx(rep.summary)}</p>}
          </header>
          <div className="p-4 sm:p-5 space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi accent={C.green} icon={<Target className="w-5 h-5" />} label="نرخ موفقیت تیم" value={pc(t.winRate)} sub={`${fa(t.won)} موفق · ${fa(t.lost)} از دست رفته`} tone={t.winRate !== null && t.winRate >= 0.5 ? 'good' : 'plain'} />
              <Kpi accent={C.orange} icon={<Timer className="w-5 h-5" />} label="متوسط چرخهٔ فروش" value={t.cycleDays === null ? '—' : `${toPersianDigits(Math.round(t.cycleDays))} روز`} sub="از ساخت فرصت تا فروش" />
              <Kpi accent={C.red} icon={<Hourglass className="w-5 h-5" />} label="فرصت‌های بی‌حرکت" value={fa(t.stale)} sub={t.open ? `از ${fa(t.open)} فرصت باز` : 'فرصت بازی نیست'} tone={t.open && t.stale / t.open > 0.3 ? 'bad' : 'plain'} />
              <Kpi accent={C.violet} icon={<Activity className="w-5 h-5" />} label="فعالیت ثبت‌شده" value={fa(t.activities)} sub="تماس، جلسه، یادداشت، قیمت، پیگیری" />
              {seesTotals && <Kpi accent={C.blue} icon={<Wallet className="w-5 h-5" />} label={`مبلغ فروش (${unitName()})`} value={compactM(t.wonValue)} sub={t.avgDeal === null ? undefined : `متوسط هر فروش ${compactM(t.avgDeal)}`} />}
              {seesTotals && <Kpi accent={C.yellow} icon={<TrendingUp className="w-5 h-5" />} label={`قیف وزنی (${unitName()})`} value={compactM(t.weighted)} sub={`از ${compactM(t.openValue)} فرصت باز`} />}
              {seesTotals && t.velocity !== null && <Kpi accent={C.aqua} icon={<Gauge className="w-5 h-5" />} label={`سرعت فروش (${unitName()}/روز)`} value={compactM(t.velocity)} sub="فرصت × نرخ × مبلغ ÷ چرخه" />}
              <Kpi accent={C.magenta} icon={<Trophy className="w-5 h-5" />} label="برترین امتیاز" value={byScore[0] ? byScore[0].name : '—'} sub={byScore[0] ? `امتیاز ${toPersianDigits(byScore[0].score)} از ۱۰۰` : undefined} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <ChartCard title="امتیاز کلی هر فروشنده" subtitle="ترکیب نتیجه (۴۰٪)، فعالیت (۳۰٪) و انضباط پیگیری (۳۰٪)؛ از ۱۰۰">
                <HBars format={(v) => toPersianDigits(v)} rows={byScore.map((r) => ({ label: r.name, segments: [{ value: r.score, color: scoreColor(r.score) }], note: PROFILE_INFO[r.profile].label }))} />
                <Insight text={cm.score} />
              </ChartCard>
              <ChartCard title="نرخ موفقیت" subtitle="فروش موفق از موفق و از دست رفته">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="shrink-0"><Donut data={wonLost} centerLabel="فرصت بسته" size={130} /></div>
                  <div className="flex-1 min-w-[200px]">
                    <HBars format={(v) => `${toPersianDigits(v)}٪`} rows={[...a.rows].filter((r) => r.winRate !== null).sort((x, y) => (y.winRate || 0) - (x.winRate || 0)).map((r) => ({ label: r.name, segments: [{ value: Math.round((r.winRate || 0) * 100), color: C.green }], note: `${toPersianDigits(r.won)} از ${toPersianDigits(r.won + r.lost)}` }))} empty="هنوز فرصت بسته‌شده‌ای نیست." />
                  </div>
                </div>
                <Insight text={cm.winRate} />
              </ChartCard>
              {seesTotals && (
                <ChartCard title={`مبلغ فروش موفق (${unitName()})`} subtitle="سهم هر فروشنده از فروش بازه">
                  <HBars format={(v) => compactM(v)} rows={[...a.rows].filter((r) => r.wonValue > 0).sort((x, y) => y.wonValue - x.wonValue).map((r) => ({ label: r.name, segments: [{ value: r.wonValue, color: C.blue }], note: r.avgDeal ? `متوسط ${compactM(r.avgDeal)}` : undefined }))} empty="فروش موفقی در این بازه نیست." />
                  <Insight text={cm.sales} />
                </ChartCard>
              )}
              <ChartCard title="فعالیت هر فروشنده" subtitle="تماس، جلسه، یادداشت، قیمت و پیگیری" legend={[{ label: 'تماس', color: C.blue }, { label: 'جلسه', color: C.green }, { label: 'یادداشت', color: C.yellow }, { label: 'قیمت', color: C.orange }, { label: 'پیگیری', color: C.violet }]}>
                <HBars rows={a.rows.map((r) => ({ label: r.name, segments: [{ value: r.calls, color: C.blue, name: 'تماس' }, { value: r.meetings, color: C.green, name: 'جلسه' }, { value: r.notes, color: C.yellow, name: 'یادداشت' }, { value: r.quotes, color: C.orange, name: 'قیمت' }, { value: r.followups, color: C.violet, name: 'پیگیری' }] }))} />
                <Insight text={cm.activity} />
              </ChartCard>
              <ChartCard title="قیف فروش باز" subtitle="فرصت‌های باز تیم در هر مرحله" legend={Object.keys(STAGE_LABEL).map((k) => ({ label: STAGE_LABEL[k], color: STAGE_COLOR[k] }))}>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="shrink-0"><Donut data={stageTotals} centerLabel="فرصت باز" size={130} /></div>
                  <div className="flex-1 min-w-[200px]">
                    <HBars rows={a.rows.filter((r) => r.open > 0).map((r) => ({ label: r.name, segments: Object.keys(STAGE_LABEL).map((k) => ({ value: r.stageOpen[k] || 0, color: STAGE_COLOR[k], name: STAGE_LABEL[k] })), note: r.stale ? `${toPersianDigits(r.stale)} بی‌حرکت` : undefined }))} empty="فرصت بازی نیست." />
                  </div>
                </div>
                <Insight text={cm.pipeline} />
              </ChartCard>
              <ChartCard title="متوسط چرخهٔ فروش (روز)" subtitle="از ساخت فرصت تا فروش موفق؛ کوتاه‌تر بهتر است">
                <HBars format={(v) => toPersianDigits(v)} rows={[...a.rows].filter((r) => r.cycleDays !== null).sort((x, y) => (x.cycleDays || 0) - (y.cycleDays || 0)).map((r) => ({ label: r.name, segments: [{ value: Math.round(r.cycleDays || 0), color: C.orange }] }))} empty="هنوز فروش بسته‌شده‌ای نیست." />
                <Insight text={cm.cycle} />
              </ChartCard>
              <ChartCard title="چرا فروش از دست می‌رود؟" subtitle="دلایل ثبت‌شدهٔ باخت">
                <div className="flex items-center gap-4 flex-wrap">
                  {a.lossReasons.length > 0 && <div className="shrink-0"><Donut data={a.lossReasons.slice(0, 6).map((l, i) => ({ label: l.label, value: l.count, color: [C.red, C.orange, C.yellow, C.magenta, C.violet, C.blue][i % 6] }))} centerLabel="باخت" size={130} /></div>}
                  <div className="flex-1 min-w-[200px]">
                    <HBars rows={a.lossReasons.slice(0, 6).map((l) => ({ label: l.label, segments: [{ value: l.count, color: C.red }] }))} empty="فروش از دست‌رفته‌ای ثبت نشده است." />
                  </div>
                </div>
                <Insight text={cm.losses} />
              </ChartCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3"><div className="font-black text-xs text-emerald-800 mb-1.5 flex items-center gap-1.5"><ThumbsUp className="w-3.5 h-3.5" />نقاط قوت تیم</div><Bullets items={arr(rep.team?.strengths)} tone="text-emerald-900" /></div>
              <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3"><div className="font-black text-xs text-rose-800 mb-1.5 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />خطرها</div><Bullets items={arr(rep.team?.risks)} tone="text-rose-900" /></div>
              <div className="rounded-2xl bg-sky-50 border border-sky-200 p-3"><div className="font-black text-xs text-sky-800 mb-1.5 flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5" />فرصت‌ها</div><Bullets items={arr(rep.team?.opportunities)} tone="text-sky-900" /></div>
            </div>

            {(rep.people || []).length > 0 && (
              <div>
                <h5 className="font-black text-[13px] text-[#3A241F] mb-2">کارنامهٔ هر نفر</h5>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {(rep.people || []).map((p, i) => {
                    const row: RepRow | undefined = rowOf.get(p.name);
                    return (
                      <div key={i} className="rounded-2xl border border-[#EBDBCE] bg-white p-4 space-y-2.5">
                        <div className="flex items-center gap-3">
                          {row ? <Ring value={row.score} color={scoreColor(row.score)} /> : <span className="w-10 h-10 rounded-full bg-[#6E1B1B] text-white font-black flex items-center justify-center shrink-0">{toPersianDigits(p.rank ?? i + 1)}</span>}
                          <div className="flex-1 min-w-0">
                            <div className="font-black text-sm text-[#3A241F] truncate">{tx(String(p.rank ?? i + 1))}. {tx(p.name)}</div>
                            <span className={`inline-block text-[10px] font-black rounded-full px-2.5 py-0.5 mt-0.5 ${GRADE_TONE(p.grade)}`}>{p.grade}</span>
                          </div>
                        </div>
                        {row && (
                          <div className="grid grid-cols-4 gap-1.5 text-center">
                            {[['موفق', fa(row.won)], ['نرخ', pc(row.winRate)], ['فعالیت', fa(row.activities)], ['بی‌حرکت', fa(row.stale)]].map(([l, v]) => (
                              <div key={l} className="rounded-xl bg-[#FAF5F1] py-1.5"><div className="text-[12px] font-black text-[#3A241F]">{v}</div><div className="text-[9px] font-bold text-[#8C6F66]">{l}</div></div>
                            ))}
                          </div>
                        )}
                        {p.verdict && <p className="text-[11.5px] font-bold leading-6 text-[#5a3d35]">{tx(p.verdict)}</p>}
                        {arr(p.strengths).length > 0 && <div><div className="text-[10px] font-black text-emerald-700 mb-1">قوت‌ها</div><Bullets items={arr(p.strengths)} tone="text-[#3A241F]" /></div>}
                        {arr(p.weaknesses).length > 0 && <div><div className="text-[10px] font-black text-rose-700 mb-1">ضعف‌ها</div><Bullets items={arr(p.weaknesses)} tone="text-[#3A241F]" /></div>}
                        {arr(p.coaching).length > 0 && <div className="bg-violet-50 rounded-xl px-3 py-2"><div className="text-[10px] font-black text-violet-700 mb-1">توصیهٔ مربی‌گری</div><Bullets items={arr(p.coaching)} tone="text-violet-950" /></div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(rep.actions || []).length > 0 && (
              <div>
                <h5 className="font-black text-[13px] text-[#3A241F] mb-2 flex items-center gap-1.5"><Target className="w-4 h-4 text-[#D34A32]" />اقدام‌های پیشنهادی</h5>
                <ol className="space-y-2">
                  {(rep.actions || []).map((x, i) => (
                    <li key={i} className="flex gap-3 rounded-2xl border border-[#EBDBCE] bg-white px-3 py-2.5">
                      <span className="w-6 h-6 rounded-full bg-[#D34A32] text-white text-[11px] font-black flex items-center justify-center shrink-0">{toPersianDigits(i + 1)}</span>
                      <div className="min-w-0">
                        <div className="font-black text-xs text-[#3A241F]">{tx(x.title)}</div>
                        <div className="text-[10.5px] font-bold text-[#8C6F66] leading-6">{[x.who, x.when].filter(Boolean).map((v) => tx(v)).join(' · ')}{x.why ? ` — ${tx(x.why)}` : ''}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#EBDBCE]">
              <button type="button" onClick={openTab} className="flex items-center gap-1.5 text-[11px] font-black text-[#3A241F] border border-[#EBDBCE] bg-white rounded-xl px-3 py-2 cursor-pointer" data-ai-sales-print><Printer className="w-3.5 h-3.5" />باز کردن در صفحهٔ جدید / چاپ</button>
              <button type="button" onClick={() => { try { navigator.clipboard.writeText(JSON.stringify(rep, null, 2)); } catch { /* no clipboard */ } }} className="flex items-center gap-1.5 text-[11px] font-black text-[#3A241F] border border-[#EBDBCE] bg-white rounded-xl px-3 py-2 cursor-pointer"><Copy className="w-3.5 h-3.5" />کپی</button>
              <span className="text-[10px] font-bold text-[#8C6F66] flex-1 min-w-[200px]">نمودارها از دادهٔ ثبت‌شده ساخته شده و شرح‌ها را هوش مصنوعی نوشته؛ پیش از تصمیم‌گیری با واقعیت تطبیق دهید.</span>
            </div>
          </div>
        </article>
      )}
    </div>
  );
};
