import React, { useCallback, useEffect, useState } from 'react';
import { LogOut, ShieldAlert, UserRound } from 'lucide-react';
import { FieldForm, FieldValues } from '../components/crm/FieldForm';

// The marketer's page (/field): sign in once (name, password and, when the administrator asks, the code of the authenticator app), then register customers in a few
// seconds each. It is deliberately light: it does not load the whole program, only this form.

const TOKEN = 'field_token_v1';
const inputCls = 'w-full px-4 py-3.5 bg-white border border-[#E2D3C7] rounded-2xl text-[16px] font-bold text-[#3A241F] outline-hidden focus:ring-2 focus:ring-[#6E1B1B]/25 focus:border-[#6E1B1B]';
const NEED_CODE = 'کد ورود دو مرحله‌ای را وارد کنید.';

interface Info { allowed: boolean; name: string; company: string; hidden: string[]; required: string[]; need2fa: boolean }

const getToken = () => { try { return localStorage.getItem(TOKEN) || ''; } catch { return ''; } };
const setTok = (t: string) => { try { if (t) localStorage.setItem(TOKEN, t); else localStorage.removeItem(TOKEN); } catch { /* storage blocked */ } };

async function call<T>(method: string, url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const token = getToken();
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export const FieldPage: React.FC = () => {
  const [info, setInfo] = useState<Info | null>(null);
  const [state, setState] = useState<'loading' | 'login' | 'ready'>('loading');
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [needCode, setNeedCode] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = 'ثبت سریع مشتری'; }, []);

  const load = useCallback(async () => {
    if (!getToken()) { setState('login'); return; }
    try {
      const r = await call<Info>('GET', '/api/field/info');
      if (r.status === 401) { setTok(''); setState('login'); return; }
      if (!r.ok) { setErr(r.data.error || 'خطا'); setState('login'); return; }
      setInfo(r.data);
      setState('ready');
    } catch {
      setErr('ارتباط با سرور برقرار نشد.');
      setState('login');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr('');
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: id.trim(), password: pw, adminOnly: false, field: true, code }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (String(j.error || '').startsWith(NEED_CODE.slice(0, 20))) { setNeedCode(true); setErr(''); } else setErr(j.error || 'ورود انجام نشد.');
      } else {
        setTok(j.token);
        setPw('');
        setCode('');
        await load();
      }
    } catch {
      setErr('ارتباط با سرور برقرار نشد.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (v: FieldValues) => {
    try {
      const r = await call<{ ok?: boolean }>('POST', '/api/field/customers', v);
      if (r.status === 401) { setTok(''); setState('login'); return 'نشست شما تمام شده؛ دوباره وارد شوید.'; }
      return r.ok ? null : r.data.error || 'ثبت نشد.';
    } catch {
      return 'ارتباط با اینترنت قطع است؛ دوباره امتحان کنید.';
    }
  };

  const shell = 'min-h-[100dvh] bg-[#FAF5F1] flex flex-col items-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]';

  if (state === 'loading') return <div className={shell} />;

  if (state === 'login') {
    return (
      <div className={shell} dir="rtl">
        <form onSubmit={login} className="w-full max-w-md mt-8 bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-6 space-y-4">
          <div className="text-center space-y-1">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#6E1B1B] text-white flex items-center justify-center"><UserRound className="w-7 h-7" /></div>
            <h1 className="text-xl font-black text-[#3A241F]">ثبت سریع مشتری</h1>
            <p className="text-[13px] font-bold text-[#8C6F66]">با نام کاربری و رمز خودتان وارد شوید</p>
          </div>
          <input className={inputCls} dir="ltr" style={{ textAlign: 'right' }} value={id} onChange={(e) => setId(e.target.value)} placeholder="نام کاربری یا ایمیل" autoComplete="username" autoCapitalize="none" autoCorrect="off" enterKeyHint="next" />
          <input className={inputCls} type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="رمز عبور" autoComplete="current-password" enterKeyHint={needCode ? 'next' : 'go'} />
          {needCode && <input className={inputCls} dir="ltr" style={{ textAlign: 'right' }} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} placeholder="کد برنامهٔ احراز هویت (۶ رقم)" autoComplete="one-time-code" autoFocus enterKeyHint="go" />}
          {err && <div role="alert" className="rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-[14px] font-black px-4 py-3">{err}</div>}
          <button type="submit" disabled={busy || !id.trim() || !pw} className="w-full min-h-[54px] rounded-2xl bg-[#6E1B1B] text-white text-[17px] font-black disabled:opacity-60 touch-manipulation">{busy ? 'در حال ورود…' : 'ورود'}</button>
        </form>
      </div>
    );
  }

  const logout = () => { setTok(''); setInfo(null); setState('login'); };
  return (
    <div className={shell} dir="rtl">
      <div className="w-full max-w-md space-y-4">
        <header className="flex items-center justify-between gap-2 pt-2">
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-[#8C6F66] truncate">{info?.company}</div>
            <div className="text-[17px] font-black text-[#3A241F] truncate">{info?.name}</div>
          </div>
          <button type="button" onClick={logout} className="shrink-0 w-11 h-11 rounded-2xl bg-white border border-[#EBDBCE] text-[#6E1B1B] flex items-center justify-center touch-manipulation" aria-label="خروج"><LogOut className="w-5 h-5" /></button>
        </header>
        {!info?.allowed ? (
          <div className="rounded-3xl bg-white border border-[#EBDBCE] p-6 text-center space-y-2"><ShieldAlert className="w-8 h-8 mx-auto text-amber-600" /><p className="text-[14px] font-black text-[#3A241F]">این صفحه برای حساب شما فعال نیست. به مدیر بگویید.</p></div>
        ) : info?.need2fa ? (
          <div className="rounded-3xl bg-white border border-[#EBDBCE] p-6 text-center space-y-2"><ShieldAlert className="w-8 h-8 mx-auto text-amber-600" /><p className="text-[14px] font-black text-[#3A241F] leading-7">مدیر خواسته برای این صفحه، احراز هویت دو مرحله‌ای (برنامهٔ Google Authenticator) روشن باشد. آن را در سامانه، بخش «حساب من»، روشن کنید و دوباره وارد شوید.</p></div>
        ) : (
          <div className="bg-white rounded-3xl border border-[#EBDBCE] shadow-sm p-5">
            <FieldForm cfg={{ hidden: info.hidden, required: info.required }} onSubmit={submit} />
          </div>
        )}
      </div>
    </div>
  );
};
