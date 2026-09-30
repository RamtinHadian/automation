import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, AlertTriangle, ClipboardList, FileText, Send, Stamp, VolumeX, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { AppNotification, isAudioReady, isSoundEnabled, playChime } from '../../lib/notifications';

const SHOW_MS = 9000;

const KIND = {
  file: { icon: Send, bar: 'bg-[#6E1B1B]', badge: 'bg-[#F6D9CD] text-[#6E1B1B]', ring: 'border-[#C98B6A]/50', fallback: 'فایل' },
  letter: { icon: Stamp, bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-800', ring: 'border-amber-300', fallback: 'نامه' },
  task: { icon: ClipboardList, bar: 'bg-sky-500', badge: 'bg-sky-100 text-sky-800', ring: 'border-sky-300', fallback: 'وظیفه' },
  call: { icon: Phone, bar: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-800', ring: 'border-emerald-300', fallback: 'تماس' },
  alert: { icon: AlertTriangle, bar: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700', ring: 'border-rose-300', fallback: 'هشدار' },
} as const;

const Card: React.FC<{ n: AppNotification; onOpen: () => void; onClose: () => void }> = ({ n, onOpen, onClose }) => {
  const k = KIND[n.kind] || KIND.file;
  const Icon = k.icon || FileText;
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(() => !isAudioReady() && isSoundEnabled());
  const left = useRef(SHOW_MS);
  const startedAt = useRef(Date.now());

  // Auto-close, paused while the pointer is over the card.
  useEffect(() => {
    if (paused) return;
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
          <span className="block text-[13px] font-black text-[#3A241F] leading-5">{n.title}</span>
          {n.body && <span className="block text-[11px] text-[#8C6F66] leading-5 mt-0.5 line-clamp-2">{n.body}</span>}
        </span>
      </button>

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

      <span
        className={`absolute bottom-0 right-0 h-1 ${k.bar}`}
        style={{ animation: `np-bar ${SHOW_MS}ms linear both`, animationPlayState: paused ? 'paused' : 'running' }}
      />
    </div>
  );
};

/** Pop-up cards that slide up from the corner of the screen when a notification arrives. */
export const NotificationPopups: React.FC = () => {
  const { popups, dismissPopup, openNotification } = useAppContext();
  if (popups.length === 0) return null;

  return createPortal(
    <>
      <style>{`
        @keyframes np-in { from { transform: translateY(130%) scale(.96); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes np-bar { from { width: 100% } to { width: 0 } }
      `}</style>
      <div className="fixed z-[2147483000] bottom-24 inset-x-3 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[380px] flex flex-col-reverse gap-2.5 pointer-events-none">
        {popups.map((n) => (
          <div key={n.id} className="pointer-events-auto">
            <Card n={n} onOpen={() => openNotification(n)} onClose={() => dismissPopup(n.id)} />
          </div>
        ))}
      </div>
    </>,
    document.body
  );
};
