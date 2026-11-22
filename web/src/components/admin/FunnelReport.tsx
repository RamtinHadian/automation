import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Filter, Lightbulb, TrendingDown, Trophy, Users, X } from 'lucide-react';
import { Deal, DealStage } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { toDisplay, unitName } from '../../lib/money';
import { STAGE_LABEL } from '../../lib/adminStats';
import { compact } from './charts';
import { FunnelDark, FunnelRow, STAGE_COLORS } from '../crm/FunnelDark';
import { FitBox } from '../crm/FunnelModal';

const STAGES: DealStage[] = ['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION', 'WON'];
const money = (n: number) => compact(toDisplay(n));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const DAY = 86400000;

const stats = (list: Deal[]) => {
  const count = STAGES.map((s) => list.filter((d) => d.stage === s).length);
  const value = STAGES.map((s) => list.filter((d) => d.stage === s).reduce((x, d) => x + (d.amount || 0), 0));
  const reached = STAGES.map((_, i) => count.slice(i).reduce((a, b) => a + b, 0));
  const lost = list.filter((d) => d.stage === 'LOST').length;
  const won = count[4];
  const open = list.filter((d) => d.stage !== 'WON' && d.stage !== 'LOST');
  const idle = open.filter((d) => Date.now() - new Date(d.updatedAt || d.createdAt || 0).getTime() > 14 * DAY).length;
  return {
    count,
    value,
    reached,
    lost,
    won,
    total: list.length,
    winRate: pct(won, won + lost),
    toWon: pct(won, list.length),
    openValue: open.reduce((a, d) => a + (d.amount || 0), 0),
    wonValue: value[4],
    idle,
  };
};

/**
 * The detail page of the sales funnel: the funnel in full size, what happens between its stages (how many go on and how many drop off), and the same
 * funnel employee by employee, so it is plain who sells well, who loses deals and who lets them go cold. Pressing an employee shows his own funnel.
 */
export const FunnelReport: React.FC<{ deals: Deal[]; seesMoney: boolean; onClose: () => void }> = ({ deals, seesMoney, onClose }) => {
  const [who, setWho] = useState('');
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const owners = useMemo(() => {
    const m = new Map<string, { id: string; name: string; list: Deal[] }>();
    deals.forEach((d) => {
      const id = d.ownerId || d.ownerName || '—';
      const cur = m.get(id) || { id, name: d.ownerName || '—', list: [] };
      cur.list.push(d);
      m.set(id, cur);
    });
    return [...m.values()]
      .map((o) => ({ ...o, st: stats(o.list) }))
      .sort((a, b) => b.st.won - a.st.won || b.st.total - a.st.total);
  }, [deals]);

  const scope = who ? owners.find((o) => o.id === who) : undefined;
  const list = scope ? scope.list : deals;
  const st = useMemo(() => stats(list), [list]);
  const all = Math.max(1, st.total);
  const rows: FunnelRow[] = STAGES.map((s, i) => ({ id: s, label: STAGE_LABEL[s], count: st.count[i], amount: money(st.value[i]), reached: st.reached[i], share: Math.round((st.reached[i] / all) * 100), color: STAGE_COLORS[s] || '#94a3b8' }));

  // the stage where most of the deals that reached it do not go on
  const steps = STAGES.slice(0, 4).map((s, i) => ({ from: STAGE_LABEL[s], to: STAGE_LABEL[STAGES[i + 1]], at: st.reached[i], next: st.reached[i + 1], rate: pct(st.reached[i + 1], st.reached[i]) }));
  const worst = steps.filter((x) => x.at >= 3).sort((a, b) => a.rate - b.rate)[0];
  const best = [...owners].filter((o) => o.st.won + o.st.lost >= 2).sort((a, b) => b.st.winRate - a.st.winRate)[0];
  const weakest = [...owners].filter((o) => o.st.won + o.st.lost >= 2).sort((a, b) => a.st.winRate - b.st.winRate)[0];

  const insights: { tone: 'warn' | 'good' | 'info'; text: string }[] = [];
  if (worst) insights.push({ tone: 'warn', text: `${scope ? `«${scope.name}»` : 'بیشترین ریزش'}: از ${toPersianDigits(worst.at)} فرصتی که به «${worst.from}» رسید، فقط ${toPersianDigits(worst.next)} (${toPersianDigits(worst.rate)}٪) به «${worst.to}» رفته؛ این مرحله گلوگاه است.` });
  if (st.idle > 0) insights.push({ tone: 'warn', text: `${toPersianDigits(st.idle)} فرصت باز بیش از ۲ هفته است که حرکتی نداشته؛ اگر به‌موقع پیگیری نشوند سرد می‌شوند.` });
  if (!scope && best && weakest && best.id !== weakest.id) insights.push({ tone: 'info', text: `بهترین نرخ موفقیت با «${best.name}» (${toPersianDigits(best.st.winRate)}٪) و کمترینش با «${weakest.name}» (${toPersianDigits(weakest.st.winRate)}٪) است.` });

  return (
    <div className="fixed inset-0 z-[85] bg-[#F4F1EC] overflow-y-auto report-detail-in" dir="rtl" data-funnel-report onClick={(e) => e.stopPropagation()}>
      <div className="relative text-white" style={{ background: 'linear-gradient(135deg, #5B3FD0 0%, #2A1F7A 100%)' }}>
        <div className="absolute inset-0 opacity-[0.14] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 10% 15%, #fff 0, transparent 36%), radial-gradient(circle at 90% 85%, #8be0ff 0, transparent 32%)' }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-7 space-y-5">
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-white/15 hover:bg-white/25 backdrop-blur cursor-pointer"><ArrowRight className="w-4 h-4" />بازگشت به گزارشات</button>
            <span className="flex-1" />
            <button type="button" onClick={onClose} className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer" aria-label="بستن"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex items-end gap-4 flex-wrap">
            <span className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center"><TrendingDown className="w-7 h-7" /></span>
            <div className="flex-1 min-w-0">
              <h2 className="font-black text-xl sm:text-2xl">قیف فروش{scope ? ` · ${scope.name}` : ''}</h2>
              <p className="text-[12px] text-white/80 mt-1">فرصت‌ها از آشنایی تا فروش موفق؛ هر مرحله چقدر ادامه می‌دهد و کجا ریزش می‌کند.</p>
            </div>
            <div className="flex gap-6 text-left">
              <div><div className="text-[11px] font-bold text-white/75">فرصت‌ها</div><div className="text-3xl font-black">{toPersianDigits(st.total)}</div></div>
              <div><div className="text-[11px] font-bold text-white/75">نرخ موفقیت</div><div className="text-3xl font-black">{toPersianDigits(st.winRate)}٪</div></div>
              {seesMoney && <div><div className="text-[11px] font-bold text-white/75">فروش موفق ({unitName()})</div><div className="text-3xl font-black">{money(st.wonValue)}</div></div>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 text-[11px] font-black text-white/80"><Filter className="w-3.5 h-3.5" />کارمند:</span>
            <button type="button" onClick={() => setWho('')} className={`px-3 py-1.5 rounded-full text-[11px] font-black cursor-pointer ${!who ? 'bg-white text-[#2A1F7A]' : 'bg-white/15 hover:bg-white/25'}`}>همه</button>
            {owners.map((o) => (
              <button key={o.id} type="button" onClick={() => setWho(o.id)} className={`px-3 py-1.5 rounded-full text-[11px] font-black cursor-pointer ${who === o.id ? 'bg-white text-[#2A1F7A]' : 'bg-white/15 hover:bg-white/25'}`}>{o.name} <span className="opacity-70">({toPersianDigits(o.list.length)})</span></button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-5 pb-10 space-y-4">
        {insights.length > 0 && (
          <div className="rounded-3xl border border-amber-200 bg-white shadow-sm p-4 space-y-1.5">
            <div className="flex items-center gap-2 font-black text-[12px] text-amber-900"><Lightbulb className="w-4 h-4" />تحلیل سریع</div>
            {insights.map((i, n) => (
              <div key={n} className="flex items-start gap-2 text-[12px] text-[#3A241F] leading-6">
                {i.tone === 'warn' ? <AlertTriangle className="w-3.5 h-3.5 mt-1.5 text-[#d03b3b] shrink-0" /> : <Trophy className="w-3.5 h-3.5 mt-1.5 text-emerald-600 shrink-0" />}
                <span>{i.text}</span>
              </div>
            ))}
          </div>
        )}

        <section className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-4 sm:p-6">
          <FitBox design={1030}>
            <FunnelDark unit={unitName()} showMoney={seesMoney} rows={rows} />
          </FitBox>
        </section>

        <section className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm overflow-hidden" data-funnel-steps>
          <div className="px-5 py-4 border-b border-[#F0E6DC]">
            <h3 className="font-black text-[13px] text-[#3A241F]">از هر مرحله چند درصد ادامه می‌دهند؟</h3>
            <p className="text-[11px] text-[#8C6F66] mt-0.5">عدد هر مرحله یعنی فرصت‌هایی که به آن مرحله یا بالاتر رسیده‌اند.</p>
          </div>
          <div className="divide-y divide-[#F0E6DC]">
            {steps.map((x) => (
              <div key={x.from} className="px-5 py-3 flex items-center gap-4">
                <div className="w-40 shrink-0 text-[12px] font-black text-[#3A241F]">{x.from} <span className="text-[#A8928B]">←</span> {x.to}</div>
                <div className="flex-1 h-3 rounded-full bg-[#F1EAE3] overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(3, x.rate)}%`, background: x.rate >= 60 ? '#10b981' : x.rate >= 35 ? '#f59e0b' : '#ef4444' }} />
                </div>
                <div className="w-16 text-left text-[13px] font-black text-[#3A241F]">{toPersianDigits(x.rate)}٪</div>
                <div className="w-28 text-left text-[11px] font-bold text-[#8C6F66]">{toPersianDigits(x.at)} ← {toPersianDigits(x.next)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm overflow-hidden" data-funnel-people>
          <div className="px-5 py-4 border-b border-[#F0E6DC] flex items-center gap-2">
            <Users className="w-4 h-4 text-[#6E1B1B]" />
            <div>
              <h3 className="font-black text-[13px] text-[#3A241F]">تحلیل هر کارمند</h3>
              <p className="text-[11px] text-[#8C6F66] mt-0.5">با زدن روی هر نفر، قیف خودش بالا نشان داده می‌شود.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[11.5px]">
              <thead>
                <tr className="bg-[#FAF5F1] text-[10.5px] font-black text-[#8C6F66]">
                  <th className="px-4 py-2.5">کارمند</th>
                  {STAGES.map((s) => <th key={s} className="px-2 py-2.5 text-center"><span className="inline-block w-2 h-2 rounded-full ml-1" style={{ background: STAGE_COLORS[s] }} />{STAGE_LABEL[s]}</th>)}
                  <th className="px-2 py-2.5 text-center">از دست رفته</th>
                  <th className="px-2 py-2.5 text-center">نرخ موفقیت</th>
                  <th className="px-2 py-2.5 text-center">بی‌حرکت (۱۴ روز+)</th>
                  {seesMoney && <th className="px-2 py-2.5 text-center">فروش ({unitName()})</th>}
                </tr>
              </thead>
              <tbody>
                {owners.map((o) => (
                  <tr key={o.id} onClick={() => { setWho(o.id); window.scrollTo({ top: 0 }); document.querySelector('[data-funnel-report]')?.scrollTo({ top: 0, behavior: 'smooth' }); }} className={`border-t border-[#F0E6DC] cursor-pointer hover:bg-[#FDFAF7] ${who === o.id ? 'bg-violet-50/60' : ''}`}>
                    <td className="px-4 py-2.5 font-black text-[#3A241F] whitespace-nowrap">{o.name}</td>
                    {o.st.count.map((c, i) => <td key={i} className="px-2 py-2.5 text-center font-bold text-[#3A241F]">{toPersianDigits(c)}</td>)}
                    <td className="px-2 py-2.5 text-center font-bold text-rose-700">{toPersianDigits(o.st.lost)}</td>
                    <td className="px-2 py-2.5 text-center"><span className={`px-2 py-0.5 rounded-full font-black border ${o.st.winRate >= 60 ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : o.st.winRate >= 35 ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}>{toPersianDigits(o.st.winRate)}٪</span></td>
                    <td className="px-2 py-2.5 text-center font-bold text-[#3A241F]">{toPersianDigits(o.st.idle)}</td>
                    {seesMoney && <td className="px-2 py-2.5 text-center font-black text-emerald-700">{money(o.st.wonValue)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
