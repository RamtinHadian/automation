import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Clock, Copy, Flame, Loader2, MessageSquareQuote, Sparkles, Target, ThumbsUp } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { jalaliizeText } from '../../lib/taskDates';
import { whenText } from '../admin/AiSalesReport';
import { useAppContext } from '../../context/AppContext';
import { canSub } from '../../lib/permissions';

interface Analysis {
  level?: number;
  levelTitle?: string;
  temperature?: string;
  readiness?: number;
  confidence?: string;
  atRisk?: boolean;
  headline?: string;
  summary?: string;
  wants?: string[];
  signals?: { text: string; evidence?: string }[];
  objections?: { text: string; evidence?: string }[];
  risks?: string[];
  nextActions?: { title: string; why?: string; when?: string }[];
  suggestedMessage?: string;
}
interface Stored { createdAt: string; analysis: Analysis | null }

const LEVELS = [
  { n: 1, title: 'ناآشنا / سرد', hint: 'هنوز تعامل واقعی نیست یا نیازش روشن نیست' },
  { n: 2, title: 'علاقه‌مند', hint: 'نیازش را گفته و اطلاعات می‌خواهد' },
  { n: 3, title: 'در حال ارزیابی', hint: 'قیمت گرفته یا مقایسه می‌کند؛ هنوز تصمیم نگرفته' },
  { n: 4, title: 'آمادهٔ خرید', hint: 'پیش‌فاکتور یا مذاکرهٔ نهایی دارد' },
  { n: 5, title: 'مشتری وفادار', hint: 'خرید موفق و تکراری دارد' },
];
const LEVEL_COLOR = ['#94a3b8', '#0ea5e9', '#f59e0b', '#ea580c', '#059669'];
const TEMP_TONE: Record<string, string> = { سرد: 'bg-slate-100 text-slate-700', ولرم: 'bg-amber-100 text-amber-800', گرم: 'bg-orange-100 text-orange-800', داغ: 'bg-rose-100 text-rose-800' };
const tx = (s?: string) => toPersianDigits(jalaliizeText(s || ''));
const arr = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v) => typeof v === 'string') : []);

const Dot: React.FC<{ c: string }> = ({ c }) => <span className={`w-1.5 h-1.5 rounded-full mt-2.5 shrink-0 ${c}`} />;

/** «تحلیل مشتری با هوش مصنوعی»: from everything said and done with this customer, the level (of five), the readiness to buy and what to do next. */
export const CustomerAiAnalysis: React.FC<{ customerId: string }> = ({ customerId }) => {
  const { currentUser } = useAppContext();
  const allowed = canSub(currentUser, 'ai.customer');
  const [st, setSt] = useState<Stored | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    setSt(null);
    if (allowed) api.customerAiGet(customerId).then((r) => live && r.analysis && setSt(r)).catch(() => undefined);
    return () => { live = false; };
  }, [customerId, allowed]);
  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      setSt(await api.customerAiRun(customerId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'تحلیل انجام نشد.');
    } finally {
      setBusy(false);
    }
  };
  const a = st?.analysis;
  const level = Math.min(5, Math.max(1, Math.round(a?.level || 1)));
  const w = st ? whenText(st.createdAt) : null;
  if (!allowed) return null;

  const color = LEVEL_COLOR[level - 1];
  const ready = typeof a?.readiness === 'number' ? Math.min(100, Math.max(0, Math.round(a.readiness))) : null;
  const R = 34;
  const C = 2 * Math.PI * R;

  return (
    <section onClick={(e) => e.stopPropagation()} className="cursor-default rounded-3xl bg-white text-[#3A241F] shadow-xl shadow-violet-950/20 overflow-hidden ring-1 ring-violet-200/60" data-customer-ai>
      <div className="relative px-5 py-4 flex flex-wrap items-center gap-3 text-white bg-gradient-to-l from-violet-700 via-violet-600 to-indigo-600">
        <span className="absolute -left-10 -top-10 w-40 h-40 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <span className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5" /></span>
        <div className="flex-1 min-w-[200px] relative">
          <div className="font-black text-[15px] leading-6">تحلیل مشتری با هوش مصنوعی</div>
          <p className="text-[11px] font-bold text-white/80 leading-5">از روی یادداشت‌ها، تماس‌ها، قیمت‌ها و فرصت‌ها تا امروز؛ می‌گوید مشتری در کدام یک از ۵ سطح است و چه کنیم.</p>
        </div>
        <button type="button" disabled={busy} onClick={run} data-customer-ai-run className="relative px-4 py-2 rounded-xl bg-white text-violet-800 hover:bg-violet-50 text-xs font-black cursor-pointer flex items-center gap-2 disabled:opacity-60 shadow-md">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {busy ? 'در حال تحلیل… (تا دو دقیقه)' : a ? 'تحلیل دوباره' : 'تحلیل کن'}
        </button>
      </div>
      {err && <div className="m-4 text-[12px] font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-2xl px-3 py-2.5 leading-7" data-ai-error>{err}</div>}
      {a && (
        <div className="p-5 space-y-5">
          {/* the readiness ring, the level, the temperature and the headline */}
          <div className="flex flex-wrap items-center gap-5">
            {ready !== null && (
              <div className="relative w-[92px] h-[92px] shrink-0" data-ai-gauge title="آمادگی برای خرید">
                <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                  <circle cx="40" cy="40" r={R} fill="none" stroke="#F3E8DF" strokeWidth="8" />
                  <circle cx="40" cy="40" r={R} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C - (C * Math.max(ready, 3)) / 100} style={{ transition: 'stroke-dashoffset .6s ease' }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                  <span className="text-[22px] font-black" style={{ color }}>{toPersianDigits(ready)}<span className="text-[11px]">٪</span></span>
                  <span className="text-[9px] font-black text-[#8C6F66] mt-1">آمادگی خرید</span>
                </div>
              </div>
            )}
            <div className="flex-1 min-w-[220px] space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-black">
                <span className="px-3 py-1 rounded-full text-white shadow-sm" style={{ background: color }}>سطح {toPersianDigits(level)} · {a.levelTitle || LEVELS[level - 1].title}</span>
                {a.temperature && <span className={`px-2.5 py-1 rounded-full flex items-center gap-1 ${TEMP_TONE[a.temperature] || 'bg-slate-100 text-slate-700'}`}><Flame className="w-3 h-3" />{a.temperature}</span>}
                {a.confidence && <span className="px-2.5 py-1 rounded-full bg-[#FAF5F1] text-[#8C6F66]">اطمینان تحلیل: {a.confidence}</span>}
                {a.atRisk && <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />در خطر از دست رفتن</span>}
              </div>
              {a.headline && <p className="text-[15px] font-black leading-8">{tx(a.headline)}</p>}
            </div>
          </div>

          {/* the five levels as a path */}
          <div className="relative px-1" data-level-ladder>
            <div className="absolute top-[13px] right-[10%] left-[10%] h-[3px] rounded-full bg-[#F3E8DF]" aria-hidden />
            <div className="absolute top-[13px] right-[10%] h-[3px] rounded-full transition-all" style={{ width: `${((level - 1) / 4) * 80}%`, background: color }} aria-hidden />
            <div className="relative grid grid-cols-5">
              {LEVELS.map((l) => {
                const done = l.n < level;
                const now = l.n === level;
                return (
                  <div key={l.n} title={l.hint} className="flex flex-col items-center gap-1.5 text-center">
                    <span
                      className={`w-[29px] h-[29px] rounded-full flex items-center justify-center text-[11px] font-black border-2 transition-all ${now ? 'text-white scale-110' : done ? 'text-white' : 'bg-white text-[#B8A39C] border-[#EBDBCE]'}`}
                      style={now || done ? { background: LEVEL_COLOR[l.n - 1], borderColor: LEVEL_COLOR[l.n - 1], boxShadow: now ? `0 6px 16px ${LEVEL_COLOR[l.n - 1]}66` : undefined } : undefined}
                    >
                      {done ? <Check className="w-3.5 h-3.5" /> : toPersianDigits(l.n)}
                    </span>
                    <span className={`text-[10px] leading-4 px-0.5 ${now ? 'font-black text-[#3A241F]' : 'font-bold text-[#B8A39C]'}`}>{l.title}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {a.summary && <p className="text-[12.5px] font-bold leading-8 text-[#5a3d35] rounded-2xl bg-[#FAF5F1] border border-[#F3E8DF] px-4 py-3">{tx(a.summary)}</p>}
          {arr(a.wants).length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-black text-[#8C6F66] flex items-center gap-1"><Target className="w-3.5 h-3.5" />دنبال:</span>
              {arr(a.wants).map((x, i) => <span key={i} className="text-[11px] font-black px-3 py-1 rounded-full bg-violet-50 text-violet-800 border border-violet-200">{tx(x)}</span>)}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {(a.signals || []).length > 0 && (
              <div className="rounded-2xl bg-gradient-to-b from-emerald-50 to-white border border-emerald-200 p-4 space-y-2.5">
                <div className="font-black text-xs text-emerald-800 flex items-center gap-2"><span className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center"><ThumbsUp className="w-3.5 h-3.5" /></span>نشانه‌های خرید</div>
                {(a.signals || []).map((x, i) => (
                  <div key={i} className="text-[12px] font-bold leading-6 text-emerald-950 flex gap-2">
                    <Dot c="bg-emerald-500" />
                    <span>{tx(x.text)}{x.evidence ? <span className="block text-[10.5px] font-medium text-emerald-800/80"><MessageSquareQuote className="w-3 h-3 inline ml-1" />{tx(x.evidence)}</span> : null}</span>
                  </div>
                ))}
              </div>
            )}
            {((a.objections || []).length > 0 || arr(a.risks).length > 0) && (
              <div className="rounded-2xl bg-gradient-to-b from-rose-50 to-white border border-rose-200 p-4 space-y-2.5">
                <div className="font-black text-xs text-rose-800 flex items-center gap-2"><span className="w-6 h-6 rounded-lg bg-rose-100 flex items-center justify-center"><AlertTriangle className="w-3.5 h-3.5" /></span>اعتراض‌ها و خطرها</div>
                {(a.objections || []).map((x, i) => (
                  <div key={i} className="text-[12px] font-bold leading-6 text-rose-950 flex gap-2">
                    <Dot c="bg-rose-500" />
                    <span>{tx(x.text)}{x.evidence ? <span className="block text-[10.5px] font-medium text-rose-800/80"><MessageSquareQuote className="w-3 h-3 inline ml-1" />{tx(x.evidence)}</span> : null}</span>
                  </div>
                ))}
                {arr(a.risks).map((x, i) => (
                  <div key={'r' + i} className="text-[12px] font-bold leading-6 text-rose-950 flex gap-2"><Dot c="bg-rose-500" /><span>{tx(x)}</span></div>
                ))}
              </div>
            )}
          </div>

          {(a.nextActions || []).length > 0 && (
            <div className="space-y-2.5">
              <div className="font-black text-xs flex items-center gap-2"><span className="w-6 h-6 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center"><Target className="w-3.5 h-3.5" /></span>کار بعدی پیشنهادی</div>
              <div className="space-y-2">
                {(a.nextActions || []).map((x, i) => (
                  <div key={i} className="flex gap-3 rounded-2xl border border-violet-100 bg-white px-3.5 py-2.5 shadow-sm">
                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white text-[11px] font-black flex items-center justify-center shrink-0">{toPersianDigits(i + 1)}</span>
                    <div className="flex-1 text-[12px] font-bold leading-6">
                      <div className="flex flex-wrap items-center gap-2"><span className="font-black">{tx(x.title)}</span>{x.when ? <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">{tx(x.when)}</span> : null}</div>
                      {x.why ? <span className="block text-[11px] text-[#8C6F66] font-medium">{tx(x.why)}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {a.suggestedMessage && (
            <div className="rounded-2xl bg-gradient-to-b from-violet-50 to-white border border-violet-200 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-black text-xs text-violet-800 flex items-center gap-2"><span className="w-6 h-6 rounded-lg bg-violet-100 flex items-center justify-center"><MessageSquareQuote className="w-3.5 h-3.5" /></span>متن پیشنهادی برای تماس یا پیامک بعدی</span>
                <button type="button" onClick={() => { try { void navigator.clipboard.writeText(a.suggestedMessage || ''); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* no clipboard */ } }} className="text-[11px] font-black text-violet-700 hover:bg-violet-100 rounded-lg px-2.5 py-1 flex items-center gap-1 cursor-pointer">
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'کپی شد' : 'کپی'}
                </button>
              </div>
              <p className="text-[12.5px] font-bold leading-8 whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-white border border-violet-100 px-4 py-3 shadow-sm">{tx(a.suggestedMessage)}</p>
            </div>
          )}
          {w && (
            <div className="flex items-start gap-1.5 text-[10.5px] font-bold text-[#8C6F66] border-t border-[#F3E8DF] pt-3" data-ai-when>
              <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>این تحلیل مربوط به تاریخ {w.date} ساعت {w.time} است. هوش مصنوعی آن را از روی سابقهٔ ثبت‌شده نوشته؛ پیش از تصمیم‌گیری با واقعیت تطبیق دهید.</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
