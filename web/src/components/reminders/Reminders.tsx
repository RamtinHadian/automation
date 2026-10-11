import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellRing, Check, Clock, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { api, Reminder } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, todayIso } from '../../lib/taskDates';
import { isAudioReady, isSoundEnabled, playSound } from '../../lib/notifications';
import { JalaliDateField } from '../tasks/TasksView';
import { Modal, field, label } from '../crm/crmUi';

const REPEAT_LABEL: Record<string, string> = { none: 'یک‌بار', daily: 'هر روز', weekly: 'هر هفته' };
const SNOOZE: [string, number][] = [['۵ دقیقه', 5], ['۱۰ دقیقه', 10], ['۳۰ دقیقه', 30], ['۱ ساعت', 60], ['۳ ساعت', 180], ['فردا', 24 * 60]];
const CHANGED = 'reminders-changed';
const pad = (n: number) => String(n).padStart(2, '0');

/** The reminders of the signed-in person, refreshed by itself (every half minute, when the window gets focus, and after any change). */
function useReminders() {
  const [list, setList] = useState<Reminder[] | null>(null);
  const load = useCallback(() => {
    api.reminders().then((r) => setList(r.reminders)).catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 30000);
    window.addEventListener(CHANGED, load);
    window.addEventListener('focus', load);
    return () => {
      window.clearInterval(t);
      window.removeEventListener(CHANGED, load);
      window.removeEventListener('focus', load);
    };
  }, [load]);
  return { list, reload: () => window.dispatchEvent(new Event(CHANGED)) };
}

// ---------- the pop-up in the middle of the page ----------

export const ReminderPopup: React.FC = () => {
  const { list, reload } = useReminders();
  const { notifications, showToast } = useAppContext();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  // a reminder that fires reaches the page as a notification as well: fetch at once instead of waiting for the next round
  const lastNote = notifications.find((n) => n.ref?.type === 'reminder')?.id;
  useEffect(() => {
    if (lastNote) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastNote]);
  const fired = useMemo(() => (list || []).filter((r) => r.status === 'fired' && !hidden.has(r.id)), [list, hidden]);
  const r = fired[0];
  const rid = r?.id;
  const [audioOk, setAudioOk] = useState(true);
  // the chime repeats every eight seconds (up to ten times) until the person answers, and phones vibrate; a reminder is something the person asked for, so quiet hours do not mute it
  useEffect(() => {
    if (!rid) return;
    let n = 0;
    const ring = () => {
      if (isSoundEnabled()) playSound('bell', 1);
      try {
        navigator.vibrate?.([250, 120, 250]);
      } catch {
        /* not supported */
      }
      setAudioOk(!isSoundEnabled() || isAudioReady());
      n++;
    };
    ring();
    const t = window.setInterval(() => (n < 10 ? ring() : window.clearInterval(t)), 8000);
    return () => window.clearInterval(t);
  }, [rid]);
  if (!r) return null;

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      showToast(ok);
      reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'خطا');
    }
  };
  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-[radial-gradient(circle_at_50%_30%,rgba(124,58,237,.55),rgba(20,6,31,.88))] backdrop-blur-md" dir="rtl" data-reminder-popup onPointerDown={() => { if (!audioOk && isSoundEnabled()) { playSound('bell', 1); setAudioOk(true); } }}>
      <div className="relative w-full max-w-md rounded-[2rem] bg-white shadow-[0_30px_90px_rgba(0,0,0,.55)] border border-white/60 overflow-hidden text-center animate-[remIn_.35s_ease-out]">
        <style>{`@keyframes remIn{from{opacity:0;transform:translateY(20px) scale(.94)}to{opacity:1;transform:none}}@keyframes remRing{0%{transform:scale(.8);opacity:.7}100%{transform:scale(1.9);opacity:0}}@keyframes remShake{0%,100%{transform:rotate(0)}15%{transform:rotate(14deg)}30%{transform:rotate(-12deg)}45%{transform:rotate(9deg)}60%{transform:rotate(-6deg)}75%{transform:rotate(3deg)}}`}</style>
        <div className="bg-gradient-to-br from-[#7C3AED] via-[#BE123C] to-[#F97316] pt-9 pb-12 px-6 text-white relative">
          <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-white/40 animate-[remRing_1.8s_ease-out_infinite]" />
            <span className="absolute inset-0 rounded-full bg-white/30 animate-[remRing_1.8s_ease-out_.6s_infinite]" />
            <span className="relative w-20 h-20 rounded-full bg-white/20 border-2 border-white/60 flex items-center justify-center backdrop-blur">
              <BellRing className="w-10 h-10 animate-[remShake_1.4s_ease-in-out_infinite]" />
            </span>
          </div>
          <div className="mt-4 text-[11px] font-black tracking-wide opacity-90">یادآور</div>
          <h2 className="mt-1 text-xl font-black leading-8 break-words">{r.title}</h2>
        </div>
        <div className="relative z-10 -mt-6 mx-5 rounded-2xl bg-white shadow-md border border-[#EBDBCE] px-4 py-3 text-xs font-bold text-[#3A241F] flex items-center justify-center gap-2">
          <Clock className="w-4 h-4 text-[#BE123C]" />
          {formatTaskDate(r.date)} · {toPersianDigits(r.time)}
          {r.repeat !== 'none' && <span className="text-[#7C3AED]">· {REPEAT_LABEL[r.repeat]}</span>}
        </div>
        {!audioOk && <div className="mx-5 mt-4 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] font-black text-amber-900">برای شنیدن صدای یادآور، یک‌بار روی همین پنجره بزنید.</div>}
        {r.note && <p className="px-6 pt-4 text-[13px] leading-7 font-semibold text-[#3A241F] whitespace-pre-wrap break-words">{r.note}</p>}
        <div className="px-5 pt-5 pb-2">
          <button type="button" onClick={() => act(() => api.reminderDone(r.id), r.repeat === 'none' ? 'یادآور انجام‌شده ثبت شد.' : 'یادآور انجام شد؛ نوبت بعدی ثبت است.')} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-l from-[#0D9488] to-[#16A34A] text-white text-sm font-black shadow-lg cursor-pointer active:scale-[.98]">
            <Check className="w-5 h-5" /> انجام شد
          </button>
          <div className="mt-4 text-[11px] font-black text-[#8C6F66]">یادم بینداز بعد از:</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {SNOOZE.map(([t, m]) => (
              <button key={m} type="button" onClick={() => act(() => api.reminderSnooze(r.id, m), `یادآور ${t} دیگر تکرار می‌شود.`)} className="py-2.5 rounded-xl border border-[#EBDBCE] bg-[#FAF5F1] text-[12px] font-black text-[#3A241F] hover:bg-[#F6D9CD] cursor-pointer">
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="px-5 pb-5 pt-2 flex items-center justify-between text-[11px] font-bold text-[#8C6F66]">
          <button type="button" onClick={() => setHidden((h) => new Set(h).add(r.id))} className="underline cursor-pointer">فعلاً ببند</button>
          {fired.length > 1 && <span>{toPersianDigits(fired.length - 1)} یادآور دیگر هم منتظر است</span>}
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ---------- the page «یادآور» in «امور اداری» ----------

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

const ReminderForm: React.FC<{ r: Partial<Reminder>; onClose: () => void; onSaved: () => void }> = ({ r, onClose, onSaved }) => {
  const { showToast } = useAppContext();
  const base = useMemo(() => {
    const d = new Date(Date.now() + 3600000);
    return { date: todayIso(), h: d.getHours(), m: Math.ceil(d.getMinutes() / 5) * 5 === 60 ? 0 : Math.ceil(d.getMinutes() / 5) * 5 };
  }, []);
  const [title, setTitle] = useState(r.title || '');
  const [note, setNote] = useState(r.note || '');
  const [date, setDate] = useState<string | undefined>(r.date || base.date);
  const [h, setH] = useState(r.time ? Number(r.time.slice(0, 2)) : base.h);
  const [m, setM] = useState(r.time ? Number(r.time.slice(3, 5)) : base.m);
  const [repeat, setRepeat] = useState(r.repeat || 'none');
  const [busy, setBusy] = useState(false);

  const quick = (mins: number) => {
    const d = new Date(Date.now() + mins * 60000);
    setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setH(d.getHours());
    setM(Math.round(d.getMinutes() / 5) * 5 === 60 ? 55 : Math.round(d.getMinutes() / 5) * 5);
  };
  const at = (dayOffset: number, hour: number) => {
    const d = new Date(Date.now() + dayOffset * 86400000);
    setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setH(hour);
    setM(0);
  };
  const save = async () => {
    if (!title.trim()) return showToast('عنوان یادآور را بنویسید.');
    if (!date) return showToast('تاریخ را انتخاب کنید.');
    setBusy(true);
    try {
      const body = { title: title.trim(), note: note.trim(), date, time: `${pad(h)}:${pad(m)}`, repeat };
      if (r.id) await api.reminderUpdate(r.id, body);
      else await api.reminderCreate(body);
      showToast('یادآور ذخیره شد.');
      onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'خطا');
      setBusy(false);
    }
  };
  const chip = 'px-3 py-1.5 rounded-lg border border-[#EBDBCE] bg-white text-[11px] font-black text-[#3A241F] hover:bg-[#FAF5F1] cursor-pointer';
  return (
    <Modal title={r.id ? 'ویرایش یادآور' : 'یادآور تازه'} onClose={onClose} footer={
      <>
        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[#EBDBCE] text-xs font-black cursor-pointer">انصراف</button>
        <button type="button" disabled={busy} onClick={save} className="px-5 py-2.5 rounded-xl bg-[#7C3AED] text-white text-xs font-black cursor-pointer disabled:opacity-60">ذخیره</button>
      </>
    }>
      <div><span className={label}>چه چیزی یادم بیندازد؟</span><input value={title} onChange={(e) => setTitle(e.target.value)} className={field} autoFocus placeholder="مثلاً تماس با مشتری، پرداخت قسط…" /></div>
      <div>
        <span className={label}>کی؟ (انتخاب سریع)</span>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={chip} onClick={() => quick(10)}>۱۰ دقیقه دیگر</button>
          <button type="button" className={chip} onClick={() => quick(60)}>۱ ساعت دیگر</button>
          <button type="button" className={chip} onClick={() => at(0, 18)}>امروز ساعت ۱۸</button>
          <button type="button" className={chip} onClick={() => at(1, 9)}>فردا ساعت ۹</button>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><span className={label}>تاریخ</span><JalaliDateField value={date} onChange={setDate} /></div>
        <div>
          <span className={label}>ساعت</span>
          <div className="flex items-center gap-2" dir="ltr">
            <select value={h} onChange={(e) => setH(Number(e.target.value))} className={field + ' text-center'}>{HOURS.map((x) => <option key={x} value={x}>{toPersianDigits(pad(x))}</option>)}</select>
            <b>:</b>
            <select value={m} onChange={(e) => setM(Number(e.target.value))} className={field + ' text-center'}>{(MINUTES.includes(m) ? MINUTES : [...MINUTES, m].sort((a, b) => a - b)).map((x) => <option key={x} value={x}>{toPersianDigits(pad(x))}</option>)}</select>
          </div>
        </div>
      </div>
      <div>
        <span className={label}>تکرار</span>
        <div className="flex gap-1.5">
          {Object.entries(REPEAT_LABEL).map(([k, t]) => (
            <button key={k} type="button" onClick={() => setRepeat(k as Reminder['repeat'])} className={`${chip} ${repeat === k ? '!bg-[#7C3AED] !text-white !border-[#7C3AED]' : ''}`}>{t}</button>
          ))}
        </div>
      </div>
      <div><span className={label}>توضیح (اختیاری)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={field} /></div>
    </Modal>
  );
};

export const RemindersView: React.FC = () => {
  const { list, reload } = useReminders();
  const { showToast } = useAppContext();
  const [edit, setEdit] = useState<Partial<Reminder> | null>(null);
  const [showDone, setShowDone] = useState(false);

  const active = (list || []).filter((r) => r.status !== 'done');
  const done = (list || []).filter((r) => r.status === 'done');
  const remove = async (r: Reminder) => {
    if (!window.confirm(`یادآور «${r.title}» حذف شود؟`)) return;
    try {
      await api.reminderDelete(r.id);
      reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'خطا');
    }
  };
  const row = (r: Reminder) => (
    <div key={r.id} className={`px-4 py-3 flex items-center gap-3 ${r.status === 'done' ? 'opacity-55' : ''}`}>
      <span className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-white ${r.status === 'fired' ? 'bg-gradient-to-br from-[#BE123C] to-[#F97316]' : r.status === 'done' ? 'bg-[#B9A9A2]' : 'bg-gradient-to-br from-[#7C3AED] to-[#6366F1]'}`}>
        {r.status === 'fired' ? <BellRing className="w-5 h-5" /> : r.status === 'done' ? <Check className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-black text-[#3A241F] truncate">{r.title}</div>
        <div className="text-[10px] font-bold text-[#8C6F66] flex items-center gap-1.5 flex-wrap">
          <span>{formatTaskDate(r.date)} · {toPersianDigits(r.time)}</span>
          {r.repeat !== 'none' && <span className="flex items-center gap-0.5 text-[#7C3AED]"><Repeat className="w-3 h-3" />{REPEAT_LABEL[r.repeat]}</span>}
          {r.status === 'fired' && <span className="text-[#BE123C]">زمانش رسیده</span>}
        </div>
        {r.note && <div className="text-[11px] text-[#8C6F66] truncate mt-0.5">{r.note}</div>}
      </div>
      {r.status !== 'done' && (
        <button type="button" onClick={() => setEdit(r)} className="p-2 text-[#8C6F66] hover:text-[#3A241F] cursor-pointer" aria-label="ویرایش"><Pencil className="w-4 h-4" /></button>
      )}
      <button type="button" onClick={() => remove(r)} className="p-2 text-[#8C6F66] hover:text-rose-700 cursor-pointer" aria-label="حذف"><Trash2 className="w-4 h-4" /></button>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-4" dir="rtl">
      <div className="flex items-center gap-3">
        <div>
          <h3 className="text-sm font-black text-[#3A241F]">یادآورهای من</h3>
          <p className="text-[11px] font-bold text-[#8C6F66]">در زمان تعیین‌شده، یک پنجرهٔ بزرگ وسط صفحه به شما یادآوری می‌کند. فقط خودتان آن‌ها را می‌بینید.</p>
        </div>
        <button type="button" onClick={() => setEdit({})} className="mr-auto flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl bg-gradient-to-l from-[#7C3AED] to-[#BE123C] text-white text-xs font-black shadow-md cursor-pointer">
          <Plus className="w-4 h-4" /> یادآور تازه
        </button>
      </div>
      {!list ? (
        <div className="p-8 text-center text-xs font-bold text-[#8C6F66]">در حال دریافت…</div>
      ) : active.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-[#EBDBCE] p-10 text-center text-xs font-bold text-[#8C6F66]">یادآوری ثبت نشده است. با «یادآور تازه» شروع کنید.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#EBDBCE] divide-y divide-[#F3E8DF] overflow-hidden">{active.map(row)}</div>
      )}
      {done.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowDone((v) => !v)} className="text-[11px] font-black text-[#8C6F66] underline cursor-pointer">
            {showDone ? 'پنهان‌کردن' : 'نمایش'} انجام‌شده‌های دو هفتهٔ اخیر ({toPersianDigits(done.length)})
          </button>
          {showDone && <div className="mt-2 bg-white rounded-2xl border border-[#EBDBCE] divide-y divide-[#F3E8DF] overflow-hidden">{done.map(row)}</div>}
        </div>
      )}
      {edit && <ReminderForm r={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
};
