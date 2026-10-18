import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, Briefcase, CalendarCheck2, CheckCircle2, Check, Clock, HeartPulse, Hourglass, MoreHorizontal, Search, Send, Share2, Trash2, Wallet, XCircle } from 'lucide-react';
import { askConfirm } from '../../lib/confirmDialog';
import { api, LeaveRequest } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, unitName } from '../../lib/money';
import { formatTaskDate, todayIso } from '../../lib/taskDates';
import { Avatar, JalaliDateField } from '../tasks/TasksView';
import { MoneyInput, digitsOf } from '../common/MoneyInput';
import { matchesAll } from '../../lib/searchAll';
import { LeaveSummary } from './LeaveSummary';

const TYPES = [
  { id: 'ANNUAL', label: 'استحقاقی', Icon: CalendarCheck2, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { id: 'SICK', label: 'استعلاجی', Icon: HeartPulse, tone: 'text-rose-700 bg-rose-50 border-rose-200' },
  { id: 'UNPAID', label: 'بدون حقوق', Icon: Wallet, tone: 'text-amber-800 bg-amber-50 border-amber-200' },
  { id: 'HOURLY', label: 'ساعتی', Icon: Hourglass, tone: 'text-sky-700 bg-sky-50 border-sky-200' },
  { id: 'MISSION', label: 'ماموریت', Icon: Briefcase, tone: 'text-violet-700 bg-violet-50 border-violet-200' },
  { id: 'OTHER', label: 'سایر', Icon: MoreHorizontal, tone: 'text-slate-700 bg-slate-50 border-slate-200' },
] as const;

const STATUS = {
  PENDING: { text: 'در انتظار تایید', cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: Clock },
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

const FWD_KEY = (kind: string) => `leave_forward_${kind}`;
const readForward = (kind: string): string[] => {
  try {
    return JSON.parse(localStorage.getItem(FWD_KEY(kind)) || '[]');
  } catch {
    return [];
  }
};

/**
 * «درخواست مرخصی» and «درخواست مساعده»: the employee sends a request to the manager of the unit (or the CEO). The one who approves chooses,
 * right there, who the approved form is sent on to (the accountant for an advance, the personnel officer for a leave…); they get it as a notice
 * and find it under «ارجاع‌شده به من».
 */
export const LeaveView: React.FC = () => {
  const { currentUser, showToast, staffList } = useAppContext();
  const [mine, setMine] = useState<LeaveRequest[]>([]);
  const [all, setAll] = useState<LeaveRequest[]>([]);
  const [forwarded, setForwarded] = useState<LeaveRequest[]>([]);
  const [canDecide, setCanDecide] = useState(false);
  const [view, setView] = useState<'mine' | 'inbox' | 'all' | 'forwarded' | 'summary'>('mine');
  const [kind, setKind] = useState<'leave' | 'advance'>('leave');
  const [type, setType] = useState<(typeof TYPES)[number]['id']>('ANNUAL');
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [fromTime, setFromTime] = useState('08:00');
  const [toTime, setToTime] = useState('12:00');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [installments, setInstallments] = useState('1');
  const [needDate, setNeedDate] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  // the approve / reject panel of one request
  const [panel, setPanel] = useState<{ id: string; mode: 'approve' | 'reject'; kind: string } | null>(null);
  const [note, setNote] = useState('');
  const [fwd, setFwd] = useState<string[]>([]);
  const [fwdQ, setFwdQ] = useState('');

  const load = useCallback(() => {
    api.leaves('mine').then((r) => { setMine(r.leaves); setCanDecide(r.canDecide); if (r.canDecide) setView((v) => (v === 'mine' ? 'inbox' : v)); }).catch(() => {});
    api.leaves('all').then((r) => setAll(r.leaves)).catch(() => setAll([]));
    api.leaves('forwarded').then((r) => setForwarded(r.leaves)).catch(() => setForwarded([]));
  }, []);
  // the first answer decides which list a CEO sees first; later refreshes keep the person's own choice
  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const advance = kind === 'advance';
  const hourly = !advance && type === 'HOURLY';
  const days = hourly ? 0 : dayCount(from, to < from ? from : to);

  const send = async () => {
    if (advance) {
      const n = Number(digitsOf(amount));
      if (!n || n <= 0) {
        showToast('مبلغ مساعده را بنویسید.');
        return;
      }
      setBusy(true);
      try {
        const r = await api.leaveCreate({ kind: 'advance', amount: n, installments: Number(installments) || 1, needDate, reason: reason.trim() });
        showToast(`درخواست مساعده برای ${(r.to && r.to.length ? r.to.join(' و ') : 'مدیرعامل')} ارسال شد.`);
        setReason('');
        setAmount('');
        load();
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'ارسال نشد.');
      } finally {
        setBusy(false);
      }
      return;
    }
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
      const r = await api.leaveCreate({ type, fromDate: from, toDate: hourly ? from : to, fromTime: hourly ? fromTime : undefined, toTime: hourly ? toTime : undefined, reason: reason.trim() });
      showToast(`درخواست مرخصی برای ${(r.to && r.to.length ? r.to.join(' و ') : 'مدیرعامل')} ارسال شد.`);
      setReason('');
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ارسال نشد.');
    } finally {
      setBusy(false);
    }
  };

  const openPanel = (l: LeaveRequest, mode: 'approve' | 'reject') => {
    const k = l.kind === 'advance' ? 'advance' : 'leave';
    setPanel({ id: l.id, mode, kind: k });
    setNote('');
    setFwdQ('');
    setFwd(mode === 'approve' ? readForward(k).filter((id) => id !== l.userId && staffList.some((u) => u.id === id && u.isActive)) : []);
  };
  const decide = async () => {
    if (!panel) return;
    const status = panel.mode === 'approve' ? 'APPROVED' : 'REJECTED';
    try {
      await api.leaveDecide(panel.id, status, note, panel.mode === 'approve' ? fwd : []);
      if (panel.mode === 'approve') {
        try {
          localStorage.setItem(FWD_KEY(panel.kind), JSON.stringify(fwd));
        } catch {
          /* storage unavailable */
        }
      }
      showToast(status === 'APPROVED' ? (fwd.length ? 'تایید شد و ارجاع داده شد.' : 'تایید شد.') : 'رد شد.');
      setPanel(null);
      setNote('');
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ثبت نشد.');
    }
  };
  const cancel = async (id: string) => {
    if (!(await askConfirm('این درخواست پس گرفته شود؟', { tone: 'warning', title: 'درخواست پس گرفته شود؟', confirmText: 'بله، پس گرفته شود' }))) return;
    try {
      await api.leaveCancel(id);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'پس گرفته نشد.');
    }
  };

  const pending = useMemo(() => all.filter((l) => l.status === 'PENDING'), [all]);
  const list = view === 'inbox' ? pending : view === 'all' ? all : view === 'forwarded' ? forwarded : mine;

  const card = (l: LeaveRequest, forCeo: boolean) => {
    const st = STATUS[l.status];
    const isAdv = l.kind === 'advance';
    const ty = isAdv ? { Icon: Banknote, tone: 'text-amber-800 bg-amber-50 border-amber-200' } : TYPES.find((x) => x.id === l.type) || TYPES[5];
    const open = panel?.id === l.id;
    const people = staffList.filter((u) => u.isActive && u.id !== l.userId && matchesAll(u, fwdQ));
    return (
      <div key={l.id} className="rounded-2xl border border-[#EBDBCE] bg-white p-3.5 space-y-2.5" data-leave-card={isAdv ? 'advance' : 'leave'}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${ty.tone}`}>
              <ty.Icon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-xs font-black text-[#3A241F] truncate">{forCeo ? `${l.userName} · ` : ''}{l.typeLabel}{isAdv && l.amount ? ` · ${formatMoney(l.amount)} ${unitName()}` : ''}</div>
              <div className="text-[11px] font-bold text-[#8C6F66]">
                {isAdv ? (
                  <>
                    {l.installments && l.installments > 1 ? `${toPersianDigits(l.installments)} قسط` : 'یک‌جا'} · نیاز تا {formatTaskDate(l.needDate || l.fromDate)}
                  </>
                ) : (
                  <>
                    {formatTaskDate(l.fromDate)}
                    {l.toDate !== l.fromDate ? ` تا ${formatTaskDate(l.toDate)}` : ''}
                    {l.fromTime ? ` · ${toPersianDigits(l.fromTime)} تا ${toPersianDigits(l.toTime || '')}` : l.type !== 'HOURLY' ? ` · ${toPersianDigits(dayCount(l.fromDate, l.toDate))} روز` : ''}
                  </>
                )}
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
          <div className="text-[11px] font-bold text-[#8C6F66] space-y-1">
            <div>
              {l.decidedByName ? `${l.status === 'APPROVED' ? 'تایید' : 'رد'} توسط ${l.decidedByName}` : ''}
              {l.note ? ` — «${l.note}»` : ''}
            </div>
            {l.status === 'APPROVED' && l.forwardNames && l.forwardNames.length > 0 && (
              <div className="flex items-center gap-1.5 text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-2.5 py-1.5" data-leave-forwarded>
                <Share2 className="w-3.5 h-3.5 shrink-0" />
                ارجاع شد به: {l.forwardNames.join('، ')}
              </div>
            )}
          </div>
        )}
        {l.status === 'PENDING' && forCeo && canDecide && !open && (
          <div className="flex gap-2">
            <button type="button" onClick={() => openPanel(l, 'approve')} className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer">{isAdv ? 'تایید مساعده' : 'تایید مرخصی'}</button>
            <button type="button" onClick={() => openPanel(l, 'reject')} className="flex-1 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-black cursor-pointer">رد</button>
          </div>
        )}
        {l.status === 'PENDING' && forCeo && canDecide && open && panel && (
          <div className="space-y-2.5 rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3" data-decide-panel>
            <input className={field} placeholder="توضیح (اختیاری)" value={note} onChange={(e) => setNote(e.target.value)} />
            {panel.mode === 'approve' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-black text-[#3A241F] flex items-center gap-1.5"><Share2 className="w-3.5 h-3.5 text-sky-700" />بعد از تایید، برای چه کسانی برود؟</div>
                  {fwd.length > 0 && <span className="text-[10px] font-black text-sky-700 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5">{toPersianDigits(fwd.length)} نفر</span>}
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-[#8C6F66]" />
                  <input className={`${field} pr-9`} placeholder="جستجوی همکار…" value={fwdQ} onChange={(e) => setFwdQ(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-52 overflow-y-auto" data-forward-people>
                  {people.map((u) => {
                    const on = fwd.includes(u.id);
                    return (
                      <button key={u.id} type="button" onClick={() => setFwd((x) => (on ? x.filter((i) => i !== u.id) : [...x, u.id]))} className={`flex items-center gap-2.5 p-2 rounded-xl border text-right cursor-pointer transition-all ${on ? 'bg-sky-50 border-sky-400' : 'bg-white border-[#EBDBCE] hover:bg-[#FAF5F1]'}`}>
                        <Avatar user={u} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-black text-[#3A241F] truncate">{u.fullName}</span>
                          {u.departmentName ? <span className="block text-[10px] font-bold text-[#8C6F66] truncate">{u.departmentName}</span> : null}
                        </span>
                        <span className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${on ? 'bg-sky-600 border-sky-600 text-white' : 'border-[#EBDBCE] text-transparent'}`}><Check className="w-3 h-3" /></span>
                      </button>
                    );
                  })}
                  {people.length === 0 && <div className="col-span-full text-center text-[11px] font-bold text-[#8C6F66] py-3">همکاری پیدا نشد.</div>}
                </div>
                <div className="text-[10px] font-medium text-[#8C6F66]">کسانی که انتخاب می‌کنید اعلان می‌گیرند و درخواست تأییدشده را در «ارجاع‌شده به من» می‌بینند. خالی بگذارید تا ارجاع نشود.</div>
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={decide} className={`flex-1 py-2.5 rounded-xl text-white text-xs font-black cursor-pointer ${panel.mode === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                {panel.mode === 'approve' ? (fwd.length ? 'تایید و ارجاع' : 'تایید') : 'ثبت رد'}
              </button>
              <button type="button" onClick={() => setPanel(null)} className="px-4 py-2.5 rounded-xl bg-white border border-[#EBDBCE] text-xs font-black text-[#3A241F] cursor-pointer">انصراف</button>
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

  const tabs: [typeof view, string][] = canDecide
    ? [['inbox', `در انتظار تایید شما (${toPersianDigits(pending.length)})`], ['all', 'همهٔ درخواست‌ها'], ['mine', 'درخواست‌های من']]
    : [['mine', 'درخواست‌های من']];
  if (forwarded.length > 0) tabs.push(['forwarded', `ارجاع‌شده به من (${toPersianDigits(forwarded.length)})`]);
  tabs.push(['summary', 'خلاصهٔ مرخصی‌های من']);

  return (
    <div className="p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-5 gap-5" data-leave-view>
      {/* the request form */}
      <section className="lg:col-span-2 rounded-3xl border border-[#EBDBCE] bg-gradient-to-b from-[#FDFAF7] to-white p-5 space-y-4 self-start">
        <div className="grid grid-cols-2 gap-1 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-1" data-form-kind>
          {([['leave', 'مرخصی', CalendarCheck2], ['advance', 'مساعده', Banknote]] as const).map(([k, t, Icon]) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black cursor-pointer transition-all ${kind === k ? 'bg-white text-[#6E1B1B] shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'}`}>
              <Icon className="w-4 h-4" />
              {t}
            </button>
          ))}
        </div>
        <div>
          <h2 className="font-black text-sm text-[#3A241F]">{advance ? 'ثبت درخواست مساعده' : 'ثبت درخواست مرخصی'}</h2>
          <p className="text-[11px] text-[#8C6F66] mt-0.5">درخواست شما برای مدیر واحدتان (یا اگر واحد مدیر ندارد، مدیرعامل) ارسال می‌شود و نتیجه را اعلان می‌گیرید. بعد از تایید، برای همکارانی که باید اقدام کنند ارجاع می‌شود.</p>
        </div>

        {advance ? (
          <div className="space-y-3" data-advance-form>
            <div>
              <div className="text-[11px] font-black text-[#3A241F] mb-1.5">مبلغ مساعده</div>
              <MoneyInput value={amount} onChange={setAmount} placeholder="مثلاً ۵٬۰۰۰٬۰۰۰" className={field} />
              {amount && <div className="mt-1 text-[10px] font-bold text-[#8C6F66]">{formatMoney(Number(digitsOf(amount)))} {unitName()}</div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] font-black text-[#3A241F] mb-1.5">تعداد قسط (کسر از حقوق)</div>
                <select className={field} value={installments} onChange={(e) => setInstallments(e.target.value)}>
                  {[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map((n) => (
                    <option key={n} value={n}>{n === 1 ? 'یک‌جا (یک ماه)' : `${toPersianDigits(n)} ماه`}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[11px] font-black text-[#3A241F] mb-1.5">نیاز تا تاریخ</div>
                <JalaliDateField value={needDate} onChange={(v) => v && setNeedDate(v)} />
              </div>
            </div>
            {amount && Number(installments) > 1 && (
              <div className="text-[11px] font-black text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-1.5">
                هر ماه حدود {formatMoney(Math.round(Number(digitsOf(amount)) / Number(installments)))} {unitName()} کسر می‌شود.
              </div>
            )}
          </div>
        ) : (
          <>
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
          </>
        )}

        <div>
          <div className="text-[11px] font-black text-[#3A241F] mb-1.5">دلیل / توضیح {advance || type === 'ANNUAL' ? '(اختیاری)' : ''}</div>
          <textarea className={`${field} min-h-[84px] leading-6 font-medium`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={advance ? 'مثلاً: هزینهٔ درمان' : 'مثلاً: سفر خانوادگی'} />
        </div>

        <button type="button" disabled={busy} onClick={send} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#6E1B1B] hover:bg-[#561414] disabled:opacity-60 text-white text-xs font-black cursor-pointer shadow-md">
          <Send className="w-4 h-4" />
          ارسال درخواست
        </button>
      </section>

      {/* the lists */}
      <section className="lg:col-span-3 space-y-3 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map(([id, t]) => (
            <button key={id} type="button" onClick={() => setView(id)} className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black cursor-pointer border ${view === id ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white text-[#3A241F] border-[#EBDBCE] hover:bg-[#FAF5F1]'}`}>
              {t}
            </button>
          ))}
        </div>
        {view === 'summary' ? (
          <LeaveSummary leaves={mine.filter((l) => l.kind !== 'advance')} />
        ) : list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#EBDBCE] p-10 text-center text-xs font-bold text-[#8C6F66]">
            {view === 'inbox' ? 'درخواستی در انتظار تایید نیست.' : view === 'forwarded' ? 'چیزی به شما ارجاع نشده است.' : 'هنوز درخواستی ثبت نشده است.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{list.map((l) => card(l, view !== 'mine'))}</div>
        )}
      </section>
    </div>
  );
};
