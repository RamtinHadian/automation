import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';

type State = { alive: boolean; seenAt: string; since: string; toolVersion: string; toolLatest: string } | null;

/** «۵ دقیقه»، «۲ ساعت و ۱۰ دقیقه»، «۳ روز و ۴ ساعت». */
export const spanText = (ms: number): string => {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 1) return 'کمتر از ۱ دقیقه';
  if (min < 60) return `${toPersianDigits(min)} دقیقه`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `${toPersianDigits(h)} ساعت و ${toPersianDigits(min % 60)} دقیقه` : `${toPersianDigits(h)} ساعت`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${toPersianDigits(d)} روز و ${toPersianDigits(h % 24)} ساعت` : `${toPersianDigits(d)} روز`;
};

/**
 * Next to the name of the program, for everybody who has the Sepidar module: a blinking green light with «سپیدار» while the program on the accounting
 * computer is connected, a blinking red one while it is not. A tap opens a small note: how long it has been connected, or how long it has been cut.
 */
export const SepidarStatusChip: React.FC<{ show: boolean }> = ({ show }) => {
  const [st, setSt] = useState<State>(null);
  const [open, setOpen] = useState(false);
  const [, tick] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show) return;
    let live = true;
    const check = () =>
      api
        .sepidarConnected()
        .then((r) => {
          if (live && r.connected) setSt({ alive: r.alive !== false, seenAt: r.seenAt || '', since: r.since || '', toolVersion: r.toolVersion || '', toolLatest: r.toolLatest || '' });
        })
        .catch(() => {});
    void check();
    const t = window.setInterval(check, 30000);
    const clock = window.setInterval(() => tick((n) => n + 1), 30000); // the minutes in the note keep counting between two checks
    return () => {
      live = false;
      window.clearInterval(t);
      window.clearInterval(clock);
    };
  }, [show]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!show || !st) return null;
  const on = st.alive;
  const ms = (iso: string) => (iso ? Date.now() - new Date(iso).getTime() : NaN);
  const note = on
    ? Number.isFinite(ms(st.since))
      ? `${spanText(ms(st.since))} است که متصل است.`
      : 'متصل است.'
    : Number.isFinite(ms(st.seenAt))
      ? `${spanText(ms(st.seenAt))} است که قطع است.`
      : 'هنوز هیچ‌وقت متصل نشده است.';
  const verNote = st.toolVersion ? ` برنامهٔ سپیدار روی رایانهٔ حسابداری: نسخهٔ ${st.toolVersion.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])}.` : ' نسخهٔ برنامهٔ سپیدار هنوز اعلام نشده (برنامه قدیمی است و باید با نسخهٔ تازه جایگزین شود).';
  // the program on the accounting computer is older than the one this server carries (or does not say its version at all)
  const vnum = (v: string) => v.split('.').map((x) => parseInt(x, 10) || 0);
  const older = (a: string, b: string) => { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };
  const outdated = !!st.toolLatest && (!st.toolVersion || older(st.toolVersion, st.toolLatest));
  const downloadZip = async () => {
    try {
      const blob = await api.sepidarToolFiles();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'hoormand-sepidar-program.zip';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'فایل‌ها دریافت نشد.');
    }
  };
  return (
    <div className="relative shrink-0" ref={box} data-sepidar-chip data-state={on ? 'on' : 'off'}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={on ? 'سپیدار متصل است' : 'سپیدار قطع است'}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-black cursor-pointer shadow-2xs transition-colors ${
          on ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100' : 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100'
        }`}
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-70 animate-ping ${on ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${on ? 'bg-emerald-600 shadow-[0_0_8px_2px_rgba(16,185,129,0.65)]' : 'bg-rose-600 shadow-[0_0_8px_2px_rgba(244,63,94,0.7)]'}`} />
        </span>
        سپیدار
      </button>
      {open && (
        <div role="status" className="absolute right-0 top-full mt-2 z-[70] min-w-[250px] rounded-2xl border border-[#EBDBCE] bg-white px-3.5 py-2.5 shadow-xl text-[11.5px] font-bold text-[#3A241F] leading-6" data-sepidar-chip-note>
          <div className={`font-black mb-0.5 ${on ? 'text-emerald-700' : 'text-rose-700'}`}>{on ? 'سپیدار متصل است' : 'سپیدار قطع است'}</div>
          {note}{verNote}
          {outdated && (
            <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] leading-6 text-amber-900" data-sepidar-outdated>
              <div className="font-black">برنامهٔ رایانهٔ حسابداری باید به‌روز شود{st.toolLatest ? ` (نسخهٔ تازه: ${st.toolLatest.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d])})` : ''}.</div>
              <div>۱) «دانلود فایل‌های برنامه» را بزنید و محتوای zip را داخل پوشهٔ برنامه روی رایانهٔ حسابداری (C:\ProgramData\HoormandSepidar) کپی کنید.</div>
              <div>۲) روی فایل <span dir="ltr" className="font-black">Beroozresani-va-Ejra-Dobare.cmd</span> دوبار کلیک کنید؛ خودش برنامه را می‌بندد، فایل‌های تازه را می‌گیرد و دوباره روشن می‌کند.</div>
              <button type="button" onClick={downloadZip} className="mt-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black cursor-pointer" data-sepidar-download>دانلود فایل‌های برنامه</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
