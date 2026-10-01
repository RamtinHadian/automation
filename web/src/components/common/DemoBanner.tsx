import React, { useEffect, useState } from 'react';
import { api, DemoInfo } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';

let cached: DemoInfo | null = null;

/** Whether this server is the public demo (and its sample accounts). */
export function useDemoInfo(): DemoInfo | null {
  const [info, setInfo] = useState<DemoInfo | null>(cached);
  useEffect(() => {
    if (cached) return;
    api
      .demoInfo()
      .then((d) => {
        cached = d;
        setInfo(d);
      })
      .catch(() => {});
  }, []);
  return info?.demo ? info : null;
}

/** Small label in the corner that tells visitors this is a demonstration. */
export const DemoBanner: React.FC = () => {
  const info = useDemoInfo();
  if (!info) return null;
  return (
    <div dir="rtl" className="fixed bottom-3 left-3 z-[60] pointer-events-none px-3 py-1.5 rounded-full bg-[#3A241F]/90 text-white text-[10px] font-black shadow-lg">
      نسخهٔ نمایشی · اطلاعات هر {toPersianDigits(info.resetHours || 6)} ساعت بازنشانی می‌شود
    </div>
  );
};

/** The demo sign-in: one field (the role) and one button. */
export const DemoAccounts: React.FC<{ onPick: (identifier: string, password: string) => void; busy?: boolean }> = ({ onPick, busy }) => {
  const info = useDemoInfo();
  const [who, setWho] = useState(0);
  if (!info?.accounts?.length) return null;
  const acc = info.accounts[who] || info.accounts[0];
  return (
    <div className="w-full bg-white rounded-3xl p-5 sm:p-6 border border-[#EBDBCE] shadow-lg shadow-[#3A241F]/5 space-y-4">
      <div className="space-y-1 text-center">
        <h2 className="font-black text-sm text-[#6E1B1B]">ورود به نسخهٔ نمایشی</h2>
        <p className="text-[11px] text-[#8C6F66] leading-5">نقش را انتخاب کنید و وارد شوید. اطلاعات ساختگی است و هر چند ساعت یک بار بازنشانی می‌شود.</p>
      </div>
      <select
        value={who}
        onChange={(e) => setWho(Number(e.target.value))}
        className="w-full px-3.5 py-3 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl text-sm font-bold text-[#3A241F] focus:outline-none focus:border-[#6E1B1B] cursor-pointer"
      >
        {info.accounts.map((a, i) => (
          <option key={a.identifier} value={i}>
            {a.name} — {a.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy}
        onClick={() => onPick(acc.identifier, acc.password)}
        className="w-full py-3.5 bg-[#6E1B1B] hover:bg-[#581717] disabled:opacity-60 text-white font-black text-sm rounded-2xl shadow-md shadow-[#6E1B1B]/25 transition-all active:scale-[0.98] cursor-pointer"
      >
        ورود
      </button>
    </div>
  );
};

/** Hint under the admin-panel sign-in: the demo manager account. */
export const DemoAdminHint: React.FC = () => {
  const info = useDemoInfo();
  const ceo = info?.accounts?.[0];
  if (!ceo) return null;
  return (
    <div dir="rtl" className="rounded-2xl border border-[#C98B6A]/40 bg-[#FAF5F1] px-3.5 py-2.5 text-[11px] text-[#3A241F] leading-6">
      <b>نسخهٔ نمایشی:</b> نام کاربری <span dir="ltr" className="font-mono font-black">{ceo.identifier}</span> و رمز <span dir="ltr" className="font-mono font-black">{ceo.password}</span>
    </div>
  );
};
