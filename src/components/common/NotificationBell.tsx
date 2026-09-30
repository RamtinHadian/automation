import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellRing, CheckCheck, ClipboardList, FileText, Send, Stamp, Trash2, Volume2, VolumeX, AlertTriangle } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { AppNotification, isAudioReady, osPermission, playChime, requestOsPermission } from '../../lib/notifications';
import { toPersianDigits } from '../../lib/jalali';
import { currentSubscription, disablePush, enablePush, isIos, isStandalone, pushSupported } from '../../lib/push';

const KIND_ICON = {
  file: Send,
  letter: Stamp,
  task: ClipboardList,
  alert: AlertTriangle,
} as const;

const KIND_COLOR = {
  file: 'bg-[#F6D9CD] text-[#6E1B1B]',
  letter: 'bg-amber-100 text-amber-700',
  task: 'bg-sky-100 text-sky-700',
  alert: 'bg-rose-100 text-rose-700',
} as const;

const timeAgo = (iso: string) => {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'هم‌اکنون';
  if (m < 60) return `${toPersianDigits(m)} دقیقه پیش`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${toPersianDigits(h)} ساعت پیش`;
  return `${toPersianDigits(Math.floor(h / 24))} روز پیش`;
};

export const NotificationBell: React.FC<{ onOpenNotification: (n: AppNotification) => void }> = ({ onOpenNotification }) => {
  const { notifications, unreadCount, markNotificationsRead, clearNotifications, soundEnabled, setSoundEnabled, setNotificationHandler } = useAppContext();
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState(osPermission());
  const [audioReady, setAudioReady] = useState(isAudioReady());
  const [pushState, setPushState] = useState<'checking' | 'unsupported' | 'off' | 'on' | 'denied'>('checking');
  const [pushBusy, setPushBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);

  // The sheet is rendered in <body> and placed from the bell's real position, so no parent (rounded card,
  // overflow, transform...) can clip it or push it outside the screen, on any phone width.
  const place = () => {
    const btn = box.current?.getBoundingClientRect();
    if (!btn) return;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const margin = 12;
    const width = Math.min(380, vw - margin * 2);
    const left = Math.max(margin, Math.min(btn.left + btn.width / 2 - width / 2, vw - width - margin));
    const top = Math.min(btn.bottom + 8, vh - 200);
    setPos({ top, left, width, maxH: vh - top - margin });
  };
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  // Clicking a system notification opens the same target as clicking it in the list.
  useEffect(() => {
    setNotificationHandler((n) => onOpenNotification(n));
    return () => setNotificationHandler(null);
  }, [onOpenNotification, setNotificationHandler]);

  useEffect(() => {
    if (!open) return;
    setAudioReady(isAudioReady());
    if (!pushSupported()) setPushState('unsupported');
    else if (Notification.permission === 'denied') setPushState('denied');
    else void currentSubscription().then((sub) => setPushState(sub && Notification.permission === 'granted' ? 'on' : 'off'));
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current && !box.current.contains(t) && !panel.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const openItem = (n: AppNotification) => {
    markNotificationsRead([n.id]);
    setOpen(false);
    onOpenNotification(n);
  };

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="اعلان‌ها"
        className="relative flex items-center justify-center w-9 h-9 rounded-2xl bg-white border border-[#EBDBCE] text-[#3A241F] hover:bg-[#F6D9CD]/40 transition-all cursor-pointer"
      >
        {unreadCount > 0 ? <BellRing className="w-4 h-4 text-[#D34A32]" /> : <Bell className="w-4 h-4" />}
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-white">
            {toPersianDigits(unreadCount > 99 ? '99+' : unreadCount)}
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={panel}
          dir="rtl"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxH }}
          className="z-[110] bg-white rounded-3xl border border-[#EBDBCE] shadow-2xl text-right overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#EBDBCE] bg-[#FAF5F1]">
            <span className="font-black text-xs text-[#3A241F]">
              اعلان‌ها {unreadCount > 0 && <span className="text-rose-600">({toPersianDigits(unreadCount)} خوانده‌نشده)</span>}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                title={soundEnabled ? 'خاموش کردن صدا' : 'روشن کردن صدا'}
                className="p-1.5 rounded-lg text-[#3A241F] hover:bg-white cursor-pointer"
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-gray-400" />}
              </button>
              <button
                type="button"
                onClick={() => markNotificationsRead()}
                title="علامت‌گذاری همه به‌عنوان خوانده‌شده"
                className="p-1.5 rounded-lg text-[#3A241F] hover:bg-white cursor-pointer"
              >
                <CheckCheck className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('همهٔ اعلان‌ها پاک شود؟')) clearNotifications();
                }}
                title="پاک کردن همه"
                className="p-1.5 rounded-lg text-rose-600 hover:bg-white cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {(!audioReady || perm === 'default') && (
            <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-100 flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-sky-900 leading-5">
                {perm === 'default'
                  ? 'برای شنیدن صدا و دیدن اعلان روی صفحه، حتی وقتی برنامه پشت پنجره‌های دیگر است، فعال کنید.'
                  : 'برای پخش صدا یک بار روی صفحه کلیک کنید.'}
              </span>
              <button
                type="button"
                onClick={async () => {
                  playChime('file');
                  setAudioReady(isAudioReady());
                  if (perm === 'default') setPerm(await requestOsPermission());
                }}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-sky-600 text-white text-[10px] font-black cursor-pointer"
              >
                فعال‌سازی و آزمایش صدا
              </button>
            </div>
          )}

          {pushState !== 'checking' && (
            <div className={`px-4 py-2.5 border-b flex items-center justify-between gap-2 ${pushState === 'on' ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50/70 border-amber-100'}`}>
              <span className={`text-[10px] font-bold leading-5 ${pushState === 'on' ? 'text-emerald-900' : 'text-amber-900'}`}>
                {pushState === 'on' && 'اعلان موبایل فعال است؛ حتی وقتی برنامه بسته است اعلان می‌رسد.'}
                {pushState === 'off' && 'برای دریافت اعلان وقتی برنامه بسته است (مثل سایر برنامه‌ها)، فعال کنید.'}
                {pushState === 'denied' && 'اعلان برای این مرورگر مسدود شده است؛ از تنظیمات مرورگر (قفل کنار آدرس) اجازه دهید.'}
                {pushState === 'unsupported' &&
                  (window.isSecureContext
                    ? isIos() && !isStandalone()
                      ? 'در آیفون ابتدا از منوی اشتراک‌گذاری «افزودن به صفحهٔ اصلی» را بزنید و برنامه را از همان‌جا باز کنید.'
                      : 'این مرورگر از اعلان در حالت بسته پشتیبانی نمی‌کند.'
                    : 'اعلان در حالت بسته فقط روی نشانی امن (HTTPS) کار می‌کند؛ سامانه باید با https باز شود.')}
              </span>
              {(pushState === 'off' || pushState === 'on') && (
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={async () => {
                    setPushBusy(true);
                    try {
                      if (pushState === 'on') {
                        await disablePush();
                        setPushState('off');
                      } else {
                        const res = await enablePush();
                        setPushState(res === 'ok' ? 'on' : res === 'denied' ? 'denied' : 'unsupported');
                      }
                    } finally {
                      setPushBusy(false);
                    }
                  }}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black cursor-pointer disabled:opacity-60 ${pushState === 'on' ? 'bg-white text-emerald-700 border border-emerald-200' : 'bg-amber-600 text-white'}`}
                >
                  {pushState === 'on' ? 'غیرفعال' : 'فعال‌سازی'}
                </button>
              )}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-[#EBDBCE]/60">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-xs font-bold text-gray-400">اعلانی وجود ندارد.</div>
            ) : (
              notifications.map((n) => {
                const Icon = KIND_ICON[n.kind] || FileText;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openItem(n)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-right hover:bg-[#FAF5F1] transition-colors cursor-pointer ${n.read ? '' : 'bg-sky-50/50'}`}
                  >
                    <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${KIND_COLOR[n.kind] || KIND_COLOR.file}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-start justify-between gap-2">
                        <span className={`text-xs leading-5 ${n.read ? 'font-bold text-[#3A241F]' : 'font-black text-[#3A241F]'}`}>{n.title}</span>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0" />}
                      </span>
                      {n.body && <span className="block text-[11px] text-[#8C6F66] leading-5 truncate">{n.body}</span>}
                      <span className="block text-[10px] text-[#8C6F66]/80 mt-0.5">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
