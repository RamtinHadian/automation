import React, { useState } from 'react';
import { CalendarSearch, Loader2, Sparkles } from 'lucide-react';
import fontUrl from 'vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2?url';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, jalaliizeText, todayIso } from '../../lib/taskDates';
import { User } from '../../types';
import { JalaliDateField } from '../tasks/TasksView';
import { noteHtml, showInTab, whenText } from './AiSalesReport';

interface DailyStats {
  from: string;
  to: string;
  workdays: number;
  reports: number;
  totalHours: number;
  people: { name: string; reports: number; expectedDays: number; hours: number; items: number; done: number; inProgress: number; blocked: number; blockerNotes: number }[];
  status: { DONE: number; IN_PROGRESS: number; BLOCKED: number };
  trend: { date: string; reports: number; hours: number }[];
  blockers: { name: string; date: string; text: string }[];
  noReportAtAll: string[];
}
interface DailyAi {
  headline?: string;
  mood?: 'good' | 'ok' | 'bad';
  summary?: string;
  comments?: Record<string, string>;
  themes?: { title: string; detail?: string }[];
  team?: { strengths?: string[]; risks?: string[]; opportunities?: string[] };
  people?: { name: string; grade?: string; verdict?: string; strengths?: string[]; weaknesses?: string[]; coaching?: string[] }[];
  actions?: { title: string; who?: string; why?: string; when?: string }[];
}
interface DailyResult { createdAt: string; stats: DailyStats; report: DailyAi }

const tx = (s?: string) => toPersianDigits(jalaliizeText(s || ''));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const arr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v) => typeof v === 'string') : []);
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const hrs = (n: number) => toPersianDigits(Math.round(n * 10) / 10);

/** The whole analysis as one page of its own (charts of the real numbers, the AI's words under each, the time it was made). */
const dailyHtml = (res: DailyResult): string => {
  const s = res.stats;
  const rep = res.report;
  const cm = rep.comments || {};
  const w = whenText(res.createdAt);
  const stamp = `این تحلیل مربوط به تاریخ ${w.date} ساعت ${w.time} است · گزارش‌های روزانهٔ ${formatTaskDate(s.from)} تا ${formatTaskDate(s.to)}`;
  const li = (xs: string[]) => (xs.length ? `<ul>${xs.map((x) => `<li>${esc(tx(x))}</li>`).join('')}</ul>` : '');
  const bar = (label: string, v: number, max: number, text: string, color: string) => `<div class="b"><span class="l">${esc(tx(label))}</span><span class="t"><i style="width:${Math.max(2, (v / Math.max(max, 1)) * 100)}%;background:${color}"></i></span><span class="n">${esc(tx(text))}</span></div>`;
  const card = (title: string, body: string, comment?: string) => `<div class="ch"><h3>${esc(title)}</h3>${body}${comment ? `<p class="ins">${esc(tx(comment))}</p>` : ''}</div>`;
  const maxH = Math.max(...s.people.map((p) => p.hours), 1);
  const doneAll = s.status.DONE + s.status.IN_PROGRESS + s.status.BLOCKED;
  const pct = (n: number) => (doneAll ? Math.round((n * 100) / doneAll) : 0);
  const stacked = (p: DailyStats['people'][number]) => {
    const tot = Math.max(p.items, 1);
    return `<div class="b"><span class="l">${esc(tx(p.name))}</span><span class="t st"><i style="width:${(p.done / tot) * 100}%;background:#0f766e"></i><i style="width:${(p.inProgress / tot) * 100}%;background:#f59e0b"></i><i style="width:${(p.blocked / tot) * 100}%;background:#dc2626"></i></span><span class="n">${esc(tx(`${p.done}/${p.items}`))}</span></div>`;
  };
  const maxTrend = Math.max(...s.trend.map((d) => d.hours), 1);
  const cols = s.trend.map((d) => `<div class="col"><div class="cb" style="height:${Math.max(3, (d.hours / maxTrend) * 100)}px" title="${esc(tx(`${formatTaskDate(d.date)}: ${d.reports} گزارش، ${hrs(d.hours)} ساعت`))}"></div><small>${esc(tx(formatTaskDate(d.date).split(' ').slice(0, 2).join(' ')))}</small><b>${esc(tx(String(d.reports)))}</b></div>`).join('');
  const kp: string[][] = [['گزارش ثبت‌شده', toPersianDigits(s.reports)], ['همکار گزارش‌دهنده', toPersianDigits(s.people.length)], ['مجموع ساعت ثبت‌شده', hrs(s.totalHours)], ['کارهای انجام‌شده', `${toPersianDigits(pct(s.status.DONE))}٪`], ['گزارش دارای مانع', toPersianDigits(s.people.reduce((a, p) => a + p.blockerNotes, 0))]];
  return `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>تحلیل هوشمند گزارش‌های روزانه</title><style>
@font-face{font-family:'Vazirmatn';src:url('${location.origin}${fontUrl}') format('woff2');font-weight:100 900}
@page{size:A4;margin:12mm}@media screen{body{max-width:980px;margin:0 auto;padding:18px;background:#fdfaf7}.toolbar{text-align:left;margin-bottom:10px}.toolbar button{font-family:inherit;background:#6E1B1B;color:#fff;border:0;border-radius:10px;padding:8px 18px;font-weight:800;cursor:pointer}}@media print{.toolbar{display:none}}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:'Vazirmatn',Tahoma,sans-serif;color:#2b1d19;line-height:1.9;font-size:12px}
h1,h2,h3,b,button{font-family:'Vazirmatn',Tahoma,sans-serif}.hd{background:linear-gradient(135deg,#1e3a5f,#2a78d6);color:#fff;border-radius:14px;padding:18px 22px}.hd small{opacity:.9;display:block}.hd h1{margin:4px 0 0;font-size:20px}
.when{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:6px 12px;margin:10px 0;color:#4c1d95;font-weight:700;font-size:11.5px}
h2{font-size:14px;margin:18px 0 6px;color:#1e3a5f;border-right:4px solid #2a78d6;padding-right:8px}
.k{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.k div{flex:1 1 18%;border:1px solid #dbe5f1;border-radius:10px;padding:8px 10px;text-align:center}.k b{display:block;font-size:16px}.k small{color:#5b6b7e}
.ch{border:1px solid #dbe5f1;border-radius:12px;padding:10px 14px;margin:10px 0;page-break-inside:avoid;background:#fff}.ch h3{margin:0 0 6px;font-size:12.5px}
.b{display:flex;align-items:center;gap:8px;margin:3px 0}.l{width:110px;font-size:11px;font-weight:700}.t{flex:1;background:#eef3f9;border-radius:6px;height:12px;display:flex;overflow:hidden}.t i{display:block;height:12px}.n{width:90px;font-size:11px;font-weight:800;text-align:left}
.cols{display:flex;gap:6px;align-items:flex-end;height:150px;overflow-x:auto;padding-bottom:4px}.col{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;min-width:34px;font-size:10px}.cb{width:20px;background:#2a78d6;border-radius:5px 5px 0 0}.col small{color:#5b6b7e;white-space:nowrap}
.lg{font-size:10.5px;color:#5b6b7e;margin:2px 0 6px}.lg span{display:inline-block;width:9px;height:9px;border-radius:3px;margin:0 8px 0 3px}
.ins{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:6px 10px;margin:8px 0 0;color:#3b0764;font-weight:600}
.p{border:1px solid #dbe5f1;border-radius:12px;padding:10px 14px;margin:8px 0;page-break-inside:avoid;background:#fff}.p h3{margin:0 0 4px;font-size:13px}.g{display:inline-block;background:#e8eef7;border-radius:99px;padding:0 10px;font-size:11px;margin-right:6px}ul{margin:2px 0;padding-right:18px}
.c{display:flex;gap:10px}.c>div{flex:1;border-radius:10px;padding:8px 12px}.s{background:#ecfdf5}.r{background:#fef2f2}.o{background:#eff6ff}
.a{border-bottom:1px dashed #dbe5f1;padding:5px 0}.ft{margin-top:18px;font-size:10px;color:#5b6b7e;text-align:center}.bl{border-bottom:1px dashed #f0d4d4;padding:3px 0;font-size:11px}
</style></head><body>
<div class="toolbar"><button onclick="print()">چاپ / ذخیره PDF</button></div>
<div class="hd"><small>تحلیل هوشمند گزارش‌های روزانهٔ همکاران · ${esc(tx(`${formatTaskDate(s.from)} تا ${formatTaskDate(s.to)}`))}</small><h1>${esc(tx(rep.headline || 'تحلیل گزارش‌های روزانه'))}</h1></div>
<div class="when">⏱ ${esc(stamp)}</div>
<p>${esc(tx(rep.summary || ''))}</p>
<div class="k">${kp.map(([l, v]) => `<div><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join('')}</div>
<h2>نمودارها و تحلیل</h2>
${card('ساعت ثبت‌شدهٔ هر همکار', s.people.map((p) => bar(p.name, p.hours, maxH, `${hrs(p.hours)} ساعت`, '#2a78d6')).join(''), cm.hours)}
${card(`نظم گزارش‌دادن (از ${toPersianDigits(s.workdays)} روز کاری بازه)`, s.people.map((p) => bar(p.name, p.reports, Math.max(s.workdays, 1), `${p.reports} روز`, '#4a3aa7')).join('') + ((s.noReportAtAll || []).length ? `<p class="lg">بدون هیچ گزارش در بازه: ${esc(tx((s.noReportAtAll || []).join('، ')))}</p>` : ''), cm.regularity)}
${card('وضعیت کارهای گزارش‌شده', `<div class="lg"><span style="background:#0f766e"></span>انجام شد (${esc(toPersianDigits(pct(s.status.DONE)))}٪)<span style="background:#f59e0b"></span>در جریان (${esc(toPersianDigits(pct(s.status.IN_PROGRESS)))}٪)<span style="background:#dc2626"></span>گیرکرده (${esc(toPersianDigits(pct(s.status.BLOCKED)))}٪)</div>` + s.people.map(stacked).join(''), cm.status)}
${s.trend.length > 1 ? card('روند روزانه (ارتفاع ستون: ساعت ثبت‌شده، عدد زیر: تعداد گزارش)', `<div class="cols">${cols}</div>`, cm.trend) : ''}
${(s.blockers || []).length ? card('موانعی که همکاران نوشته‌اند', (s.blockers || []).map((b) => `<div class="bl"><b>${esc(tx(b.name))}</b> · ${esc(tx(formatTaskDate(b.date)))}: ${esc(tx(b.text))}</div>`).join(''), cm.blockers) : ''}
${(rep.themes || []).length ? `<h2>موضوع‌های اصلی کار تیم</h2>${(rep.themes || []).map((t) => `<div class="a"><b>${esc(tx(t.title))}</b>${t.detail ? ` — ${esc(tx(t.detail))}` : ''}</div>`).join('')}` : ''}
<h2>تیم در یک نگاه</h2><div class="c"><div class="s"><b>نقاط قوت</b>${li(arr(rep.team?.strengths))}</div><div class="r"><b>خطرها</b>${li(arr(rep.team?.risks))}</div><div class="o"><b>فرصت‌ها</b>${li(arr(rep.team?.opportunities))}</div></div>
<h2>کارنامهٔ هر نفر</h2>
${(rep.people || []).map((p) => `<div class="p"><h3>${esc(tx(p.name))}<span class="g">${esc(p.grade || '')}</span></h3><div>${esc(tx(p.verdict || ''))}</div>${p.strengths?.length ? `<b>قوت‌ها</b>${li(arr(p.strengths))}` : ''}${p.weaknesses?.length ? `<b>ضعف‌ها</b>${li(arr(p.weaknesses))}` : ''}${p.coaching?.length ? `<b>توصیهٔ مربی‌گری</b>${li(arr(p.coaching))}` : ''}</div>`).join('')}
<h2>اقدام‌های پیشنهادی</h2>${(rep.actions || []).map((x, i) => `<div class="a"><b>${esc(tx(String(i + 1)))}. ${esc(tx(x.title))}</b> — ${esc(tx(x.who || ''))} · ${esc(tx(x.when || ''))}<br>${esc(tx(x.why || ''))}</div>`).join('')}
<div class="ft">${esc(stamp)}. نمودارها از گزارش‌های ثبت‌شده در هورمند ساخته شده و شرح‌ها را هوش مصنوعی نوشته است؛ ساعت‌ها را خود همکاران نوشته‌اند. پیش از تصمیم‌گیری با واقعیت تطبیق دهید.</div>
</body></html>`;
};

/** «تحلیل گزارش‌های روزانه با هوش مصنوعی»: choose the dates (and, if wished, one person); the analysis opens in a page of its own. */
export const AiDailyReport: React.FC<{ staff: User[] }> = ({ staff }) => {
  const [from, setFrom] = useState<string | undefined>(() => addDays(todayIso(), -6));
  const [to, setTo] = useState<string | undefined>(() => todayIso());
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async () => {
    if (!from || !to) { setErr('تاریخ شروع و پایان را انتخاب کنید.'); return; }
    const w = window.open('', '_blank');
    if (w) showInTab(w, noteHtml('در حال خواندن گزارش‌های روزانه و تحلیل با هوش مصنوعی… این صفحه تا دو دقیقه منتظر می‌ماند و خودش تحلیل را نشان می‌دهد.', 'wait'));
    setBusy(true);
    setErr('');
    try {
      const res = await api.reportAiDaily({ from, to, userId: userId || undefined });
      if (w && !w.closed) showInTab(w, dailyHtml(res as DailyResult));
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'تحلیل انجام نشد.';
      setErr(msg);
      if (w && !w.closed) showInTab(w, noteHtml(msg, 'error'));
    } finally {
      setBusy(false);
    }
  };
  const preset = (days: number) => { setTo(todayIso()); setFrom(addDays(todayIso(), -(days - 1))); };
  const chip = 'px-3 py-1.5 rounded-xl border border-[#EBDBCE] bg-white text-[11px] font-black text-[#3A241F] cursor-pointer';
  return (
    <section className="rounded-3xl border border-sky-200 bg-gradient-to-l from-sky-50 to-white p-4 space-y-3" data-ai-daily>
      <div>
        <div className="font-black text-sm text-sky-900 flex items-center gap-2"><CalendarSearch className="w-4 h-4" />تحلیل گزارش‌های روزانه با هوش مصنوعی</div>
        <p className="text-[11px] font-bold text-sky-900/80 leading-6 mt-0.5">بازهٔ تاریخ را بدهید؛ هوش مصنوعی گزارش‌های روزانهٔ همان بازه (فقط آن‌هایی که شما اجازهٔ دیدنشان را دارید) را می‌خواند و در یک صفحهٔ تازه تحلیل می‌کند: حجم کار و ساعت هر نفر، نظم گزارش‌دادن، وضعیت کارها، روند روزانه، موانع، موضوع‌های اصلی کار و پیشنهاد اقدام. متن گزارش‌ها برای تحلیل به سرویس هوش مصنوعی فرستاده می‌شود.</p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div><span className="block text-[10px] font-black text-[#8C6F66] mb-1">از تاریخ</span><JalaliDateField value={from} onChange={setFrom} /></div>
        <div><span className="block text-[10px] font-black text-[#8C6F66] mb-1">تا تاریخ</span><JalaliDateField value={to} onChange={setTo} /></div>
        <div>
          <span className="block text-[10px] font-black text-[#8C6F66] mb-1">همکار</span>
          <select className="p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] min-w-[150px]" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">همهٔ همکاران</option>
            {staff.filter((u) => u.isActive !== false).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </div>
        <div className="flex gap-1.5">
          <button type="button" className={chip} onClick={() => preset(1)}>امروز</button>
          <button type="button" className={chip} onClick={() => preset(7)}>۷ روز اخیر</button>
          <button type="button" className={chip} onClick={() => preset(30)}>۳۰ روز اخیر</button>
        </div>
        <button type="button" disabled={busy} onClick={run} data-ai-daily-run className="px-5 py-2.5 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-black cursor-pointer flex items-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {busy ? 'در حال تحلیل… (تا دو دقیقه)' : 'تحلیل کن'}
        </button>
      </div>
      {err && <div className="text-[12px] font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 leading-7" data-ai-error>{err}</div>}
    </section>
  );
};
