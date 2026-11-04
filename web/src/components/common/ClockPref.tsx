import React, { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { CLOCK_COUNT, ClockFace, designName } from './AnalogClock';
import { toPersianDigits } from '../../lib/jalali';

type Pref = { enabled: boolean; design: number };
const key = (uid: string) => `app_user_clock_${uid}`;
const EVENT = 'hoormand-clock-pref';

/** The clock a person sees: his own choice (kept in this browser, like the colour theme) when he made one, else what the administrator set for everybody. */
export const useClockPref = (): Pref => {
  const { settings, currentUser } = useAppContext();
  const read = (): Pref | null => {
    try {
      const raw = localStorage.getItem(key(currentUser?.id || ''));
      return raw ? (JSON.parse(raw) as Pref) : null;
    } catch {
      return null;
    }
  };
  const [own, setOwn] = useState<Pref | null>(read);
  useEffect(() => {
    setOwn(read());
    const on = () => setOwn(read());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);
  return own ?? settings.analogClock ?? { enabled: false, design: 0 };
};

const save = (uid: string, p: Pref) => {
  try {
    localStorage.setItem(key(uid), JSON.stringify(p));
  } catch {
    /* not kept */
  }
  window.dispatchEvent(new Event(EVENT));
};

/** The button next to the colour palette: every person switches the clock on or off and picks a design for himself (not on phones). */
export const ClockPref: React.FC = () => {
  const { currentUser } = useAppContext();
  const pref = useClockPref();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNow(new Date()), 1000);
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => { window.clearInterval(id); document.removeEventListener('mousedown', close); };
  }, [open]);
  const set = (u: Partial<Pref>) => save(currentUser.id, { ...pref, ...u });
  return (
    <div className="relative max-sm:hidden" ref={box} data-clock-pref>
      <button type="button" onClick={() => setOpen((v) => !v)} title="ساعت آنالوگ بالای صفحه: روشن، خاموش و انتخاب طرح" className={`p-2 sm:p-2.5 border rounded-2xl transition-all shadow-2xs hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1.5 text-xs font-bold ${pref.enabled ? 'bg-[#F6D9CD] border-[#D9A38F] text-[#6E1B1B]' : 'bg-[#FAF5F1] hover:bg-[#F6D9CD] text-[#6E1B1B] border-[#EBDBCE]'}`}>
        <Clock className="w-4 h-4" />
        <span className="hidden lg:inline">ساعت</span>
      </button>
      {open && (
        <div role="dialog" className="absolute left-0 top-full mt-2 z-[70] w-[min(92vw,420px)] rounded-2xl border border-[#EBDBCE] bg-white p-3.5 shadow-xl text-right" data-clock-pref-panel>
          <label className="flex items-center gap-2.5 text-xs font-black text-[#3A241F] cursor-pointer">
            <input type="checkbox" className="w-4 h-4 accent-[#6E1B1B]" checked={pref.enabled} onChange={(e) => set({ enabled: e.target.checked })} data-clock-pref-enable />
            ساعت آنالوگ با تاریخ شمسی بالای صفحه نمایش داده شود
          </label>
          <p className="mt-1 text-[10.5px] font-bold text-[#8C6F66]">طرح فعلی: {toPersianDigits(pref.design + 1)} · {designName(pref.design)}. این انتخاب فقط برای شماست.</p>
          <div className="mt-2 grid grid-cols-5 gap-1.5 max-h-64 overflow-y-auto p-0.5">
            {Array.from({ length: CLOCK_COUNT }, (_, i) => (
              <button key={i} type="button" onClick={() => set({ design: i, enabled: true })} title={designName(i)} className={`rounded-lg border p-0.5 cursor-pointer flex flex-col items-center ${pref.design === i ? 'border-[#6E1B1B] bg-[#FAF5F1] ring-2 ring-[#6E1B1B]/30' : 'border-[#EBDBCE] hover:bg-[#FAF5F1]'}`}>
                <ClockFace design={i} time={now} size={44} />
                <span className="text-[9px] font-black text-[#8C6F66]">{toPersianDigits(i + 1)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
