import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BadgeDollarSign, ChevronDown, ChevronLeft, ChevronRight, Coins, Percent, Plus, Settings2, Trash2, Trophy, Wallet, X } from 'lucide-react';
import { api } from '../../lib/api';
import { askConfirm } from '../../lib/confirmDialog';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits, formatCurrentJalaliDateTime } from '../../lib/jalali';
import { formatMoney, fromDisplay, toDisplay, unitName } from '../../lib/money';
import { JALALI_MONTHS, isoToJalaliParts, todayIso, formatTaskDate } from '../../lib/taskDates';
import { CommissionPayment, CommissionRule, CommissionRules, commissionOf, periodKey, percentFor, ruleOf } from '../../lib/commission';
import { MoneyInput } from '../common/MoneyInput';
import { Deal, User } from '../../types';

const field = 'w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-violet-500 focus:outline-none';
const EMPTY_RULES: CommissionRules = { defaultRule: { percent: 0, tiers: [] }, perUser: {} };

/** A percent written with Persian digits and «٫»; the page keeps it as a plain number. */
const PercentInput: React.FC<{ value: number; onChange: (n: number) => void; className?: string }> = ({ value, onChange, className }) => {
  const [text, setText] = useState(String(value ?? 0).replace('.', '٫'));
  useEffect(() => {
    const cur = Number(text.replace(/٫/g, '.').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
    if (cur !== value) setText(String(value ?? 0).replace('.', '٫'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      <input
        dir="ltr"
        inputMode="decimal"
        className={`${className || field} text-left pl-8`}
        value={toPersianDigits(text)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/٫/g, '.').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
          setText(raw.replace('.', '٫'));
          const n = Math.min(100, Number(raw) || 0);
          onChange(n);
        }}
      />
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-black text-[#8C6F66]">٪</span>
    </div>
  );
};

/** One rule: the base percent and the steps (when the month's sales reach an amount, the whole month is paid with a higher percent). Amounts are kept in Toman, typed in the system's unit. */
const RuleEditor: React.FC<{ rule: CommissionRule; onChange: (r: CommissionRule) => void }> = ({ rule, onChange }) => {
  const tiers = rule.tiers || [];
  const setTier = (i: number, u: Partial<{ from: number; percent: number }>) => onChange({ ...rule, tiers: tiers.map((t, k) => (k === i ? { ...t, ...u } : t)) });
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
        <div>
          <div className="text-[10.5px] font-black text-[#8C6F66] mb-1">درصد پورسانت از فروش موفق ماه</div>
          <PercentInput value={rule.percent} onChange={(n) => onChange({ ...rule, percent: n })} />
        </div>
      </div>
      {tiers.map((t, i) => (
        <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2 items-end rounded-xl bg-violet-50/60 border border-violet-100 p-2.5" data-commission-tier>
          <div>
            <div className="text-[10.5px] font-black text-violet-900 mb-1">وقتی فروش ماه به این مبلغ برسد</div>
            <MoneyInput unit className={field} value={t.from ? String(toDisplay(t.from)) : ''} onChange={(d) => setTier(i, { from: fromDisplay(Number(d) || 0) })} placeholder="مثلاً ۶۰۰٬۰۰۰٬۰۰۰" />
          </div>
          <div>
            <div className="text-[10.5px] font-black text-violet-900 mb-1">کل ماه با درصد</div>
            <PercentInput value={t.percent} onChange={(n) => setTier(i, { percent: n })} />
          </div>
          <button type="button" onClick={() => onChange({ ...rule, tiers: tiers.filter((_, k) => k !== i) })} className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer" aria-label="حذف این پله"><X className="w-4 h-4" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange({ ...rule, tiers: [...tiers, { from: 0, percent: (rule.percent || 0) + 1 }] })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black text-violet-700 bg-white border border-violet-200 hover:bg-violet-50 cursor-pointer" data-commission-add-tier><Plus className="w-3.5 h-3.5" />پلهٔ بالاتر (درصد بیشتر برای فروش بیشتر)</button>
    </div>
  );
};

export const CommissionView: React.FC<{ deals: Deal[]; staff: User[]; currentUser: User }> = ({ deals, staff, currentUser }) => {
  const { showToast } = useAppContext();
  const [rules, setRules] = useState<CommissionRules>(EMPTY_RULES);
  const [payments, setPayments] = useState<CommissionPayment[]>([]);
  const [manager, setManager] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const today = isoToJalaliParts(todayIso()) || [1405, 1, 1];
  const [jy, setJy] = useState(today[0]);
  const [jm, setJm] = useState(today[1]);
  const [open, setOpen] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [draft, setDraft] = useState<CommissionRules>(EMPTY_RULES);
  const [payFor, setPayFor] = useState<{ userId: string; amount: string; note: string } | null>(null);
  const [addUser, setAddUser] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.commissionGet().then((r) => {
      const rr = r.rules as unknown as CommissionRules;
      setRules({ defaultRule: rr.defaultRule || EMPTY_RULES.defaultRule, perUser: rr.perUser || {} });
      setPayments(r.payments as unknown as CommissionPayment[]);
      setManager(r.manager);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const period = periodKey(jy, jm);
  const nameOf = (id: string) => staff.find((u) => u.id === id)?.fullName || payments.find((p) => p.userId === id)?.userName || deals.find((d) => d.ownerId === id)?.ownerName || '—';
  const rows = useMemo(() => {
    const base = commissionOf(deals, rules, period).filter((r) => manager || r.userId === currentUser.id);
    const have = new Set(base.map((r) => r.userId));
    // somebody paid in this month but with no sale in it: still listed, so the payment is not hidden
    for (const p of payments) if (p.period === period && !have.has(p.userId) && (manager || p.userId === currentUser.id)) { have.add(p.userId); base.push({ userId: p.userId, deals: [], sales: 0, percent: percentFor(ruleOf(rules, p.userId), 0), commission: 0 }); }
    return base.sort((a, b) => b.commission - a.commission);
  }, [deals, rules, period, manager, currentUser.id, payments]);
  const paid = (id: string) => payments.filter((p) => p.userId === id && p.period === period).reduce((s, p) => s + p.amount, 0);
  const totals = rows.reduce((t, r) => ({ sales: t.sales + r.sales, commission: t.commission + r.commission, paid: t.paid + paid(r.userId), deals: t.deals + r.deals.length }), { sales: 0, commission: 0, paid: 0, deals: 0 });

  const move = (delta: number) => {
    let m = jm + delta, y = jy;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    setJm(m); setJy(y); setOpen(null); setPayFor(null);
  };
  const saveRules = async () => {
    setBusy(true);
    try {
      await api.commissionSaveRules(draft);
      showToast('قانون پورسانت ذخیره شد.');
      setRules(draft);
      setRulesOpen(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ذخیره نشد.');
    } finally { setBusy(false); }
  };
  const savePay = async () => {
    if (!payFor) return;
    const amount = fromDisplay(Number(payFor.amount) || 0);
    if (amount <= 0) { showToast('مبلغ پرداخت را بنویسید.'); return; }
    setBusy(true);
    try {
      await api.commissionPay({ userId: payFor.userId, period, amount, note: payFor.note });
      showToast('پرداخت ثبت شد.');
      setPayFor(null);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ثبت نشد.');
    } finally { setBusy(false); }
  };
  const removePay = async (p: CommissionPayment) => {
    if (!(await askConfirm(`پرداخت ${formatMoney(p.amount)} ${unitName()} به «${p.userName}» حذف شود؟`, { tone: 'danger', title: 'حذف پرداخت', confirmText: 'بله، حذف شود' }))) return;
    try { await api.commissionPayDelete(p.id); load(); } catch (e) { showToast(e instanceof Error ? e.message : 'حذف نشد.'); }
  };

  const tile = (Icon: React.ElementType, label: string, value: string, tone: string) => (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-black opacity-80"><Icon className="w-4 h-4" />{label}</div>
      <div className="mt-1.5 text-[19px] font-black leading-7">{value}</div>
    </div>
  );
  const years = Array.from({ length: 6 }, (_, i) => today[0] - 4 + i);
  const periodPays = payments.filter((p) => p.period === period).sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-5" data-commission-view>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => move(-1)} className="p-2 rounded-xl bg-white border border-[#EBDBCE] hover:bg-violet-50 cursor-pointer" aria-label="ماه قبل"><ChevronRight className="w-4 h-4" /></button>
          <select className="px-3 py-2 rounded-xl bg-white border border-[#EBDBCE] text-xs font-black cursor-pointer" value={jm} onChange={(e) => setJm(Number(e.target.value))} data-commission-month>
            {JALALI_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select className="px-3 py-2 rounded-xl bg-white border border-[#EBDBCE] text-xs font-black cursor-pointer" value={jy} onChange={(e) => setJy(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{toPersianDigits(y)}</option>)}
          </select>
          <button type="button" onClick={() => move(1)} className="p-2 rounded-xl bg-white border border-[#EBDBCE] hover:bg-violet-50 cursor-pointer" aria-label="ماه بعد"><ChevronLeft className="w-4 h-4" /></button>
        </div>
        <div className="text-[11px] font-bold text-[#8C6F66]">پورسانت فروش‌هایی که در این ماه «فروش موفق» شده‌اند.{manager ? '' : ' فقط پورسانت خودتان نشان داده می‌شود.'}</div>
        {manager && (
          <button type="button" onClick={() => { setDraft(JSON.parse(JSON.stringify(rules))); setRulesOpen((o) => !o); }} className="mr-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 cursor-pointer" data-commission-rules-btn><Settings2 className="w-4 h-4" />قانون پورسانت</button>
        )}
      </div>

      {rulesOpen && manager && (
        <section className="rounded-3xl border border-violet-200 bg-white p-5 space-y-5" data-commission-rules>
          <div>
            <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2"><Percent className="w-4 h-4 text-violet-700" />قانون عمومی (برای همهٔ فروشنده‌ها)</h3>
            <p className="text-[11px] font-bold text-[#8C6F66] leading-6 mt-1">پورسانت هر ماه = درصد × جمع فروش‌های موفق همان ماه. اگر پله بگذارید، وقتی فروش ماه به مبلغ پله برسد کل ماه با درصد آن پله حساب می‌شود (نه فقط مازاد).</p>
          </div>
          <RuleEditor rule={draft.defaultRule} onChange={(r) => setDraft({ ...draft, defaultRule: r })} />
          <div className="border-t border-[#EBDBCE] pt-4 space-y-3">
            <h3 className="font-black text-sm text-[#3A241F]">قانون مخصوص یک نفر (جایگزین قانون عمومی می‌شود)</h3>
            {Object.keys(draft.perUser).map((id) => (
              <div key={id} className="rounded-2xl border border-[#EBDBCE] p-3.5 space-y-2.5" data-commission-person-rule>
                <div className="flex items-center justify-between"><span className="font-black text-xs text-[#3A241F]">{nameOf(id)}</span>
                  <button type="button" onClick={() => { const per = { ...draft.perUser }; delete per[id]; setDraft({ ...draft, perUser: per }); }} className="text-[11px] font-black text-rose-600 hover:underline cursor-pointer">برگشت به قانون عمومی</button></div>
                <RuleEditor rule={draft.perUser[id]} onChange={(r) => setDraft({ ...draft, perUser: { ...draft.perUser, [id]: r } })} />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <select className={`${field} max-w-xs`} value={addUser} onChange={(e) => setAddUser(e.target.value)}>
                <option value="">انتخاب فروشنده…</option>
                {staff.filter((u) => u.isActive && !draft.perUser[u.id]).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
              <button type="button" disabled={!addUser} onClick={() => { setDraft({ ...draft, perUser: { ...draft.perUser, [addUser]: JSON.parse(JSON.stringify(draft.defaultRule)) } }); setAddUser(''); }} className="px-4 py-2.5 rounded-xl text-xs font-black text-violet-700 bg-violet-50 border border-violet-200 disabled:opacity-40 cursor-pointer">افزودن قانون ویژه</button>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={saveRules} className="px-6 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 cursor-pointer" data-commission-save>ذخیرهٔ قانون</button>
            <button type="button" onClick={() => setRulesOpen(false)} className="px-5 py-2.5 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">انصراف</button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tile(Trophy, 'فروش‌های موفق', toPersianDigits(totals.deals), 'bg-white border-[#EBDBCE] text-[#3A241F]')}
        {tile(BadgeDollarSign, 'جمع فروش', `${formatMoney(totals.sales)} ${unitName()}`, 'bg-white border-[#EBDBCE] text-[#3A241F]')}
        {tile(Coins, 'پورسانت این ماه', `${formatMoney(totals.commission)} ${unitName()}`, 'bg-violet-50 border-violet-200 text-violet-900')}
        {tile(Wallet, 'مانده (پرداخت‌نشده)', `${formatMoney(Math.max(0, totals.commission - totals.paid))} ${unitName()}`, totals.commission - totals.paid > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900')}
      </div>

      {!loaded ? (
        <div className="rounded-2xl border border-dashed border-[#EBDBCE] p-8 text-center text-xs font-bold text-[#8C6F66]">در حال خواندن…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EBDBCE] p-10 text-center text-xs font-bold text-[#8C6F66]" data-commission-empty>در این ماه فروش موفقی ثبت نشده است.</div>
      ) : (
        <div className="space-y-2.5" data-commission-rows>
          {rows.map((r) => {
            const pd = paid(r.userId);
            const rest = r.commission - pd;
            const rule = ruleOf(rules, r.userId);
            const isOpen = open === r.userId;
            return (
              <div key={r.userId} className="rounded-2xl border border-[#EBDBCE] bg-white overflow-hidden" data-commission-row>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4">
                  <button type="button" onClick={() => setOpen(isOpen ? null : r.userId)} className="flex items-center gap-2 font-black text-[14px] text-[#3A241F] cursor-pointer"><ChevronDown className={`w-4 h-4 text-[#8C6F66] transition-transform ${isOpen ? 'rotate-180' : ''}`} />{nameOf(r.userId)}</button>
                  <span className="text-[11px] font-bold text-[#8C6F66]">{toPersianDigits(r.deals.length)} فروش · {formatMoney(r.sales)} {unitName()}</span>
                  <span className="text-[11px] font-black rounded-full px-2.5 py-0.5 bg-violet-50 text-violet-800 border border-violet-200">{toPersianDigits(r.percent)}٪{(rule.tiers || []).some((t) => r.sales >= t.from) ? ' (پله)' : ''}</span>
                  <span className="mr-auto flex items-center gap-4 text-[12px] font-black">
                    <span className="text-violet-800">پورسانت: {formatMoney(r.commission)} {unitName()}</span>
                    {pd > 0 && <span className="text-emerald-700">پرداخت‌شده: {formatMoney(pd)}</span>}
                    <span className={rest > 0 ? 'text-amber-700' : 'text-emerald-700'}>مانده: {formatMoney(Math.max(0, rest))}</span>
                  </span>
                  {manager && <button type="button" onClick={() => setPayFor({ userId: r.userId, amount: rest > 0 ? String(toDisplay(rest)) : '', note: '' })} className="px-3.5 py-1.5 rounded-xl text-[11px] font-black text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 cursor-pointer" data-commission-pay-btn>ثبت پرداخت</button>}
                </div>
                {payFor?.userId === r.userId && manager && (
                  <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-[200px_1fr_auto] gap-2 items-end bg-emerald-50/40 border-t border-emerald-100 pt-3" data-commission-pay-form>
                    <div><div className="text-[10.5px] font-black text-[#8C6F66] mb-1">مبلغ پرداخت</div><MoneyInput unit className={field} value={payFor.amount} onChange={(d) => setPayFor({ ...payFor, amount: d })} /></div>
                    <div><div className="text-[10.5px] font-black text-[#8C6F66] mb-1">توضیح (اختیاری)</div><input className={field} value={payFor.note} onChange={(e) => setPayFor({ ...payFor, note: e.target.value })} placeholder="مثلاً واریز به حساب" /></div>
                    <div className="flex gap-2"><button type="button" disabled={busy} onClick={savePay} className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 cursor-pointer">ثبت</button><button type="button" onClick={() => setPayFor(null)} className="px-4 py-2.5 rounded-xl text-xs font-black bg-white border border-[#EBDBCE] cursor-pointer">انصراف</button></div>
                  </div>
                )}
                {isOpen && (
                  <div className="border-t border-[#EBDBCE] bg-[#FDFAF7]" data-commission-deals>
                    {r.deals.length === 0 ? <div className="p-4 text-[11px] font-bold text-[#8C6F66]">فروشی در این ماه نیست.</div> : (
                      <table className="w-full text-[11.5px]">
                        <thead className="text-[#8C6F66]"><tr><th className="text-right font-black py-2 px-4">فروش</th><th className="text-right font-black py-2">مشتری</th><th className="text-right font-black py-2">تاریخ</th><th className="text-left font-black py-2">مبلغ</th><th className="text-left font-black py-2 px-4">پورسانت</th></tr></thead>
                        <tbody>
                          {r.deals.map((d) => (
                            <tr key={d.id} className="border-t border-[#EBDBCE]/60 font-bold text-[#3A241F]">
                              <td className="py-2 px-4">{d.title}</td><td className="py-2">{d.customerName}</td>
                              <td className="py-2 whitespace-nowrap">{formatTaskDate((d.closedAt || d.updatedAt || '').slice(0, 10))}</td>
                              <td className="py-2 text-left">{formatMoney(d.amount)}</td>
                              <td className="py-2 px-4 text-left text-violet-800">{formatMoney(Math.round(((d.amount || 0) * r.percent) / 100))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {periodPays.filter((p) => p.userId === r.userId).length > 0 && (
                      <div className="px-4 py-3 border-t border-[#EBDBCE] space-y-1.5">
                        {periodPays.filter((p) => p.userId === r.userId).map((p) => (
                          <div key={p.id} className="flex items-center gap-2 text-[11px] font-bold text-emerald-800">
                            <Wallet className="w-3.5 h-3.5" />{formatMoney(p.amount)} {unitName()} · {formatCurrentJalaliDateTime(new Date(p.at))}{p.byName ? ` · ثبت: ${p.byName}` : ''}{p.note ? ` · ${p.note}` : ''}
                            {manager && <button type="button" onClick={() => removePay(p)} className="mr-auto p-1 rounded text-rose-500 hover:bg-rose-50 cursor-pointer" aria-label="حذف پرداخت"><Trash2 className="w-3.5 h-3.5" /></button>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {currentUser && !manager && <p className="text-[10.5px] font-bold text-[#8C6F66]">پورسانت از جمع فروش‌های موفق ماه و قانونی که مدیرعامل تعیین کرده حساب می‌شود. اگر ایرادی می‌بینید با مدیرعامل صحبت کنید.</p>}
    </div>
  );
};
