import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, Pause, Play, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing, Phone, Search, X, Users, UserPlus } from 'lucide-react';
import { api, VoipCall } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';
import { useAppContext } from '../../context/AppContext';

const dur = (s: number) => (s > 0 ? toPersianDigits(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`) : '');
const clock = (iso: string) => toPersianDigits(new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));

const STATUS_TEXT: Record<string, string> = { answered: 'پاسخ داده شد', missed: 'بی‌پاسخ', busy: 'مشغول', failed: 'ناموفق' };

// recordings are often loud and harsh (both sides mixed, speakerphone echo): start quieter and remember what the person picks
const VOLUME_KEY = 'call_recording_volume';
const savedVolume = (): number => {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY) || '');
    if (v >= 0 && v <= 1) return v;
  } catch { /* private window */ }
  return 0.35;
};

/** Plays the recording of one call (fetched with the login, then played from memory). */
const RecordingButton: React.FC<{ id: string }> = ({ id }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const open = async () => {
    if (url) {
      setUrl(null);
      return;
    }
    setLoading(true);
    setErr('');
    try {
      setUrl(URL.createObjectURL(await api.voipRecording(id)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ضبط مکالمه در دسترس نیست.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <>
      <button type="button" onClick={open} title={url ? 'بستن پخش' : 'شنیدن مکالمهٔ ضبط‌شده'} className="p-2 rounded-xl text-rose-700 hover:bg-rose-50 cursor-pointer shrink-0">
        {url ? <Pause className="w-4 h-4" /> : <Play className={`w-4 h-4 ${loading ? 'animate-pulse' : ''}`} />}
      </button>
      {(url || err) && (
        <div className="basis-full order-last" dir="ltr">
          {url ? <audio src={url} controls autoPlay ref={(a) => { if (a && !a.dataset.vol) { a.dataset.vol = '1'; a.volume = savedVolume(); } }} onVolumeChange={(e) => { try { localStorage.setItem(VOLUME_KEY, String(e.currentTarget.volume)); } catch { /* private window */ } }} onPlay={(e) => document.querySelectorAll('audio').forEach((a) => { if (a !== e.currentTarget) a.pause(); })} className="w-full h-9" /> : <div className="text-[11px] font-bold text-rose-600 text-right" dir="rtl">{err}</div>}
        </div>
      )}
    </>
  );
};

/** One list of calls: direction icon, who, when, how long, and a call-back button. */
export const CallList: React.FC<{ calls: VoipCall[]; showUser?: boolean; onCall?: (number: string) => void; onSaveCustomer?: (number: string, name: string) => void; busy?: string | null; empty?: string }> = ({
  calls,
  showUser,
  onCall,
  onSaveCustomer,
  busy,
  empty = 'تماسی ثبت نشده است.',
}) => {
  if (calls.length === 0) return <div className="py-10 text-center text-xs font-bold text-gray-400">{empty}</div>;
  return (
    <div className="divide-y divide-[#EBDBCE]/60">
      {calls.map((c) => {
        const missed = c.direction === 'in' && c.status !== 'answered';
        const Icon = missed ? PhoneMissed : c.direction === 'out' ? PhoneOutgoing : c.direction === 'internal' ? Users : PhoneIncoming;
        const who = c.customerName || c.name || c.number;
        const callable = onCall && c.number && /^[0-9*#+]+$/.test(c.number);
        return (
          <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${missed ? 'bg-rose-100 text-rose-600' : c.status === 'answered' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              <Icon className="w-4 h-4" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-black text-[#3A241F] truncate">{who}</span>
              <span className="block text-[10px] text-[#8C6F66] truncate">
                {c.customerName && c.name ? `${c.name} · ` : ''}
                <span dir="ltr">{toPersianDigits(c.number)}</span> · {c.direction === 'in' ? 'ورودی' : c.direction === 'out' ? 'خروجی' : 'داخلی'} · {STATUS_TEXT[c.status] || c.status}
                {c.duration > 0 ? ` · ${dur(c.duration)}` : ''}
                {showUser && c.userName ? ` · ${c.userName}` : ''}
              </span>
            </span>
            <span className="text-[10px] text-[#8C6F66] text-left shrink-0">
              <span className="block">{formatTaskDate(c.startedAt.slice(0, 10))}</span>
              <span className="block">{clock(c.startedAt)}</span>
            </span>
            {c.hasRecording && <RecordingButton id={c.id} />}
            {c.customerId && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('open-customer-report', { detail: { id: c.customerId } }))}
                title="گزارش این مشتری (خریدها و قیمت‌های گرفته‌شده)"
                className="p-2 rounded-xl text-emerald-700 hover:bg-emerald-50 cursor-pointer shrink-0"
              >
                <BarChart3 className="w-4 h-4" />
              </button>
            )}
            {onSaveCustomer && !c.customerName && c.direction !== 'internal' && /^[0-9+]{7,}$/.test(c.number) && (
              <button
                type="button"
                onClick={() => onSaveCustomer(c.number, c.name)}
                title="ذخیره به‌عنوان مشتری جدید"
                className="p-2 rounded-xl text-violet-700 hover:bg-violet-50 cursor-pointer shrink-0"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            )}
            {callable && (
              <button
                type="button"
                disabled={busy !== null && busy !== undefined}
                onClick={() => onCall!(c.number)}
                title="تماس مجدد"
                className="p-2 rounded-xl text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 cursor-pointer shrink-0"
              >
                <PhoneCall className={`w-4 h-4 ${busy === c.number ? 'animate-pulse' : ''}`} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

type Filter = 'all' | 'missed' | 'in' | 'out';

/** «Call history» window: my calls (admins can switch to the whole company), with filters, search and call-back. */
export const CallLogModal: React.FC<{ onClose: () => void; isAdmin: boolean }> = ({ onClose, isAdmin }) => {
  const { showToast, currentUser, notifications, markNotificationsRead } = useAppContext();
  const canSaveCustomer = currentUser.canUseCrm === true || currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEPT_ADMIN';
  const [calls, setCalls] = useState<VoipCall[] | null>(null);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .voipCalls({ scope, limit: 300 })
      .then((r) => setCalls(r.calls))
      .catch(() => setCalls([]));
  }, [scope]);
  useEffect(() => {
    setCalls(null);
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (calls || []).filter((c) => {
      if (filter === 'missed' && !(c.direction === 'in' && c.status !== 'answered')) return false;
      if (filter === 'in' && c.direction !== 'in') return false;
      if (filter === 'out' && c.direction !== 'out') return false;
      return !s || `${c.number} ${c.name} ${c.customerName} ${c.userName}`.toLowerCase().includes(s);
    });
  }, [calls, filter, q]);

  // Missed calls that came in since the history was last opened. Opening it (calls loaded) reads them: the count is
  // remembered per person, and the call notifications (bell, pop-ups) are read too, so no red number is left behind.
  const seenKey = `calllog_seen_${currentUser.id}`;
  const [seenAt] = useState(() => {
    try {
      return localStorage.getItem(seenKey) || '';
    } catch {
      return '';
    }
  });
  // once the person has looked at the missed calls the red number is gone for good (not only while that tab is open)
  const [missedSeen, setMissedSeen] = useState(false);
  useEffect(() => {
    if (filter === 'missed') setMissedSeen(true);
  }, [filter]);
  const missedCount = missedSeen ? 0 : (calls || []).filter((c) => c.direction === 'in' && c.status !== 'answered' && c.startedAt > seenAt).length;
  const marked = useRef(false);
  useEffect(() => {
    if (calls === null || marked.current) return;
    marked.current = true;
    try {
      localStorage.setItem(seenKey, new Date().toISOString());
    } catch {
      /* storage unavailable */
    }
    const ids = notifications.filter((n) => !n.read && n.kind === 'call').map((n) => n.id);
    if (ids.length) markNotificationsRead(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls]);

  const callBack = async (number: string) => {
    setBusy(number);
    try {
      await api.voipCall(number);
      showToast('تلفن داخلی شما زنگ می‌خورد؛ گوشی را بردارید تا تماس وصل شود.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'تماس برقرار نشد.');
    } finally {
      setBusy(null);
    }
  };

  // Opens the CRM «new customer» form with this number filled in.
  const saveAsCustomer = (number: string, name: string) => {
    try {
      sessionStorage.setItem('crm_open', JSON.stringify({ type: 'newCustomer', phone: number, name }));
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new Event('goto-crm'));
    window.dispatchEvent(new Event('open-crm-item'));
    onClose();
  };

  const tab = (id: Filter, label: string, n?: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setFilter(id)}
      className={`px-3 py-1.5 rounded-xl text-[11px] font-black cursor-pointer ${filter === id ? 'bg-emerald-600 text-white' : 'bg-[#FAF5F1] text-[#3A241F] border border-[#EBDBCE]'}`}
    >
      {label}
      {n ? <span className="mr-1 bg-rose-500 text-white rounded-full px-1.5 text-[9px]">{toPersianDigits(n)}</span> : null}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={onClose}>
      <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-xl h-[86vh] max-h-[720px] flex flex-col border border-[#EBDBCE] text-right">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2">
            <Phone className="w-4 h-4 text-emerald-700" />
            سابقهٔ تماس‌ها
          </h3>
          <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-3 border-b border-[#EBDBCE]/70 space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {tab('all', 'همه')}
            {tab('missed', 'بی‌پاسخ', missedCount)}
            {tab('in', 'ورودی')}
            {tab('out', 'خروجی')}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setScope((s) => (s === 'mine' ? 'all' : 'mine'))}
                className={`mr-auto px-3 py-1.5 rounded-xl text-[11px] font-black cursor-pointer border ${scope === 'all' ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}
              >
                {scope === 'all' ? 'همهٔ شرکت' : 'فقط تماس‌های من'}
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#8C6F66] absolute right-3 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در نام یا شماره" className="w-full pr-9 pl-3 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs outline-hidden" />
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {calls === null ? (
            <div className="py-10 text-center text-xs font-bold text-gray-400">در حال بارگذاری...</div>
          ) : (
            <CallList calls={shown} showUser={scope === 'all'} onCall={callBack} onSaveCustomer={canSaveCustomer ? saveAsCustomer : undefined} busy={busy} empty="تماسی با این فیلتر پیدا نشد." />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
