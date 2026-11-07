import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';

type Msg = Awaited<ReturnType<typeof api.inboxList>>['messages'][number];
const NAME: Record<string, string> = { telegram: 'تلگرام', bale: 'بله' };
const timeOf = (at: string) => `${formatTaskDate(at.slice(0, 10))} · ${toPersianDigits(new Date(at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))}`;

/**
 * The messages customers write to the company bots (Telegram, Bale) arrive here by themselves (the server listens), each conversation
 * belongs to the person who owns the customer, and the answer goes back to the same messenger. The server filters the list by the
 * CRM rules, so a person only ever receives the conversations of the customers they may see.
 */
export const InboxPanel: React.FC<{ showToast: (m: string) => void; onOpenCustomer: (id: string) => void }> = ({ showToast, onOpenCustomer }) => {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [open, setOpen] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { setMsgs((await api.inboxList()).messages); } catch { /* the list stays as it was */ }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000); // new messages show up by themselves
    return () => clearInterval(t);
  }, [load]);

  const threads = useMemo(() => {
    const m = new Map<string, { id: string; name: string; last: Msg; unread: number }>();
    for (const x of msgs) { // newest first
      const t = m.get(x.customerId) || { id: x.customerId, name: x.customerName, last: x, unread: 0 };
      if (x.direction === 'in' && !x.read) t.unread += 1;
      m.set(x.customerId, t);
    }
    return [...m.values()];
  }, [msgs]);
  const thread = useMemo(() => msgs.filter((x) => x.customerId === open).slice().reverse(), [msgs, open]);
  const channel = thread.length ? thread[thread.length - 1].channel : 'telegram';
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [thread.length, open]);

  const pick = async (id: string) => {
    setOpen(id);
    try { await api.inboxRead(id); await load(); } catch { /* reading mark failed: the unread count stays */ }
  };
  const send = async () => {
    if (!text.trim() || !open) return;
    setBusy(true);
    try { await api.inboxReply({ customerId: open, channel, text: text.trim() }); setText(''); await load(); } catch (e) { showToast((e as Error).message || 'ارسال نشد.'); }
    setBusy(false);
  };

  if (threads.length === 0) {
    return <div className="text-center text-[11px] font-bold text-gray-400 py-8 border border-dashed border-[#EBDBCE] rounded-2xl">هنوز پیامی نیامده. وقتی مشتری با لینک ربات (تلگرام یا بله) وصل شود و به ربات شرکت پیام بدهد، همین‌جا و به‌صورت اعلان به مسئول مشتری می‌رسد.</div>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-3 min-h-[340px]" data-inbox>
      <div className="border border-[#EBDBCE] rounded-2xl divide-y divide-[#EBDBCE]/60 overflow-y-auto max-h-[420px] bg-white">
        {threads.map((t) => (
          <button key={t.id} type="button" onClick={() => void pick(t.id)} className={`w-full text-right px-3 py-2.5 cursor-pointer hover:bg-[#FAF5F1] ${open === t.id ? 'bg-violet-50' : ''}`}>
            <div className="flex items-center justify-between gap-2"><span className="font-black text-xs text-[#3A241F] truncate">{t.name}</span>{t.unread > 0 && <span className="bg-rose-500 text-white text-[10px] font-black rounded-full px-1.5">{toPersianDigits(t.unread)}</span>}</div>
            <div className="text-[10.5px] font-bold text-[#8C6F66] truncate">{NAME[t.last.channel]} · {t.last.text}</div>
          </button>
        ))}
      </div>
      <div className="border border-[#EBDBCE] rounded-2xl bg-white flex flex-col max-h-[420px]">
        {!open ? <div className="m-auto text-[11px] font-bold text-gray-400">یک گفتگو را انتخاب کنید.</div> : (
          <>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#EBDBCE]">
              <button type="button" onClick={() => onOpenCustomer(open)} className="font-black text-xs text-violet-700 cursor-pointer">{threads.find((x) => x.id === open)?.name} · پروندهٔ مشتری</button>
              <span className="text-[10px] font-black rounded-full px-2 py-0.5 bg-violet-50 text-violet-700 border border-violet-200">{NAME[channel]}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {thread.map((x) => (
                <div key={x.id} className={`flex ${x.direction === 'out' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs font-bold whitespace-pre-line ${x.direction === 'out' ? 'bg-violet-600 text-white' : 'bg-[#FAF5F1] text-[#3A241F] border border-[#EBDBCE]'}`}>
                    {x.text}
                    <div className={`text-[9.5px] mt-1 ${x.direction === 'out' ? 'text-white/70' : 'text-[#8C6F66]'}`}>{x.direction === 'out' ? x.sender : x.customerName} · {timeOf(x.at)}</div>
                  </div>
                </div>
              ))}
              <div ref={end} />
            </div>
            <div className="flex items-center gap-2 p-3 border-t border-[#EBDBCE]">
              <input className="flex-1 px-3 py-2 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:outline-none focus:ring-2 focus:ring-violet-300" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} placeholder="پاسخ را بنویسید…" />
              <button type="button" disabled={busy || !text.trim()} onClick={() => void send()} className="p-2.5 rounded-xl text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 cursor-pointer" aria-label="ارسال"><Send className="w-4 h-4" /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
