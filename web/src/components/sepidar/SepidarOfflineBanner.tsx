import React, { useEffect, useState } from 'react';
import { Unplug, X } from 'lucide-react';
import { api, getToken } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';

const KEY = 'sepidar_offline_dismissed';

/**
 * A bar on top of every page when Sepidar is switched on but its program on the accounting computer has not taken Hoormand's requests for 3 minutes.
 * The X hides it for this sign-in only: a new sign-in (a new token) shows it again, so nobody keeps working without knowing that Sepidar is cut.
 */
export const SepidarOfflineBanner: React.FC = () => {
  const [off, setOff] = useState<{ since: string } | null>(null);
  const [hidden, setHidden] = useState(() => {
    try {
      const t = getToken();
      return !!t && sessionStorage.getItem(KEY) === t;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let live = true;
    const check = () =>
      api
        .sepidarConnected()
        .then((r) => {
          if (!live) return;
          setOff(r.connected && r.alive === false ? { since: r.seenAt || '' } : null);
        })
        .catch(() => {});
    void check();
    const t = window.setInterval(check, 60000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, []);

  if (!off || hidden) return null;
  const mins = off.since ? Math.max(3, Math.floor((Date.now() - new Date(off.since).getTime()) / 60000)) : 0;
  const ago = !off.since ? 'تا حالا' : mins >= 120 ? `${toPersianDigits(Math.floor(mins / 60))} ساعت` : `${toPersianDigits(mins)} دقیقه`;
  return (
    <div
      role="alert"
      data-sepidar-offline
      className="fixed inset-x-0 top-0 z-[80] flex items-center gap-2 bg-rose-600 text-white px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-lg text-[12px] font-black"
    >
      <Unplug className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0 leading-5">
        اتصال هورمند به سپیدار قطع است{off.since ? ` (${ago} است جواب نمی‌دهد)` : ''}. تا وصل شدن، ثبت و دریافت اطلاعات سپیدار انجام نمی‌شود؛ به مدیر سیستم یا حسابداری خبر بدهید.
      </span>
      <button
        type="button"
        onClick={() => {
          try {
            const t = getToken();
            if (t) sessionStorage.setItem(KEY, t);
          } catch {
            /* private window */
          }
          setHidden(true);
        }}
        aria-label="بستن"
        className="p-1.5 rounded-lg hover:bg-white/20 cursor-pointer shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
