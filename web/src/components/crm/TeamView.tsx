import React, { useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Flag, Settings2, Snowflake, Target, Trophy, XCircle } from 'lucide-react';
import { CrmActivity, Deal, DealStage, User } from '../../types';
import { api } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { downloadCsv } from '../../lib/csv';
import { formatMoney, fromDisplay, toDisplay, unitName } from '../../lib/money';
import { toPersianDigits } from '../../lib/jalali';
import { JALALI_MONTHS } from '../../lib/taskDates';
import { addMonths, DEFAULT_PROB, Month, monthNow, OPEN_STAGE_IDS, PersonStat, personStats, Rules, Targets } from '../../lib/team';
import { MoneyInput } from '../common/MoneyInput';
import { Modal, field, label } from './crmUi';

const STAGE_NAME: Record<string, string> = { NEW: 'جدید', CONTACTED: 'تماس گرفته شد', PROPOSAL: 'پیشنهاد ارسال شد', NEGOTIATION: 'مذاکره' };
const fa = (n: number) => toPersianDigits(Math.round(n));

/** The manager's page: how every person is doing this month against their target, and what the open opportunities are likely to bring. */
export const TeamView: React.FC<{
  staff: User[];
  deals: Deal[];
  activities: CrmActivity[];
  targets: Targets | null;
  rules: Rules | null;
  isAdmin: boolean;
  onSaved: () => void;
}> = ({ staff, deals, activities, targets, rules, isAdmin, onSaved }) => {
  const [month, setMonth] = useState<Month>(monthNow());
  const [settings, setSettings] = useState(false);
  const stats = useMemo(() => personStats(staff.map((u) => u.id), deals, activities, month, targets), [staff, deals, activities, month, targets]);
  const rows = useMemo(() => [...stats].sort((a, b) => b.won - a.won), [stats]);
  const nameOf = (id: string) => staff.find((u) => u.id === id)?.fullName || '—';
  const sum = (f: (s: PersonStat) => number) => stats.reduce((t, s) => t + f(s), 0);
  const totalWon = sum((s) => s.won);
  const totalTarget = sum((s) => s.target);
  const expected = sum((s) => s.expected);
  const isNow = month[0] === monthNow()[0] && month[1] === monthNow()[1];

  // expected sales of the next month (open opportunities with a closing day there)
  const nextExpected = useMemo(() => personStats(staff.map((u) => u.id), deals, activities, addMonths(month, 1), targets).reduce((t, s) => t + s.expected, 0), [staff, deals, activities, month, targets]);
  const noDate = useMemo(() => deals.filter((d) => OPEN_STAGE_IDS.includes(d.stage) && !d.expectedClose).reduce((t, d) => t + (d.amount || 0) * ((targets?.probabilities?.[d.stage] ?? DEFAULT_PROB[d.stage] ?? 0) / 100), 0), [deals, targets]);

  const exportCsv = () =>
    downloadCsv(`عملکرد-تیم-${JALALI_MONTHS[month[1] - 1]}.csv`, [
      ['همکار', `فروش (${unitName()})`, `هدف (${unitName()})`, 'درصد هدف', 'فروش ماه قبل', 'فرصت باز', 'پیگیری انجام‌شده', 'پیگیری عقب‌افتاده', 'فرصت گیرکرده', 'فرصت ازدست‌رفته', 'رایج‌ترین دلیل'],
      ...rows.map((s) => [nameOf(s.id), toDisplay(s.won), toDisplay(s.target), s.target ? Math.round((s.won / s.target) * 100) : '', toDisplay(s.prevWon), s.openCount, s.followDone, s.overdue, s.stalled, s.lostCount, s.topLostReason]),
    ]);

  const bar = (s: PersonStat) => {
    const pct = s.target ? Math.min(100, Math.round((s.won / s.target) * 100)) : 0;
    return s.target ? (
      <div className="min-w-[120px]">
        <div className="h-1.5 rounded-full bg-[#EBDBCE]/70 overflow-hidden"><div className={`h-full rounded-full ${s.won >= s.target ? 'bg-emerald-500' : 'bg-violet-500'}`} style={{ width: `${pct}%` }} /></div>
        <div className="text-[10px] text-[#8C6F66] mt-1">{fa(Math.round((s.won / s.target) * 100))}٪ از هدف</div>
      </div>
    ) : (
      <span className="text-[10px] text-[#8C6F66]">هدف تعیین نشده</span>
    );
  };
  const change = (s: PersonStat) => (s.prevWon ? `${s.won >= s.prevWon ? '+' : '−'}${fa(Math.abs(((s.won - s.prevWon) / s.prevWon) * 100))}٪` : '—');

  return (
    <div className="space-y-5" data-team>
      <div className="rounded-3xl bg-gradient-to-l from-[#7C3AED] via-[#9333EA] to-[#BE123C] text-white p-5 shadow-lg shadow-violet-700/20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-lg font-black">
            <Trophy className="w-5 h-5" />
            عملکرد تیم
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white/15 rounded-xl">
              <button type="button" onClick={() => setMonth(addMonths(month, -1))} className="p-2 cursor-pointer" title="ماه قبل"><ChevronRight className="w-4 h-4" /></button>
              <span className="px-2 text-xs font-black min-w-[100px] text-center">{JALALI_MONTHS[month[1] - 1]} {toPersianDigits(month[0])}</span>
              <button type="button" onClick={() => setMonth(addMonths(month, 1))} className="p-2 cursor-pointer" title="ماه بعد"><ChevronLeft className="w-4 h-4" /></button>
            </div>
            <button type="button" onClick={exportCsv} className="p-2 rounded-xl bg-white/15 hover:bg-white/25 cursor-pointer" title="خروجی اکسل"><Download className="w-4 h-4" /></button>
            {isAdmin && (
              <button type="button" onClick={() => setSettings(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-[11px] font-black cursor-pointer" data-team-settings>
                <Settings2 className="w-4 h-4" />
                هدف و قوانین
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {([
            ['فروش موفق این ماه', `${formatMoney(totalWon)} ${unitName()}`, Trophy],
            ['هدف کل تیم', totalTarget ? `${formatMoney(totalTarget)} ${unitName()} (${fa((totalWon / totalTarget) * 100)}٪)` : 'تعیین نشده', Target],
            ['پیش‌بینی فروش این ماه', `${formatMoney(totalWon + (isNow ? expected : 0))} ${unitName()}`, Flag],
            ['پیش‌بینی ماه بعد', `${formatMoney(nextExpected)} ${unitName()}`, Flag],
          ] as const).map(([k, v, Ic]) => (
            <div key={k} className="rounded-2xl bg-white/15 border border-white/20 px-3.5 py-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold opacity-85"><Ic className="w-4 h-4" />{k}</div>
              <div className="text-[13px] font-black mt-0.5 leading-5">{v}</div>
            </div>
          ))}
        </div>
        <p className="text-[10px] font-bold opacity-80 mt-3 leading-5">
          پیش‌بینی = فروش‌های بسته‌شده + مبلغ فرصت‌های بازِ دارای تاریخ بستن در همان ماه، ضربدر احتمال هر مرحله. فرصت‌های بدون تاریخ بستن (ارزش وزنی {formatMoney(noDate)} {unitName()}) در پیش‌بینی نمی‌آیند؛ تاریخ‌شان را وارد کنید.
        </p>
      </div>

      <section className="bg-white border border-[#EBDBCE] rounded-3xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#EBDBCE] text-xs font-black text-[#3A241F]">همکاران (به ترتیب فروش این ماه)</div>
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-[#8C6F66]">همکار فروشی پیدا نشد.</div>
        ) : (
          <>
            <table className="hidden md:table w-full text-right">
              <thead className="bg-[#FAF5F1] text-[10px] font-black text-[#8C6F66]">
                <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">همکار</th><th className="px-3 py-2">فروش</th><th className="px-3 py-2">هدف</th><th className="px-3 py-2">نسبت به ماه قبل</th><th className="px-3 py-2">فرصت باز</th><th className="px-3 py-2">پیگیری (انجام / عقب)</th><th className="px-3 py-2">گیرکرده</th><th className="px-3 py-2">ازدست‌رفته</th></tr>
              </thead>
              <tbody className="divide-y divide-[#EBDBCE]/60">
                {rows.map((s, i) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 text-[11px] font-black text-violet-700">{fa(i + 1)}</td>
                    <td className="px-3 py-2 text-[11px] font-black text-[#3A241F]">{nameOf(s.id)}</td>
                    <td className="px-3 py-2 text-[11px] font-black text-[#3A241F]">{formatMoney(s.won)} <span className="text-[#8C6F66] font-medium">({fa(s.wonCount)} فروش)</span></td>
                    <td className="px-3 py-2">{bar(s)}</td>
                    <td className="px-3 py-2 text-[11px] font-bold text-[#5A4640]" dir="ltr">{change(s)}</td>
                    <td className="px-3 py-2 text-[11px] font-bold text-[#5A4640]">{fa(s.openCount)} · {formatMoney(s.openAmount)}</td>
                    <td className="px-3 py-2 text-[11px] font-bold"><span className="text-emerald-700">{fa(s.followDone)}</span> / <span className={s.overdue ? 'text-rose-600' : 'text-[#8C6F66]'}>{fa(s.overdue)}</span></td>
                    <td className="px-3 py-2 text-[11px] font-bold">{s.stalled ? <span className="text-sky-700 flex items-center gap-1"><Snowflake className="w-3 h-3" />{fa(s.stalled)}</span> : <span className="text-[#8C6F66]">۰</span>}</td>
                    <td className="px-3 py-2 text-[11px] font-bold text-[#5A4640]">{s.lostCount ? <span title={s.topLostReason}>{fa(s.lostCount)}{s.topLostReason ? ` · ${s.topLostReason}` : ''}</span> : '۰'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="md:hidden divide-y divide-[#EBDBCE]/60">
              {rows.map((s, i) => (
                <div key={s.id} className="p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-black text-[13px] text-[#3A241F]"><span className="text-violet-700">{fa(i + 1)}.</span> {nameOf(s.id)}</div>
                    <div className="text-[12px] font-black text-[#3A241F]">{formatMoney(s.won)} {unitName()}</div>
                  </div>
                  {bar(s)}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold text-[#5A4640]">
                    <span>ماه قبل: <span dir="ltr">{change(s)}</span></span>
                    <span>فرصت باز: {fa(s.openCount)}</span>
                    <span>پیگیری: <span className="text-emerald-700">{fa(s.followDone)}</span> / <span className={s.overdue ? 'text-rose-600' : ''}>{fa(s.overdue)}</span></span>
                    {s.stalled > 0 && <span className="text-sky-700">گیرکرده: {fa(s.stalled)}</span>}
                    {s.lostCount > 0 && <span className="text-rose-700 flex items-center gap-1"><XCircle className="w-3 h-3" />{fa(s.lostCount)}{s.topLostReason ? ` · ${s.topLostReason}` : ''}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      {stats.some((s) => s.overdue > 0) && (
        <div className="flex items-center gap-2 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          برخی همکاران پیگیری عقب‌افتاده دارند؛ از تب «امروز من» با «همهٔ تیم» فهرستش را ببینید.
        </div>
      )}
      {settings && <TeamSettings staff={staff} targets={targets} rules={rules} onClose={() => setSettings(false)} onSaved={() => { setSettings(false); onSaved(); }} />}
    </div>
  );
};

/** Targets, the chance of each stage, and the rules of the sales process (administrators). */
const TeamSettings: React.FC<{ staff: User[]; targets: Targets | null; rules: Rules | null; onClose: () => void; onSaved: () => void }> = ({ staff, targets, rules, onClose, onSaved }) => {
  const { showToast } = useAppContext();
  const [t, setT] = useState<Targets>({ defaultTarget: targets?.defaultTarget || 0, perUser: { ...(targets?.perUser || {}) }, probabilities: { ...(targets?.probabilities || {}) } });
  const [r, setR] = useState<Rules>({ proposalNeedsProforma: !!rules?.proposalNeedsProforma, bigDealAdminOnly: rules?.bigDealAdminOnly || 0, kindDiscount: { ...(rules?.kindDiscount || {}) } });
  const [busy, setBusy] = useState(false);
  const money = (toman?: number) => String(toDisplay(toman || 0) || '');
  const save = async () => {
    setBusy(true);
    try {
      await api.crmTargetsSave(t);
      await api.crmRulesSave(r);
      showToast('تنظیمات تیم ذخیره شد.');
      onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ذخیره نشد.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="هدف فروش و قوانین فرایند"
      onClose={onClose}
      onTop="max"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">انصراف</button>
          <button type="button" disabled={busy} onClick={save} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer">ذخیره</button>
        </>
      }
    >
      <section className="space-y-3">
        <div className="text-xs font-black text-[#3A241F]">هدف فروش ماهانه ({unitName()})</div>
        <div>
          <label className={label}>هدف پیش‌فرض هر همکار</label>
          <MoneyInput unit className={field} value={money(t.defaultTarget)} onChange={(d) => setT({ ...t, defaultTarget: Math.round(fromDisplay(Number(d) || 0)) })} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {staff.map((u) => (
            <div key={u.id}>
              <label className="block text-[10px] font-bold text-[#8C6F66] mb-1">{u.fullName}</label>
              <MoneyInput unit className={field} placeholder="پیش‌فرض" value={t.perUser?.[u.id] ? money(t.perUser[u.id]) : ''} onChange={(d) => { const per = { ...(t.perUser || {}) }; const n = Math.round(fromDisplay(Number(d) || 0)); if (n > 0) per[u.id] = n; else delete per[u.id]; setT({ ...t, perUser: per }); }} />
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <div className="text-xs font-black text-[#3A241F]">احتمال فروش هر مرحله (برای پیش‌بینی)</div>
        <div className="grid grid-cols-2 gap-3">
          {OPEN_STAGE_IDS.map((st: DealStage) => (
            <div key={st}>
              <label className="block text-[10px] font-bold text-[#8C6F66] mb-1">{STAGE_NAME[st]} (٪)</label>
              <input type="number" min={0} max={100} dir="ltr" className={field} value={t.probabilities?.[st] ?? DEFAULT_PROB[st]} onChange={(e) => setT({ ...t, probabilities: { ...(t.probabilities || {}), [st]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) } })} />
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <div className="text-xs font-black text-[#3A241F]">قوانین فرایند فروش</div>
        <label className="flex items-center gap-2 text-xs font-bold text-[#3A241F] cursor-pointer">
          <input type="checkbox" checked={!!r.proposalNeedsProforma} onChange={(e) => setR({ ...r, proposalNeedsProforma: e.target.checked })} />
          فرصت بدون پیش‌فاکتور نتواند به «مذاکره» یا «فروش موفق» برود
        </label>
        <div>
          <label className={label}>فروش‌های بالاتر از این مبلغ را فقط مدیر ببندد ({unitName()}؛ خالی = بدون سقف)</label>
          <MoneyInput unit className={field} value={money(r.bigDealAdminOnly)} onChange={(d) => setR({ ...r, bigDealAdminOnly: Math.round(fromDisplay(Number(d) || 0)) })} />
        </div>
        <div>
          <div className={label}>تخفیف پیش‌فرض پیش‌فاکتور برای هر نوع مشتری (٪)</div>
          <div className="grid grid-cols-3 gap-3">
            {([['PERSON', 'شخص'], ['COMPANY', 'شرکت'], ['SHOP', 'فروشگاه']] as const).map(([k, text]) => (
              <div key={k}>
                <label className="block text-[10px] font-bold text-[#8C6F66] mb-1">{text}</label>
                <input type="number" min={0} max={100} dir="ltr" className={field} value={r.kindDiscount?.[k] ?? 0} onChange={(e) => setR({ ...r, kindDiscount: { ...(r.kindDiscount || {}), [k]: Math.min(100, Math.max(0, Number(e.target.value) || 0)) } })} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </Modal>
  );
};
