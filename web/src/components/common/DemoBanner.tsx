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

/** The demo's public account, shown under the sign-in forms. */
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
