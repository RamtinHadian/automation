import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Loader2, Sparkles, X } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { compact } from '../admin/charts';
import { toDisplay, unitName } from '../../lib/money';

type Item = { id: string; name: string; stage: string; idleDays: number; deals: number; amount?: number; problem: string; advice: string[]; say: string; priority: 'HIGH' | 'MED' | 'LOW' };
const STAGE: Record<string, { label: string; color: string }> = {
  NEW: { label: 'جدید', color: '#94a3b8' },
  CONTACTED: { label: 'تماس گرفته شد', color: '#0ea5e9' },
  PROPOSAL: { label: 'پیشنهاد ارسال شد', color: '#8b5cf6' },
  NEGOTIATION: { label: 'مذاکره', color: '#f59e0b' },
  LOST: { label: 'از دست رفته', color: '#e34948' },
};
const PRIO: Record<string, { label: string; cls: string }> = {
  HIGH: { label: 'فوری', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
  MED: { label: 'متوسط', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  LOW: { label: 'کم‌اهمیت', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

/**
 * A page of its own (over the whole screen): the AI reads every opportunity the person may see and, customer by customer, says what the problem
 * was and what to tell him now. The server works in groups, so each customer appears as soon as it is ready.
 */
export const FunnelAiPage: React.FC<{ onClose: () => void; onOpenCustomer?: (id: string) => void }> = ({ onClose, onOpenCustomer }) => {
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'HIGH' | 'MED' | 'LOW'>('ALL');
  const [copied, setCopied] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const jobId = useRef('');

  // the page that opened this one passes a new onClose on every render; the polling timer must not be cancelled by that, so it lives in a ref
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); window.clearTimeout(timer.current); };
  }, []);

  const poll = useCallback(async () => {
    try {
      const r = await api.aiFunnelGet(jobId.current);
      setItems(r.items as unknown as Item[]);
      setDone(r.done);
      setTotal(r.total);
      if (r.status === 'error') { setErr(r.error || 'تحلیل ناقص ماند.'); setPhase('error'); return; }
      if (r.status === 'done') { setPhase('done'); return; }
      timer.current = window.setTimeout(() => void poll(), 3000);
    } catch (e) {
      setErr((e as Error).message || 'ارتباط قطع شد.');
      setPhase('error');
    }
  }, []);

  const start = async () => {
    setErr(''); setItems([]); setDone(0); setPhase('running');
    try {
      const r = await api.aiFunnelStart();
      jobId.current = r.id;
      setTotal(r.total);
      timer.current = window.setTimeout(() => void poll(), 2500);
    } catch (e) {
      setErr((e as Error).message || 'شروع نشد.');
      setPhase('error');
    }
  };

  // whatever the server sends, a customer with a strange value is shown as «متوسط» instead of breaking the page
  const norm = (x: Item): Item['priority'] => (x.priority === 'HIGH' || x.priority === 'LOW' ? x.priority : 'MED');
  const shown = useMemo(() => {
    const rank = { HIGH: 0, MED: 1, LOW: 2 } as const;
    return items.filter((x) => filter === 'ALL' || norm(x) === filter).slice().sort((a, b) => rank[norm(a)] - rank[norm(b)] || (b.idleDays || 0) - (a.idleDays || 0));
  }, [items, filter]);
  const count = (k: Item['priority']) => items.filter((x) => norm(x) === k).length;
  const copy = async (id: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); window.setTimeout(() => setCopied(''), 1500); } catch { /* the text stays selectable on the page */ }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-[#FAF5F1] flex flex-col" dir="rtl" data-funnel-ai onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-3 px-5 py-3 bg-white border-b border-[#EBDBCE] shrink-0">
        <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-700" />تحلیل هوش مصنوعی قیف فروش: مشکل هر مشتری و پیشنهاد گفتگو</h3>
        <button type="button" onClick={onClose} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-[#6E1B1B] bg-[#FAF5F1] hover:bg-[#EBDBCE] cursor-pointer"><X className="w-3.5 h-3.5" />بستن (Esc)</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {phase === 'idle' && (
            <div className="bg-white border border-[#EBDBCE] rounded-3xl p-8 text-center space-y-4">
              <Sparkles className="w-10 h-10 text-violet-600 mx-auto" />
              <p className="text-sm font-black text-[#3A241F]">هوش مصنوعی همهٔ فرصت‌های باز (و فرصت‌های ۴ ماه اخیر که از دست رفته‌اند) را می‌خواند.</p>
              <p className="text-[12px] font-bold text-[#8C6F66] leading-7 max-w-2xl mx-auto">برای هر مشتری جدا می‌گوید مشکل کجا بوده (مثلاً چند روز است بی‌حرکت مانده یا بعد از پیش‌فاکتور پیگیری نشده)، فروشنده الان چه کاری بکند و چه جمله‌ای به مشتری بگوید. فقط فرصت‌هایی خوانده می‌شود که شما اجازهٔ دیدنشان را دارید. نام، مرحله، یادداشت‌ها و فعالیت‌های اخیر به سرویس هوش مصنوعی (togpt) فرستاده می‌شود؛ تا ۶۰ مشتری مهم‌تر در هر بار.</p>
              <button type="button" onClick={() => void start()} className="px-6 py-2.5 rounded-xl text-sm font-black text-white bg-violet-600 hover:bg-violet-700 cursor-pointer">شروع تحلیل</button>
            </div>
          )}
          {phase === 'running' && (
            <div className="bg-white border border-violet-200 rounded-2xl p-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-violet-600 animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-black text-[#3A241F]">در حال خواندن فرصت‌ها… {toPersianDigits(done)} از {toPersianDigits(total)} مشتری</div>
                <div className="h-2 rounded-full bg-violet-100 mt-1.5 overflow-hidden"><div className="h-full bg-violet-600 transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
              </div>
            </div>
          )}
          {phase === 'error' && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs font-black text-rose-800 space-y-2">
              <div>{err}</div>
              <button type="button" onClick={() => void start()} className="px-4 py-2 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 cursor-pointer">دوباره امتحان کنید</button>
            </div>
          )}
          {items.length > 0 && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {(['ALL', 'HIGH', 'MED', 'LOW'] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-xl text-[11px] font-black border cursor-pointer ${filter === k ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-[#8C6F66] border-[#EBDBCE]'}`}>
                    {k === 'ALL' ? `همه (${toPersianDigits(items.length)})` : `${PRIO[k].label} (${toPersianDigits(count(k))})`}
                  </button>
                ))}
                {phase === 'done' && <button type="button" onClick={() => void start()} className="mr-auto px-3 py-1.5 rounded-xl text-[11px] font-black text-violet-700 bg-violet-50 hover:bg-violet-100 cursor-pointer">تحلیل دوباره</button>}
              </div>
              <div className="space-y-3">
                {shown.map((x) => {
                  const st = STAGE[x.stage] || { label: x.stage || '—', color: '#94a3b8' };
                  return (
                    <article key={x.id} className="bg-white border border-[#EBDBCE] rounded-2xl p-4 sm:p-5 space-y-3" style={{ borderRightWidth: 5, borderRightColor: st.color }}>
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => onOpenCustomer?.(x.id)} className={`font-black text-[15px] text-[#3A241F] ${onOpenCustomer ? 'hover:text-violet-700 cursor-pointer' : 'cursor-default'}`}>{x.name || 'بدون نام'}</button>
                        <span className="text-[10.5px] font-black rounded-full px-2.5 py-0.5 text-white" style={{ background: st.color }}>{st.label}</span>
                        <span className={`text-[10.5px] font-black rounded-full px-2.5 py-0.5 border ${PRIO[norm(x)].cls}`}>{PRIO[norm(x)].label}</span>
                        <span className="text-[11px] font-bold text-[#8C6F66] mr-auto">
                          {x.idleDays >= 0 ? `${toPersianDigits(x.idleDays)} روز بی‌حرکت` : ''}{x.deals > 1 ? ` · ${toPersianDigits(x.deals)} فرصت` : ''}{typeof x.amount === 'number' && x.amount > 0 ? ` · ${compact(toDisplay(x.amount))} ${unitName()}` : ''}
                        </span>
                      </div>
                      <div><div className="text-[11px] font-black text-rose-700 mb-0.5">مشکل چه بوده</div><p className="text-[13px] font-bold text-[#374151] leading-7">{String(x.problem ?? '')}</p></div>
                      {Array.isArray(x.advice) && x.advice.length > 0 && (
                        <div><div className="text-[11px] font-black text-emerald-700 mb-0.5">کار پیشنهادی</div>
                          <ul className="space-y-1">{x.advice.map((a, i) => <li key={i} className="text-[13px] font-bold text-[#374151] leading-7 flex gap-2"><span className="text-emerald-600">●</span><span>{String(a)}</span></li>)}</ul></div>
                      )}
                      {x.say && (
                        <div className="rounded-xl bg-violet-50 border border-violet-100 p-3">
                          <div className="flex items-center justify-between mb-1"><span className="text-[11px] font-black text-violet-800">به مشتری بگویید</span>
                            <button type="button" onClick={() => void copy(x.id, x.say)} className="flex items-center gap-1 text-[10.5px] font-black text-violet-700 cursor-pointer">{copied === x.id ? <><Check className="w-3 h-3" />کپی شد</> : <><Copy className="w-3 h-3" />کپی متن</>}</button></div>
                          <p className="text-[13px] font-bold text-[#3A241F] leading-7 whitespace-pre-line select-text">{x.say}</p>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
