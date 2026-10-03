import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Sparkles, X } from 'lucide-react';
import { toPersianDigits } from '../../lib/jalali';
import { isoToJalaliParts, JALALI_MONTHS, todayIso } from '../../lib/taskDates';
import changelog from '../../data/changelog.json';

type Entry = { version: string; date: string; items: string[] };

const dayLabel = (iso: string) => {
  const p = iso ? isoToJalaliParts(iso) : null;
  return p ? toPersianDigits(`${p[2]} ${JALALI_MONTHS[p[1] - 1]} ${p[0]}`) : '';
};

/** «تازه‌های سامانه»: the latest update on top, then every update grouped by day, newest first. */
export const ChangelogModal: React.FC<{ onClose: () => void; currentVersion?: string }> = ({ onClose, currentVersion }) => {
  // entries still waiting for their version number (not released yet) are not shown
  const entries = useMemo(() => (changelog as Entry[]).filter((e) => e.version && e.date), []);
  const latest = entries[0];
  const rest = entries.slice(1);
  const days = useMemo(() => {
    const g = new Map<string, Entry[]>();
    for (const e of rest) g.set(e.date, [...(g.get(e.date) || []), e]);
    return [...g.entries()];
  }, [rest]);
  const today = todayIso();

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs sm:p-4" onMouseDown={onClose}>
      <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white w-full sm:max-w-2xl h-[92vh] sm:h-auto sm:max-h-[88vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-[#EBDBCE] text-right">
        <div className="relative px-6 pt-6 pb-5 bg-gradient-to-l from-[#6E1B1B] via-[#8B2A2A] to-[#B4533A] text-white">
          <button type="button" onClick={onClose} aria-label="بستن" className="absolute left-4 top-4 p-1.5 rounded-xl bg-white/15 hover:bg-white/25 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 text-[11px] font-black text-white/80">
            <Sparkles className="w-4 h-4" />
            تازه‌های سامانه
          </div>
          <div className="mt-1.5 text-xl font-black">نسخهٔ {toPersianDigits(currentVersion || latest?.version || '')}</div>
          <div className="text-[11px] text-white/75 mt-0.5">هر تغییری که روی سامانه انجام می‌شود، همین‌جا ثبت می‌ماند.</div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-5 space-y-6 bg-[#FFFCFA]">
          {latest && (
            <section className="rounded-3xl border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-black">آخرین بروزرسانی</span>
                <span className="px-2.5 py-1 rounded-full bg-white border border-emerald-200 text-emerald-800 text-[11px] font-black">نسخهٔ {toPersianDigits(latest.version)}</span>
                <span className="text-[11px] font-bold text-[#8C6F66] mr-auto">{dayLabel(latest.date)}</span>
              </div>
              <ul className="space-y-2.5">
                {latest.items.map((t, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-7 text-[#3A241F] font-bold">
                    <CheckCircle2 className="w-4 h-4 mt-1.5 shrink-0 text-emerald-600" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {days.length > 0 && <h4 className="text-xs font-black text-[#8C6F66]">تاریخچهٔ تغییرات</h4>}
          {days.map(([date, list]) => (
            <section key={date}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-black text-[#3A241F]">{dayLabel(date)}</span>
                {date === today && <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-black">امروز</span>}
                <span className="flex-1 h-px bg-[#EBDBCE]" />
              </div>
              <div className="relative pr-5 space-y-4 before:content-[''] before:absolute before:right-[5px] before:top-2 before:bottom-2 before:w-px before:bg-[#EBDBCE]">
                {list.map((e, k) => (
                  <div key={k} className="relative">
                    <span className="absolute -right-5 top-1.5 w-[11px] h-[11px] rounded-full bg-white border-2 border-[#B4533A]" />
                    <div className="rounded-2xl bg-white border border-[#EBDBCE] p-4">
                      <div className="text-[11px] font-black text-[#6E1B1B] mb-2">نسخهٔ {toPersianDigits(e.version)}</div>
                      <ul className="space-y-1.5">
                        {e.items.map((t, i) => (
                          <li key={i} className="flex gap-2 text-xs leading-6 text-[#3A241F] font-medium">
                            <span className="mt-2.5 w-1 h-1 rounded-full bg-[#B4533A] shrink-0" />
                            <span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
};
