import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, KeyRound, Loader2 } from 'lucide-react';
import { api, LicenseStatus } from '../../lib/api';
import { formatJalaliShort, toPersianDigits } from '../../lib/jalali';

const box = 'w-full p-3 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl text-xs font-mono text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none';

/** The install code to give the vendor, and the field for the activation code that comes back. */
export const ActivationForm: React.FC<{ status: LicenseStatus; renew?: boolean; onDone: (s: LicenseStatus) => void }> = ({ status, renew, onDone }) => {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(status.installId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the code stays selectable */
    }
  };
  const go = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      onDone(await (renew ? api.licenseRenew(code) : api.licenseActivate(code)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'فعال‌سازی انجام نشد.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4 text-right">
      <div>
        <div className="text-[11px] font-black text-[#3A241F] mb-1.5">۱. «کد نصب» این سرور را به فروشنده بدهید</div>
        <div className="flex items-center gap-2">
          <div dir="ltr" className="flex-1 px-3 py-3 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl font-mono text-sm font-black text-[#6E1B1B] tracking-wider text-center select-all">{status.installId}</div>
          <button type="button" onClick={copy} className="h-[46px] px-3.5 rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE] hover:bg-[#EBDBCE] text-[#6E1B1B] cursor-pointer flex items-center gap-1.5 text-xs font-black" aria-label="کپی">
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'کپی شد' : 'کپی'}
          </button>
        </div>
      </div>
      <div>
        <div className="text-[11px] font-black text-[#3A241F] mb-1.5">۲. «کد فعال‌سازی» دریافتی را اینجا بچسبانید</div>
        <textarea dir="ltr" rows={3} value={code} onChange={(e) => { setCode(e.target.value); setError(''); }} placeholder="HM1-…" className={`${box} resize-none`} />
      </div>
      {error && <div className="bg-[#D34A32]/10 border border-[#D34A32]/30 text-[#D34A32] text-xs font-bold px-3 py-2 rounded-xl text-center">{error}</div>}
      <button type="button" onClick={go} disabled={!code.trim() || busy} className="w-full py-3.5 bg-[#6E1B1B] hover:bg-[#D34A32] disabled:opacity-50 text-white font-black text-sm rounded-2xl cursor-pointer flex items-center justify-center gap-2">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
        {renew ? 'ثبت کد جدید' : 'فعال‌سازی'}
      </button>
    </div>
  );
};

/** Shown instead of the whole application until a valid activation code is entered. */
const ActivationPage: React.FC<{ status: LicenseStatus; onDone: (s: LicenseStatus) => void }> = ({ status, onDone }) => (
  <div className="min-h-screen flex items-center justify-center p-4 font-sans bg-[#FAF7F2] text-[#3A241F]" dir="rtl">
    <div className="w-full max-w-md flex flex-col items-center gap-6">
      <img src="/images/logo-full.png" alt="هورمند" className="w-44 sm:w-52 mx-auto" draggable={false} />
      <div className="w-full bg-white rounded-3xl p-6 sm:p-8 border border-[#EBDBCE] shadow-lg shadow-[#3A241F]/5 space-y-4">
        <div className="flex items-center gap-2 font-black text-sm"><KeyRound className="w-5 h-5 text-[#6E1B1B]" />فعال‌سازی سامانه</div>
        <p className="text-xs leading-6 text-[#8C6F66]">این سامانه روی این سرور هنوز فعال نشده است. برای شروع، کد نصب را به فروشنده بدهید و کد فعال‌سازی را دریافت و وارد کنید.</p>
        <ActivationForm status={status} onDone={onDone} />
      </div>
    </div>
  </div>
);

/** Decides between the activation page and the application, and warns when the licence is about to run out. */
export const LicenseGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    api.licenseStatus().then((s) => { setStatus(s); setFailed(false); }).catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 10 * 60 * 1000);
    return () => window.clearInterval(t);
  }, [load]);

  if (!status && !failed) return null;
  if (status && !status.licensed) return <ActivationPage status={status} onDone={() => window.location.reload()} />;
  const warn = status && (status.readOnly || status.mode === 'grace' || (status.mode === 'active' && status.daysLeft <= 14));
  return (
    <>
      {warn && status && (
        <div dir="rtl" className={`px-4 py-2 text-center text-[12px] font-black flex items-center justify-center gap-2 ${status.readOnly ? 'bg-rose-700 text-white' : 'bg-amber-100 text-amber-900'}`}>
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {status.readOnly
            ? 'مجوز این سامانه منقضی شده است؛ فعلاً فقط مشاهده ممکن است. برای تمدید با فروشنده تماس بگیرید.'
            : status.mode === 'grace'
              ? `این سامانه هنوز فعال‌سازی نشده است؛ ${toPersianDigits(Math.max(0, status.daysLeft))} روز مهلت دارید (تنظیمات ← مجوز).`
              : `مجوز سامانه تا ${toPersianDigits(Math.max(0, status.daysLeft))} روز دیگر به پایان می‌رسد (${status.expires ? toPersianDigits(formatJalaliShort(new Date(status.expires))) : ''}).`}
        </div>
      )}
      {children}
    </>
  );
};
