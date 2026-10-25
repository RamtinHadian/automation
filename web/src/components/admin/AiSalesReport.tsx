import React, { useState } from 'react';
import { AlertTriangle, Copy, Lightbulb, Loader2, Printer, Sparkles, Target, ThumbsUp } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { toDisplay, unitName } from '../../lib/money';
import { PROFILE_INFO, STALE_DAYS, TeamAnalysis } from '../../lib/salesAnalysis';

interface Person { name: string; rank?: number; grade?: string; verdict?: string; strengths?: string[]; weaknesses?: string[]; coaching?: string[] }
interface Report {
  headline?: string;
  mood?: 'good' | 'ok' | 'bad';
  summary?: string;
  kpis?: { label: string; value: string; note?: string }[];
  team?: { strengths?: string[]; risks?: string[]; opportunities?: string[] };
  people?: Person[];
  actions?: { title: string; who?: string; why?: string; when?: string }[];
}

const MOOD = {
  good: { bar: 'from-emerald-600 to-teal-500', chip: 'خوب' },
  ok: { bar: 'from-amber-500 to-orange-500', chip: 'متوسط' },
  bad: { bar: 'from-rose-600 to-red-500', chip: 'نیازمند اقدام' },
};
const GRADE_TONE = (g?: string) => (g === 'عالی' ? 'bg-emerald-100 text-emerald-800' : g === 'خوب' ? 'bg-sky-100 text-sky-800' : g === 'متوسط' ? 'bg-amber-100 text-amber-800' : g === 'نیازمند توجه' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600');
const arr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v) => typeof v === 'string') : []);
const fa = (s?: string) => toPersianDigits(s || '');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The numbers sent to the AI: what the analysis table already shows, in the money unit of the system. */
function buildPayload(a: TeamAnalysis, days: number) {
  const t = a.total;
  return {
    periodDays: days,
    moneyUnit: unitName(),
    staleDaysRule: STALE_DAYS,
    team: {
      created: t.created, won: t.won, lost: t.lost, winRate: t.winRate === null ? null : Math.round(t.winRate * 100),
      soldValue: toDisplay(t.wonValue), avgDeal: t.avgDeal === null ? null : toDisplay(t.avgDeal), cycleDays: t.cycleDays === null ? null : Math.round(t.cycleDays),
      openDeals: t.open, openValue: toDisplay(t.openValue), weightedForecast: toDisplay(t.weighted), staleOpenDeals: t.stale, activities: t.activities,
      pipelineCoverageMonths: a.coverageMonths === null ? null : Math.round(a.coverageMonths * 10) / 10,
    },
    lossReasons: a.lossReasons.slice(0, 6).map((l) => ({ reason: l.label, count: l.count })),
    topCustomerSharePercent: a.concentration ? Math.round(a.concentration.share1 * 100) : null,
    people: a.rows.map((r, i) => ({
      name: r.name, systemRank: i + 1, systemScore: r.score, systemProfile: PROFILE_INFO[r.profile].label,
      createdDeals: r.created, won: r.won, lost: r.lost, winRatePercent: r.winRate === null ? null : Math.round(r.winRate * 100),
      soldValue: toDisplay(r.wonValue), avgDeal: r.avgDeal === null ? null : toDisplay(r.avgDeal), cycleDays: r.cycleDays === null ? null : Math.round(r.cycleDays),
      openDeals: r.open, staleOpenDeals: r.stale, overdueCloseDates: r.overdueClose,
      calls: r.calls, meetings: r.meetings, notes: r.notes, quotes: r.quotes, followups: r.followups, followupsOverdue: r.followupsOverdue,
      activeDays: r.activeDays, newCustomers: r.newCustomers, topLossReason: r.topLoss || null,
    })),
  };
}

const printHtml = (rep: Report, rangeLabel: string) => {
  const li = (xs: string[]) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(fa(x))}</li>`).join('')}</ul>` : '');
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>گزارش هوشمند تحلیل فروش</title><style>
@page{size:A4;margin:14mm}body{font-family:Vazirmatn,Tahoma,sans-serif;color:#2b1d19;line-height:1.9;font-size:12px}
.hd{background:linear-gradient(135deg,#6E1B1B,#C0392B);color:#fff;border-radius:14px;padding:18px 22px}.hd small{opacity:.85}.hd h1{margin:4px 0 0;font-size:20px}
h2{font-size:14px;margin:18px 0 6px;color:#6E1B1B;border-right:4px solid #D34A32;padding-right:8px}
.k{display:flex;flex-wrap:wrap;gap:8px}.k div{flex:1 1 30%;border:1px solid #EBDBCE;border-radius:10px;padding:8px 10px}.k b{display:block;font-size:15px}
.p{border:1px solid #EBDBCE;border-radius:12px;padding:10px 14px;margin:8px 0;page-break-inside:avoid}.p h3{margin:0 0 4px;font-size:13px}
.g{display:inline-block;background:#f3e8e2;border-radius:99px;padding:0 10px;font-size:11px;margin-right:6px}ul{margin:2px 0;padding-right:18px}
.c{display:flex;gap:10px}.c>div{flex:1;border-radius:10px;padding:8px 12px}.s{background:#ecfdf5}.r{background:#fef2f2}.o{background:#eff6ff}
.a{border-bottom:1px dashed #EBDBCE;padding:5px 0}.ft{margin-top:18px;font-size:10px;color:#8C6F66;text-align:center}
</style></head><body>
<div class="hd"><small>گزارش هوشمند تحلیل فروش همکاران · ${esc(fa(rangeLabel))}</small><h1>${esc(fa(rep.headline || 'تحلیل عملکرد تیم فروش'))}</h1></div>
<p>${esc(fa(rep.summary || ''))}</p>
${(rep.kpis || []).length ? `<div class="k">${(rep.kpis || []).map((k) => `<div><small>${esc(fa(k.label))}</small><b>${esc(fa(k.value))}</b><small>${esc(fa(k.note || ''))}</small></div>`).join('')}</div>` : ''}
<h2>تیم در یک نگاه</h2><div class="c"><div class="s"><b>نقاط قوت</b>${li(arr(rep.team?.strengths))}</div><div class="r"><b>خطرها</b>${li(arr(rep.team?.risks))}</div><div class="o"><b>فرصت‌ها</b>${li(arr(rep.team?.opportunities))}</div></div>
<h2>کارنامهٔ هر نفر</h2>
${(rep.people || []).map((p) => `<div class="p"><h3>${esc(fa(String(p.rank ?? '')))}. ${esc(fa(p.name))}<span class="g">${esc(p.grade || '')}</span></h3><div>${esc(fa(p.verdict || ''))}</div>${p.strengths?.length ? `<b>قوت‌ها</b>${li(arr(p.strengths))}` : ''}${p.weaknesses?.length ? `<b>ضعف‌ها</b>${li(arr(p.weaknesses))}` : ''}${p.coaching?.length ? `<b>توصیهٔ مربی‌گری</b>${li(arr(p.coaching))}` : ''}</div>`).join('')}
<h2>اقدام‌های پیشنهادی</h2>${(rep.actions || []).map((a, i) => `<div class="a"><b>${esc(fa(String(i + 1)))}. ${esc(fa(a.title))}</b> — ${esc(fa(a.who || ''))} · ${esc(fa(a.when || ''))}<br>${esc(fa(a.why || ''))}</div>`).join('')}
<div class="ft">این گزارش را هوش مصنوعی از روی داده‌های ثبت‌شده در هورمند نوشته است؛ پیش از تصمیم‌گیری با واقعیت تطبیق دهید.</div>
<script>document.fonts&&document.fonts.ready?document.fonts.ready.then(function(){setTimeout(function(){print()},300)}):setTimeout(function(){print()},500)</script></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
};

const Bullets: React.FC<{ items: string[]; tone: string }> = ({ items, tone }) => (
  <ul className="space-y-1.5">{items.map((x, i) => <li key={i} className={`text-[11.5px] font-bold leading-6 flex gap-1.5 ${tone}`}><span className="mt-2 w-1.5 h-1.5 rounded-full bg-current shrink-0" /><span>{fa(x)}</span></li>)}</ul>
);

/** «گزارش هوشمند»: the AI reads the team's numbers and writes a ready, readable report (headline, team view, one card per person, actions). */
export const AiSalesReport: React.FC<{ analysis: TeamAnalysis; days: number; rangeLabel: string }> = ({ analysis, days, rangeLabel }) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [rep, setRep] = useState<Report | null>(null);
  const [rawText, setRawText] = useState('');
  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await api.reportAiSales(rangeLabel, buildPayload(analysis, days));
      if (r.report) { setRep(r.report as Report); setRawText(''); } else { setRep(null); setRawText(r.text || ''); }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'تحلیل انجام نشد.');
    } finally {
      setBusy(false);
    }
  };
  const mood = MOOD[rep?.mood || 'ok'] || MOOD.ok;
  return (
    <div className="space-y-3" data-ai-sales-report>
      <div className="rounded-3xl border border-violet-200 bg-gradient-to-l from-violet-50 to-white p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className="font-black text-sm text-violet-900 flex items-center gap-2"><Sparkles className="w-4 h-4" />گزارش هوشمند با هوش مصنوعی</div>
          <p className="text-[11px] font-bold text-violet-800/80 leading-6 mt-0.5">هوش مصنوعی همین اعداد را می‌خواند و یک گزارش آماده می‌نویسد: خلاصهٔ مدیریتی، رتبه‌بندی، نقاط قوت و ضعف هر نفر و اقدام‌های پیشنهادی. فقط عددهای این جدول (بدون شمارهٔ تلفن و مشخصات مشتری) به سرویس فرستاده می‌شود.</p>
        </div>
        <button type="button" disabled={busy} onClick={run} data-ai-sales-run className="px-5 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-xs font-black cursor-pointer flex items-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {busy ? 'در حال تحلیل… (تا دو دقیقه)' : rep || rawText ? 'تحلیل دوباره' : 'ساخت گزارش هوشمند'}
        </button>
      </div>
      {err && <div className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{err}</div>}
      {rawText && !rep && <div className="whitespace-pre-wrap text-xs font-bold leading-7 bg-white border border-[#EBDBCE] rounded-2xl p-4">{fa(rawText)}</div>}
      {rep && (
        <article className="rounded-3xl border border-[#EBDBCE] bg-white overflow-hidden" data-ai-sales-result>
          <header className={`bg-gradient-to-l ${mood.bar} text-white px-5 py-5`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[10px] font-black opacity-90">گزارش هوشمند · {rangeLabel}</span>
              <span className="text-[10px] font-black bg-white/20 rounded-full px-3 py-0.5">وضع تیم: {mood.chip}</span>
            </div>
            <h4 className="font-black text-lg sm:text-xl mt-1 leading-8">{fa(rep.headline)}</h4>
          </header>
          <div className="p-5 space-y-5">
            {rep.summary && <p className="text-[12.5px] font-bold leading-8 text-[#3A241F]">{fa(rep.summary)}</p>}
            {(rep.kpis || []).length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                {(rep.kpis || []).slice(0, 6).map((k, i) => (
                  <div key={i} className="rounded-2xl border border-[#EBDBCE] bg-[#FAF5F1] px-3 py-2.5">
                    <div className="text-[10px] font-black text-[#8C6F66]">{fa(k.label)}</div>
                    <div className="text-base font-black text-[#3A241F] mt-0.5">{fa(k.value)}</div>
                    {k.note && <div className="text-[10px] font-bold text-[#8C6F66] mt-0.5 leading-5">{fa(k.note)}</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3"><div className="font-black text-xs text-emerald-800 mb-1.5 flex items-center gap-1.5"><ThumbsUp className="w-3.5 h-3.5" />نقاط قوت تیم</div><Bullets items={arr(rep.team?.strengths)} tone="text-emerald-900" /></div>
              <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3"><div className="font-black text-xs text-rose-800 mb-1.5 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />خطرها</div><Bullets items={arr(rep.team?.risks)} tone="text-rose-900" /></div>
              <div className="rounded-2xl bg-sky-50 border border-sky-200 p-3"><div className="font-black text-xs text-sky-800 mb-1.5 flex items-center gap-1.5"><Lightbulb className="w-3.5 h-3.5" />فرصت‌ها</div><Bullets items={arr(rep.team?.opportunities)} tone="text-sky-900" /></div>
            </div>
            {(rep.people || []).length > 0 && (
              <div>
                <h5 className="font-black text-[13px] text-[#3A241F] mb-2">کارنامهٔ هر نفر</h5>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {(rep.people || []).map((p, i) => (
                    <div key={i} className="rounded-2xl border border-[#EBDBCE] p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 rounded-full bg-[#6E1B1B] text-white font-black text-sm flex items-center justify-center shrink-0">{fa(String(p.rank ?? i + 1))}</span>
                        <span className="font-black text-sm text-[#3A241F] flex-1 truncate">{fa(p.name)}</span>
                        <span className={`text-[10px] font-black rounded-full px-2.5 py-0.5 ${GRADE_TONE(p.grade)}`}>{p.grade}</span>
                      </div>
                      {p.verdict && <p className="text-[11.5px] font-bold leading-6 text-[#5a3d35]">{fa(p.verdict)}</p>}
                      {arr(p.strengths).length > 0 && <div><div className="text-[10px] font-black text-emerald-700 mb-1">قوت‌ها</div><Bullets items={arr(p.strengths)} tone="text-[#3A241F]" /></div>}
                      {arr(p.weaknesses).length > 0 && <div><div className="text-[10px] font-black text-rose-700 mb-1">ضعف‌ها</div><Bullets items={arr(p.weaknesses)} tone="text-[#3A241F]" /></div>}
                      {arr(p.coaching).length > 0 && <div className="bg-violet-50 rounded-xl px-3 py-2"><div className="text-[10px] font-black text-violet-700 mb-1">توصیهٔ مربی‌گری</div><Bullets items={arr(p.coaching)} tone="text-violet-950" /></div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(rep.actions || []).length > 0 && (
              <div>
                <h5 className="font-black text-[13px] text-[#3A241F] mb-2 flex items-center gap-1.5"><Target className="w-4 h-4 text-[#D34A32]" />اقدام‌های پیشنهادی</h5>
                <ol className="space-y-2">
                  {(rep.actions || []).map((a, i) => (
                    <li key={i} className="flex gap-3 rounded-2xl border border-[#EBDBCE] bg-[#FAF5F1] px-3 py-2.5">
                      <span className="w-6 h-6 rounded-full bg-[#D34A32] text-white text-[11px] font-black flex items-center justify-center shrink-0">{fa(String(i + 1))}</span>
                      <div className="min-w-0">
                        <div className="font-black text-xs text-[#3A241F]">{fa(a.title)}</div>
                        <div className="text-[10.5px] font-bold text-[#8C6F66] leading-6">{[a.who, a.when].filter(Boolean).map((x) => fa(x)).join(' · ')}{a.why ? ` — ${fa(a.why)}` : ''}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#EBDBCE]">
              <button type="button" onClick={() => printHtml(rep, rangeLabel)} className="flex items-center gap-1.5 text-[11px] font-black text-[#3A241F] border border-[#EBDBCE] rounded-xl px-3 py-2 cursor-pointer"><Printer className="w-3.5 h-3.5" />چاپ / ذخیره PDF</button>
              <button type="button" onClick={() => { try { navigator.clipboard.writeText(JSON.stringify(rep, null, 2)); } catch { /* no clipboard */ } }} className="flex items-center gap-1.5 text-[11px] font-black text-[#3A241F] border border-[#EBDBCE] rounded-xl px-3 py-2 cursor-pointer"><Copy className="w-3.5 h-3.5" />کپی</button>
              <span className="text-[10px] font-bold text-[#8C6F66] flex-1 min-w-[200px]">این گزارش را هوش مصنوعی از روی همین اعداد نوشته؛ پیش از تصمیم‌گیری با واقعیت تطبیق دهید.</span>
            </div>
          </div>
        </article>
      )}
    </div>
  );
};
