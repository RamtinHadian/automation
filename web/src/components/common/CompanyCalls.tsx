import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Headphones, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Search, Users } from 'lucide-react';
import { api, VoipCall } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, formatDateTime } from '../../lib/taskDates';
import { matchesAll } from '../../lib/searchAll';
import { RecordingButton } from './CallLog';
import { SubTabs } from './SubTabs';
import { fullPhone, useVoipArea } from '../../lib/voipArea';

const dur = (s: number) => (s > 0 ? toPersianDigits(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`) : '');
const clock = (iso: string) => toPersianDigits(new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));
const STATUS_TEXT: Record<string, string> = { answered: 'پاسخ داده شد', missed: 'بی‌پاسخ', busy: 'مشغول', failed: 'ناموفق' };

type Filter = 'all' | 'in' | 'out' | 'internal' | 'missed' | 'rec';
const FILTERS: [Filter, string][] = [
  ['all', 'همه'],
  ['in', 'ورودی'],
  ['out', 'خروجی'],
  ['internal', 'داخلی'],
  ['missed', 'بی‌پاسخ'],
  ['rec', 'دارای ضبط'],
];

/** One call written as a sentence: who rang whom, on which extension, and which colleague sits at it. */
function sentence(c: VoipCall, area: string): React.ReactNode {
  const other = c.customerName || c.name;
  const num = <b dir="ltr" className="font-black">{toPersianDigits(c.direction === 'internal' ? c.number : fullPhone(c.number, area))}</b>;
  const person = other ? (
    <>
      «<b>{other}</b>» ({num})
    </>
  ) : (
    num
  );
  const ext = (
    <>
      داخلی <b>{c.ext ? toPersianDigits(c.ext) : '؟'}</b>
      {c.userName ? <> ({c.userName})</> : null}
    </>
  );
  if (c.direction === 'in') return <>تماس ورودی از {person} به {ext}</>;
  if (c.direction === 'out') return <>تماس خروجی از {ext} با {person}</>;
  return <>تماس داخلی میان {ext} و {person}</>;
}

/**
 * The calls of the whole company, for the top manager: every call as a box that says in words who spoke with which number on which extension,
 * with a player for the recording when the phone system has one. Listening is written to the audit log.
 */
export const CompanyCalls: React.FC = () => {
  const area = useVoipArea();
  const [calls, setCalls] = useState<VoipCall[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [who, setWho] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    api
      .voipCalls({ scope: 'all', limit: 500 })
      .then((r) => {
        setCalls(r.calls);
        setFailed(false);
      })
      .catch(() => {
        setCalls((x) => x ?? []);
        setFailed(true);
      });
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  // the colleagues (and their extensions) that appear in the calls
  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of calls || []) if (c.ext) m.set(c.ext, c.userName ? `${c.userName} (داخلی ${toPersianDigits(c.ext)})` : `داخلی ${toPersianDigits(c.ext)}`);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'fa'));
  }, [calls]);

  const shown = useMemo(
    () =>
      (calls || []).filter((c) => {
        if (who && c.ext !== who) return false;
        if (filter === 'in' && !(c.direction === 'in' && c.status === 'answered')) return false; // missed calls are their own tab
        if (filter === 'out' && c.direction !== 'out') return false;
        if (filter === 'internal' && c.direction !== 'internal') return false;
        if (filter === 'missed' && !(c.direction === 'in' && c.status !== 'answered')) return false;
        if (filter === 'rec' && !c.hasRecording) return false;
        return matchesAll(c, q);
      }),
    [calls, filter, who, q]
  );

  const today = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => {
    const all = calls || [];
    const t = all.filter((c) => c.startedAt.slice(0, 10) === today);
    return { today: t.length, answered: t.filter((c) => c.status === 'answered').length, missed: t.filter((c) => c.direction === 'in' && c.status !== 'answered').length, rec: all.filter((c) => c.hasRecording).length };
  }, [calls, today]);

  return (
    <div className="flex-1 p-3.5 sm:p-8 space-y-4 sm:space-y-5 pb-8 select-none overflow-x-clip" data-company-calls>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-lg text-[#3A241F]">تماس‌های شرکت</h2>
          <p className="text-xs text-[#8C6F66] mt-0.5">همهٔ تماس‌های همکاران؛ هر تماس می‌گوید با کدام شماره و روی کدام داخلی بوده، و مکالمه‌های ضبط‌شده را می‌شود شنید.</p>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ['امروز', stats.today, 'bg-sky-50 text-sky-800 border-sky-200'],
            ['پاسخ‌داده', stats.answered, 'bg-emerald-50 text-emerald-800 border-emerald-200'],
            ['بی‌پاسخ', stats.missed, 'bg-rose-50 text-rose-800 border-rose-200'],
            ['ضبط‌شده', stats.rec, 'bg-violet-50 text-violet-800 border-violet-200'],
          ].map(([t, n, cls]) => (
            <div key={String(t)} className={`rounded-2xl border px-3 py-1.5 ${cls}`}>
              <div className="text-base font-black leading-5">{toPersianDigits(Number(n))}</div>
              <div className="text-[10px] font-bold">{t}</div>
            </div>
          ))}
        </div>
      </div>

      <SubTabs
        tone="emerald"
        value={filter}
        onChange={(k) => setFilter(k as Filter)}
        tabs={FILTERS.map(([id, label]) => ({ id, label, Icon: ({ all: Phone, in: PhoneIncoming, out: PhoneOutgoing, internal: Users, missed: PhoneMissed, rec: Headphones } as Record<string, React.ElementType>)[id] }))}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select value={who} onChange={(e) => setWho(e.target.value)} className="min-h-[40px] rounded-xl border border-[#EBDBCE] bg-white px-3 text-xs font-bold text-[#3A241F]" aria-label="فیلتر همکار یا داخلی">
          <option value="">همهٔ همکاران و داخلی‌ها</option>
          {people.map(([ext, label]) => (
            <option key={ext} value={ext}>{label}</option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#8C6F66]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در همهٔ اطلاعات تماس: نام، شماره، داخلی، همکار، مشتری، تاریخ…" className="w-full pr-9 pl-3 py-2.5 min-h-[40px] bg-white border border-[#EBDBCE] rounded-xl text-xs outline-hidden" />
        </div>
      </div>

      {calls === null ? (
        <div className="py-12 text-center text-xs font-bold text-[#8C6F66]">در حال دریافت تماس‌ها…</div>
      ) : shown.length === 0 ? (
        <div className="py-12 text-center text-xs font-bold text-[#8C6F66]">{failed ? 'تماس‌ها خوانده نشد؛ اتصال را بررسی کنید.' : 'تماسی پیدا نشد.'}</div>
      ) : (
        <>
          {stats.rec === 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-900">
              هنوز هیچ مکالمهٔ ضبط‌شده‌ای به سامانه نرسیده است. برای شنیدن مکالمه‌ها، ضبط را در تلفن‌خانه فعال کنید و پوشهٔ ضبط‌ها را به سامانه وصل کنید (کنسول مدیریت ← وضعیت تلفن).
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {shown.slice(0, 300).map((c) => {
              const missed = c.direction === 'in' && c.status !== 'answered';
              const Icon = missed ? PhoneMissed : c.direction === 'out' ? PhoneOutgoing : c.direction === 'internal' ? Users : PhoneIncoming;
              const tone = missed ? 'bg-rose-100 text-rose-600' : c.status === 'answered' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500';
              return (
                <div key={c.id} className="rounded-2xl border border-[#EBDBCE] bg-white p-3.5 space-y-2.5 shadow-2xs" data-call-box>
                  <div className="flex items-start gap-3">
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-[#3A241F] leading-6">{sentence(c, area)}</div>
                      <div className="text-[10px] font-bold text-[#8C6F66] mt-0.5">
                        {STATUS_TEXT[c.status] || c.status}
                        {c.duration > 0 ? ` · مدت ${dur(c.duration)}` : ''}
                      </div>
                    </div>
                    <div className="text-[10px] font-bold text-[#8C6F66] text-left shrink-0">
                      <div>{formatDateTime(c.startedAt)}</div>
                      <div>{clock(c.startedAt)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#EBDBCE]/70">
                    {c.hasRecording ? (
                      <span className="flex flex-wrap items-center gap-1 flex-1">
                        <Headphones className="w-3.5 h-3.5 text-violet-700" />
                        <span className="text-[11px] font-black text-violet-800">مکالمهٔ ضبط‌شده</span>
                        <RecordingButton id={c.id} hasTranscript={c.hasTranscript} />
                      </span>
                    ) : (
                      <span className="flex-1 text-[10px] font-bold text-[#B8A39C] flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        ضبط‌شده نیست
                      </span>
                    )}
                    {c.customerId && (
                      <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent('open-customer-report', { detail: { id: c.customerId } }))}
                        title="گزارش این مشتری"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-black text-emerald-800 bg-emerald-50 border border-emerald-200 cursor-pointer"
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        گزارش مشتری
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
