import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Loader2, Sparkles, Bot, Brain, Wand2, Stars } from 'lucide-react';
import { api } from '../../lib/api';
import { formatCurrentJalaliDateTime, toPersianDigits } from '../../lib/jalali';
import { compact } from '../admin/charts';
import { toDisplay, unitName } from '../../lib/money';

export type FunnelAiItem = { id: string; name: string; stage: string; idleDays: number; deals: number; amount?: number; problem: string; advice: string[]; say: string; priority: 'HIGH' | 'MED' | 'LOW'; /** not analysed: nothing changed for a long time, only the time is told */ stale?: boolean };
type Phase = 'idle' | 'running' | 'done' | 'error';
export type FunnelAiState = {
  phase: Phase; total: number; done: number; items: FunnelAiItem[]; err: string; at: string; by: string; start: () => void;
};

const STAGE: Record<string, { label: string; color: string }> = {
  NEW: { label: 'جدید', color: '#94a3b8' },
  CONTACTED: { label: 'تماس گرفته شد', color: '#0ea5e9' },
  PROPOSAL: { label: 'پیشنهاد ارسال شد', color: '#8b5cf6' },
  NEGOTIATION: { label: 'مذاکره', color: '#f59e0b' },
  LOST: { label: 'از دست رفته', color: '#e34948' },
};
const PRIO: Record<'HIGH' | 'MED' | 'LOW', { label: string; color: string; soft: string }> = {
  HIGH: { label: 'فوری', color: '#e34948', soft: '#fdecec' },
  MED: { label: 'متوسط', color: '#f59e0b', soft: '#fef3dc' },
  LOW: { label: 'کم‌اهمیت', color: '#64748b', soft: '#eef1f5' },
};
const norm = (x: FunnelAiItem): FunnelAiItem['priority'] => (x.priority === 'HIGH' || x.priority === 'LOW' ? x.priority : 'MED');

/**
 * The state of the AI reading of the funnel, shared by the funnel picture (which spins the AI marks while it works) and the result under it.
 * The last finished reading is loaded from the server, so it stays under the funnel (with its date and who ran it) until it is run again.
 */
export function useFunnelAi(enabled: boolean): FunnelAiState {
  const [phase, setPhase] = useState<Phase>('idle');
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [items, setItems] = useState<FunnelAiItem[]>([]);
  const [err, setErr] = useState('');
  const [at, setAt] = useState('');
  const [by, setBy] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const jobId = useRef('');
  const started = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; window.clearTimeout(timer.current); };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    api.aiFunnelLast().then((r) => {
      if (!alive.current || started.current) return;
      if (r.at && Array.isArray(r.items) && r.items.length) {
        setItems(r.items as unknown as FunnelAiItem[]); setAt(r.at); setBy(r.by || ''); setTotal(r.total || r.items.length); setDone(r.total || r.items.length); setPhase('done');
      }
    }).catch(() => { /* no stored reading: the funnel simply shows no analysis yet */ });
  }, [enabled]);

  const poll = useCallback(async () => {
    try {
      const r = await api.aiFunnelGet(jobId.current);
      if (!alive.current) return;
      setItems(r.items as unknown as FunnelAiItem[]);
      setDone(r.done);
      setTotal(r.total);
      if (r.status === 'error') { setErr(r.error || 'تحلیل ناقص ماند.'); setPhase('error'); return; }
      if (r.status === 'done') { setPhase('done'); setAt(new Date().toISOString()); setBy('شما'); return; }
      timer.current = window.setTimeout(() => void poll(), 3000);
    } catch (e) {
      if (!alive.current) return;
      setErr((e as Error).message || 'ارتباط قطع شد.');
      setPhase('error');
    }
  }, []);

  const start = useCallback(() => {
    window.clearTimeout(timer.current);
    started.current = true;
    setErr(''); setDone(0); setPhase('running');
    api.aiFunnelStart().then((r) => {
      if (!alive.current) return;
      jobId.current = r.id;
      setTotal(r.total);
      setItems([]);
      timer.current = window.setTimeout(() => void poll(), 2500);
    }).catch((e) => {
      if (!alive.current) return;
      setErr((e as Error).message || 'شروع نشد.');
      setPhase('error');
    });
  }, [poll]);

  return { phase, total, done, items, err, at, by, start };
}

/** The button that starts (or restarts) the reading. */
export const FunnelAiButton: React.FC<{ ai: FunnelAiState }> = ({ ai }) => (
  <button type="button" onClick={ai.start} disabled={ai.phase === 'running'} data-funnel-ai-btn className="relative overflow-hidden flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white cursor-pointer disabled:opacity-80 disabled:cursor-wait" style={{ background: 'linear-gradient(110deg,#7c3aed,#0ea5e9,#8b5cf6,#d946ef)', backgroundSize: '220% 100%', animation: ai.phase === 'running' ? 'fai-shift 2.2s linear infinite' : undefined }}>
    {ai.phase === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
    {ai.phase === 'running' ? 'در حال تحلیل…' : ai.items.length ? 'تحلیل دوباره' : 'تحلیل هوش مصنوعی'}
  </button>
);

const MARKS = [Sparkles, Brain, Wand2, Bot, Stars];
const MARK_COLORS = ['#8b5cf6', '#0ea5e9', '#f59e0b', '#10b981', '#d946ef'];
const RINGS = [{ rx: 46, ry: 40, dur: 14, rev: false, n: 5 }, { rx: 30, ry: 26, dur: 9, rev: true, n: 4 }];

/**
 * Wraps the funnel picture: while the AI works, glowing AI marks circle around the funnel and a light beam sweeps down over it, with a small
 * progress card on top. When nothing is running it is invisible and does not touch the mouse.
 */
export const FunnelAiOrbit: React.FC<{ ai: FunnelAiState; children: React.ReactNode }> = ({ ai, children }) => {
  const on = ai.phase === 'running';
  return (
    <div className="relative" data-funnel-orbit={on ? 'on' : 'off'}>
      <style>{`
        @keyframes fai-spin { to { transform: rotate(360deg); } }
        @keyframes fai-spin-rev { to { transform: rotate(-360deg); } }
        @keyframes fai-beam { 0% { top: -8%; opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { top: 104%; opacity: 0; } }
        @keyframes fai-pulse { 0%,100% { transform: scale(1); opacity: .95; } 50% { transform: scale(1.3); opacity: .55; } }
        @keyframes fai-shift { to { background-position: -220% 0; } }
        @keyframes fai-glow { 0%,100% { box-shadow: inset 0 0 40px rgba(139,92,246,.10); } 50% { box-shadow: inset 0 0 90px rgba(14,165,233,.28), inset 0 0 30px rgba(139,92,246,.30); } }
        @media (prefers-reduced-motion: reduce) { [data-funnel-orbit] * { animation-duration: 9s !important; } }
      `}</style>
      <div>{children}</div>
      {on && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl" style={{ animation: 'fai-glow 2.4s ease-in-out infinite' }} aria-hidden>
          {RINGS.map((ring, ri) => (
            <div key={ri} className="absolute inset-0" style={{ animation: `${ring.rev ? 'fai-spin-rev' : 'fai-spin'} ${ring.dur}s linear infinite` }}>
              {Array.from({ length: ring.n }).map((_, i) => {
                const a = (i / ring.n) * Math.PI * 2;
                const Icon = MARKS[(i + ri) % MARKS.length];
                const col = MARK_COLORS[(i + ri * 2) % MARK_COLORS.length];
                return (
                  <div key={i} className="absolute" style={{ left: `${50 + Math.cos(a) * ring.rx}%`, top: `${50 + Math.sin(a) * ring.ry}%`, marginLeft: -18, marginTop: -18 }}>
                    <div style={{ animation: `${ring.rev ? 'fai-spin' : 'fai-spin-rev'} ${ring.dur}s linear infinite` }}>
                      <span className="flex items-center justify-center w-9 h-9 rounded-full bg-white/95" style={{ boxShadow: `0 0 18px 3px ${col}66`, border: `2px solid ${col}` }}>
                        <Icon style={{ color: col, width: 18, height: 18, animation: `fai-pulse ${1.4 + i * 0.2}s ease-in-out infinite` }} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="absolute left-0 right-0 h-16" style={{ animation: 'fai-beam 3.2s ease-in-out infinite', background: 'linear-gradient(180deg, transparent, rgba(139,92,246,.28), rgba(14,165,233,.35), rgba(139,92,246,.28), transparent)', borderTop: '1px solid rgba(139,92,246,.5)', borderBottom: '1px solid rgba(14,165,233,.5)' }} />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-3 flex items-center gap-2.5 rounded-2xl px-4 py-2 text-white text-xs font-black whitespace-nowrap" style={{ background: 'linear-gradient(110deg,#7c3aed,#0ea5e9)', boxShadow: '0 8px 28px rgba(124,58,237,.45)' }}>
            <Sparkles className="w-4 h-4" style={{ animation: 'fai-pulse 1.2s ease-in-out infinite' }} />
            هوش مصنوعی در حال خواندن فرصت‌ها… {toPersianDigits(ai.done)} از {toPersianDigits(ai.total)} مشتری
          </div>
        </div>
      )}
    </div>
  );
};

/** The finished reading, under the funnel: when and by whom, then every customer with the problem, the advice and what to say. */
export const FunnelAiResults: React.FC<{ ai: FunnelAiState; onOpenCustomer?: (id: string) => void }> = ({ ai, onOpenCustomer }) => {
  const [filter, setFilter] = useState<'ALL' | 'HIGH' | 'MED' | 'LOW'>('ALL');
  const [copied, setCopied] = useState('');
  const { phase } = ai;
  const items = useMemo(() => ai.items.filter((x) => !x.stale), [ai.items]);
  const quiet = useMemo(() => ai.items.filter((x) => x.stale).sort((a, b) => (b.amount || 0) - (a.amount || 0) || (a.idleDays || 0) - (b.idleDays || 0)), [ai.items]);
  const shown = useMemo(() => {
    const rank = { HIGH: 0, MED: 1, LOW: 2 } as const;
    return items.filter((x) => filter === 'ALL' || norm(x) === filter).slice().sort((a, b) => rank[norm(a)] - rank[norm(b)] || (b.idleDays || 0) - (a.idleDays || 0));
  }, [items, filter]);
  const count = (k: FunnelAiItem['priority']) => items.filter((x) => norm(x) === k).length;
  const copy = async (id: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); window.setTimeout(() => setCopied(''), 1500); } catch { /* the text stays selectable on the page */ }
  };
  if (phase === 'error') {
    return (
      <div className="mt-4 bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs font-black text-rose-800 space-y-2" data-funnel-ai-result>
        <div>{ai.err}</div>
        <button type="button" onClick={ai.start} className="px-4 py-2 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 cursor-pointer">دوباره امتحان کنید</button>
      </div>
    );
  }
  if (!ai.items.length) return null;
  const when = ai.at ? formatCurrentJalaliDateTime(new Date(ai.at)) : '';
  return (
    <section className="mt-5 rounded-3xl overflow-hidden border border-violet-200 bg-white" data-funnel-ai-result>
      <div className="px-5 py-4 text-white" style={{ background: 'linear-gradient(110deg,#6d28d9 0%,#0ea5e9 45%,#8b5cf6 75%,#d946ef 100%)' }}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center justify-center w-10 h-10 rounded-2xl bg-white/20"><Sparkles className="w-5 h-5" /></span>
          <div className="min-w-0">
            <h4 className="font-black text-[15px]">تحلیل هوش مصنوعی قیف فروش</h4>
            <div className="text-[11.5px] font-bold text-white/90 mt-0.5" data-funnel-ai-meta>
              {phase === 'running' ? 'در حال نوشتن تحلیل؛ هر مشتری که آماده شد همین‌جا می‌آید…' : <>انجام‌شده در {when || '—'}{ai.by ? ` · توسط ${ai.by}` : ''} · {toPersianDigits(items.length)} مشتری تحلیل شد{quiet.length > 0 ? ` · ${toPersianDigits(quiet.length)} مشتری راکد (فقط زمان)` : ''}</>}
            </div>
          </div>
          {phase !== 'running' && <button type="button" onClick={ai.start} className="mr-auto flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black bg-white text-violet-700 hover:bg-violet-50 cursor-pointer"><Sparkles className="w-3.5 h-3.5" />تحلیل دوباره</button>}
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {(['ALL', 'HIGH', 'MED', 'LOW'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black cursor-pointer ${filter === k ? 'bg-white text-violet-700' : 'bg-white/20 text-white hover:bg-white/30'}`}>
              {k === 'ALL' ? `همه (${toPersianDigits(items.length)})` : `${PRIO[k].label} (${toPersianDigits(count(k))})`}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4 sm:p-5 space-y-3 bg-[#FAF7FF]">
        {shown.map((x) => {
          const st = STAGE[x.stage] || { label: x.stage || '—', color: '#94a3b8' };
          const pr = PRIO[norm(x)];
          return (
            <article key={x.id} className="rounded-2xl overflow-hidden bg-white border border-[#E8E0F5]" style={{ borderRightWidth: 6, borderRightColor: st.color }}>
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5" style={{ background: `linear-gradient(90deg, ${st.color}22, transparent)` }}>
                <button type="button" onClick={() => onOpenCustomer?.(x.id)} className={`font-black text-[15px] text-[#3A241F] ${onOpenCustomer ? 'hover:text-violet-700 cursor-pointer' : 'cursor-default'}`}>{x.name || 'بدون نام'}</button>
                <span className="text-[10.5px] font-black rounded-full px-2.5 py-0.5 text-white" style={{ background: st.color }}>{st.label}</span>
                <span className="text-[10.5px] font-black rounded-full px-2.5 py-0.5" style={{ background: pr.soft, color: pr.color, border: `1px solid ${pr.color}55` }}>{pr.label}</span>
                <span className="text-[11px] font-bold text-[#8C6F66] mr-auto">
                  {x.idleDays >= 0 ? `${toPersianDigits(x.idleDays)} روز بی‌حرکت` : ''}{x.deals > 1 ? ` · ${toPersianDigits(x.deals)} فرصت` : ''}{typeof x.amount === 'number' && x.amount > 0 ? ` · ${compact(toDisplay(x.amount))} ${unitName()}` : ''}
                </span>
              </div>
              <div className="px-4 pb-4 pt-2 space-y-3">
                <div className="rounded-xl p-3" style={{ background: '#fdecec' }}><div className="text-[11px] font-black text-rose-700 mb-0.5">مشکل چه بوده</div><p className="text-[13px] font-bold text-[#374151] leading-7">{String(x.problem ?? '')}</p></div>
                {Array.isArray(x.advice) && x.advice.length > 0 && (
                  <div className="rounded-xl p-3" style={{ background: '#e8f8f1' }}><div className="text-[11px] font-black text-emerald-700 mb-0.5">کار پیشنهادی</div>
                    <ul className="space-y-1">{x.advice.map((a, i) => <li key={i} className="text-[13px] font-bold text-[#374151] leading-7 flex gap-2"><span className="text-emerald-600">●</span><span>{String(a)}</span></li>)}</ul></div>
                )}
                {x.say && (
                  <div className="rounded-xl p-3 bg-violet-50 border border-violet-100">
                    <div className="flex items-center justify-between mb-1"><span className="text-[11px] font-black text-violet-800">به مشتری بگویید</span>
                      <button type="button" onClick={() => void copy(x.id, x.say)} className="flex items-center gap-1 text-[10.5px] font-black text-violet-700 cursor-pointer">{copied === x.id ? <><Check className="w-3 h-3" />کپی شد</> : <><Copy className="w-3 h-3" />کپی متن</>}</button></div>
                    <p className="text-[13px] font-bold text-[#3A241F] leading-7 whitespace-pre-line select-text">{x.say}</p>
                  </div>
                )}
              </div>
            </article>
          );
        })}
        {items.length === 0 && phase !== 'running' && <div className="text-xs font-bold text-[#8C6F66] text-center py-3">مشتری تازه‌ای برای تحلیل نبود؛ همهٔ فرصت‌ها مدت‌هاست تغییری نکرده‌اند.</div>}
        {quiet.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden" data-funnel-quiet>
            <div className="px-4 py-2.5 bg-slate-100 text-[12px] font-black text-slate-700">راکد: فرصت‌هایشان بیش از {toPersianDigits(45)} روز تغییری نکرده (تحلیل نشدند؛ فقط زمان اعلام می‌شود)</div>
            <div className="divide-y divide-slate-100">
              {quiet.map((x) => {
                const st = STAGE[x.stage] || { label: x.stage || '—', color: '#94a3b8' };
                return (
                  <div key={x.id} className="flex flex-wrap items-center gap-2 px-4 py-2" data-funnel-quiet-row>
                    <button type="button" onClick={() => onOpenCustomer?.(x.id)} className={`font-black text-[13px] text-[#3A241F] ${onOpenCustomer ? 'hover:text-violet-700 cursor-pointer' : 'cursor-default'}`}>{x.name || 'بدون نام'}</button>
                    <span className="text-[10px] font-black rounded-full px-2 py-0.5 text-white" style={{ background: st.color }}>{st.label}</span>
                    <span className="text-[11px] font-bold text-slate-500 mr-auto">{toPersianDigits(x.idleDays)} روز بدون تغییر{x.deals > 1 ? ` · ${toPersianDigits(x.deals)} فرصت` : ''}{typeof x.amount === 'number' && x.amount > 0 ? ` · ${compact(toDisplay(x.amount))} ${unitName()}` : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
