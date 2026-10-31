import React, { useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, Copy } from 'lucide-react';
import { api } from '../../lib/api';
import { askConfirm } from '../../lib/confirmDialog';

/**
 * Two-step sign-in for the signed-in person: after the password, the 6-digit code of an authenticator app is asked.
 * Setup shows the key (type it into the app) and the link; the first code confirms it and ten recovery codes are shown once.
 */
export const TwoFactorCard: React.FC<{ showToast?: (m: string) => void }> = ({ showToast }) => {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [left, setLeft] = useState(0);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const load = () =>
    api
      .twoFactorStatus()
      .then((s) => {
        setEnabled(s.enabled);
        setLeft(s.recoveryLeft);
      })
      .catch(() => setEnabled(null));
  useEffect(() => {
    void load();
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  if (enabled === null) return null;

  const copy = (t: string) => {
    void navigator.clipboard?.writeText(t).then(() => showToast?.('کپی شد.'));
  };

  return (
    <div className="mt-2 pt-4 border-t border-[#EBDBCE] space-y-3" data-two-factor-card>
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center ${enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-[#F6D9CD] text-[#6E1B1B]'}`}>
          {enabled ? <ShieldCheck className="w-5 h-5" /> : <ShieldOff className="w-5 h-5" />}
        </div>
        <div className="flex-1">
          <h4 className="font-black text-sm text-[#3A241F]">ورود دو مرحله‌ای {enabled ? '(روشن)' : '(خاموش)'}</h4>
          <p className="text-[11px] text-[#8C6F66] leading-5">
            {enabled
              ? `هنگام ورود، علاوه بر رمز، کد برنامهٔ احراز هویت هم پرسیده می‌شود. کد بازیابی باقی‌مانده: ${left}`
              : 'با یک برنامهٔ احراز هویت (Google Authenticator، Microsoft Authenticator و مانند آن) حساب شما حتی با لو رفتن رمز هم امن می‌ماند. برای مدیران توصیه می‌شود.'}
          </p>
        </div>
      </div>

      {error && <div className="p-2.5 bg-rose-50 text-rose-700 text-xs font-bold rounded-xl border border-rose-200">{error}</div>}

      {recovery && (
        <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 space-y-2" data-recovery-codes>
          <p className="text-xs font-black text-amber-900">کدهای بازیابی را همین حالا جایی امن نگه دارید؛ دیگر نشان داده نمی‌شوند. هر کد فقط یک بار کار می‌کند و اگر گوشی را گم کردید جای کد برنامه را می‌گیرد.</p>
          <div className="grid grid-cols-2 gap-1.5" dir="ltr">
            {recovery.map((c) => (
              <code key={c} data-keep-digits className="text-sm font-mono font-bold bg-white border border-amber-200 rounded-lg px-2 py-1 text-center text-[#3A241F]">
                {c}
              </code>
            ))}
          </div>
          <button type="button" onClick={() => copy(recovery.join('\n'))} className="text-xs font-black text-amber-900 flex items-center gap-1 cursor-pointer">
            <Copy className="w-3.5 h-3.5" />
            کپی همهٔ کدها
          </button>
          <button type="button" onClick={() => setRecovery(null)} className="block w-full py-2 rounded-xl bg-amber-900 text-white text-xs font-black cursor-pointer">
            کدها را نگه داشتم
          </button>
        </div>
      )}

      {!enabled && !setup && !recovery && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(async () => setSetup(await api.twoFactorSetup()))}
          className="w-full py-2.5 rounded-2xl bg-[#6E1B1B] text-white text-xs font-black cursor-pointer disabled:opacity-60"
          data-two-factor-start
        >
          روشن کردن ورود دو مرحله‌ای
        </button>
      )}

      {setup && !enabled && (
        <div className="space-y-2.5 p-3 rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE]">
          <ol className="text-[11px] font-bold text-[#3A241F] leading-6 list-decimal pr-4">
            <li>در گوشی یک برنامهٔ احراز هویت نصب کنید.</li>
            <li>در برنامه «افزودن حساب» و سپس «وارد کردن کلید» را بزنید و این کلید را بنویسید (نوع: مبتنی بر زمان).</li>
            <li>کد ۶ رقمی که برنامه نشان می‌دهد را پایین بنویسید و تأیید کنید.</li>
          </ol>
          <div className="flex items-center gap-2" dir="ltr">
            <code data-keep-digits data-two-factor-secret className="flex-1 text-sm font-mono font-black bg-white border border-[#EBDBCE] rounded-xl px-3 py-2 tracking-wider break-all select-all text-[#3A241F]">
              {setup.secret.match(/.{1,4}/g)?.join(' ')}
            </code>
            <button type="button" onClick={() => copy(setup.secret)} className="p-2 rounded-xl bg-white border border-[#EBDBCE] cursor-pointer" aria-label="کپی کلید">
              <Copy className="w-4 h-4" />
            </button>
          </div>
          <a href={setup.uri} className="block text-[11px] font-bold text-[#6E1B1B] underline" dir="ltr">
            (روی گوشی: باز کردن در برنامهٔ احراز هویت)
          </a>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="کد ۶ رقمی"
              dir="ltr"
              data-two-factor-code
              className="flex-1 p-2.5 bg-white border border-[#EBDBCE] rounded-xl text-sm font-mono font-bold text-center tracking-widest focus:border-[#6E1B1B] focus:outline-none"
            />
            <button
              type="button"
              disabled={busy || !code.trim()}
              onClick={() =>
                run(async () => {
                  const r = await api.twoFactorEnable(code);
                  setRecovery(r.recoveryCodes);
                  setSetup(null);
                  setCode('');
                  await load();
                  showToast?.('ورود دو مرحله‌ای روشن شد.');
                })
              }
              className="px-4 rounded-xl bg-emerald-700 text-white text-xs font-black cursor-pointer disabled:opacity-60"
            >
              تأیید
            </button>
          </div>
        </div>
      )}

      {enabled && !disabling && !recovery && (
        <button type="button" onClick={() => setDisabling(true)} className="w-full py-2.5 rounded-2xl border border-rose-300 text-rose-700 text-xs font-black cursor-pointer">
          خاموش کردن ورود دو مرحله‌ای
        </button>
      )}

      {enabled && disabling && (
        <div className="space-y-2 p-3 rounded-2xl bg-rose-50 border border-rose-200">
          <p className="text-[11px] font-bold text-rose-800">برای خاموش کردن، رمز و یک کد فعلی (یا کد بازیابی) لازم است.</p>
          <input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="کلمه عبور" className="w-full p-2.5 bg-white border border-rose-200 rounded-xl text-sm font-bold" />
          <input type="text" dir="ltr" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="کد برنامه یا کد بازیابی" className="w-full p-2.5 bg-white border border-rose-200 rounded-xl text-sm font-mono font-bold text-center" />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (!(await askConfirm('ورود دو مرحله‌ای خاموش شود؟ حساب شما فقط با رمز محافظت می‌شود.'))) return;
                  await api.twoFactorDisable(password, code);
                  setDisabling(false);
                  setPassword('');
                  setCode('');
                  await load();
                  showToast?.('ورود دو مرحله‌ای خاموش شد.');
                })
              }
              className="flex-1 py-2 rounded-xl bg-rose-700 text-white text-xs font-black cursor-pointer disabled:opacity-60"
            >
              خاموش شود
            </button>
            <button type="button" onClick={() => { setDisabling(false); setError(''); }} className="px-4 rounded-xl border border-rose-300 text-rose-700 text-xs font-black cursor-pointer">
              انصراف
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
