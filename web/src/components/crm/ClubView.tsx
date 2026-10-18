import React, { useEffect, useMemo, useState } from 'react';
import { Cake, Crown, Gift, MessageSquare, Moon, Plus, Settings2, Star, Trash2, Users } from 'lucide-react';
import { Customer, Deal } from '../../types';
import { api } from '../../lib/api';
import { askConfirm } from '../../lib/confirmDialog';
import { useAppContext } from '../../context/AppContext';
import { canSeeSalesTotals } from '../../lib/permissions';
import { birthMonthDay, buildMembers, ClubConfig, ClubTier, DEFAULT_CLUB, Member, normalizeClub, TIER_TONES } from '../../lib/club';
import { formatMoney, formatNumber, fromDisplay, toDisplay, unitName } from '../../lib/money';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, JALALI_MONTHS, isoToJalaliParts, todayIso } from '../../lib/taskDates';
import { MoneyInput } from '../common/MoneyInput';
import { SmsModal } from './SmsModal';
import { field, label } from './crmUi';

const fa = (n: number) => formatNumber(n);

const TierBadge: React.FC<{ tier: ClubTier; index: number }> = ({ tier, index }) => (
  <span className={`inline-flex items-center gap-1 text-[10px] font-black rounded-full border px-2 py-0.5 ${TIER_TONES[index % TIER_TONES.length]}`}>
    <Crown className="w-3 h-3" />
    {tier.name}
  </span>
);

export const ClubView: React.FC<{ customers: Customer[]; deals: Deal[]; isAdmin: boolean; smsEnabled: boolean; onOpenCustomer: (id: string) => void }> = ({ customers, deals, isAdmin, smsEnabled, onOpenCustomer }) => {
  const { showToast, currentUser } = useAppContext();
  const [cfg, setCfg] = useState<ClubConfig>(DEFAULT_CLUB);
  const [draft, setDraft] = useState<ClubConfig | null>(null);
  const [tierFilter, setTierFilter] = useState<string>('');
  const [sms, setSms] = useState<Customer | null>(null);

  useEffect(() => {
    api.clubGet().then((r) => setCfg(normalizeClub(r as Partial<ClubConfig>))).catch(() => {});
  }, []);

  const members = useMemo(() => buildMembers(customers, deals, cfg), [customers, deals, cfg]);
  const shown = tierFilter ? members.filter((m) => m.tier.id === tierFilter) : members;
  const totalPoints = members.reduce((s, m) => s + m.points, 0);

  // birthdays in the current Jalali month, nearest first
  const monthNow = isoToJalaliParts(todayIso())?.[1] || 1;
  const dayNow = isoToJalaliParts(todayIso())?.[2] || 1;
  const birthdays = useMemo(
    () =>
      customers
        .map((c) => ({ c, md: birthMonthDay(c.birthDate) }))
        .filter((x): x is { c: Customer; md: [number, number] } => !!x.md && x.md[0] === monthNow)
        .sort((a, b) => a.md[1] - b.md[1]),
    [customers, monthNow],
  );
  const dormant = useMemo(() => {
    const limit = Date.now() - cfg.dormantDays * 86400000;
    return members.filter((m) => m.last && new Date(m.last).getTime() < limit).sort((a, b) => a.last.localeCompare(b.last));
  }, [members, cfg.dormantDays]);

  const openSms = (c: Customer) => {
    if (!smsEnabled) return showToast('پیامک در این سامانه فعال نیست.');
    setSms(c);
  };

  const save = async () => {
    if (!draft) return;
    try {
      await api.clubSave(draft);
      setCfg(normalizeClub(draft));
      setDraft(null);
      showToast('قوانین باشگاه ذخیره شد.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ذخیره نشد.');
    }
  };
  const patchTier = (i: number, u: Partial<ClubTier>) => setDraft((d) => (d ? { ...d, tiers: d.tiers.map((t, k) => (k === i ? { ...t, ...u } : t)) } : d));

  const smsBtn = (c: Customer) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        openSms(c);
      }}
      title="ارسال پیامک"
      className="p-1.5 rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 cursor-pointer"
    >
      <MessageSquare className="w-3.5 h-3.5" />
    </button>
  );

  const progress = (m: Member) => {
    if (!m.next) return <span className="text-[10px] font-black text-emerald-700">بالاترین سطح</span>;
    const from = m.tier.minPoints;
    const pct = Math.min(100, Math.round(((m.points - from) / Math.max(1, m.next.minPoints - from)) * 100));
    return (
      <div className="min-w-[110px]">
        <div className="h-1.5 rounded-full bg-[#EBDBCE]/70 overflow-hidden">
          <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[10px] text-[#8C6F66] mt-1">
          {fa(m.toNext)} امتیاز تا «{m.next.name}»
        </div>
      </div>
    );
  };

  const stats: [string, string, React.ReactNode][] = [
    ['اعضای باشگاه', `${fa(members.length)} مشتری`, <Users key="a" className="w-4 h-4" />],
    ['مجموع امتیازها', fa(totalPoints), <Star key="b" className="w-4 h-4" />],
    ['تولدهای این ماه', `${fa(birthdays.length)} نفر`, <Cake key="c" className="w-4 h-4" />],
    ['مدتی خرید نکرده‌اند', `${fa(dormant.length)} نفر`, <Moon key="d" className="w-4 h-4" />],
  ];

  return (
    <div className="space-y-5" data-club>
      <div className="rounded-3xl bg-gradient-to-l from-[#7C3AED] via-[#9333EA] to-[#BE123C] text-white p-5 shadow-lg shadow-violet-700/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-lg font-black">
              <Gift className="w-5 h-5" />
              باشگاه مشتریان
            </div>
            <p className="text-[11px] font-bold opacity-85 mt-1 leading-6">
              به ازای هر {formatMoney(cfg.tomanPerPoint)} {unitName()} خرید، یک امتیاز. امتیاز هر مشتری از فروش‌های موفق خودش حساب می‌شود.
            </p>
          </div>
          {isAdmin && (
            <button type="button" onClick={() => setDraft({ ...cfg, tiers: cfg.tiers.map((t) => ({ ...t })) })} className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-[11px] font-black cursor-pointer">
              <Settings2 className="w-4 h-4" />
              قوانین
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {stats.map(([k, v, ic]) => (
            <div key={k} className="rounded-2xl bg-white/15 border border-white/20 px-3.5 py-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold opacity-85">
                {ic}
                {k}
              </div>
              <div className="text-base font-black mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setTierFilter('')} className={`px-3 py-1.5 rounded-full text-[11px] font-black border cursor-pointer ${!tierFilter ? 'bg-[#3A241F] text-white border-[#3A241F]' : 'bg-white text-[#5A4640] border-[#EBDBCE]'}`}>
          همه ({fa(members.length)})
        </button>
        {cfg.tiers.map((t, i) => (
          <button key={t.id} type="button" onClick={() => setTierFilter(tierFilter === t.id ? '' : t.id)} className={`px-3 py-1.5 rounded-full text-[11px] font-black border cursor-pointer ${tierFilter === t.id ? 'ring-2 ring-violet-400' : ''} ${TIER_TONES[i % TIER_TONES.length]}`}>
            {t.name} ({fa(members.filter((m) => m.tier.id === t.id).length)}){t.discountPercent ? ` · ${toPersianDigits(t.discountPercent)}٪ تخفیف` : ''}
          </button>
        ))}
      </div>

      <section className="bg-white border border-[#EBDBCE] rounded-3xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#EBDBCE] text-xs font-black text-[#3A241F]">اعضا و امتیازها</div>
        {shown.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-[#8C6F66]">هنوز مشتری‌ای فروش موفق ندارد. با بسته‌شدن فروش‌ها، اعضا اینجا می‌آیند.</div>
        ) : (
          <>
            <table className="hidden sm:table w-full text-right">
              <thead className="bg-[#FAF5F1] text-[10px] font-black text-[#8C6F66]">
                <tr>
                  <th className="px-3 py-2">مشتری</th>
                  <th className="px-3 py-2">سطح</th>
                  <th className="px-3 py-2">امتیاز</th>
                  {canSeeSalesTotals(currentUser) && <th className="px-3 py-2">مجموع خرید</th>}
                  <th className="px-3 py-2">آخرین خرید</th>
                  <th className="px-3 py-2">پیشرفت</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBDBCE]/60">
                {shown.map((m) => (
                  <tr key={m.customer.id} onClick={() => onOpenCustomer(m.customer.id)} className="hover:bg-[#FAF5F1]/60 cursor-pointer">
                    <td className="px-3 py-2 text-[11px] font-black text-[#3A241F]">{m.customer.name}</td>
                    <td className="px-3 py-2">
                      <TierBadge tier={m.tier} index={m.tierIndex} />
                    </td>
                    <td className="px-3 py-2 text-[11px] font-black text-violet-700">{fa(m.points)}</td>
                    {canSeeSalesTotals(currentUser) && <td className="px-3 py-2 text-[11px] font-bold text-[#5A4640]">
                      {formatMoney(m.total)} {unitName()}
                    </td>}
                    <td className="px-3 py-2 text-[11px] font-bold text-[#5A4640]">{formatTaskDate(m.last.slice(0, 10)) || '—'}</td>
                    <td className="px-3 py-2">{progress(m)}</td>
                    <td className="px-3 py-2">{smsBtn(m.customer)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="sm:hidden divide-y divide-[#EBDBCE]/60">
              {shown.map((m) => (
                <div key={m.customer.id} onClick={() => onOpenCustomer(m.customer.id)} className="p-3.5 space-y-2 cursor-pointer">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-black text-[13px] text-[#3A241F] truncate">{m.customer.name}</div>
                    <TierBadge tier={m.tier} index={m.tierIndex} />
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#5A4640]">
                    <span>
                      <span className="text-violet-700 font-black">{fa(m.points)}</span> امتیاز
                    </span>
                    {canSeeSalesTotals(currentUser) && <span>
                      {formatMoney(m.total)} {unitName()}
                    </span>}
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    {progress(m)}
                    {smsBtn(m.customer)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="bg-white border border-[#EBDBCE] rounded-3xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EBDBCE] text-xs font-black text-[#3A241F] flex items-center gap-2">
            <Cake className="w-4 h-4 text-rose-500" />
            تولدهای {JALALI_MONTHS[monthNow - 1]}
          </div>
          <div className="divide-y divide-[#EBDBCE]/60 max-h-72 overflow-y-auto">
            {birthdays.length === 0 && <div className="px-4 py-6 text-center text-[11px] text-[#8C6F66]">این ماه تولدی ثبت نشده. تاریخ تولد را در پروندهٔ مشتری وارد کنید.</div>}
            {birthdays.map(({ c, md }) => (
              <div key={c.id} onClick={() => onOpenCustomer(c.id)} className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer hover:bg-[#FAF5F1]/60">
                <div className="min-w-0">
                  <div className="text-[11px] font-black text-[#3A241F] truncate">{c.name}</div>
                  <div className="text-[10px] text-[#8C6F66]">
                    {toPersianDigits(md[1])} {JALALI_MONTHS[md[0] - 1]}
                    {md[1] === dayNow ? ' · امروز' : ''}
                  </div>
                </div>
                {smsBtn(c)}
              </div>
            ))}
          </div>
        </section>
        <section className="bg-white border border-[#EBDBCE] rounded-3xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#EBDBCE] text-xs font-black text-[#3A241F] flex items-center gap-2">
            <Moon className="w-4 h-4 text-indigo-500" />
            بیش از {toPersianDigits(cfg.dormantDays)} روز خرید نکرده‌اند
          </div>
          <div className="divide-y divide-[#EBDBCE]/60 max-h-72 overflow-y-auto">
            {dormant.length === 0 && <div className="px-4 py-6 text-center text-[11px] text-[#8C6F66]">همهٔ اعضا اخیراً خرید کرده‌اند.</div>}
            {dormant.map((m) => (
              <div key={m.customer.id} onClick={() => onOpenCustomer(m.customer.id)} className="flex items-center justify-between gap-2 px-4 py-2.5 cursor-pointer hover:bg-[#FAF5F1]/60">
                <div className="min-w-0">
                  <div className="text-[11px] font-black text-[#3A241F] truncate">{m.customer.name}</div>
                  <div className="text-[10px] text-[#8C6F66]">
                    آخرین خرید: {formatTaskDate(m.last.slice(0, 10))} · {fa(m.points)} امتیاز
                  </div>
                </div>
                {smsBtn(m.customer)}
              </div>
            ))}
          </div>
        </section>
      </div>

      {sms && <SmsModal customerId={sms.id} customerName={sms.name} phones={sms.phones} onClose={() => setSms(null)} />}

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={() => setDraft(null)}>
          <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[92dvh] flex flex-col border border-[#EBDBCE] text-right">
            <div className="px-5 py-4 border-b border-[#EBDBCE] font-black text-sm text-[#3A241F]">قوانین باشگاه مشتریان</div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <label className="flex items-center gap-2 text-xs font-black text-[#3A241F]">
                <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
                باشگاه فعال باشد
              </label>
              <div>
                <label className={label}>هر چند {unitName()} خرید یک امتیاز بدهد؟</label>
                <MoneyInput unit className={field} value={String(toDisplay(draft.tomanPerPoint))} onChange={(d) => setDraft({ ...draft, tomanPerPoint: Math.max(1000, Math.round(fromDisplay(Number(d) || 0))) })} />
              </div>
              <div>
                <label className={label}>چند روز بدون خرید، «مدتی خرید نکرده» حساب شود؟</label>
                <input type="number" min={7} className={field} dir="ltr" value={draft.dormantDays} onChange={(e) => setDraft({ ...draft, dormantDays: Math.max(7, Number(e.target.value) || 0) })} />
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-black text-[#3A241F]">سطح‌ها (از پایین به بالا)</div>
                {draft.tiers.map((t, i) => (
                  <div key={t.id + i} className="grid grid-cols-[1fr_76px_76px_auto] gap-2 items-end">
                    <div>
                      <label className="block text-[10px] font-bold text-[#8C6F66] mb-1">نام سطح</label>
                      <input className={field} value={t.name} onChange={(e) => patchTier(i, { name: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#8C6F66] mb-1">از امتیاز</label>
                      <input type="number" min={0} dir="ltr" className={field} value={t.minPoints} onChange={(e) => patchTier(i, { minPoints: Math.max(0, Number(e.target.value) || 0) })} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#8C6F66] mb-1">تخفیف ٪</label>
                      <input type="number" min={0} max={100} dir="ltr" className={field} value={t.discountPercent} onChange={(e) => patchTier(i, { discountPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
                    </div>
                    <button
                      type="button"
                      disabled={draft.tiers.length <= 1}
                      onClick={async () => {
                        if (await askConfirm(`سطح «${t.name || 'بدون نام'}» حذف شود؟ مشتری‌های این سطح به سطح پایین‌تر می‌روند.`, { tone: 'danger', confirmText: 'حذف سطح' })) setDraft({ ...draft, tiers: draft.tiers.filter((_, k) => k !== i) });
                      }}
                      className="p-2.5 rounded-xl text-rose-600 hover:bg-rose-50 disabled:opacity-30 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={draft.tiers.length >= 8}
                  onClick={() => setDraft({ ...draft, tiers: [...draft.tiers, { id: 'n' + draft.tiers.length, name: '', minPoints: (draft.tiers[draft.tiers.length - 1]?.minPoints || 0) + 100, discountPercent: 0 }] })}
                  className="flex items-center gap-1 text-[11px] font-black text-violet-700 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  سطح تازه
                </button>
              </div>
              <p className="text-[10px] text-[#8C6F66] leading-5">تخفیف هر سطح فقط یک راهنما برای همکاران فروش است و خودکار روی پیش‌فاکتور نمی‌نشیند. تغییر قوانین، امتیاز همهٔ مشتری‌ها را از نو حساب می‌کند.</p>
            </div>
            <div data-modal-footer className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#EBDBCE]">
              <button type="button" onClick={() => setDraft(null)} className="px-4 py-2.5 rounded-xl text-xs font-black text-[#5A4640] hover:bg-[#FAF5F1] cursor-pointer">
                انصراف
              </button>
              <button type="button" onClick={save} className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black cursor-pointer">
                ذخیره
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
