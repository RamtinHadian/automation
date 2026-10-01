import React, { useEffect, useState } from 'react';
import { PlayCircle } from 'lucide-react';
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

/** One-tap sign-in buttons for the demo accounts, shown on the login page. */
export const DemoAccounts: React.FC<{ onPick: (identifier: string, password: string) => void; busy?: boolean }> = ({ onPick, busy }) => {
  const info = useDemoInfo();
  if (!info?.accounts?.length) return null;
  return (
    <div className="w-full bg-white rounded-3xl p-5 border border-[#C98B6A]/40 shadow-lg shadow-[#3A241F]/5 space-y-3">
      <div className="flex items-center gap-2 text-[#6E1B1B]">
        <PlayCircle className="w-5 h-5" />
        <h2 className="font-black text-sm">نسخهٔ نمایشی؛ با یک کلیک وارد شوید</h2>
      </div>
      <p className="text-[11px] text-[#8C6F66] leading-5">یکی از نقش‌ها را انتخاب کنید و سامانه را امتحان کنید. اطلاعات این نسخه ساختگی است و هر چند ساعت یک بار بازنشانی می‌شود.</p>
      <div className="grid grid-cols-1 gap-2">
        {info.accounts.map((a) => (
          <button
            key={a.identifier}
            type="button"
            disabled={busy}
            onClick={() => onPick(a.identifier, a.password)}
            className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border border-[#EBDBCE] bg-[#FAF5F1] hover:bg-[#F6D9CD]/60 disabled:opacity-60 cursor-pointer text-right"
          >
            <span className="min-w-0">
              <span className="block text-xs font-black text-[#3A241F] truncate">{a.name}</span>
              <span className="block text-[10px] text-[#8C6F66]">{a.title}</span>
            </span>
            <span className="text-[10px] font-black text-[#6E1B1B] shrink-0">ورود ←</span>
          </button>
        ))}
      </div>
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
