import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Headset, LogOut, Send, ShieldCheck, Plus, ArrowRight } from 'lucide-react';
import { toPersianDigits } from '../lib/jalali';
import { dayText } from '../lib/warranty';
import { TICKET_STATUS } from '../lib/support';
import { TicketStatus } from '../types';

const TOKEN = 'portal_token_v1';
const inputCls = 'w-full px-4 py-3 bg-white border border-[#EBDBCE] rounded-2xl text-base outline-hidden focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500';

interface PLog { at: string; kind: 'customer' | 'ai' | 'staff' | 'status'; byName?: string; note?: string; to?: TicketStatus }
interface PTicket { id: string; ticketNo: string; subject: string; description: string; status: TicketStatus; createdAt: string; resolution?: string; log: PLog[] }
interface Me { name: string; plan: string; endDate: string; responseHours: number; ai: boolean; tickets: PTicket[] }
interface Info { enabled: boolean; company: string; ai: boolean; demoHint?: string }

class PErr extends Error {
  constructor(public status: number, m: string) {
    super(m);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  let token = '';
  try {
    token = localStorage.getItem(TOKEN) || '';
  } catch {
    /* storage blocked */
  }
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new PErr(res.status, json.error || 'انجام نشد.');
  return json as T;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return toPersianDigits(d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));
};

const STEP_TEXT: Partial<Record<TicketStatus, string>> = {
  IN_PROGRESS: 'همکاران ما در حال بررسی هستند',
  WAITING: 'منتظر پاسخ یا اطلاعات از شما هستیم',
  RESOLVED: 'مشکل حل شد',
  CLOSED: 'درخواست بسته شد',
};

/** The page for customers with a running support plan: sign in with the mobile number and the access code, send a request, follow the answers. */
export const PortalPage: React.FC = () => {
  const [info, setInfo] = useState<Info | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [authed, setAuthed] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [desc, setDesc] = useState('');
  const [reply, setReply] = useState('');

  const loadMe = useCallback(async () => {
    try {
      setMe(await call<Me>('GET', '/api/portal/me'));
      setAuthed(true);
    } catch (e) {
      if (e instanceof PErr && (e.status === 401 || e.status === 403)) {
        try {
          localStorage.removeItem(TOKEN);
        } catch {
          /* ignore */
        }
        setAuthed(false);
        setMe(null);
        if (e.status === 403) setErr(e.message);
      }
    }
  }, []);

  useEffect(() => {
    call<Info>('GET', '/api/portal/info').then(setInfo).catch(() => setInfo({ enabled: false, company: '', ai: false }));
    loadMe();
  }, [loadMe]);
  useEffect(() => {
    if (!authed) return;
    const t = window.setInterval(loadMe, 20000);
    return () => window.clearInterval(t);
  }, [authed, loadMe]);

  const login = async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const r = await call<{ token: string }>('POST', '/api/portal/login', { phone, code });
      localStorage.setItem(TOKEN, r.token);
      setCode('');
      await loadMe();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ورود انجام نشد.');
    } finally {
      setBusy(false);
    }
  };
  const logout = () => {
    try {
      localStorage.removeItem(TOKEN);
    } catch {
      /* ignore */
    }
    setAuthed(false);
    setMe(null);
    setOpenId(null);
  };
  const send = async () => {
    if (busy || !subject.trim() || !desc.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const t = await call<PTicket>('POST', '/api/portal/tickets', { subject: subject.trim(), description: desc.trim() });
      setSubject('');
      setDesc('');
      setCreating(false);
      await loadMe();
      setOpenId(t.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ارسال نشد.');
    } finally {
      setBusy(false);
    }
  };
  const sendReply = async (id: string) => {
    if (busy || !reply.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await call<PTicket>('POST', `/api/portal/tickets/${encodeURIComponent(id)}/message`, { text: reply.trim() });
      setReply('');
      await loadMe();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ارسال نشد.');
    } finally {
      setBusy(false);
    }
  };

  const open = me?.tickets.find((t) => t.id === openId) || null;
  const shell = (children: React.ReactNode) => (
    <div className="min-h-[100dvh] bg-[#FAF5F1] text-[#3A241F]" data-portal>
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10 pb-[max(2rem,env(safe-area-inset-bottom))]">{children}</div>
    </div>
  );

  if (!info) return shell(<div className="py-24 text-center text-sm font-bold text-[#8C6F66]">در حال بارگذاری…</div>);

  if (!authed || !me) {
    return shell(
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-lg shadow-teal-600/25"><Headset className="w-7 h-7" /></div>
          <h1 className="text-xl font-black">پشتیبانی {info.company}</h1>
          <p className="text-xs font-bold text-[#8C6F66] leading-6">ویژهٔ مشتریانی که پلن پشتیبانی فعال دارند. با شمارهٔ موبایل ثبت‌شده در پروندهٔ خود و چهار رقم آخر کد ملی‌تان وارد شوید.</p>
        </div>
        {!info.enabled ? (
          <div className="bg-white border border-[#EBDBCE] rounded-3xl p-5 text-center text-sm font-bold text-[#8C6F66]">ورود مشتریان فعلاً بسته است. با شرکت تماس بگیرید.</div>
        ) : (
          <form
            className="bg-white border border-[#EBDBCE] rounded-3xl p-5 space-y-4 shadow-sm"
            onSubmit={(e) => {
              e.preventDefault();
              login();
            }}
          >
            <div>
              <label className="block text-xs font-black mb-1.5">شمارهٔ موبایل</label>
              <input className={inputCls} inputMode="tel" autoComplete="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09123456789" />
            </div>
            <div>
              <label className="block text-xs font-black mb-1.5">چهار رقم آخر کد ملی</label>
              <input className={inputCls} inputMode="numeric" autoComplete="off" dir="ltr" maxLength={4} value={code} onChange={(e) => setCode(e.target.value)} placeholder="••••" />
            </div>
            {err && <div className="text-xs font-black text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{err}</div>}
            <button type="submit" disabled={busy || !phone.trim() || code.trim().length !== 4} className="w-full min-h-[48px] rounded-2xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-black cursor-pointer">{busy ? 'در حال بررسی…' : 'ورود'}</button>
            {info.demoHint && <div className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{info.demoHint}</div>}
          </form>
        )}
        <p className="text-center text-[11px] font-bold text-[#8C6F66] flex items-center justify-center gap-1.5"><ShieldCheck className="w-4 h-4" />اطلاعات ورود خود را به کسی ندهید.</p>
      </div>
    );
  }

  const bubble = (l: PLog, i: number) => {
    if (l.kind === 'status') return <div key={i} className="text-center text-[11px] font-bold text-[#8C6F66]">{l.to && STEP_TEXT[l.to] ? `${STEP_TEXT[l.to]} · ${when(l.at)}` : ''}</div>;
    const mine = l.kind === 'customer';
    const ai = l.kind === 'ai';
    return (
      <div key={i} className={`flex ${mine ? 'justify-start' : 'justify-end'}`}>
        <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-7 whitespace-pre-wrap ${mine ? 'bg-teal-600 text-white rounded-br-md' : ai ? 'bg-violet-50 border border-violet-200 rounded-bl-md' : 'bg-white border border-[#EBDBCE] rounded-bl-md'}`}>
          {!mine && <div className="text-[10px] font-black mb-0.5 flex items-center gap-1 text-[#8C6F66]">{ai && <Bot className="w-3 h-3" />}{ai ? 'پاسخ هوشمند (کارشناس ما هم بررسی می‌کند)' : l.byName}</div>}
          {l.note}
          <div className={`text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-[#8C6F66]'}`}>{when(l.at)}</div>
        </div>
      </div>
    );
  };

  return shell(
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-black">سلام {me.name}</h1>
          <p className="text-[11px] font-bold text-[#8C6F66] leading-6">پلن «{me.plan}» تا {dayText(me.endDate)} · پاسخ‌گویی ظرف {toPersianDigits(me.responseHours)} ساعت</p>
        </div>
        <button type="button" onClick={logout} className="shrink-0 flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl bg-white border border-[#EBDBCE] text-xs font-black cursor-pointer"><LogOut className="w-4 h-4" />خروج</button>
      </div>
      {err && <div className="text-xs font-black text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{err}</div>}

      {open ? (
        <div className="space-y-3">
          <button type="button" onClick={() => { setOpenId(null); setErr(''); }} className="flex items-center gap-1.5 min-h-[44px] text-xs font-black text-teal-700 cursor-pointer"><ArrowRight className="w-4 h-4" />همهٔ درخواست‌ها</button>
          <div className="bg-white border border-[#EBDBCE] rounded-3xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-black text-sm">{open.subject}</div>
                <div className="text-[11px] font-bold text-[#8C6F66]">{toPersianDigits(open.ticketNo)} · {when(open.createdAt)}</div>
              </div>
              <span className={`shrink-0 text-[11px] font-black px-2.5 py-1 rounded-full border ${TICKET_STATUS[open.status].cls}`}>{TICKET_STATUS[open.status].label}</span>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-start"><div className="max-w-[88%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm leading-7 whitespace-pre-wrap bg-teal-600 text-white">{open.description}</div></div>
              {open.log.map(bubble)}
            </div>
            {open.resolution && open.status !== 'OPEN' && (open.status === 'RESOLVED' || open.status === 'CLOSED') && (
              <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-3.5 py-2.5 text-xs font-bold leading-6"><span className="font-black text-emerald-800">نتیجه: </span>{open.resolution}</div>
            )}
          </div>
          {open.status !== 'CLOSED' ? (
            <div className="flex gap-2 items-end">
              <textarea className={`${inputCls} min-h-[52px] max-h-40`} rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={open.status === 'RESOLVED' ? 'اگر مشکل هنوز هست بنویسید تا دوباره باز شود…' : 'پیام تازه…'} />
              <button type="button" onClick={() => sendReply(open.id)} disabled={busy || !reply.trim()} className="shrink-0 w-12 h-12 rounded-2xl bg-teal-600 disabled:opacity-50 text-white flex items-center justify-center cursor-pointer" aria-label="ارسال"><Send className="w-5 h-5 -scale-x-100" /></button>
            </div>
          ) : (
            <div className="text-center text-xs font-bold text-[#8C6F66]">این درخواست بسته شده است. برای موضوع تازه، درخواست جدید بفرستید.</div>
          )}
        </div>
      ) : (
        <>
          {creating ? (
            <div className="bg-white border border-[#EBDBCE] rounded-3xl p-4 space-y-3 shadow-sm">
              <h2 className="font-black text-sm">درخواست تازه</h2>
              <input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="موضوع (مثلاً خطا هنگام صدور فاکتور)" maxLength={140} />
              <textarea className={`${inputCls} min-h-[120px]`} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="مشکل را کامل بنویسید: چه کاری می‌کردید و چه اتفاقی افتاد؟" maxLength={2000} />
              {me.ai && <p className="text-[11px] font-bold text-violet-700 flex items-center gap-1.5"><Bot className="w-4 h-4" />دستیار هوشمند سریع جواب اولیه می‌دهد و کارشناس ما هم درخواست را می‌بیند.</p>}
              <div className="flex gap-2">
                <button type="button" onClick={send} disabled={busy || !subject.trim() || !desc.trim()} className="flex-1 min-h-[48px] rounded-2xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-black cursor-pointer">{busy ? 'در حال ارسال…' : 'ارسال درخواست'}</button>
                <button type="button" onClick={() => { setCreating(false); setErr(''); }} className="min-h-[48px] px-5 rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE] text-sm font-black cursor-pointer">انصراف</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setCreating(true)} className="w-full min-h-[52px] flex items-center justify-center gap-2 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-black shadow-md shadow-teal-600/25 cursor-pointer"><Plus className="w-5 h-5" />درخواست پشتیبانی تازه</button>
          )}
          <div className="space-y-2.5">
            <h2 className="text-xs font-black text-[#8C6F66]">درخواست‌های شما</h2>
            {me.tickets.length === 0 && <div className="bg-white border border-[#EBDBCE] rounded-2xl py-10 text-center text-xs font-bold text-gray-400">هنوز درخواستی نفرستاده‌اید.</div>}
            {me.tickets.map((t) => (
              <button key={t.id} type="button" onClick={() => { setOpenId(t.id); setErr(''); }} className="w-full text-right bg-white border border-[#EBDBCE] rounded-2xl p-3.5 space-y-1 hover:shadow-md cursor-pointer" data-portal-ticket>
                <div className="flex items-start justify-between gap-2">
                  <span className="font-black text-sm">{t.subject}</span>
                  <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border ${TICKET_STATUS[t.status].cls}`}>{TICKET_STATUS[t.status].label}</span>
                </div>
                <div className="text-[11px] font-bold text-[#8C6F66]">{toPersianDigits(t.ticketNo)} · {when(t.createdAt)}</div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
