import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing, Phone, Search, X, Users, UserPlus } from 'lucide-react';
import { api, VoipCall } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';
import { useAppContext } from '../../context/AppContext';

const dur = (s: number) => (s > 0 ? toPersianDigits(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`) : '');
const clock = (iso: string) => toPersianDigits(new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));

const STATUS_TEXT: Record<string, string> = { answered: 'پاسخ داده شد', missed: 'بی‌پاسخ', busy: 'مشغول', failed: 'ناموفق' };

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
          <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
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
  const { showToast, currentUser } = useAppContext();
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

  const missedCount = (calls || []).filter((c) => c.direction === 'in' && c.status !== 'answered').length;

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
      <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[88vh] flex flex-col border border-[#EBDBCE] text-right">
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
