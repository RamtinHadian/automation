import React, { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, Clock, Mic, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing, User, Users } from 'lucide-react';
import { VoipCall } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatDateTime } from '../../lib/taskDates';
import { canSub } from '../../lib/permissions';
import { RecordingButton } from '../common/CallLog';
import type { User as Staff } from '../../types';

const STATUS_TEXT: Record<string, string> = { answered: 'پاسخ داده شد', missed: 'بی‌پاسخ', busy: 'مشغول', failed: 'ناموفق' };
const dur = (s: number) => (s > 0 ? toPersianDigits(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`) : '');
const clock = (iso: string) => toPersianDigits(new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));
const FIRST = 5;

/**
 * Every phone call with one customer, in one card: the people who called, when, how long, who answered. A call with a recording can be played,
 * turned into text and (with «خلاصه») its AI summary written into the customer's notes; the customer's report and a call-back are one tap away.
 */
export const CustomerCalls: React.FC<{
  calls: VoipCall[];
  me: Staff;
  onCall?: (number: string) => void;
  /** writes the summary of a recorded call into the notes (not given when the contact details are hidden) */
  onSummary?: (call: VoipCall, summary: string) => void;
}> = ({ calls, me, onCall, onSummary }) => {
  const [all, setAll] = useState(false);
  const stats = useMemo(
    () => ({
      total: calls.length,
      answered: calls.filter((c) => c.status === 'answered').length,
      missed: calls.filter((c) => c.direction === 'in' && c.status !== 'answered').length,
      recorded: calls.filter((c) => c.hasRecording).length,
    }),
    [calls],
  );
  if (!calls.length) return null;
  const shown = all ? calls : calls.slice(0, FIRST);
  const chip = (icon: React.ReactNode, n: number, label: string, cls: string) => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-black ${cls}`}>
      {icon}
      {toPersianDigits(n)} {label}
    </span>
  );
  return (
    <div className="rounded-2xl overflow-hidden border border-emerald-200 bg-white shadow-sm" data-customer-calls>
      <div className="px-4 py-3 bg-gradient-to-l from-emerald-600 via-teal-600 to-cyan-700 text-white">
        <div className="flex items-center gap-2 font-black text-sm">
          <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center"><PhoneCall className="w-4 h-4" /></span>
          تماس‌های تلفنی با این مشتری
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2.5" data-customer-calls-stats>
          {chip(<PhoneCall className="w-3 h-3" />, stats.total, 'تماس', 'bg-white/20 text-white')}
          {chip(<PhoneIncoming className="w-3 h-3" />, stats.answered, 'پاسخ داده‌شده', 'bg-white/15 text-white')}
          {stats.missed > 0 && chip(<PhoneMissed className="w-3 h-3" />, stats.missed, 'بی‌پاسخ ورودی', 'bg-rose-500/80 text-white')}
          {stats.recorded > 0 && chip(<Mic className="w-3 h-3" />, stats.recorded, 'ضبط‌شده', 'bg-amber-400/90 text-[#3A241F]')}
        </div>
      </div>
      <div className="divide-y divide-[#EBDBCE]/70">
        {shown.map((c) => {
          const missed = c.direction === 'in' && c.status !== 'answered';
          const Icon = missed ? PhoneMissed : c.direction === 'out' ? PhoneOutgoing : c.direction === 'internal' ? Users : PhoneIncoming;
          const tone = missed ? 'bg-rose-100 text-rose-600' : c.status === 'answered' ? (c.direction === 'out' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700') : 'bg-slate-100 text-slate-500';
          const callable = onCall && c.number && /^[0-9*#+]+$/.test(c.number);
          return (
            <div key={c.id} className="px-3.5 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 hover:bg-emerald-50/40 transition-colors" data-customer-call-row>
              <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${tone}`}><Icon className="w-5 h-5" /></span>
              <div className="flex-1 min-w-[150px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-black text-[#3A241F]">{c.direction === 'in' ? 'تماس ورودی' : c.direction === 'out' ? 'تماس خروجی' : 'تماس داخلی'}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${missed ? 'bg-rose-50 text-rose-700' : c.status === 'answered' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{STATUS_TEXT[c.status] || c.status}</span>
                  {c.duration > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 text-violet-700 px-2 py-0.5 text-[10px] font-black"><Clock className="w-3 h-3" />{dur(c.duration)}</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[10.5px] font-bold text-[#8C6F66]">
                  <span>{formatDateTime(c.startedAt)} · {clock(c.startedAt)}</span>
                  {c.userName && <span className="inline-flex items-center gap-1"><User className="w-3 h-3" />{c.userName}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {c.hasRecording && <RecordingButton id={c.id} hasTranscript={c.hasTranscript} onSummary={onSummary ? (t) => onSummary(c, t) : undefined} />}
                {c.customerId && canSub(me, 'crm.callReport') && (
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('open-customer-report', { detail: { id: c.customerId } }))}
                    title="گزارش این مشتری (خریدها و قیمت‌های گرفته‌شده)"
                    className="p-2 rounded-xl text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </button>
                )}
                {callable && (
                  <button type="button" onClick={() => onCall!(c.number)} title="تماس مجدد" className="p-2 rounded-xl text-emerald-700 hover:bg-emerald-100 cursor-pointer">
                    <PhoneCall className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {calls.length > FIRST && (
        <button type="button" onClick={() => setAll((v) => !v)} className="w-full py-2.5 text-[11px] font-black text-emerald-800 bg-emerald-50/60 hover:bg-emerald-50 flex items-center justify-center gap-1 cursor-pointer border-t border-[#EBDBCE]/70" data-customer-calls-more>
          {all ? <>کمتر <ChevronUp className="w-3.5 h-3.5" /></> : <>نمایش همهٔ {toPersianDigits(calls.length)} تماس <ChevronDown className="w-3.5 h-3.5" /></>}
        </button>
      )}
    </div>
  );
};
