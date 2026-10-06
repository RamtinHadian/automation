import React, { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, Megaphone, X } from 'lucide-react';
import { Announcement, api, getToken } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, todayIso } from '../../lib/taskDates';

// «Dismissed» is remembered only for this login: a new login makes a new token, so the banner comes back.
const dismissKey = () => 'bn_dismissed_' + (getToken() || '').slice(-12);
const readDismissed = (): string[] => {
  try {
    return JSON.parse(sessionStorage.getItem(dismissKey()) || '[]');
  } catch {
    return [];
  }
};

const dayDiff = (iso: string) => Math.round((new Date(iso + 'T12:00:00').getTime() - new Date(todayIso() + 'T12:00:00').getTime()) / 86400000);

/** The news that an admin put «on top of every page»: shown under the page title for the chosen number of days, with an X to close it until the next login. */
export const BannerStrip: React.FC = () => {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .announcements()
        .then((r) => alive && setItems(r.announcements))
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const now = Date.now();
  const shown = items.filter((a) => a.banner && a.bannerUntil && new Date(a.bannerUntil).getTime() >= now && !dismissed.includes(a.id)).slice(0, 3);
  if (shown.length === 0) return null;

  const close = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      sessionStorage.setItem(dismissKey(), JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <div className="shrink-0 space-y-px" data-banner-strip>
      {shown.map((a) => {
        const left = a.eventDate ? dayDiff(a.eventDate) : null;
        const weekday = a.eventDate ? new Date(a.eventDate + 'T12:00:00').toLocaleDateString('fa-IR', { weekday: 'long' }) : '';
        const hot = !!a.important;
        return (
          <div
            key={a.id}
            role="status"
            className={`relative flex items-center gap-3 px-4 sm:px-8 py-2.5 text-white ${hot ? 'bg-gradient-to-l from-rose-700 via-rose-600 to-orange-500' : 'bg-gradient-to-l from-amber-700 via-amber-600 to-yellow-500'}`}
          >
            <span className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              {hot ? <AlertCircle className="w-5 h-5" /> : <Megaphone className="w-5 h-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-black text-sm leading-6 truncate">{a.title}</div>
              <div className="text-[12px] leading-5 text-white/90 line-clamp-2 break-words">{a.text}</div>
            </div>
            {a.eventDate && (
              <span className="hidden sm:flex shrink-0 items-center gap-1.5 rounded-xl bg-white/20 border border-white/30 px-3 py-1.5 text-[11px] font-black">
                <CalendarDays className="w-4 h-4" />
                <span>
                  {weekday} {formatTaskDate(a.eventDate)}
                  {left !== null && left >= 0 ? ` · ${left === 0 ? 'امروز' : `${toPersianDigits(left)} روز مانده`}` : ''}
                </span>
              </span>
            )}
            <button type="button" onClick={() => close(a.id)} title="بستن (تا ورود بعدی دیده نمی‌شود)" className="shrink-0 w-8 h-8 rounded-lg bg-white/15 hover:bg-white/30 flex items-center justify-center cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
