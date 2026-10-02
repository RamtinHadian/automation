import React, { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { api, LicenseStatus } from '../../lib/api';
import { formatJalaliShort, toPersianDigits } from '../../lib/jalali';
import { ActivationForm } from '../common/LicenseGate';

const MODE: Record<string, { label: string; cls: string }> = {
  active: { label: 'فعال', cls: 'bg-emerald-100 text-emerald-800' },
  grace: { label: 'مهلت فعال‌سازی', cls: 'bg-amber-100 text-amber-800' },
  expired: { label: 'منقضی (فقط مشاهده)', cls: 'bg-rose-100 text-rose-800' },
  none: { label: 'غیرفعال', cls: 'bg-rose-100 text-rose-800' },
};

/** Licence of this installation: who it is for, until when, how many users, and where to enter a renewed code. */
export const LicenseCard: React.FC = () => {
  const [s, setS] = useState<LicenseStatus | null>(null);
  useEffect(() => {
    api.licenseStatus().then(setS).catch(() => {});
  }, []);
  if (!s) return <div className="py-16 text-center text-xs font-bold text-[#8C6F66]">در حال خواندن…</div>;
  const m = MODE[s.mode] || MODE.none;
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-[#EBDBCE]/60 last:border-0 text-[12px]">
      <span className="font-bold text-[#8C6F66]">{k}</span>
      <span className="font-black text-[#3A241F]">{v}</span>
    </div>
  );
  return (
    <div className="space-y-4 text-right">
      <div className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-5 sm:p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="w-11 h-11 rounded-2xl bg-[#6E1B1B] text-white flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></span>
          <div>
            <h3 className="font-black text-sm text-[#3A241F]">مجوز استفاده از سامانه</h3>
            <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[11px] font-black ${m.cls}`}>{m.label}</span>
          </div>
        </div>
        {s.customer && row('صادرشده برای', s.customer)}
        {s.serial && row('شمارهٔ مجوز', <span dir="ltr">{s.serial}</span>)}
        {s.expires && row(s.mode === 'grace' ? 'پایان مهلت' : 'تاریخ پایان', `${toPersianDigits(formatJalaliShort(new Date(s.expires)))} (${toPersianDigits(Math.max(0, s.daysLeft))} روز مانده)`)}
        {row('حداکثر کاربران', s.maxUsers ? toPersianDigits(s.maxUsers) : 'نامحدود')}
        {row('کد نصب این سرور', <span dir="ltr" className="font-mono select-all">{s.installId}</span>)}
      </div>
      <div className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2 font-black text-sm text-[#3A241F]"><KeyRound className="w-4 h-4 text-[#6E1B1B]" />تمدید یا تغییر مجوز</div>
        <p className="text-[11px] text-[#8C6F66] leading-6">برای تمدید، «کد نصب» بالا را به فروشنده بدهید و کد فعال‌سازی تازه را اینجا وارد کنید. اطلاعات شما دست نمی‌خورد.</p>
        <ActivationForm status={s} renew onDone={setS} />
      </div>
    </div>
  );
};
