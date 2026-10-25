import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, MessageCircle, Phone, AlertTriangle, ClipboardList, FileText, Send, Stamp, UserPlus, VolumeX, X } from 'lucide-react';
import { formatMoney, unitName } from '../../lib/money';
import { toPersianDigits } from '../../lib/jalali';
import { normPhone } from '../../lib/customerImport';
import { fullPhone, useVoipArea } from '../../lib/voipArea';
import { useAppContext } from '../../context/AppContext';
import { canSeeSalesTotals } from '../../lib/permissions';
import { isExtensionNumber, savedCallTitle, SavedContactLine, UnknownNumberActions, useSavedContact } from './UnknownNumber';
import { CustomerFinance } from '../sepidar/CustomerFinance';
import { AppNotification, getNotifyConfig, isAudioReady, isSoundEnabled, playChime } from '../../lib/notifications';

const showMs = () => Math.min(60, Math.max(3, getNotifyConfig()?.popupSeconds ?? 9)) * 1000;

const KIND = {
  file: { icon: Send, bar: 'bg-[#6E1B1B]', badge: 'bg-[#F6D9CD] text-[#6E1B1B]', ring: 'border-[#C98B6A]/50', fallback: 'فایل' },
  letter: { icon: Stamp, bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800', ring: 'border-amber-300', fallback: 'نامه' },
  task: { icon: ClipboardList, bar: 'bg-sky-500', badge: 'bg-sky-100 text-sky-800', ring: 'border-sky-300', fallback: 'وظیفه' },
  call: { icon: Phone, bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800', ring: 'border-emerald-300', fallback: 'تماس' },
  chat: { icon: MessageCircle, bar: 'bg-emerald-600', badge: 'bg-emerald-100 text-emerald-800', ring: 'border-emerald-300', fallback: 'پیام' },
  alert: { icon: AlertTriangle, bar: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700', ring: 'border-rose-300', fallback: 'هشدار' },
} as const;

const Card: React.FC<{ n: AppNotification; onOpen: () => void; onClose: () => void; waiting?: number }> = ({ n, onOpen, onClose, waiting }) => {
  const k = KIND[n.kind] || KIND.file;
  const Icon = k.icon || FileText;
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(() => !isAudioReady() && isSoundEnabled());
  const { deals, customers, activities, currentUser } = useAppContext();
  const isCall = n.kind === 'call';
  const cust = isCall && n.ref?.type === 'customer' ? customers.find((c) => c.id === n.ref!.id) : undefined;
  const summary = React.useMemo(() => {
    if (!cust) return null;
    const mine = deals.filter((d) => d.customerId === cust.id && d.proformaNumber);
    const won = deals.filter((d) => d.customerId === cust.id && d.stage === 'WON');
    return { bought: won.reduce((s, d) => s + (d.amount || 0), 0), wonCount: won.length, quotes: mine.length, status: cust.status };
  }, [cust, deals]);
  // what we know about the caller: the last prices given, the last talks and the open opportunities
  const history = React.useMemo(() => {
    if (!cust) return null;
    const mine = activities.filter((a) => a.customerId === cust.id);
    const byNew = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt);
    return {
      quotes: mine.filter((a) => a.type === 'QUOTE').sort(byNew).slice(0, 3),
      talks: mine.filter((a) => a.type !== 'QUOTE' && a.type !== 'MISSING' && (a.text || '').trim()).sort(byNew).slice(0, 5),
      openDeals: deals.filter((d) => d.customerId === cust.id && d.stage !== 'WON' && d.stage !== 'LOST'),
      interest: (cust.interest || '').trim(),
    };
  }, [cust, activities, deals]);
  const area = useVoipArea();
  const callNumber = isCall && n.ref?.type === 'phone' ? fullPhone(n.ref.id, area) : '';
  const savedContact = useSavedContact(callNumber);
  const unknownNumber = savedContact || (n.ref?.type === 'phone' && isExtensionNumber(n.ref.id)) ? '' : callNumber;
  // an incoming-call card stays until the call ends (or at most the number of seconds the admin set); the other cards use the admin's time, or stay until closed
  const incoming = isCall && n.label !== 'تماس بی‌پاسخ';
  const conf = getNotifyConfig();
  const callSecs = conf?.callPopupSeconds ?? 120;
  const noLimit = incoming ? callSecs === 0 : !!conf?.popupFixed;
  const total = useRef(incoming && callSecs > 0 ? callSecs * 1000 : showMs());
  useEffect(() => {
    if (!incoming) return;
    const end = () => onClose();
    window.addEventListener('hoormand-call-ended', end);
    return () => window.removeEventListener('hoormand-call-ended', end);
  }, [incoming, onClose]);
  const left = useRef(total.current);
  const startedAt = useRef(Date.now());

  // the seconds that are left (shown when other cards wait behind this one)
  const [secs, setSecs] = useState(Math.ceil(total.current / 1000));
  useEffect(() => {
    const t = setInterval(() => setSecs(Math.max(0, Math.ceil((left.current - (paused ? 0 : Date.now() - startedAt.current)) / 1000))), 250);
    return () => clearInterval(t);
  }, [paused]);

  // Auto-close, paused while the pointer is over the card.
  useEffect(() => {
    if (paused || noLimit) return;
    startedAt.current = Date.now();
    const t = setTimeout(onClose, left.current);
    return () => {
      clearTimeout(t);
      left.current = Math.max(1500, left.current - (Date.now() - startedAt.current));
    };
  }, [paused, onClose]);

  return (
    <div
      dir="rtl"
      role="alert"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{ animation: 'np-in 380ms cubic-bezier(.2,.9,.3,1.15) both' }}
      className={`relative overflow-hidden w-full bg-white rounded-2xl border ${k.ring} shadow-[0_14px_40px_rgba(58,36,31,0.28)] text-right`}
    >
      <button type="button" onClick={onOpen} className="w-full flex items-start gap-3 p-3.5 pr-3.5 text-right cursor-pointer hover:bg-[#FAF5F1]/70 transition-colors">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${k.badge}`}>
          <Icon className="w-5 h-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className={`inline-block text-[10px] font-black px-2 py-0.5 rounded-full mb-1 ${k.badge}`}>{n.label || k.fallback}</span>
          <span className="block text-[13px] font-black text-[#3A241F] leading-5">{savedContact ? savedCallTitle(savedContact) : n.title}</span>
          {n.body && <span className="block text-[11px] text-[#8C6F66] leading-5 mt-0.5 line-clamp-2">{n.body}</span>}
        </span>
      </button>

      {isCall && cust && history && history.openDeals.length > 0 && (
        <button type="button" onClick={onOpen} className="w-full text-right px-3.5 py-2.5 bg-violet-100 border-t-2 border-violet-400 space-y-1.5 cursor-pointer hover:bg-violet-200/70" data-call-open-deals>
          <div className="text-[11px] font-black text-violet-900">فرصت فروش باز</div>
          {history.openDeals.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 text-[12px] font-black text-violet-950">
              <span className="truncate">{d.title}</span>
              <span className="shrink-0">{formatMoney(d.amount || 0)} {unitName()}</span>
            </div>
          ))}
        </button>
      )}
      {isCall && cust && summary && (
        <div className="px-3.5 py-2 bg-emerald-50 border-t border-emerald-100 flex items-center justify-between gap-2 text-[11px] font-bold text-emerald-900">
          <span className="min-w-0">
            {canSeeSalesTotals(currentUser) ? (summary.wonCount > 0 ? `تا حالا ${formatMoney(summary.bought)} ${unitName()} خرید (${toPersianDigits(summary.wonCount)} فروش)` : 'هنوز خریدی ثبت نشده') : 'مشتری شناخته‌شده'}
            {summary.quotes > 0 ? ` · ${toPersianDigits(summary.quotes)} پیش‌فاکتور` : ''}
          </span>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('open-customer-report', { detail: { id: cust.id } }))}
            className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-black cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            گزارش
          </button>
        </div>
      )}
      {isCall && (cust || n.ref?.type === 'customer') && <CustomerFinance customerId={cust ? cust.id : n.ref!.id} compact />}
      {isCall && cust && history && (history.quotes.length > 0 || history.talks.length > 0 || history.interest) && (
        <button type="button" onClick={onOpen} className="w-full text-right px-3.5 py-2.5 bg-violet-50 border-t border-violet-100 space-y-1.5 cursor-pointer hover:bg-violet-100/70" data-call-history>
          <div className="text-[10px] font-black text-violet-800">سابقهٔ این مشتری (برای جزئیات بزنید)</div>
          {history.interest && <div className="text-[11px] font-bold text-[#3A241F]">دنبال: {history.interest}</div>}
          {history.quotes.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#3A241F]">
              <span className="truncate">قیمت «{a.itemName}»{a.spec ? ` (${a.spec})` : ''}</span>
              <span className="shrink-0 text-amber-800 font-black">{formatMoney(a.price || 0)} {unitName()}</span>
            </div>
          ))}
          {history.talks.map((a) => (
            <div key={a.id} className="text-[11px] text-[#5A4640] leading-5 line-clamp-2">• {a.text}</div>
          ))}
          
        </button>
      )}
      {savedContact && (
        <div className="px-3.5 py-2 bg-emerald-50 border-t border-emerald-100"><SavedContactLine number={callNumber} compact /></div>
      )}
      {unknownNumber && (
        <div className="px-3.5 py-2 bg-amber-50 border-t border-amber-100 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-amber-900">
          <span>شمارهٔ ناشناس؛ مشتری است؟</span>
          <UnknownNumberActions number={unknownNumber} compact />
        </div>
      )}

      {muted && (
        <button
          type="button"
          onClick={() => {
            playChime(n.kind);
            setMuted(!isAudioReady());
          }}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-50 border-t border-amber-100 text-[10px] font-black text-amber-900 cursor-pointer"
        >
          <VolumeX className="w-3.5 h-3.5" />
          صدا هنوز فعال نشده؛ برای فعال شدن اینجا را لمس کنید
        </button>
      )}

      <button
        type="button"
        onClick={onClose}
        title="بستن"
        className="absolute top-2 left-2 p-1 rounded-lg text-[#8C6F66] hover:bg-[#EBDBCE]/60 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {(waiting !== undefined || noLimit || incoming) && (
        <div className="flex items-center justify-between px-3.5 pb-2.5 pt-0.5 text-[10px] font-black text-[#8C6F66]" data-popup-queue>
          <span>{waiting === undefined ? '' : waiting > 0 ? `${toPersianDigits(waiting)} مورد دیگر در صف` : 'آخرین مورد'}</span>
          <span>{incoming ? (noLimit ? 'تا پایان تماس می‌ماند' : `تا پایان تماس (حداکثر ${toPersianDigits(secs)} ثانیهٔ دیگر)`) : noLimit ? 'ثابت؛ تا بسته نکنید می‌ماند' : `بسته می‌شود تا ${toPersianDigits(secs)} ثانیهٔ دیگر`}</span>
        </div>
      )}

      {!noLimit && <span
        className={`absolute bottom-0 right-0 h-1 w-full origin-right ${k.bar}`}
        style={{ animation: `np-bar ${total.current}ms linear both`, animationPlayState: paused ? 'paused' : 'running' }}
      />}
    </div>
  );
};

/** Pop-up cards that slide up from the corner of the screen when a notification arrives. */
export const NotificationPopups: React.FC = () => {
  const { popups: all, dismissPopup, openNotification } = useAppContext();
  // one at a time (the top-most of the pile first, its countdown runs, then the next one comes) unless an admin switched it off
  const queue = getNotifyConfig()?.popupQueue !== false;
  // After one is opened the next waits (its countdown does not start) until the page that was opened is closed: the window that came up is gone
  // (or, for a page without a window, a minute has passed, or the person presses «نمایش بعدی»).
  const [hold, setHold] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hold) return;
    const started = Date.now();
    let saw = false;
    const t = setInterval(() => {
      const open = [...document.querySelectorAll('.fixed.inset-0')].filter((el) => !host.current?.contains(el) && el.getClientRects().length > 0).length;
      if (open > 0) saw = true;
      if (saw && open === 0) setTimeout(() => setHold(false), 500);
      if (!saw && Date.now() - started > 60000) setHold(false);
      if (Date.now() - started > 600000) setHold(false);
    }, 400);
    return () => clearInterval(t);
  }, [hold]);
  if (all.length === 0) return null;
  const popups = hold ? [] : queue ? [all[all.length - 1]] : all.slice(0, 4);

  return createPortal(
    <>
      <style>{`
        @keyframes np-in { from { transform: translateY(130%) scale(.96); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes np-bar { from { transform: scaleX(1) } to { transform: scaleX(0) } }
      `}</style>
      <div ref={host} data-keep-anim className="fixed z-[2147483000] bottom-24 inset-x-3 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[380px] flex flex-col-reverse gap-2.5 pointer-events-none">
        {hold && queue && (
          <button type="button" onClick={() => setHold(false)} className="pointer-events-auto self-end px-3.5 py-2 rounded-full bg-[#3A241F] text-white text-[11px] font-black shadow-lg cursor-pointer" data-popup-hold>
            {toPersianDigits(all.length)} اعلان در انتظار است — نمایش بعدی
          </button>
        )}
        {popups.map((n) => (
          <div key={n.id} className="pointer-events-auto">
            <Card
              n={n}
              onOpen={() => {
                if (queue) setHold(true);
                openNotification(n);
              }}
              onClose={() => dismissPopup(n.id)}
              waiting={queue ? all.length - 1 : undefined}
            />
          </div>
        ))}
      </div>
    </>,
    document.body
  );
};
