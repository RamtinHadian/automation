import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { isoToJalaliParts, JALALI_MONTHS } from '../../lib/taskDates';
import changelog from '../../data/changelog.json';

const SEEN_KEY = 'hoormand_notice_version';
export const OPEN_VERSION_NOTICE = 'hoormand:open-version-notice';

type Entry = { version: string; date: string; items: string[] };
const dayLabel = (iso?: string) => {
  const p = iso ? isoToJalaliParts(iso) : null;
  return p ? toPersianDigits(`${p[2]} ${JALALI_MONTHS[p[1] - 1]} ${p[0]}`) : '';
};

/**
 * For the computers where the Sepidar program is connected: when Hoormand has been updated, a card tells which version is installed now and what
 * changed. It has no timer: it stays until the person closes it, and it can be opened again by hand (the button in the Sepidar page, or
 * window.dispatchEvent(new Event(OPEN_VERSION_NOTICE))).
 */
export const VersionNotice: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const [installed, setInstalled] = useState(false); // the Sepidar program has connected to this Hoormand
  const [v, setV] = useState<{ version: string; date?: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [updated, setUpdated] = useState(false);
  const shown = useRef('');

  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    api.sepidar().then((s) => { if (!stop) setInstalled(!!(s as { connectorSeenAt?: string }).connectorSeenAt); }).catch(() => {});
    return () => { stop = true; };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !installed) return;
    let stop = false;
    const check = () =>
      api.version().then((x) => {
        if (stop || x.version === 'dev') return;
        setV(x);
        let seen = '';
        try { seen = localStorage.getItem(SEEN_KEY) || ''; } catch { /* storage unavailable */ }
        if (seen !== x.version && shown.current !== x.version) {
          shown.current = x.version;
          setUpdated(!!seen);
          setOpen(true);
        }
      }).catch(() => {});
    check();
    const t = window.setInterval(() => { if (!document.hidden) check(); }, 30 * 1000);
    return () => { stop = true; window.clearInterval(t); };
  }, [enabled, installed]);

  useEffect(() => {
    const on = () => {
      setUpdated(false);
      setOpen(true);
      if (!v) api.version().then(setV).catch(() => {});
    };
    window.addEventListener(OPEN_VERSION_NOTICE, on);
    return () => window.removeEventListener(OPEN_VERSION_NOTICE, on);
  }, [v]);

  const close = () => {
    setOpen(false);
    if (v) { try { localStorage.setItem(SEEN_KEY, v.version); } catch { /* storage unavailable */ } }
  };

  if (!enabled || !open || !v) return null;
  const entry = (changelog as Entry[]).find((e) => e.version === v.version);
  return createPortal(
    <div dir="rtl" data-version-notice className="fixed z-[140] bottom-24 sm:bottom-5 left-3 right-3 sm:right-auto sm:left-5 sm:w-[360px] rounded-2xl bg-white border border-emerald-200 shadow-2xl overflow-hidden text-right">
      <div className="flex items-center gap-2 px-3.5 py-2.5 bg-gradient-to-l from-emerald-700 to-emerald-600 text-white">
        <Sparkles className="w-4 h-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-black">{updated ? 'هورمند به‌روز شد' : 'نسخهٔ هورمند'}</div>
          <div className="text-[11px] font-bold text-white/85">نسخهٔ نصب‌شده روی این سیستم: {toPersianDigits(v.version)}{v.date ? ` · ${dayLabel(v.date)}` : ''}</div>
        </div>
        <button type="button" onClick={close} aria-label="بستن" title="بستن" className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      {entry && entry.items.length > 0 && (
        <ul className="max-h-48 overflow-y-auto px-3.5 py-2.5 space-y-1.5">
          {entry.items.map((t, i) => (
            <li key={i} className="text-[11.5px] leading-6 font-bold text-[#3A241F]">• {t}</li>
          ))}
        </ul>
      )}
    </div>,
    document.body,
  );
};
