import React, { useEffect, useState } from 'react';
import { AlertTriangle, Clock, Copy, Flame, Loader2, MessageSquareQuote, Sparkles, Target, ThumbsUp } from 'lucide-react';
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

/** «تحلیل مشتری با هوش مصنوعی»: from everything said and done with this customer, the level (of five), the readiness to buy and what to do next. */
export const CustomerAiAnalysis: React.FC<{ customerId: string }> = ({ customerId }) => {
  const { currentUser } = useAppContext();
  const allowed = canSub(currentUser, 'ai.customer');
  const [st, setSt] = useState<Stored | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
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

  return (
    <section onClick={(e) => e.stopPropagation()} className="cursor-default rounded-2xl bg-white text-[#3A241F] border border-violet-200 overflow-hidden" data-customer-ai>
      <div className="px-4 py-3 flex flex-wrap items-center gap-3 bg-gradient-to-l from-violet-50 to-white border-b border-violet-100">
        <div className="flex-1 min-w-[200px]">
          <div className="font-black text-sm text-violet-900 flex items-center gap-2"><Sparkles className="w-4 h-4" />تحلیل مشتری با هوش مصنوعی</div>
          <p className="text-[11px] font-bold text-violet-800/80 leading-6">از روی یادداشت‌ها، تماس‌ها و متن مکالمه‌ها، قیمت‌ها و فرصت‌ها تا امروز؛ می‌گوید مشتری در کدام یک از ۵ سطح است و چه کنیم.</p>
        </div>
        <button type="button" disabled={busy} onClick={run} data-customer-ai-run className="px-4 py-2 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-xs font-black cursor-pointer flex items-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {busy ? 'در حال تحلیل… (تا دو دقیقه)' : a ? 'تحلیل دوباره' : 'تحلیل کن'}
        </button>
      </div>
      {err && <div className="m-3 text-[12px] font-bold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 leading-7" data-ai-error>{err}</div>}
      {a && (
        <div className="p-4 space-y-4">
          <div>
            <div className="grid grid-cols-5 gap-1.5" data-level-ladder>
              {LEVELS.map((l) => (
                <div key={l.n} title={l.hint} className={`rounded-xl px-1.5 py-2 text-center border ${l.n === level ? 'text-white border-transparent shadow-md' : l.n < level ? 'bg-[#FAF5F1] border-[#EBDBCE] text-[#5a3d35]' : 'bg-white border-dashed border-[#EBDBCE] text-[#B8A39C]'}`} style={l.n === level ? { background: LEVEL_COLOR[l.n - 1] } : undefined}>
                  <div className="text-base font-black leading-5">{toPersianDigits(l.n)}</div>
                  <div className="text-[10px] font-black leading-4">{l.title}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-black">
              <span className="px-2.5 py-1 rounded-full text-white" style={{ background: LEVEL_COLOR[level - 1] }}>سطح {toPersianDigits(level)}: {a.levelTitle || LEVELS[level - 1].title}</span>
              {a.temperature && <span className={`px-2.5 py-1 rounded-full flex items-center gap-1 ${TEMP_TONE[a.temperature] || 'bg-slate-100 text-slate-700'}`}><Flame className="w-3 h-3" />{a.temperature}</span>}
              {a.confidence && <span className="px-2.5 py-1 rounded-full bg-[#FAF5F1] text-[#8C6F66]">اطمینان تحلیل: {a.confidence}</span>}
              {a.atRisk && <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />در خطر از دست رفتن</span>}
            </div>
          </div>
          {typeof a.readiness === 'number' && (
            <div>
              <div className="flex items-center justify-between text-[11px] font-black mb-1"><span>آمادگی برای خرید</span><span>{toPersianDigits(Math.round(a.readiness))}٪</span></div>
              <div className="h-2.5 rounded-full bg-[#F3E8DF] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(2, a.readiness))}%`, background: LEVEL_COLOR[level - 1] }} /></div>
            </div>
          )}
          {a.headline && <p className="text-[13px] font-black leading-7">{tx(a.headline)}</p>}
          {a.summary && <p className="text-[12px] font-bold leading-7 text-[#5a3d35]">{tx(a.summary)}</p>}
          {arr(a.wants).length > 0 && (
            <div className="flex flex-wrap gap-1.5">{arr(a.wants).map((x, i) => <span key={i} className="text-[11px] font-black px-2.5 py-1 rounded-full bg-violet-50 text-violet-800 border border-violet-200"><Target className="w-3 h-3 inline ml-1" />{tx(x)}</span>)}</div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {(a.signals || []).length > 0 && (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3 space-y-1.5">
                <div className="font-black text-xs text-emerald-800 flex items-center gap-1.5"><ThumbsUp className="w-3.5 h-3.5" />نشانه‌های خرید</div>
                {(a.signals || []).map((x, i) => <div key={i} className="text-[11.5px] font-bold leading-6 text-emerald-950">• {tx(x.text)}{x.evidence ? <span className="block text-[10.5px] font-medium text-emerald-800/80 pr-3"><MessageSquareQuote className="w-3 h-3 inline ml-1" />{tx(x.evidence)}</span> : null}</div>)}
              </div>
            )}
            {((a.objections || []).length > 0 || arr(a.risks).length > 0) && (
              <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 space-y-1.5">
                <div className="font-black text-xs text-rose-800 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />اعتراض‌ها و خطرها</div>
                {(a.objections || []).map((x, i) => <div key={i} className="text-[11.5px] font-bold leading-6 text-rose-950">• {tx(x.text)}{x.evidence ? <span className="block text-[10.5px] font-medium text-rose-800/80 pr-3"><MessageSquareQuote className="w-3 h-3 inline ml-1" />{tx(x.evidence)}</span> : null}</div>)}
                {arr(a.risks).map((x, i) => <div key={'r' + i} className="text-[11.5px] font-bold leading-6 text-rose-950">• {tx(x)}</div>)}
              </div>
            )}
          </div>
          {(a.nextActions || []).length > 0 && (
            <div className="space-y-1.5">
              <div className="font-black text-xs">کار بعدی پیشنهادی</div>
              {(a.nextActions || []).map((x, i) => (
                <div key={i} className="flex gap-2.5 rounded-xl border border-[#EBDBCE] bg-[#FAF5F1] px-3 py-2">
                  <span className="w-5 h-5 rounded-full bg-[#D34A32] text-white text-[10px] font-black flex items-center justify-center shrink-0">{toPersianDigits(i + 1)}</span>
                  <div className="text-[11.5px] font-bold leading-6"><span className="font-black">{tx(x.title)}</span>{x.when ? ` · ${tx(x.when)}` : ''}{x.why ? <span className="block text-[10.5px] text-[#8C6F66]">{tx(x.why)}</span> : null}</div>
                </div>
              ))}
            </div>
          )}
          {a.suggestedMessage && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-3">
              <div className="flex items-center justify-between gap-2 mb-1"><span className="font-black text-xs text-violet-800">متن پیشنهادی برای تماس یا پیامک بعدی</span>
                <button type="button" onClick={() => { try { navigator.clipboard.writeText(a.suggestedMessage || ''); } catch { /* no clipboard */ } }} className="text-[10px] font-black text-violet-700 flex items-center gap-1 cursor-pointer"><Copy className="w-3 h-3" />کپی</button></div>
              <p className="text-[12px] font-bold leading-7 whitespace-pre-wrap">{tx(a.suggestedMessage)}</p>
            </div>
          )}
          {w && (
            <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-[#8C6F66]" data-ai-when>
              <Clock className="w-3.5 h-3.5" />این تحلیل مربوط به تاریخ {w.date} ساعت {w.time} است. هوش مصنوعی آن را از روی سابقهٔ ثبت‌شده نوشته؛ پیش از تصمیم‌گیری با واقعیت تطبیق دهید.
            </div>
          )}
        </div>
      )}
    </section>
  );
};
