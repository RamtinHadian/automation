import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, CornerUpLeft, Eye, FilePlus2, History, Inbox, Network, Reply, Send, Undo2, X } from 'lucide-react';
import { api, ChainPerson, InternalLetter, InternalLetterEvent } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { formatCurrentJalaliDateTime, toPersianDigits } from '../../lib/jalali';
import { PersonPicker } from '../common/PersonPicker';

const field = 'w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-semibold text-[#3A241F] focus:ring-2 focus:ring-[#D34A32]/20 focus:border-[#D34A32] focus:outline-none';

const STATUS: Record<InternalLetter['status'], { t: string; c: string }> = {
  IN_CHAIN: { t: 'در مسیر', c: 'bg-amber-50 text-amber-800 border-amber-200' },
  DELIVERED: { t: 'به مقصد رسید', c: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  RETURNED: { t: 'برگشت خورده', c: 'bg-rose-50 text-rose-800 border-rose-200' },
};

const ACTION: Record<InternalLetterEvent['action'], { t: string; c: string }> = {
  CREATED: { t: 'نامه را نوشت', c: '#6E1B1B' },
  SENT: { t: 'ارسال کرد به', c: '#B45309' },
  FORWARDED: { t: 'به بالا فرستاد، برای', c: '#B45309' },
  DELIVERED: { t: 'به مقصد رساند، به', c: '#059669' },
  RETURNED: { t: 'برگرداند به', c: '#E11D48' },
  EDITED: { t: 'اصلاح کرد', c: '#7C3AED' },
  NOTE: { t: 'یادداشت گذاشت', c: '#0284C7' },
  REPLY: { t: 'پاسخ داد', c: '#059669' },
  READ: { t: 'خواند', c: '#8C6F66' },
};

const when = (iso: string) => formatCurrentJalaliDateTime(new Date(iso));

/** «مکاتبات داخلی»: letters between the people of the company that climb the organisation chart (employee → unit manager → peer manager / managing director), each with its full history. */
export const InternalLettersView: React.FC<{ onUnread?: (n: number) => void }> = ({ onUnread }) => {
  const { currentUser } = useAppContext();
  const auditor = !!currentUser.canSignOfficialLetters || currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEPT_ADMIN';
  const [box, setBox] = useState<'inbox' | 'sent' | 'involved' | 'all'>('inbox');
  const [list, setList] = useState<InternalLetter[]>([]);
  const [open, setOpen] = useState<InternalLetter | null>(null);
  const [compose, setCompose] = useState<InternalLetter | 'new' | null>(null);
  const [route, setRoute] = useState<string[]>([]);

  const load = useCallback(() => {
    api.icList(box).then((r) => {
      setList(r.letters);
      if (box === 'inbox') onUnread?.(r.letters.filter((l) => !l.read).length);
      setOpen((cur) => (cur ? r.letters.find((l) => l.id === cur.id) || cur : cur));
    }).catch(() => setList([]));
  }, [box, onUnread]);
  useEffect(() => { load(); }, [load]);
  // letters move while somebody else works on them
  useEffect(() => {
    const t = window.setInterval(load, 20000);
    return () => window.clearInterval(t);
  }, [load]);
  useEffect(() => {
    api.icOptions().then((r) => setRoute(r.firstHop || [])).catch(() => setRoute([]));
  }, []);

  const show = (l: InternalLetter) => {
    setOpen(l);
    if (!l.read && l.people.includes(currentUser.id)) api.icRead(l.id).then(load).catch(() => {});
  };

  const boxes: [typeof box, string][] = [['inbox', 'دریافتی (نزد من)'], ['sent', 'نوشته‌های من'], ['involved', 'از دست من گذشته'], ...(auditor ? ([['all', 'همهٔ مکاتبات']] as [typeof box, string][]) : [])];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4" dir="rtl" data-internal-letters>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {boxes.map(([k, t]) => (
            <button key={k} type="button" onClick={() => setBox(k)} className={`px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer ${box === k ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>{t}</button>
          ))}
        </div>
        <button type="button" onClick={() => setCompose('new')} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black cursor-pointer" data-ic-new>
          <FilePlus2 className="w-4 h-4" />
          نامهٔ داخلی جدید
        </button>
      </div>

      <div className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3 text-[11px] leading-6 font-bold text-[#6B4F47] flex items-start gap-2" data-ic-chain>
        <Network className="w-4 h-4 text-[#6E1B1B] shrink-0 mt-1" />
        <div>
          {currentUser.canSignOfficialLetters
            ? 'شما مدیرعامل هستید؛ می‌توانید به همهٔ همکاران نامهٔ داخلی بنویسید و نامه‌هایی که به شما می‌رسد در «دریافتی» است.'
            : route.length > 0
              ? <>نامهٔ شما اول نزد «<b>{route[0]}</b>» (مدیر واحدتان) می‌رود. او آن را به مدیر هم‌رده، مدیر بالاتر یا مدیرعامل می‌فرستد یا با دلیل برمی‌گرداند. هر مرحله در تاریخچهٔ نامه ثبت می‌شود.</>
              : 'واحد شما مدیر ندارد؛ نامه‌هایتان را مستقیم به مدیران بالاتر یا مدیرعامل می‌نویسید. هر مرحله در تاریخچهٔ نامه ثبت می‌شود.'}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EBDBCE] p-10 text-center text-xs font-bold text-[#8C6F66]" data-ic-empty>
          <Inbox className="w-8 h-8 mx-auto mb-2 text-[#C9B8AE]" />
          {box === 'inbox' ? 'نامهٔ داخلی‌ای نزد شما نیست.' : box === 'sent' ? 'هنوز نامهٔ داخلی ننوشته‌اید.' : 'موردی نیست.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {list.map((l) => (
            <button key={l.id} type="button" onClick={() => show(l)} className={`text-right rounded-2xl border p-4 bg-white hover:shadow-md hover:border-[#C98B6A] transition-all cursor-pointer ${!l.read && l.people.includes(currentUser.id) ? 'border-amber-300 bg-amber-50/40' : 'border-[#EBDBCE]'}`} data-ic-card>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-black text-[#3A241F] truncate">{l.subject}</div>
                  <div className="text-[11px] font-bold text-[#8C6F66] mt-0.5">از {l.senderName}{l.senderDept ? ` (${l.senderDept})` : ''} ← به {l.toName}</div>
                  <div className="text-[10.5px] font-bold text-[#A8928B] mt-0.5">شمارهٔ {toPersianDigits(l.number)} · {when(l.createdAt)}</div>
                  {l.status !== 'DELIVERED' && <div className="text-[10.5px] font-black text-[#6E1B1B] mt-1">الان نزد: {l.holderName}</div>}
                </div>
                <span className={`text-[10px] font-black rounded-full px-2 py-0.5 border shrink-0 ${STATUS[l.status].c}`}>{STATUS[l.status].t}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && <Detail letter={open} onClose={() => setOpen(null)} onChanged={load} onEdit={() => { setCompose(open); }} />}
      {compose && <Compose resend={compose === 'new' ? undefined : compose} onClose={() => setCompose(null)} onDone={() => { setCompose(null); setOpen(null); setBox(compose === 'new' ? 'sent' : box); load(); }} />}
    </div>
  );
};

const Detail: React.FC<{ letter: InternalLetter; onClose: () => void; onChanged: () => void; onEdit: () => void }> = ({ letter, onClose, onChanged, onEdit }) => {
  const { currentUser } = useAppContext();
  const holder = letter.holderId === currentUser.id;
  const [fwd, setFwd] = useState<ChainPerson[]>([]);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'forward' | 'return' | 'note' | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const canAct = holder && letter.status === 'IN_CHAIN';
  const canReturn = holder && letter.senderId !== currentUser.id && letter.status !== 'RETURNED';
  const involved = letter.people.includes(currentUser.id);
  useEffect(() => {
    if (canAct) api.icOptions(letter.id).then((r) => setFwd(r.forward || [])).catch(() => setFwd([]));
  }, [letter.id, canAct]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const history = letter.history || [];

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
      setMode(null);
      setNote('');
      setTo('');
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] bg-[#FAF5F1] overflow-y-auto" dir="rtl" data-ic-detail onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 sm:px-5 py-3 bg-white/95 backdrop-blur border-b border-[#EBDBCE]">
        <button type="button" onClick={onClose} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] hover:bg-[#EBDBCE] cursor-pointer"><ArrowRight className="w-4 h-4" />بازگشت</button>
        <span className={`text-[11px] font-black rounded-full px-3 py-1 border ${STATUS[letter.status].c}`}>{STATUS[letter.status].t}{letter.status !== 'DELIVERED' ? ` · نزد ${letter.holderName}` : ''}</span>
      </div>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-5 gap-5">
        <section className="lg:col-span-3 space-y-4">
          <article className="bg-white rounded-3xl border border-[#EBDBCE] p-5 sm:p-7 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[#8C6F66]">
              <span>شمارهٔ {toPersianDigits(letter.number)}</span>
              <span>{when(letter.createdAt)}</span>
            </div>
            <h2 className="text-base font-black text-[#3A241F]">{letter.subject}</h2>
            <div className="text-[12px] font-bold text-[#6B4F47]">از: {letter.senderName}{letter.senderDept ? ` (${letter.senderDept})` : ''}<br />به: {letter.toName}</div>
            <div className="border-t border-[#EBDBCE] pt-3 text-[13px] leading-8 text-[#3A241F] whitespace-pre-wrap">{letter.body}</div>
          </article>

          {letter.status === 'RETURNED' && letter.senderId === currentUser.id && (
            <button type="button" onClick={onEdit} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#6E1B1B] hover:bg-[#561414] text-white text-sm font-black cursor-pointer" data-ic-resend><Undo2 className="w-4 h-4" />اصلاح و ارسال دوباره</button>
          )}

          {(canAct || canReturn || involved) && (
            <div className="bg-white rounded-3xl border border-[#EBDBCE] p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {canAct && <button type="button" onClick={() => setMode('forward')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer ${mode === 'forward' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-amber-800 border-amber-300'}`} data-ic-forward><CornerUpLeft className="w-3.5 h-3.5" />ارسال به بالا</button>}
                {canReturn && <button type="button" onClick={() => setMode('return')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer ${mode === 'return' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-rose-700 border-rose-300'}`}><Undo2 className="w-3.5 h-3.5" />برگرداندن با دلیل</button>}
                {involved && <button type="button" onClick={() => setMode('note')} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border cursor-pointer ${mode === 'note' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-sky-800 border-sky-300'}`}><Reply className="w-3.5 h-3.5" />{letter.toId === currentUser.id ? 'پاسخ' : 'یادداشت'}</button>}
              </div>
              {mode === 'forward' && (
                <div className="space-y-2">
                  <PersonPicker title="ارسال برای…" items={fwd.map((p) => ({ id: p.id, name: p.name, sub: p.sub }))} value={to} onChange={setTo} placeholder={fwd.length ? 'مقصد بعدی را انتخاب کنید…' : 'مقصدی در دسترس نیست'} />
                  <textarea className={`${field} min-h-[70px]`} placeholder="توضیح شما برای مقصد بعدی (اختیاری)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button type="button" disabled={busy || !to} onClick={() => run(() => api.icForward(letter.id, { toId: to, note }))} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black disabled:opacity-50 cursor-pointer"><Send className="w-4 h-4" />ارسال</button>
                </div>
              )}
              {mode === 'return' && (
                <div className="space-y-2">
                  <textarea className={`${field} min-h-[80px]`} placeholder="دلیل برگرداندن (لازم است)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button type="button" disabled={busy || !note.trim()} onClick={() => run(() => api.icReturn(letter.id, { note }))} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black disabled:opacity-50 cursor-pointer"><Undo2 className="w-4 h-4" />برگرداندن به {letter.senderName}</button>
                </div>
              )}
              {mode === 'note' && (
                <div className="space-y-2">
                  <textarea className={`${field} min-h-[80px]`} placeholder={letter.toId === currentUser.id ? 'پاسخ شما به نامه' : 'یادداشت شما (همهٔ افراد این نامه می‌بینند)'} value={note} onChange={(e) => setNote(e.target.value)} />
                  <button type="button" disabled={busy || !note.trim()} onClick={() => run(() => api.icNote(letter.id, { note }))} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black disabled:opacity-50 cursor-pointer"><Send className="w-4 h-4" />ثبت</button>
                </div>
              )}
              {err && <div className="text-[11px] font-bold text-rose-600">{err}</div>}
            </div>
          )}
        </section>

        <aside className="lg:col-span-2">
          <div className="bg-white rounded-3xl border border-[#EBDBCE] p-4 sm:p-5" data-ic-history>
            <h3 className="flex items-center gap-1.5 text-[12px] font-black text-[#6E1B1B] mb-3"><History className="w-4 h-4" />تاریخچهٔ نامه</h3>
            <ol className="relative border-r-2 border-[#EBDBCE] pr-4 space-y-3.5">
              {history.map((h, i) => (
                <li key={i} className="relative">
                  <span className="absolute -right-[23px] top-1 w-3 h-3 rounded-full border-2 border-white" style={{ background: ACTION[h.action]?.c || '#8C6F66' }} />
                  <div className="text-[11.5px] font-black text-[#3A241F] leading-5">
                    {h.action === 'READ' ? <Eye className="inline w-3 h-3 ml-1 text-[#8C6F66]" /> : h.action === 'DELIVERED' ? <CheckCircle2 className="inline w-3 h-3 ml-1 text-emerald-600" /> : null}
                    {h.byName} {ACTION[h.action]?.t || h.action}{h.toName ? ` ${h.toName}` : ''}
                  </div>
                  {h.note && <div className="mt-1 text-[11px] leading-6 text-[#6B4F47] bg-[#FAF5F1] rounded-xl px-2.5 py-1.5 whitespace-pre-wrap">{h.note}</div>}
                  <div className="text-[10px] font-bold text-[#A8928B] mt-0.5">{when(h.at)}</div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
};

const Compose: React.FC<{ resend?: InternalLetter; onClose: () => void; onDone: () => void }> = ({ resend, onClose, onDone }) => {
  const [targets, setTargets] = useState<ChainPerson[]>([]);
  const [first, setFirst] = useState<string[]>([]);
  const [toId, setToId] = useState(resend?.toId || '');
  const [subject, setSubject] = useState(resend?.subject || '');
  const [body, setBody] = useState(resend?.body || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.icOptions().then((r) => { setTargets(r.targets || []); setFirst(r.firstHop || []); }).catch(() => {});
  }, []);
  const send = async () => {
    setErr('');
    if (!toId) return setErr('گیرندهٔ نامه را انتخاب کنید.');
    if (!subject.trim() || !body.trim()) return setErr('موضوع و متن نامه را بنویسید.');
    setBusy(true);
    try {
      if (resend) await api.icResend(resend.id, { subject, body, toId });
      else await api.icCreate({ subject, body, toId });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ارسال نشد.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[95] bg-black/55 flex items-center justify-center p-3 sm:p-6" dir="rtl" data-ic-compose>
      <div className="bg-white rounded-3xl border border-[#EBDBCE] shadow-2xl w-full max-w-2xl max-h-[94dvh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 bg-gradient-to-l from-amber-600 to-amber-500 text-white">
          <FilePlus2 className="w-5 h-5" />
          <h3 className="font-black text-sm flex-1">{resend ? 'اصلاح و ارسال دوبارهٔ نامه' : 'نامهٔ داخلی جدید'}</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center cursor-pointer" aria-label="بستن"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto">
          <div>
            <div className="text-[11px] font-black text-[#3A241F] mb-1.5">نامه برای چه کسی است؟</div>
            <PersonPicker title="گیرندهٔ نامه" items={targets.map((p) => ({ id: p.id, name: p.name, sub: p.sub }))} value={toId} onChange={setToId} placeholder="انتخاب گیرنده…" />
            {first.length > 0 && <p className="text-[10.5px] font-bold text-[#8C6F66] mt-1.5 leading-5">طبق چارت سازمانی نامه اول نزد «{first[0]}» می‌رود و او آن را بالا می‌فرستد.</p>}
          </div>
          <div>
            <div className="text-[11px] font-black text-[#3A241F] mb-1.5">موضوع</div>
            <input className={field} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <div className="text-[11px] font-black text-[#3A241F] mb-1.5">متن نامه</div>
            <textarea className={`${field} leading-8 min-h-[220px]`} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          {err && <div className="text-[11px] font-bold text-rose-600">{err}</div>}
          <button type="button" disabled={busy} onClick={send} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-black disabled:opacity-60 cursor-pointer" data-ic-send><Send className="w-4 h-4" />{resend ? 'ارسال دوباره' : 'ارسال نامه'}</button>
        </div>
      </div>
    </div>
  );
};
