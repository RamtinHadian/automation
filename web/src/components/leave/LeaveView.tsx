import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Briefcase, CalendarCheck2, CheckCircle2, Clock, HeartPulse, Hourglass, MoreHorizontal, Send, Trash2, Wallet, XCircle } from 'lucide-react';
import { api, LeaveRequest } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, todayIso } from '../../lib/taskDates';
import { JalaliDateField } from '../tasks/TasksView';

const TYPES = [
  { id: 'ANNUAL', label: 'استحقاقی', Icon: CalendarCheck2, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { id: 'SICK', label: 'استعلاجی', Icon: HeartPulse, tone: 'text-rose-700 bg-rose-50 border-rose-200' },
  { id: 'UNPAID', label: 'بدون حقوق', Icon: Wallet, tone: 'text-amber-800 bg-amber-50 border-amber-200' },
  { id: 'HOURLY', label: 'ساعتی', Icon: Hourglass, tone: 'text-sky-700 bg-sky-50 border-sky-200' },
  { id: 'MISSION', label: 'ماموریت', Icon: Briefcase, tone: 'text-violet-700 bg-violet-50 border-violet-200' },
  { id: 'OTHER', label: 'سایر', Icon: MoreHorizontal, tone: 'text-slate-700 bg-slate-50 border-slate-200' },
] as const;

const STATUS = {
  PENDING: { text: 'در انتظار مدیرعامل', cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: Clock },
  APPROVED: { text: 'تایید شد', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200', Icon: CheckCircle2 },
  REJECTED: { text: 'رد شد', cls: 'bg-rose-50 text-rose-800 border-rose-200', Icon: XCircle },
} as const;

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];
const field = 'w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none';

const dayCount = (from: string, to: string) => Math.max(1, Math.round((new Date(to + 'T12:00:00').getTime() - new Date(from + 'T12:00:00').getTime()) / 86400000) + 1);

const TimePick: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [h, m] = value.split(':');
  return (
    <div className="flex items-center gap-1.5" dir="ltr">
      <select className={field} value={h} onChange={(e) => onChange(`${e.target.value}:${m}`)}>
        {HOURS.map((x) => (
          <option key={x} value={x}>{toPersianDigits(x)}</option>
        ))}
      </select>
      <span className="font-black text-[#8C6F66]">:</span>
      <select className={field} value={m} onChange={(e) => onChange(`${h}:${e.target.value}`)}>
        {MINUTES.map((x) => (
          <option key={x} value={x}>{toPersianDigits(x)}</option>
        ))}
      </select>
    </div>
  );
};

/** «درخواست مرخصی»: the employee sends a request straight to the CEO; the CEO approves or rejects it. */
export const LeaveView: React.FC = () => {
  const { currentUser, showToast } = useAppContext();
  const [mine, setMine] = useState<LeaveRequest[]>([]);
  const [all, setAll] = useState<LeaveRequest[]>([]);
  const [canDecide, setCanDecide] = useState(false);
  const [view, setView] = useState<'mine' | 'inbox' | 'all'>('mine');
  const [type, setType] = useState<(typeof TYPES)[number]['id']>('ANNUAL');
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [fromTime, setFromTime] = useState('08:00');
  const [toTime, setToTime] = useState('12:00');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    api.leaves('mine').then((r) => { setMine(r.leaves); setCanDecide(r.canDecide); if (r.canDecide) setView((v) => (v === 'mine' ? 'inbox' : v)); }).catch(() => {});
    api.leaves('all').then((r) => setAll(r.leaves)).catch(() => setAll([]));
  }, []);
  // the first answer decides which list a CEO sees first; later refreshes keep the person's own choice
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const hourly = type === 'HOURLY';
  const days = hourly ? 0 : dayCount(from, to < from ? from : to);

  const send = async () => {
    if (!reason.trim() && type !== 'ANNUAL') {
      showToast('دلیل یا توضیح کوتاهی بنویسید.');
      return;
    }
    if (!hourly && to < from) {
      showToast('تاریخ پایان نباید قبل از تاریخ شروع باشد.');
      return;
    }
    setBusy(true);
    try {
      await api.leaveCreate({ type, fromDate: from, toDate: hourly ? from : to, fromTime: hourly ? fromTime : undefined, toTime: hourly ? toTime : undefined, reason: reason.trim() });
      showToast('درخواست مرخصی برای مدیرعامل ارسال شد.');
      setReason('');
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ارسال نشد.');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      await api.leaveDecide(id, status, note);
      showToast(status === 'APPROVED' ? 'مرخصی تایید شد.' : 'مرخصی رد شد.');
      setNoteFor(null);
      setNote('');
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ثبت نشد.');
    }
  };
  const cancel = async (id: string) => {
    if (!window.confirm('این درخواست پس گرفته شود؟')) return;
    try {
      await api.leaveCancel(id);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'پس گرفته نشد.');
    }
  };

  const pending = useMemo(() => all.filter((l) => l.status === 'PENDING'), [all]);
  const list = view === 'inbox' ? pending : view === 'all' ? all : mine;

  const card = (l: LeaveRequest, forCeo: boolean) => {
    const st = STATUS[l.status];
    const ty = TYPES.find((x) => x.id === l.type) || TYPES[5];
    return (
      <div key={l.id} className="rounded-2xl border border-[#EBDBCE] bg-white p-3.5 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${ty.tone}`}>
              <ty.Icon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-black text-[#3A241F] truncate">{forCeo ? `${l.userName} · ` : ''}{l.typeLabel}</div>
              <div className="text-[11px] font-bold text-[#8C6F66]">
                {formatTaskDate(l.fromDate)}
                {l.toDate !== l.fromDate ? ` تا ${formatTaskDate(l.toDate)}` : ''}
                {l.fromTime ? ` · ${toPersianDigits(l.fromTime)} تا ${toPersianDigits(l.toTime || '')}` : l.type !== 'HOURLY' ? ` · ${toPersianDigits(dayCount(l.fromDate, l.toDate))} روز` : ''}
                {forCeo && l.departmentName ? ` · ${l.departmentName}` : ''}
              </div>
            </div>
          </div>
          <span className={`shrink-0 flex items-center gap-1 text-[10px] font-black rounded-full px-2.5 py-1 border ${st.cls}`}>
            <st.Icon className="w-3 h-3" />
            {st.text}
          </span>
        </div>
        {l.reason && <p className="text-[11px] leading-6 text-[#503730] bg-[#FAF5F1] rounded-xl px-3 py-2">{l.reason}</p>}
        {l.status !== 'PENDING' && (
          <div className="text-[11px] font-bold text-[#8C6F66]">
            {l.decidedByName ? `${l.status === 'APPROVED' ? 'تایید' : 'رد'} توسط ${l.decidedByName}` : ''}
            {l.note ? ` — «${l.note}»` : ''}
          </div>
        )}
        {l.status === 'PENDING' && forCeo && canDecide && (
          <div className="space-y-2">
            {noteFor === l.id && <input className={field} placeholder="توضیح (اختیاری)" value={note} onChange={(e) => setNote(e.target.value)} />}
            <div className="flex gap-2">
              <button type="button" onClick={() => decide(l.id, 'APPROVED')} className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer">تایید مرخصی</button>
              <button type="button" onClick={() => (noteFor === l.id ? decide(l.id, 'REJECTED') : (setNoteFor(l.id), setNote('')))} className="flex-1 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-black cursor-pointer">
                {noteFor === l.id ? 'ثبت رد' : 'رد'}
              </button>
            </div>
          </div>
        )}
        {l.status === 'PENDING' && !forCeo && l.userId === currentUser.id && (
          <button type="button" onClick={() => cancel(l.id)} className="flex items-center gap-1 text-[11px] font-black text-rose-600 hover:underline cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" />
            پس گرفتن درخواست
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-5 gap-5" data-leave-view>
      {/* the request form */}
      <section className="lg:col-span-2 rounded-3xl border border-[#EBDBCE] bg-gradient-to-b from-[#FDFAF7] to-white p-5 space-y-4 self-start">
        <div>
          <h2 className="font-black text-sm text-[#3A241F]">ثبت درخواست مرخصی</h2>
          <p className="text-[11px] text-[#8C6F66] mt-0.5">درخواست شما مستقیم برای مدیرعامل ارسال می‌شود و نتیجه را اعلان می‌گیرید.</p>
        </div>

        <div>
          <div className="text-[11px] font-black text-[#3A241F] mb-1.5">نوع مرخصی</div>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-2xl border text-[11px] font-black cursor-pointer transition-all ${type === t.id ? `${t.tone} ring-2 ring-offset-1 ring-[#6E1B1B]/30 shadow-sm` : 'bg-white border-[#EBDBCE] text-[#8C6F66] hover:bg-[#FAF5F1]'}`}
              >
                <t.Icon className="w-5 h-5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {hourly ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <div className="text-[11px] font-black text-[#3A241F] mb-1.5">تاریخ</div>
              <JalaliDateField value={from} onChange={(v) => { if (v) { setFrom(v); setTo(v); } }} />
            </div>
            <div>
              <div className="text-[11px] font-black text-[#3A241F] mb-1.5">از ساعت</div>
              <TimePick value={fromTime} onChange={setFromTime} />
            </div>
            <div>
              <div className="text-[11px] font-black text-[#3A241F] mb-1.5">تا ساعت</div>
              <TimePick value={toTime} onChange={setToTime} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] font-black text-[#3A241F] mb-1.5">از تاریخ</div>
              <JalaliDateField value={from} onChange={(v) => { if (v) { setFrom(v); if (to < v) setTo(v); } }} />
            </div>
            <div>
              <div className="text-[11px] font-black text-[#3A241F] mb-1.5">تا تاریخ</div>
              <JalaliDateField value={to} onChange={(v) => v && setTo(v)} />
            </div>
            <div className="col-span-2 text-[11px] font-black text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-1.5">
              مدت: {toPersianDigits(days)} روز
            </div>
          </div>
        )}

        <div>
          <div className="text-[11px] font-black text-[#3A241F] mb-1.5">دلیل / توضیح {type === 'ANNUAL' ? '(اختیاری)' : ''}</div>
          <textarea className={`${field} min-h-[84px] leading-6 font-medium`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: سفر خانوادگی" />
        </div>

        <button type="button" disabled={busy} onClick={send} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#6E1B1B] hover:bg-[#561414] disabled:opacity-60 text-white text-xs font-black cursor-pointer shadow-md">
          <Send className="w-4 h-4" />
          ارسال برای مدیرعامل
        </button>
      </section>

      {/* the lists */}
      <section className="lg:col-span-3 space-y-3 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {(canDecide
            ? ([['inbox', `در انتظار تایید شما (${toPersianDigits(pending.length)})`], ['all', 'همهٔ درخواست‌ها'], ['mine', 'مرخصی‌های من']] as const)
            : ([['mine', 'درخواست‌های من']] as const)
          ).map(([id, t]) => (
            <button key={id} type="button" onClick={() => setView(id)} className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black cursor-pointer border ${view === id ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white text-[#3A241F] border-[#EBDBCE] hover:bg-[#FAF5F1]'}`}>
              {t}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#EBDBCE] p-10 text-center text-xs font-bold text-[#8C6F66]">
            {view === 'inbox' ? 'درخواستی در انتظار تایید نیست.' : 'هنوز درخواستی ثبت نشده است.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{list.map((l) => card(l, view !== 'mine'))}</div>
        )}
      </section>
    </div>
  );
};
