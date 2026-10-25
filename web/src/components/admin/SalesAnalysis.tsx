import React, { useMemo, useState } from 'react';
import { Activity, AlertTriangle, BookOpen, CheckCircle2, Gauge, Hourglass, Info, Target, Timer, TrendingUp, Trophy, Wallet } from 'lucide-react';
import { CrmActivity, Customer, Deal, User } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { toDisplay, unitName } from '../../lib/money';
import { analyzeTeam, PROFILE_INFO, RepRow, STAGE_PROB, STALE_DAYS } from '../../lib/salesAnalysis';
import { AiSalesReport } from './AiSalesReport';
import { C, ChartCard, compact, fa, HBars, Kpi } from './charts';

const compactM = (n: number) => compact(toDisplay(n));
const pc = (x: number | null) => (x === null ? '—' : `${toPersianDigits(Math.round(x * 100))}٪`);
const dayText = (x: number | null) => (x === null ? '—' : `${toPersianDigits(Math.round(x))} روز`);
const STAGE_LABEL: Record<string, string> = { NEW: 'جدید', CONTACTED: 'تماس گرفته شد', PROPOSAL: 'پیشنهاد ارسال شد', NEGOTIATION: 'مذاکره' };
const STAGE_COLOR: Record<string, string> = { NEW: '#94a3b8', CONTACTED: '#0ea5e9', PROPOSAL: '#8b5cf6', NEGOTIATION: '#f59e0b' };

type SortKey = 'score' | 'won' | 'winRate' | 'wonValue' | 'avgDeal' | 'cycleDays' | 'open' | 'stale' | 'activities' | 'activeDays' | 'newCustomers';

/** «تحلیل فروش همکاران»: the team's selling measured the way the sales-management books measure it. */
export const SalesAnalysis: React.FC<{ staff: User[]; deals: Deal[]; customers: Customer[]; activities: CrmActivity[]; days: number; rangeLabel: string; seesTotals: boolean }> = ({ staff, deals, customers, activities, days, rangeLabel, seesTotals }) => {
  const a = useMemo(() => analyzeTeam({ staff, deals, customers, activities, days }), [staff, deals, customers, activities, days]);
  const [sort, setSort] = useState<SortKey>('score');
  const [asc, setAsc] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showBooks, setShowBooks] = useState(false);

  const rows = useMemo(() => {
    const v = (r: RepRow) => (r[sort] === null ? -1 : (r[sort] as number));
    return [...a.rows].sort((x, y) => (asc ? v(x) - v(y) : v(y) - v(x)));
  }, [a.rows, sort, asc]);
  const th = (key: SortKey, label: string) => (
    <th className="px-2.5 py-2 font-black text-[10px] text-[#8C6F66] whitespace-nowrap">
      <button type="button" onClick={() => (sort === key ? setAsc(!asc) : (setSort(key), setAsc(false)))} className={`cursor-pointer ${sort === key ? 'text-[#6E1B1B]' : ''}`}>
        {label}
        {sort === key ? (asc ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  );
  const t = a.total;
  const actColors = { calls: C.blue, meetings: C.green, notes: C.yellow, quotes: C.orange, followups: C.violet };

  if (a.rows.length === 0) {
    return (
      <section className="space-y-3" data-sales-analysis>
        <h3 className="font-black text-sm text-[#3A241F]">تحلیل فروش همکاران</h3>
        <div className="rounded-3xl border border-dashed border-[#EBDBCE] py-10 text-center text-xs font-bold text-gray-400">هنوز فرصت فروش یا فعالیتی برای تحلیل ثبت نشده است.</div>
      </section>
    );
  }

  return (
    <section className="space-y-4" data-sales-analysis>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-600" />تحلیل فروش همکاران</h3>
          <p className="text-[11px] text-[#8C6F66] mt-0.5 max-w-3xl leading-6">عملکرد هر فروشنده در {rangeLabel} اخیر با معیارهایی که کتاب‌های مدیریت فروش بر آن‌ها بنا شده‌اند: تبدیل و نرخ موفقیت، اندازهٔ فروش و طول چرخهٔ فروش، سرعت فروش، سلامت قیف، فعالیت روزانه و انضباط پیگیری. زیر هر نفر توصیهٔ مربی‌گری هست.</p>
        </div>
        <button type="button" onClick={() => setShowBooks(!showBooks)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black border border-[#EBDBCE] bg-white cursor-pointer text-[#3A241F]" data-books-toggle>
          <BookOpen className="w-3.5 h-3.5" />
          مبانی و روش محاسبه
        </button>
      </div>

      {showBooks && <Methodology seesTotals={seesTotals} />}

      <AiSalesReport analysis={a} days={days} rangeLabel={rangeLabel} seesTotals={seesTotals} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-sales-kpis>
        <Kpi accent={C.green} icon={<Target className="w-5 h-5" />} label="نرخ موفقیت تیم" value={pc(t.winRate)} sub={`${fa(t.won)} موفق · ${fa(t.lost)} از دست رفته`} tone={t.winRate !== null && t.winRate >= 0.5 ? 'good' : 'plain'} />
        <Kpi accent={C.orange} icon={<Timer className="w-5 h-5" />} label="متوسط چرخهٔ فروش" value={dayText(t.cycleDays)} sub="از ساخت فرصت تا فروش موفق" />
        <Kpi accent={C.red} icon={<Hourglass className="w-5 h-5" />} label="فرصت‌های بی‌حرکت" value={fa(t.stale)} sub={t.open ? `${toPersianDigits(Math.round((t.stale / t.open) * 100))}٪ از ${fa(t.open)} فرصت باز (بیش از ${toPersianDigits(STALE_DAYS)} روز)` : 'فرصت بازی نیست'} tone={t.open && t.stale / t.open > 0.3 ? 'bad' : 'plain'} />
        <Kpi accent={C.violet} icon={<Activity className="w-5 h-5" />} label="فعالیت ثبت‌شده" value={fa(t.activities)} sub="تماس، جلسه، یادداشت، قیمت و پیگیری" />
        {seesTotals && <Kpi accent={C.blue} icon={<Wallet className="w-5 h-5" />} label={`متوسط فروش (${unitName()})`} value={t.avgDeal === null ? '—' : compactM(t.avgDeal)} sub={`مجموع ${compactM(t.wonValue)} ${unitName()}`} />}
        {seesTotals && <Kpi accent={C.aqua} icon={<Gauge className="w-5 h-5" />} label={`سرعت فروش (${unitName()} در روز)`} value={t.velocity === null ? '—' : compactM(t.velocity)} sub="فرصت × نرخ موفقیت × متوسط فروش ÷ چرخه" />}
        {seesTotals && <Kpi accent={C.yellow} icon={<TrendingUp className="w-5 h-5" />} label={`قیف وزنی (${unitName()})`} value={compactM(t.weighted)} sub={a.coverageMonths === null ? `از ${compactM(t.openValue)} فرصت باز` : `حدود ${toPersianDigits(a.coverageMonths.toFixed(1))} برابر فروش ۳۰ روز اخیر`} />}
        <Kpi accent={C.magenta} icon={<CheckCircle2 className="w-5 h-5" />} label="فرصت تازه ساخته‌شده" value={fa(t.created)} sub={`در ${rangeLabel} اخیر`} />
      </div>

      <div className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm overflow-hidden" data-sales-scorecard>
        <div className="px-5 pt-4 pb-2">
          <h4 className="font-black text-[13px] text-[#3A241F]">کارنامهٔ هر فروشنده</h4>
          <p className="text-[11px] text-[#8C6F66] mt-0.5">روی سرِ هر ستون بزنید تا مرتب شود؛ روی نام بزنید تا توصیهٔ مربی‌گری او باز شود. امتیاز: نتیجه ۴۰٪، فعالیت ۳۰٪، انضباط قیف ۳۰٪.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[1000px]">
            <thead>
              <tr className="border-y border-[#EBDBCE] bg-[#FAF5F1]/70 text-right">
                <th className="px-2.5 py-2 font-black text-[10px] text-[#8C6F66]">فروشنده</th>
                {th('score', 'امتیاز')}
                {th('won', 'فروش موفق')}
                {th('winRate', 'نرخ موفقیت')}
                {seesTotals && th('wonValue', `مبلغ فروش (${unitName()})`)}
                {seesTotals && th('avgDeal', 'متوسط فروش')}
                {th('cycleDays', 'چرخهٔ فروش')}
                {th('open', 'فرصت باز')}
                {th('stale', 'بی‌حرکت')}
                {th('activities', 'فعالیت')}
                {th('activeDays', 'روز فعال')}
                {th('newCustomers', 'مشتری تازه')}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F3E8DF]">
              {rows.map((r) => {
                const p = PROFILE_INFO[r.profile];
                return (
                  <React.Fragment key={r.id}>
                    <tr className="hover:bg-[#FAF5F1]/50">
                      <td className="px-2.5 py-2.5">
                        <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="text-right cursor-pointer" data-rep-open={r.id}>
                          <div className="font-black text-[#3A241F] text-xs">{r.name}</div>
                          <span className={`inline-block mt-0.5 text-[10px] font-black border rounded-full px-2 py-0.5 ${p.tone}`} title={p.hint}>{p.label}</span>
                        </button>
                      </td>
                      <td className="px-2.5 py-2.5"><ScoreBadge score={r.score} /></td>
                      <td className="px-2.5 py-2.5 font-black">{fa(r.won)}</td>
                      <td className="px-2.5 py-2.5 font-bold">{pc(r.winRate)}</td>
                      {seesTotals && <td className="px-2.5 py-2.5 font-bold">{compactM(r.wonValue)}</td>}
                      {seesTotals && <td className="px-2.5 py-2.5">{r.avgDeal === null ? '—' : compactM(r.avgDeal)}</td>}
                      <td className="px-2.5 py-2.5">{dayText(r.cycleDays)}</td>
                      <td className="px-2.5 py-2.5">{fa(r.open)}</td>
                      <td className={`px-2.5 py-2.5 font-bold ${r.stale ? 'text-rose-600' : ''}`}>{fa(r.stale)}</td>
                      <td className="px-2.5 py-2.5">{fa(r.activities)}</td>
                      <td className="px-2.5 py-2.5">{fa(r.activeDays)}</td>
                      <td className="px-2.5 py-2.5">{fa(r.newCustomers)}</td>
                    </tr>
                    {open === r.id && (
                      <tr className="bg-[#FAF5F1]/60" data-rep-detail={r.id}>
                        <td colSpan={seesTotals ? 12 : 10} className="px-4 py-3">
                          <RepDetail r={r} seesTotals={seesTotals} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="فعالیت هر فروشنده" subtitle="تماس، جلسه، یادداشت، قیمت و پیگیری؛ هر چه قیف پُرتر، فروش آینده بیشتر" legend={[{ label: 'تماس', color: actColors.calls }, { label: 'جلسه', color: actColors.meetings }, { label: 'یادداشت', color: actColors.notes }, { label: 'قیمت', color: actColors.quotes }, { label: 'پیگیری', color: actColors.followups }]}>
          <HBars rows={a.rows.map((r) => ({ label: r.name, segments: [{ value: r.calls, color: actColors.calls, name: 'تماس' }, { value: r.meetings, color: actColors.meetings, name: 'جلسه' }, { value: r.notes, color: actColors.notes, name: 'یادداشت' }, { value: r.quotes, color: actColors.quotes, name: 'قیمت' }, { value: r.followups, color: actColors.followups, name: 'پیگیری' }], note: `${toPersianDigits(r.activeDays)} روز فعال` }))} empty="فعالیتی ثبت نشده است." />
        </ChartCard>
        <ChartCard title="نرخ موفقیت" subtitle="فروش موفق از موفق و از دست رفته؛ عدد کنار هر ردیف تعداد فروش‌های بسته‌شده است">
          <HBars format={(v) => `${toPersianDigits(v)}٪`} rows={[...a.rows].filter((r) => r.winRate !== null).sort((x, y) => (y.winRate || 0) - (x.winRate || 0)).map((r) => ({ label: r.name, segments: [{ value: Math.round((r.winRate || 0) * 100), color: C.green }], note: `${toPersianDigits(r.won + r.lost)} بسته` }))} empty="فروش بسته‌شده‌ای نیست." />
        </ChartCard>
        {seesTotals && (
          <ChartCard title={`مبلغ فروش موفق (${unitName()})`} subtitle={`${rangeLabel} اخیر؛ عدد کنار هر ردیف متوسط هر فروش است`}>
            <HBars format={(v) => compactM(v)} rows={[...a.rows].filter((r) => r.wonValue > 0).sort((x, y) => y.wonValue - x.wonValue).map((r) => ({ label: r.name, segments: [{ value: r.wonValue, color: C.blue }], note: r.avgDeal ? compactM(r.avgDeal) : undefined }))} empty="فروش موفقی در این بازه نیست." />
          </ChartCard>
        )}
        <ChartCard title="قیف باز هر فروشنده" subtitle="تعداد فرصت‌های باز در هر مرحله" legend={Object.keys(STAGE_LABEL).map((k) => ({ label: STAGE_LABEL[k], color: STAGE_COLOR[k] }))}>
          <HBars rows={a.rows.filter((r) => r.open > 0).map((r) => ({ label: r.name, segments: Object.keys(STAGE_LABEL).map((k) => ({ value: r.stageOpen[k] || 0, color: STAGE_COLOR[k], name: STAGE_LABEL[k] })), note: r.stale ? `${toPersianDigits(r.stale)} بی‌حرکت` : undefined }))} empty="فرصت بازی نیست." />
        </ChartCard>
        <ChartCard title="متوسط چرخهٔ فروش (روز)" subtitle="از ساخت فرصت تا فروش موفق؛ کوتاه‌تر بهتر است">
          <HBars format={(v) => toPersianDigits(v)} rows={[...a.rows].filter((r) => r.cycleDays !== null).sort((x, y) => (x.cycleDays || 0) - (y.cycleDays || 0)).map((r) => ({ label: r.name, segments: [{ value: Math.round(r.cycleDays || 0), color: C.orange }], note: `${toPersianDigits(r.won)} فروش` }))} empty="فروش بسته‌شده‌ای نیست." />
        </ChartCard>
        <ChartCard title="چرا فروش از دست می‌رود؟" subtitle={`دلایل ثبت‌شدهٔ ${rangeLabel} اخیر؛ برای مربی‌گری و اصلاح قیمت و محصول`}>
          <HBars rows={a.lossReasons.slice(0, 8).map((l) => ({ label: l.label, segments: [{ value: l.count, color: C.red }], note: seesTotals ? `${compactM(l.value)} ${unitName()}` : undefined }))} empty="فروش از دست‌رفته‌ای ثبت نشده است." />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="فرصت‌های کهنه (نیازمند تصمیم)" subtitle={`باز و بیش از ${toPersianDigits(STALE_DAYS)} روز بی‌حرکت؛ قدیمی‌ترین‌ها اول`}>
          {a.staleDeals.length === 0 ? (
            <div className="py-8 text-center text-xs font-bold text-emerald-700">فرصت کهنه‌ای نیست؛ قیف سالم است.</div>
          ) : (
            <div className="divide-y divide-[#F3E8DF]" data-stale-list>
              {a.staleDeals.map((d) => (
                <div key={d.id} className="flex items-center gap-3 py-2 text-[11px]">
                  <span className="w-1.5 h-8 rounded-full shrink-0" style={{ background: STAGE_COLOR[d.stage] }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-black text-[#3A241F] truncate">{d.title}</div>
                    <div className="text-[10px] text-[#8C6F66] truncate">{d.customerName} · {d.ownerName} · {STAGE_LABEL[d.stage]}{seesTotals ? ` · ${compactM(d.amount)} ${unitName()}` : ''}</div>
                  </div>
                  <span className="shrink-0 text-rose-600 font-black">{toPersianDigits(d.idleDays)} روز</span>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
        {seesTotals && (
          <ChartCard title="تمرکز فروش روی مشتریان" subtitle="اصل ۸۰/۲۰: چند مشتری چه سهمی از فروش موفق دارند">
            {a.concentration ? (
              <div className="space-y-3" data-concentration>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[['بزرگ‌ترین مشتری', a.concentration.share1], ['سه مشتری برتر', a.concentration.share3], ['پنج مشتری برتر', a.concentration.share5]].map(([l, v]) => (
                    <div key={String(l)} className="rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE] py-2.5">
                      <div className="text-lg font-black text-[#3A241F]">{pc(v as number)}</div>
                      <div className="text-[10px] font-bold text-[#8C6F66]">{l}</div>
                    </div>
                  ))}
                </div>
                <HBars format={(v) => compactM(v)} rows={a.concentration.top.map((x) => ({ label: x.name, segments: [{ value: x.value, color: C.violet }] }))} />
                {a.concentration.share3 >= 0.6 && (
                  <div className="flex items-start gap-2 text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    بیش از ۶۰٪ فروش به سه مشتری وابسته است؛ از دست رفتن یکی‌شان فروش را به‌شدت کم می‌کند. مشتریان تازه را جدی‌تر دنبال کنید.
                  </div>
                )}
              </div>
            ) : (
              <div className="py-8 text-center text-xs font-bold text-gray-400">فروش موفقی در این بازه نیست.</div>
            )}
          </ChartCard>
        )}
      </div>

      <div className="space-y-3" data-coaching>
        <h4 className="font-black text-[13px] text-[#3A241F] flex items-center gap-2"><Info className="w-4 h-4 text-sky-600" />توصیهٔ مربی‌گری برای هر فروشنده</h4>
        <p className="text-[11px] text-[#8C6F66] -mt-1">از روی همین اعداد ساخته می‌شود و زیر هر توصیه، ایدهٔ کتابی که بر آن بنا شده نوشته شده است. این‌ها پیشنهاد گفت‌وگوی مدیر با فروشنده‌اند، نه حکم.</p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {a.rows.map((r) => (
            <div key={r.id} className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-4 space-y-2" data-coach-card={r.id}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ScoreBadge score={r.score} />
                  <span className="font-black text-[13px] text-[#3A241F] truncate">{r.name}</span>
                </div>
                <span className={`shrink-0 text-[10px] font-black border rounded-full px-2 py-0.5 ${PROFILE_INFO[r.profile].tone}`}>{PROFILE_INFO[r.profile].label}</span>
              </div>
              <p className="text-[10px] text-[#8C6F66]">{PROFILE_INFO[r.profile].hint}</p>
              <TipList r={r} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const ScoreBadge: React.FC<{ score: number }> = ({ score }) => (
  <span className={`inline-flex items-center justify-center min-w-[38px] h-7 rounded-xl text-xs font-black px-2 ${score >= 70 ? 'bg-emerald-100 text-emerald-800' : score >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{toPersianDigits(score)}</span>
);

const TipList: React.FC<{ r: RepRow }> = ({ r }) => (
  <div className="space-y-2">
    {r.tips.map((tp, i) => (
      <div key={i} className={`rounded-2xl border px-3 py-2 ${tp.tone === 'good' ? 'bg-emerald-50/60 border-emerald-200' : tp.tone === 'warn' ? 'bg-amber-50/60 border-amber-200' : 'bg-sky-50/60 border-sky-200'}`}>
        <div className="text-[12px] leading-6 text-[#3A241F] font-medium">{tp.text}</div>
        <div className="text-[10px] font-bold text-[#8C6F66] mt-0.5 flex items-start gap-1"><BookOpen className="w-3 h-3 mt-0.5 shrink-0" />{tp.basis}</div>
      </div>
    ))}
  </div>
);

const RepDetail: React.FC<{ r: RepRow; seesTotals: boolean }> = ({ r, seesTotals }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-[11px]">
    <div className="space-y-1.5 text-[#3A241F]">
      <div className="font-black text-xs">اعداد کامل</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span>فرصت تازه: <b>{fa(r.created)}</b></span>
        <span>پیش‌فاکتور: <b>{fa(r.proformas)}</b></span>
        <span>تماس: <b>{fa(r.calls)}</b></span>
        <span>جلسه: <b>{fa(r.meetings)}</b></span>
        <span>یادداشت: <b>{fa(r.notes)}</b></span>
        <span>قیمت‌دهی: <b>{fa(r.quotes)}</b></span>
        <span>پیگیری ثبت‌شده: <b>{fa(r.followups)}</b></span>
        <span>پیگیری عقب‌افتاده: <b className={r.followupsOverdue ? 'text-rose-600' : ''}>{fa(r.followupsOverdue)}</b></span>
        <span>گذشته از تاریخ بستن: <b className={r.overdueClose ? 'text-rose-600' : ''}>{fa(r.overdueClose)}</b></span>
        <span>از دست رفته: <b>{fa(r.lost)}</b>{r.topLoss ? ` (بیشتر: ${r.topLoss})` : ''}</span>
        {seesTotals && <span>قیف باز: <b>{compactM(r.openValue)}</b> {unitName()}</span>}
        {seesTotals && <span>قیف وزنی: <b>{compactM(r.weighted)}</b> {unitName()}</span>}
        {seesTotals && <span>سرعت فروش: <b>{r.velocity === null ? '—' : compactM(r.velocity)}</b></span>}
        {r.topCustomerShare !== null && <span>سهم بزرگ‌ترین مشتری: <b>{pc(r.topCustomerShare)}</b></span>}
      </div>
    </div>
    <TipList r={r} />
  </div>
);

const SOURCES: { book: string; idea: string; used: string }[] = [
  { book: 'SPIN Selling — نیل رکهم', idea: 'فروش‌های بزرگ با پرسیدن درست (موقعیت، مشکل، پیامد، نیاز-سود) بسته می‌شوند، نه با اصرار.', used: 'توصیه برای نرخ موفقیت پایین' },
  { book: 'The Challenger Sale — دیکسون و آدامسون', idea: 'برنده‌ها مشتری را آموزش می‌دهند، متناسب با او صحبت می‌کنند و کنترل روند فروش را در دست می‌گیرند.', used: 'توصیه برای چرخهٔ طولانی و قیمت‌دادن بدون تبدیل' },
  { book: 'Predictable Revenue — آرون راس', idea: 'فروش قابل‌پیش‌بینی از یک قیف پُر و پیگیری منظم می‌آید.', used: 'فرصت باز، پیگیری عقب‌افتاده و قیف خالی' },
  { book: 'The Sales Acceleration Formula — مارک روبرج', idea: 'مدیریت فروش بر پایهٔ داده؛ رفتار فروشنده‌های برنده را اندازه بگیرید و به بقیه یاد بدهید.', used: 'کارنامه، امتیاز و توصیهٔ «الگو کردن» برنده‌ها' },
  { book: 'Fanatical Prospecting — جب بلانت', idea: 'مشتری‌یابی روزانهٔ ثابت؛ قیف بدون فعالیت ثابت خشک می‌شود.', used: 'فعالیت و تعداد روزهای فعال' },
  { book: 'Gap Selling — کینان (Keenan)', idea: 'رقیب اصلی «تصمیم نگرفتن» است؛ فرصت بی‌گام‌بعدی معمولاً مرده است.', used: 'فرصت‌های بی‌حرکت' },
  { book: 'Never Split the Difference — کریس واس', idea: 'مذاکره با پرسش و گوش‌دادن، نه با تخفیف زودهنگام.', used: 'توصیه برای قیمت زیاد با تبدیل کم' },
  { book: 'The 80/20 Principle — ریچارد کوچ', idea: 'بخش کوچکی از مشتریان بخش بزرگی از نتیجه را می‌سازند؛ هم باید آن‌ها را نگه داشت هم وابسته نشد.', used: 'تمرکز فروش روی مشتریان' },
];

const Methodology: React.FC<{ seesTotals: boolean }> = ({ seesTotals }) => (
  <div className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-5 space-y-4 text-[12px] leading-6 text-[#3A241F]" data-methodology>
    <div>
      <h4 className="font-black text-[13px] mb-1">چطور محاسبه می‌شود</h4>
      <ul className="list-disc pr-5 space-y-1 text-[#52514e]">
        <li><b>نرخ موفقیت</b> = فروش موفق ÷ (فروش موفق + از دست رفته) در همین بازه، بر پایهٔ تاریخ بسته شدن فرصت.</li>
        <li><b>چرخهٔ فروش</b> = میانگین روزهای بین ساخته‌شدن فرصت و فروش موفق.</li>
        <li><b>فرصت بی‌حرکت</b> = فرصت بازی که {toPersianDigits(STALE_DAYS)} روز یا بیشتر هیچ تغییری نکرده.</li>
        {seesTotals && <li><b>سرعت فروش</b> = (فرصت تازه × نرخ موفقیت × متوسط فروش) ÷ طول چرخه؛ یعنی هر روز چه مبلغی از قیف به فروش می‌رسد.</li>}
        {seesTotals && <li><b>قیف وزنی</b>: مبلغ هر فرصت باز × شانس مرحله‌اش ({Object.entries(STAGE_PROB).map(([k, v]) => `${STAGE_LABEL[k]} ${toPersianDigits(Math.round(v * 100))}٪`).join('، ')}). این شانس‌ها فرض‌های رایج برای شروع‌اند و مقدار تقریبی دارند، نه پیش‌بینی قطعی.</li>}
        <li><b>فعالیت</b> = تماس، جلسه، یادداشت، قیمت‌دهی و پیگیری که خود شخص در سامانه ثبت کرده؛ <b>روز فعال</b> = تعداد روزهایی که حداقل یک فعالیت داشته.</li>
        <li><b>امتیاز</b> (۰ تا ۱۰۰) یک شاخص داخلی برای مقایسه است: ۴۰٪ نتیجه (نرخ موفقیت و تعداد فروش نسبت به بهترین)، ۳۰٪ فعالیت نسبت به بیشترین، ۳۰٪ انضباط (فرصت بی‌حرکت و پیگیری عقب‌افتاده کمتر). وزن‌ها از کتاب نیامده‌اند.</li>
        <li><b>نوع شخصیت فروش</b>: فعالیت بالاتر یا پایین‌تر از میانهٔ تیم، در برابر نرخ موفقیت بالاتر یا پایین‌تر از میانگین شرکت: ستاره، پرتلاش با نتیجهٔ کم، گزینشی، نیازمند توجه.</li>
      </ul>
    </div>
    <div>
      <h4 className="font-black text-[13px] mb-1">ایده‌های کتاب‌هایی که توصیه‌ها بر آن‌ها بنا شده</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {SOURCES.map((s) => (
          <div key={s.book} className="rounded-2xl border border-[#EBDBCE] bg-[#FAF5F1]/60 px-3 py-2">
            <div className="font-black text-[12px]">{s.book}</div>
            <div className="text-[11px] text-[#52514e]">{s.idea}</div>
            <div className="text-[10px] font-bold text-[#8C6F66] mt-0.5">در این گزارش: {s.used}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] font-bold text-[#8C6F66] mt-2">این‌ها خلاصهٔ ایدهٔ اصلی هر کتاب‌اند، نقل‌قول نیستند. اعداد فقط از داده‌های همین سامانه می‌آیند؛ فروشنده‌ای که فعالیتش را ثبت نکند کم‌کار دیده می‌شود، پس ثبت لحظه‌ای در سامانه شرط دقیق بودن تحلیل است.</p>
    </div>
  </div>
);
