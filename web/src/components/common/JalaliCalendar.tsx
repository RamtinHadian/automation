import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { toPersianDigits } from '../../lib/jalali';
import { JALALI_MONTHS, isoToJalaliParts, jalaliPartsToIso, todayIso } from '../../lib/taskDates';

const WEEK = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

/** How many days a Jalali month has (the last month has 30 in a leap year: checked by converting day 30 back). */
const monthLength = (y: number, m: number) => {
  if (m <= 6) return 31;
  if (m <= 11) return 30;
  const p = isoToJalaliParts(jalaliPartsToIso(y, 12, 30));
  return p && p[0] === y && p[1] === 12 && p[2] === 30 ? 30 : 29;
};

/** Saturday = 0 … Friday = 6, for the first day of the month. */
const firstWeekday = (y: number, m: number) => (new Date(jalaliPartsToIso(y, m, 1) + 'T12:00:00').getDay() + 1) % 7;

/** A month calendar in a small window: choose a day, move between months and years. `value` / `onPick` hold yyyy-mm-dd (Gregorian). */
export const JalaliCalendarDialog: React.FC<{ value?: string; onPick: (iso: string) => void; onClose: () => void; title?: string }> = ({ value, onPick, onClose, title = 'انتخاب تاریخ' }) => {
  const today = isoToJalaliParts(todayIso())!;
  const cur = value ? isoToJalaliParts(value) : null;
  const [y, setY] = useState(cur ? cur[0] : today[0]);
  const [m, setM] = useState(cur ? cur[1] : today[1]);
  const go = (d: number) => {
    let nm = m + d;
    let ny = y;
    if (nm > 12) { nm = 1; ny++; }
    if (nm < 1) { nm = 12; ny--; }
    setM(nm);
    setY(ny);
  };
  const lead = firstWeekday(y, m);
  const len = monthLength(y, m);
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: len }, (_, i) => i + 1)];
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <div className="fixed inset-0 z-[360] flex items-center justify-center bg-black/40 p-3" onMouseDown={(e) => { stop(e); onClose(); }} onClick={stop} data-jalali-calendar>
      <div dir="rtl" onMouseDown={stop} className="bg-white rounded-3xl shadow-2xl w-full max-w-xs border border-[#EBDBCE] text-right">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F]">{title}</h3>
          <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] rounded-xl cursor-pointer" aria-label="بستن"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => go(-1)} className="p-2 rounded-xl hover:bg-[#FAF5F1] cursor-pointer" aria-label="ماه قبل"><ChevronRight className="w-4 h-4" /></button>
            <div className="text-sm font-black text-[#3A241F]">{JALALI_MONTHS[m - 1]} {toPersianDigits(y)}</div>
            <button type="button" onClick={() => go(1)} className="p-2 rounded-xl hover:bg-[#FAF5F1] cursor-pointer" aria-label="ماه بعد"><ChevronLeft className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-[#8C6F66] mb-1">
            {WEEK.map((w) => <div key={w}>{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const iso = jalaliPartsToIso(y, m, d);
              const sel = iso === value;
              const isToday = y === today[0] && m === today[1] && d === today[2];
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onPick(iso); onClose(); }}
                  className={`h-9 rounded-xl text-xs font-black cursor-pointer ${sel ? 'bg-[#6E1B1B] text-white' : isToday ? 'border border-[#6E1B1B] text-[#6E1B1B]' : (i % 7 === 6 ? 'text-rose-600' : 'text-[#3A241F]') + ' hover:bg-[#F6D9CD]'}`}
                >
                  {toPersianDigits(d)}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => { onPick(todayIso()); onClose(); }} className="mt-3 w-full py-2 rounded-xl text-[11px] font-black text-[#6E1B1B] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">امروز</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

/** The small calendar button that sits next to the day / month / year selects. */
export const CalendarButton: React.FC<{ value?: string; onPick: (iso: string) => void; disabled?: boolean }> = ({ value, onPick, disabled }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} className="p-2 rounded-xl border border-[#EBDBCE] bg-white text-[#6E1B1B] hover:bg-[#FAF5F1] disabled:opacity-60 cursor-pointer" title="باز کردن تقویم" aria-label="باز کردن تقویم" data-open-calendar>
        <CalendarDays className="w-4 h-4" />
      </button>
      {open && <JalaliCalendarDialog value={value} onPick={onPick} onClose={() => setOpen(false)} />}
    </>
  );
};
