import React, { useEffect, useMemo, useState } from 'react';
import { Banknote, CalendarCheck, ClipboardCheck, FileSignature, PackageX, Phone, Send, TrendingUp, UserPlus, Users, Lightbulb, AlertTriangle } from 'lucide-react';
import { api, VoipStatRow } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { computeStats, shortDay, STAGE_LABEL } from '../../lib/adminStats';
import { toDisplay, unitName } from '../../lib/money';
import { C, ChartCard, Columns, compact, Donut, fa, HBars, Kpi, RAMP, TrendChart } from './charts';
import { missingStats } from '../../lib/missingItems';

const compactM = (n: number) => compact(toDisplay(n));

const RANGES = [
  { days: 7, label: '۷ روز' },
  { days: 30, label: '۳۰ روز' },
  { days: 90, label: '۹۰ روز' },
  { days: 365, label: 'یک سال' },
];

/** The management dashboard: the numbers and charts behind decisions about work, letters, sales and phone. */
export const ManagementReports: React.FC<{ remote?: boolean }> = () => {
  // Always read the whole company's numbers from the server, so it works in the user panel too (not only for admins).
  const [data, setData] = useState<Awaited<ReturnType<typeof api.statsData>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [range, setRange] = useState(30);
  const [calls, setCalls] = useState<VoipStatRow[]>([]);
  useEffect(() => {
    const load = () => {
      api.statsData().then((d) => { setData(d); setFailed(false); }).catch(() => setFailed(true));
      api.voipStats().then((s) => setCalls(s.byDay)).catch(() => {});
    };
    load();
    const t = window.setInterval(load, 60000);
    return () => window.clearInterval(t);
  }, []);
  const staffList = data?.staff ?? [];
  const transfers = data?.transfers ?? [];
  const tasks = data?.tasks ?? [];
  const reports = data?.reports ?? [];
  const customers = data?.customers ?? [];
  const deals = data?.deals ?? [];
  const missing = useMemo(() => missingStats(data?.missing ?? [], customers, range), [data?.missing, customers, range]);
  // the chart over time: a column per day up to a month, then per week (90 days) or per month (a year)
  const missingBuckets = useMemo(() => {
    const step = range <= 31 ? 1 : range <= 90 ? 7 : 30;
    const out: { label: string; value: number }[] = [];
    for (let i = 0; i < missing.perDay.length; i += step) {
      const part = missing.perDay.slice(i, i + step);
      out.push({ label: step === 1 ? shortDay(part[0].day) : shortDay(part[0].day) + (step === 7 ? '…' : '…'), value: part.reduce((a, d) => a + d.value, 0) });
    }
    return out;
  }, [missing, range]);

  const s = useMemo(() => computeStats({ staff: staffList, transfers, tasks, reports, customers, deals }, range), [staffList, transfers, tasks, reports, customers, deals, range]);
  const labels = s.days.map(shortDay);
  const k = s.kpi;
  const callDays = [...calls].reverse(); // oldest first
  const rangeLabel = RANGES.find((r) => r.days === range)!.label;

  const insights: { tone: 'warn' | 'info'; text: string }[] = [];
  if (k.tasksOverdue > 0) {
    const worst = s.taskLoad.slice().sort((a, b) => b.overdue - a.overdue)[0];
    insights.push({ tone: 'warn', text: `${toPersianDigits(k.tasksOverdue)} وظیفه از موعدش گذشته است${worst?.overdue ? `؛ بیشترین پیش «${worst.name}» (${toPersianDigits(worst.overdue)} مورد)` : ''}.` });
  }
  if (k.lettersPending > 0) insights.push({ tone: 'warn', text: `${toPersianDigits(k.lettersPending)} نامه منتظر امضاست${k.avgSignHours !== null ? `؛ میانگین زمان امضا در این دوره ${toPersianDigits(Math.round(k.avgSignHours))} ساعت بوده` : ''}.` });
  if (s.missingReportsToday.length > 0) insights.push({ tone: 'info', text: `امروز ${toPersianDigits(s.missingReportsToday.length)} نفر هنوز گزارش روزانه نداده‌اند: ${s.missingReportsToday.slice(0, 4).join('، ')}${s.missingReportsToday.length > 4 ? ' و ...' : ''}.` });
  if (k.winRate !== null) insights.push({ tone: 'info', text: `از فرصت‌های بسته‌شدهٔ این دوره ${toPersianDigits(k.winRate)}٪ به فروش موفق رسیده است؛ مجموع فروش ${compactM(k.wonValue)} ${unitName()}.` });
  const missedCalls = callDays.reduce((a, d) => a + d.missed, 0);
  if (missedCalls > 0) insights.push({ tone: 'warn', text: `در ۷ روز اخیر ${toPersianDigits(missedCalls)} تماس ورودی بی‌پاسخ مانده است.` });
  const idleDeals = deals.filter((d) => ['NEW', 'CONTACTED'].includes(d.stage) && Date.now() - new Date(d.updatedAt).getTime() > 14 * 86400000).length;
  if (idleDeals > 0) insights.push({ tone: 'info', text: `${toPersianDigits(idleDeals)} فرصت فروش بیش از ۲ هفته است که حرکتی نداشته و پیگیری لازم دارد.` });

  if (!data) return <div className="py-20 text-center text-sm font-bold text-[#8C6F66]">{failed ? 'دریافت گزارش‌ها ممکن نشد؛ دسترسی یا اتصال را بررسی کنید.' : 'در حال آماده‌سازی گزارش‌ها…'}</div>;

  return (
    <div className="space-y-5 text-right">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-black text-base text-[#3A241F]">گزارشات آماری مدیریتی</h2>
          <p className="text-[11px] text-[#8C6F66] mt-0.5">وضعیت کار، نامه‌ها، فروش و تلفن شرکت؛ برای تصمیم‌گیری سریع. روی نمودارها نگه دارید تا عددها را ببینید.</p>
        </div>
        <div className="flex items-center gap-1.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-1">
          {RANGES.map((r) => (
            <button key={r.days} type="button" onClick={() => setRange(r.days)} className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black cursor-pointer transition-colors ${range === r.days ? 'bg-[#6E1B1B] text-white shadow-sm' : 'text-[#3A241F] hover:bg-white'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {insights.length > 0 && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-4 space-y-1.5">
          <div className="flex items-center gap-2 font-black text-[12px] text-amber-900">
            <Lightbulb className="w-4 h-4" />
            نکته‌های مهم برای مدیریت
          </div>
          {insights.map((i, n) => (
            <div key={n} className="flex items-start gap-2 text-[12px] text-[#3A241F] leading-6">
              {i.tone === 'warn' ? <AlertTriangle className="w-3.5 h-3.5 mt-1.5 text-[#d03b3b] shrink-0" /> : <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2.5 shrink-0" />}
              <span>{i.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi accent={C.violet} icon={<FileSignature className="w-5 h-5" />} label={`نامهٔ امضاشده (${rangeLabel})`} value={fa(k.lettersSigned)} sub={`${toPersianDigits(k.lettersPending)} در انتظار امضا`} tone={k.lettersPending ? 'bad' : 'good'} />
        <Kpi accent={C.blue} icon={<Send className="w-5 h-5" />} label={`فایل تبادل‌شده (${rangeLabel})`} value={fa(k.filesSent)} sub={k.avgSignHours !== null ? `میانگین امضا: ${toPersianDigits(Math.round(k.avgSignHours))} ساعت` : undefined} />
        <Kpi accent={C.aqua} icon={<ClipboardCheck className="w-5 h-5" />} label={`وظیفهٔ انجام‌شده (${rangeLabel})`} value={fa(k.tasksDone)} sub={k.completionRate !== null ? `${toPersianDigits(k.completionRate)}٪ نسبت به وظایف تازه` : `از ${toPersianDigits(k.tasksCreated)} وظیفهٔ تازه`} tone="good" />
        <Kpi accent={C.red} icon={<CalendarCheck className="w-5 h-5" />} label="وظایف معوق (الان)" value={fa(k.tasksOverdue)} sub={`${toPersianDigits(k.tasksOpen)} وظیفهٔ باز`} tone={k.tasksOverdue ? 'bad' : 'good'} />
        <Kpi accent={C.orange} icon={<Banknote className="w-5 h-5" />} label={`ارزش فرصت‌های باز (${unitName()})`} value={compactM(k.pipelineValue)} sub={`${toPersianDigits(k.openDeals)} فرصت در جریان`} />
        <Kpi accent={C.green} icon={<TrendingUp className="w-5 h-5" />} label={`فروش موفق (${rangeLabel})`} value={compactM(k.wonValue)} sub={k.winRate !== null ? `نرخ موفقیت ${toPersianDigits(k.winRate)}٪ · ${toPersianDigits(k.wonCount)} فروش` : `${toPersianDigits(k.wonCount)} فروش`} tone="good" />
        <Kpi accent={C.magenta} icon={<UserPlus className="w-5 h-5" />} label={`مشتری جدید (${rangeLabel})`} value={fa(k.newCustomers)} sub={`${toPersianDigits(k.proformas)} پیش‌فاکتور · ${compactM(k.proformaValue)}`} />
        <Kpi accent={C.yellow} icon={<Phone className="w-5 h-5" />} label="تماس بی‌پاسخ (۷ روز)" value={fa(missedCalls)} sub={callDays.length ? `از ${toPersianDigits(callDays.reduce((a, d) => a + d.total, 0))} تماس` : 'هنوز تماسی ثبت نشده'} tone={missedCalls ? 'bad' : 'good'} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="فایل و نامه در طول زمان" subtitle={`تعداد ارسال در هر روز (${rangeLabel} اخیر)`} legend={[{ label: 'فایل', color: C.blue }, { label: 'نامهٔ رسمی', color: C.orange }]} className="xl:col-span-2">
          <TrendChart labels={labels} series={[{ name: 'فایل', color: C.blue, values: s.transfersPerDay.files }, { name: 'نامهٔ رسمی', color: C.orange, values: s.transfersPerDay.letters }]} />
        </ChartCard>

        <ChartCard title="وضعیت وظایف" subtitle="همهٔ وظایف ثبت‌شده">
          <Donut centerLabel="وظیفه" data={s.taskStatus.map((t, i) => ({ label: t.label, value: t.value, color: [C.yellow, C.blue, C.violet, C.aqua][i] }))} />
        </ChartCard>

        <ChartCard title="بار کاری همکاران" subtitle="وظایف بازِ هر نفر؛ قرمز = معوق" legend={[{ label: 'در جریان', color: C.blue }, { label: 'معوق', color: C.red }]}>
          <HBars rows={s.taskLoad.map((t) => ({ label: t.name, segments: [{ value: t.open - t.overdue, color: C.blue, name: 'در جریان' }, { value: t.overdue, color: C.red, name: 'معوق' }] }))} empty="وظیفهٔ بازی نیست." />
        </ChartCard>

        <ChartCard title="قیف فروش" subtitle="تعداد فرصت در هر مرحله؛ مبلغ کنار هر ردیف">
          <HBars
            format={(v) => toPersianDigits(v)}
            rows={s.funnel.map((f, i) => ({ label: f.label, segments: [{ value: f.count, color: RAMP[i] }], note: `${compactM(f.value)} ${unitName()}` }))}
          />
        </ChartCard>

        <ChartCard title="فروش موفق هر ماه" subtitle={`مجموع مبلغ فروش (${unitName()})`}>
          <Columns labels={s.wonByMonth.map((m) => m.label)} series={[{ name: 'فروش', color: C.green, values: s.wonByMonth.map((m) => m.value) }]} format={(v) => compactM(v)} />
        </ChartCard>

        <ChartCard title="فروش هر کارشناس" subtitle={`مبلغ فروش موفق در ${rangeLabel} اخیر`}>
          <HBars format={(v) => compactM(v)} rows={s.salesByOwner.map((o) => ({ label: o.name, segments: [{ value: o.won, color: C.green }], note: `${toPersianDigits(o.count)} فروش` }))} empty="در این دوره فروش موفقی ثبت نشده." />
        </ChartCard>

        <ChartCard title="مشتریان از کجا آمده‌اند؟" subtitle="منبع آشنایی مشتریان">
          <Donut centerLabel="مشتری" data={s.sources.map((x, i) => ({ label: x.label, value: x.value, color: [C.blue, C.orange, C.aqua, C.violet, C.magenta, C.yellow][i] }))} />
        </ChartCard>

        <ChartCard title="وضعیت نامه‌های رسمی" subtitle="همهٔ نامه‌ها">
          <Donut centerLabel="نامه" data={[{ ...s.letterStatus[0], color: C.aqua }, { ...s.letterStatus[1], color: C.yellow }, { ...s.letterStatus[2], color: C.red }]} />
        </ChartCard>

        <ChartCard title="تماس‌های تلفنی" subtitle="۷ روز اخیر" legend={[{ label: 'پاسخ داده شد', color: C.aqua }, { label: 'بی‌پاسخ', color: C.red }]}>
          {callDays.length === 0 ? (
            <div className="py-10 text-center text-xs font-bold text-gray-400">هنوز تماسی ثبت نشده است (اتصال تلفن شرکت را در تنظیمات بررسی کنید).</div>
          ) : (
            <Columns
              stacked
              labels={callDays.map((d) => shortDay(d.key))}
              series={[
                { name: 'پاسخ داده شد', color: C.aqua, values: callDays.map((d) => d.answered) },
                { name: 'بی‌پاسخ', color: C.red, values: callDays.map((d) => Math.max(0, d.total - d.answered)) },
              ]}
            />
          )}
        </ChartCard>

        <ChartCard title="گزارش روزانهٔ همکاران" subtitle="چند نفر از افرادی که باید گزارش بدهند، در هر روز گزارش داده‌اند" legend={[{ label: 'گزارش‌دهندگان', color: C.violet }]}>
          <Columns labels={s.reportRate.map((r) => shortDay(r.day))} series={[{ name: 'گزارش داده‌اند', color: C.violet, values: s.reportRate.map((r) => r.submitted) }]} height={190} />
          <div className="text-[11px] text-[#8C6F66]">از {toPersianDigits(s.reportRate[0]?.expected || 0)} نفر که باید گزارش بدهند.</div>
        </ChartCard>

        <ChartCard title="مصرف فضا به تفکیک واحد" subtitle="گیگابایت مصرفی نسبت به سهمیه">
          <HBars format={(v) => toPersianDigits(Math.round(v * 10) / 10)} rows={s.storageByDept.map((d) => ({ label: d.name, segments: [{ value: d.used, color: d.quota && d.used / d.quota > 0.85 ? C.red : C.blue }], note: `از ${toPersianDigits(Math.round(d.quota))}` }))} />
        </ChartCard>
      </div>

      {/* products customers asked for that were not in stock: what to buy next */}
      <section className="space-y-3" data-missing-report>
        <div>
          <h3 className="font-black text-[14px] text-[#3A241F] flex items-center gap-2"><PackageX className="w-4 h-4 text-[#6E1B1B]" />کالاهای درخواست‌شده و ناموجود</h3>
          <p className="text-[11px] text-[#8C6F66] mt-0.5">هر بار که کارشناس در پروندهٔ مشتری «کالا موجود نبود» را ثبت کند، این‌جا شمارش می‌شود ({rangeLabel} اخیر).</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Kpi accent={C.red} icon={<PackageX className="w-5 h-5" />} label="کالای مختلفِ ناموجود" value={fa(missing.items.length)} sub={missing.items[0] ? `بیشترین: ${missing.items[0].name}` : 'هنوز موردی ثبت نشده'} />
          <Kpi accent={C.orange} icon={<ClipboardCheck className="w-5 h-5" />} label="کل درخواست‌ها" value={fa(missing.total)} sub={missing.items[0] ? `${toPersianDigits(missing.items[0].count)} بار برای پرتقاضاترین کالا` : undefined} />
          <Kpi accent={C.violet} icon={<Users className="w-5 h-5" />} label="مشتریانی که کالا را نیافتند" value={fa(missing.customerCount)} />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartCard title="کدام کالاها بیشتر خواسته شده و نبوده؟" subtitle="۱۰ کالای پرتقاضا؛ عدد = تعداد درخواست">
            <HBars empty="در این دوره کالای ناموجودی ثبت نشده است." rows={missing.items.slice(0, 10).map((m) => ({ label: m.name, segments: [{ value: m.count, color: C.red, name: 'درخواست' }], note: `${toPersianDigits(m.customers.length)} مشتری` }))} />
          </ChartCard>
          <ChartCard title="روند درخواست کالای ناموجود" subtitle={range <= 31 ? 'تعداد درخواست در هر روز' : range <= 90 ? 'تعداد درخواست در هر هفته' : 'تعداد درخواست در هر ماه'}>
            <Columns labels={missingBuckets.map((b) => b.label)} series={[{ name: 'درخواست', color: C.red, values: missingBuckets.map((b) => b.value) }]} />
          </ChartCard>
        </div>
        {missing.items.length > 0 && (
          <div className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm overflow-hidden">
            <div className="px-5 py-3 bg-[#FAF5F1] font-black text-[12px] text-[#3A241F]">فهرست کامل کالاهای ناموجود</div>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-[11px]">
                <thead><tr className="text-[#8C6F66]"><th className="px-4 py-2 font-bold">کالا</th><th className="px-2 font-bold">تعداد درخواست</th><th className="px-2 font-bold">مقدار خواسته‌شده</th><th className="px-2 font-bold">مشتریان</th></tr></thead>
                <tbody>
                  {missing.items.map((m) => (
                    <tr key={m.name} className="border-t border-[#EBDBCE]/60 align-top">
                      <td className="px-4 py-2 font-black text-[#3A241F]">{m.name}</td>
                      <td className="px-2 py-2 font-black text-[#d03b3b]">{toPersianDigits(m.count)}</td>
                      <td className="px-2 py-2">{m.qty ? toPersianDigits(m.qty) : '—'}</td>
                      <td className="px-2 py-2 text-[#503730] leading-5">{m.customers.slice(0, 6).join('، ')}{m.customers.length > 6 ? ` و ${toPersianDigits(m.customers.length - 6)} نفر دیگر` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <p className="text-[10px] text-[#8C6F66] text-center">همهٔ عددها از اطلاعات ثبت‌شده در سامانه حساب می‌شود و با هر ورود تازه به‌روز است. «{STAGE_LABEL.WON}» یعنی فرصت‌هایی که در مرحلهٔ فروش موفق بسته شده‌اند.</p>
    </div>
  );
};
