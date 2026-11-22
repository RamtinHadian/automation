import React, { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, LogOut, ShieldAlert } from 'lucide-react';
import { FieldForm, FieldValues } from '../components/crm/FieldForm';
import { PaperShell } from '../components/common/PaperShell';
import { PAPER_BUTTON, PAPER_INPUT, PAPER_LABEL } from '../components/common/paperStyles';
import { PaperNotice } from '../components/common/PaperNotice';

// The marketer's page (/field): sign in once (name, password and, when the administrator asks, the code of the authenticator app), then register customers in a few
// seconds each. It is deliberately light: it does not load the whole program, only this form.

const TOKEN = 'field_token_v1';
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
  const [showPw, setShowPw] = useState(false);
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

  if (state === 'loading') return <PaperShell title="ثبت سریع مشتری"><div className="h-24" /></PaperShell>;

  if (state === 'login') {
    return (
      <PaperShell title="ورود" subtitle="با نام کاربری و رمز خودتان وارد شوید">
        <form onSubmit={login} className="space-y-3">
          <div>
            <label className={PAPER_LABEL}>نام کاربری یا ایمیل</label>
            <input className={PAPER_INPUT} dir="ltr" style={{ textAlign: 'right' }} value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" enterKeyHint="next" />
          </div>
          <div>
            <label className={PAPER_LABEL}>رمز عبور</label>
            <div className="relative">
              <input className={`${PAPER_INPUT} pl-12`} type={showPw ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" enterKeyHint={needCode ? 'next' : 'go'} />
              <button type="button" onClick={() => setShowPw((x) => !x)} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#7d8c84]" aria-label="نمایش رمز">{showPw ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}</button>
            </div>
          </div>
          {needCode && (
            <div>
              <label className={PAPER_LABEL}>کد برنامهٔ احراز هویت (۶ رقم)</label>
              <input className={PAPER_INPUT} dir="ltr" style={{ textAlign: 'right' }} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" autoFocus enterKeyHint="go" />
            </div>
          )}
          {err && <PaperNotice kind="err" text={err} onClose={() => setErr('')} />}
          <button type="submit" disabled={busy || !id.trim() || !pw} className={PAPER_BUTTON}>{busy ? 'در حال ورود…' : 'ورود'}</button>
        </form>
      </PaperShell>
    );
  }

  const logout = () => { setTok(''); setInfo(null); setState('login'); };
  return (
    <PaperShell title="ثبت سریع مشتری" brand={info?.company} subtitle={info?.name}>
      {!info?.allowed ? (
        <div className="text-center space-y-2 py-4"><ShieldAlert className="w-8 h-8 mx-auto text-amber-600" /><p className="text-[14px] font-black text-[#1f2a24]">این صفحه برای حساب شما فعال نیست. به مدیر بگویید.</p></div>
      ) : info?.need2fa ? (
        <div className="text-center space-y-2 py-4"><ShieldAlert className="w-8 h-8 mx-auto text-amber-600" /><p className="text-[14px] font-black text-[#1f2a24] leading-7">مدیر خواسته برای این صفحه، احراز هویت دو مرحله‌ای (برنامهٔ Google Authenticator) روشن باشد. آن را در سامانه، بخش «حساب من»، روشن کنید و دوباره وارد شوید.</p></div>
      ) : (
        <FieldForm cfg={{ hidden: info.hidden, required: info.required }} onSubmit={submit} />
      )}
      <button type="button" onClick={logout} className="mt-4 mx-auto flex items-center gap-1.5 text-[12px] font-black text-[#55645c]"><LogOut className="w-4 h-4" />خروج</button>
    </PaperShell>
  );
};
