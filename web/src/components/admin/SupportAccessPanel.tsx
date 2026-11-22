import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, ShieldCheck, Terminal, Lock, Power } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';

type Status = Awaited<ReturnType<typeof api.supportAccessStatus>>;

const EVENT_FA: Record<string, string> = {
  unlocked: 'ورود موفق',
  'unlock-failed': 'تلاش ناموفق',
  blocked: 'مسدود (تلاش زیاد)',
  locked: 'خروج',
  command: 'دستور',
  enrolled: 'ساخت رمز دوم',
  'switched-off': 'خاموش شد',
  'switched-on': 'روشن شد',
};
const when = (iso: string) => toPersianDigits(new Date(iso).toLocaleString('fa-IR'));

/**
 * The technical access of the company that installed the program. Three things are needed together: the console session of the top administrator,
 * his password typed again, and the 6-digit code of the installer's Google Authenticator. It opens a diagnostics console (a fixed list of read-only
 * checks, not a shell). Every try is logged here, and the installation's top administrator can switch it off.
 */
export const SupportAccessPanel: React.FC<{ toast: (m: string) => void }> = ({ toast }) => {
  const [st, setSt] = useState<Status | null>(null);
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [left, setLeft] = useState(0);
  const [line, setLine] = useState('');
  const [out, setOut] = useState<{ cmd: string; text: string }[]>([]);
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const [swPw, setSwPw] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api.supportAccessStatus().then(setSt).catch(() => setSt(null));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [out]);

  // the session ends by itself (15 minutes): the screen is locked again
  useEffect(() => {
    if (!token) return;
    const t = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          setToken('');
          setOut([]);
          load();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [token, load]);

  const unlock = async () => {
    setBusy(true);
    try {
      const r = await api.supportAccessUnlock(pw, code);
      setToken(r.token);
      setLeft(r.expiresInSeconds);
      setOut([]);
      toast('دسترسی فنی باز شد.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'ورود انجام نشد.');
    } finally {
      setPw('');
      setCode('');
      setBusy(false);
      load();
    }
  };
  const lock = async () => {
    try {
      await api.supportAccessLock(token);
    } catch { /* it ends anyway */ }
    setToken('');
    setOut([]);
    load();
  };
  const run = async (cmd: string) => {
    const c = cmd.trim();
    if (!c || !token) return;
    setHist((h) => [c, ...h].slice(0, 30));
    setHi(-1);
    setLine('');
    setOut((o) => [...o, { cmd: c, text: '…' }]);
    try {
      const r = await api.supportAccessRun(token, c);
      setOut((o) => [...o.slice(0, -1), { cmd: c, text: r.output }]);
    } catch (e) {
      setOut((o) => [...o.slice(0, -1), { cmd: c, text: e instanceof Error ? e.message : 'خطا' }]);
      if (e instanceof Error && /نشست/.test(e.message)) setToken('');
    }
  };
  const toggle = async (on: boolean) => {
    try {
      await api.supportAccessEnable(on, swPw);
      toast(on ? 'دسترسی فنی روشن شد.' : 'دسترسی فنی خاموش شد.');
      setSwPw('');
      if (!on) { setToken(''); setOut([]); }
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'انجام نشد.');
    }
  };

  const card = 'bg-white border border-[#EBDBCE] rounded-3xl p-5 space-y-3';
  const field = 'w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-sm font-bold text-[#3A241F]';

  if (!st) return <div className="text-xs font-bold text-[#8C6F66] p-4">در حال خواندن…</div>;

  return (
    <div className="space-y-5 max-w-5xl" data-support-access>
      <div>
        <h3 className="font-black text-lg text-[#3A241F] flex items-center gap-2"><Terminal className="w-5 h-5 text-[#6E1B1B]" />دسترسی فنی (شرکت نصب‌کنندهٔ هورمند)</h3>
        <p className="text-xs text-[#8C6F66] mt-1 leading-6">
          این بخش برای عیب‌یابی سرور توسط شرکت نصب‌کنندهٔ هورمند است. ورود فقط با سه چیز همزمان ممکن است: ورود شما به کنسول مدیریت، کلمهٔ عبور مدیر ارشد که دوباره وارد می‌شود، و کد ۶ رقمی برنامهٔ Google Authenticator که فقط دست شرکت نصب‌کننده است. کار آن فقط چند آزمون خواندنی است (وضعیت سیستم، دیسک، پایگاه داده و اینترنت سرور)، نه اجرای برنامهٔ دیگر یا خواندن اطلاعات شما. هر ورود و هر دستور در گزارش پایین ثبت می‌شود و شما هر وقت بخواهید می‌توانید آن را خاموش کنید.
        </p>
      </div>

      {!st.enrolled && (
        <div className={card}>
          <div className="text-xs font-black text-amber-800">دسترسی فنی روی این سرور هنوز تنظیم نشده و کسی نمی‌تواند وارد شود.</div>
          <p className="text-[11px] font-bold text-[#8C6F66] leading-6">نصب‌کننده در ترمینال سرور این دستور را یک بار می‌زند و رمز دوم را در Google Authenticator خودش ذخیره می‌کند (رمز در هیچ صفحهٔ وبی نشان داده نمی‌شود):</p>
          <pre className="text-[11px] font-mono bg-[#1b1b1f] text-green-300 rounded-xl p-3 overflow-x-auto" dir="ltr">cd /opt/automation && docker compose exec app /server support-enroll</pre>
        </div>
      )}

      {st.enrolled && !token && (
        <div className={card} data-support-lock>
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-black text-sm flex items-center gap-2"><Lock className="w-4 h-4 text-[#6E1B1B]" />ورود به دسترسی فنی</h4>
            <span className={`text-[10px] font-black rounded-full px-2.5 py-0.5 border ${st.enabled ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{st.enabled ? 'روشن' : 'خاموش'}</span>
          </div>
          {st.enabled ? (
            <>
              <div className="grid sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-[11px] font-black text-[#8C6F66] mb-1">مدیر</label>
                  <input className={`${field} opacity-70`} readOnly value={st.fullName || ''} />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-[#8C6F66] mb-1">کلمهٔ عبور مدیر</label>
                  <input className={field} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} data-support-pw />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-[#8C6F66] mb-1 flex items-center gap-1"><KeyRound className="w-3 h-3" />رمز دوم (Google Authenticator شرکت نصب‌کننده)</label>
                  <input className={field} dir="ltr" inputMode="numeric" maxLength={8} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && pw && code) void unlock(); }} data-support-code />
                </div>
              </div>
              <button type="button" disabled={busy || !pw || !code} onClick={() => void unlock()} className="px-6 py-2.5 rounded-xl bg-[#6E1B1B] text-white text-xs font-black cursor-pointer disabled:opacity-50" data-support-unlock>
                {busy ? 'در حال بررسی…' : 'ورود'}
              </button>
              <p className="text-[10px] font-bold text-[#8C6F66]">پنج تلاش اشتباه، ورود را چند دقیقه می‌بندد. هر تلاش در گزارش ثبت می‌شود.</p>
            </>
          ) : (
            <p className="text-[11px] font-bold text-[#8C6F66]">دسترسی فنی خاموش است و ورودی پذیرفته نمی‌شود.</p>
          )}
        </div>
      )}

      {token && (
        <div className="rounded-3xl overflow-hidden border border-[#2b2b33] bg-[#1b1b1f]" data-support-console>
          <div className="flex items-center justify-between gap-2 px-4 py-2 bg-[#25252c] text-white">
            <div className="text-xs font-black flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-green-400" />کنسول عیب‌یابی · {toPersianDigits(Math.floor(left / 60))}:{toPersianDigits(String(left % 60).padStart(2, '0'))} مانده</div>
            <button type="button" onClick={() => void lock()} className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-black cursor-pointer" data-support-end>پایان نشست</button>
          </div>
          <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-white/10">
            {['all', 'version', 'system', 'disk', 'db', 'network'].map((c) => (
              <button key={c} type="button" onClick={() => void run(c)} className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-green-300 text-[11px] font-mono cursor-pointer" dir="ltr">{c}</button>
            ))}
            <button type="button" onClick={() => void run('help')} className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-sky-300 text-[11px] font-mono cursor-pointer" dir="ltr">help</button>
          </div>
          <div className="h-[44vh] overflow-auto px-4 py-3 text-[12px] font-mono text-green-200 whitespace-pre-wrap" dir="ltr" data-support-output>
            {out.length === 0 && <div className="text-white/50">یکی از دکمه‌ها را بزنید یا دستور بنویسید (help = فهرست دستورها).</div>}
            {out.map((o, i) => (
              <div key={i} className="mb-3">
                <div className="text-sky-300">$ {o.cmd}</div>
                <div>{o.text}</div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="flex items-center gap-2 px-4 py-2 border-t border-white/10 bg-[#25252c]" dir="ltr">
            <span className="text-sky-300 font-mono text-sm">$</span>
            <input
              value={line}
              onChange={(e) => setLine(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void run(line);
                else if (e.key === 'ArrowUp') { const n = Math.min(hist.length - 1, hi + 1); if (hist[n]) { setHi(n); setLine(hist[n]); } e.preventDefault(); }
                else if (e.key === 'ArrowDown') { const n = hi - 1; setHi(n); setLine(n >= 0 ? hist[n] : ''); e.preventDefault(); }
              }}
              className="flex-1 bg-transparent text-green-200 font-mono text-sm focus:outline-none"
              autoComplete="off"
              spellCheck={false}
              placeholder="help"
              data-support-line
            />
          </div>
        </div>
      )}

      {st.enrolled && (
        <div className={card}>
          <h4 className="font-black text-sm flex items-center gap-2"><Power className="w-4 h-4 text-[#6E1B1B]" />روشن و خاموش کردن (فقط مدیر ارشد)</h4>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px]">
              <label className="block text-[11px] font-black text-[#8C6F66] mb-1">کلمهٔ عبور شما برای تأیید</label>
              <input className={field} type="password" autoComplete="current-password" value={swPw} onChange={(e) => setSwPw(e.target.value)} />
            </div>
            {st.enabled ? (
              <button type="button" disabled={!swPw} onClick={() => void toggle(false)} className="px-4 py-2.5 rounded-xl border border-rose-300 bg-rose-50 text-rose-800 text-xs font-black cursor-pointer disabled:opacity-50">خاموش کردن دسترسی فنی</button>
            ) : (
              <button type="button" disabled={!swPw} onClick={() => void toggle(true)} className="px-4 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-black cursor-pointer disabled:opacity-50">روشن کردن</button>
            )}
          </div>
        </div>
      )}

      <div className={card} data-support-log>
        <h4 className="font-black text-sm">گزارش دسترسی‌ها (۴۰ مورد آخر)</h4>
        {st.log.length === 0 ? (
          <p className="text-[11px] font-bold text-[#8C6F66]">هنوز موردی ثبت نشده است.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[11px]">
              <thead><tr className="text-[#8C6F66]"><th className="py-1 px-2">زمان</th><th className="px-2">رویداد</th><th className="px-2">آدرس</th><th className="px-2">جزئیات</th></tr></thead>
              <tbody>
                {st.log.map((l, i) => (
                  <tr key={i} className="border-t border-[#F3E8DF]">
                    <td className="py-1.5 px-2 whitespace-nowrap">{when(l.at)}</td>
                    <td className={`px-2 font-black ${l.event === 'unlock-failed' || l.event === 'blocked' ? 'text-rose-700' : ''}`}>{EVENT_FA[l.event] || l.event}</td>
                    <td className="px-2" dir="ltr">{l.ip}</td>
                    <td className="px-2 font-mono" dir="ltr">{l.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
