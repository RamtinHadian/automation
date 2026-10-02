import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCheck, MessageCircle, Search, Send } from 'lucide-react';
import { api, ChatConversation, ChatMessage } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { isoToJalaliParts, JALALI_MONTHS } from '../../lib/taskDates';
import { isoDay } from '../../lib/adminStats';
import { setActiveChatPeer } from '../../lib/chatState';

const timeOf = (iso: string) => {
  const d = new Date(iso);
  return toPersianDigits(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
};
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const today = isoDay(new Date());
  const key = isoDay(d);
  if (key === today) return 'امروز';
  if (key === isoDay(new Date(Date.now() - 86400000))) return 'دیروز';
  const p = isoToJalaliParts(key);
  return p ? `${toPersianDigits(p[2])} ${JALALI_MONTHS[p[1] - 1]}` : key;
};

/** One tick = sent; two green ticks = the person has opened the conversation and seen it. */
export const Ticks: React.FC<{ read: boolean }> = ({ read }) =>
  read ? <CheckCheck className="w-3.5 h-3.5 text-[#16a34a]" aria-label="دیده شد" /> : <Check className="w-3.5 h-3.5 text-[#8C6F66]" aria-label="ارسال شد" />;

const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 40 }) => (
  <span className="rounded-2xl bg-[#F6D9CD] text-[#6E1B1B] font-black flex items-center justify-center shrink-0" style={{ width: size, height: size, fontSize: size * 0.4 }}>
    {name.trim().slice(0, 1) || '؟'}
  </span>
);

/** Chat between colleagues, inside the «file» menu. */
export const ChatView: React.FC<{ initialPeer?: string; onPeerChange?: (id: string) => void }> = ({ initialPeer = '', onPeerChange }) => {
  const { staffList, currentUser, notifications, markNotificationsRead } = useAppContext();
  const [convs, setConvs] = useState<ChatConversation[]>([]);
  const [peer, setPeer] = useState(initialPeer);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLElement>(null);
  const [dock, setDock] = useState<{ left: number; width: number; bottom: number } | null>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  // the chat fills what is left of the window, so the typing bar is always in view and nothing needs scrolling
  useLayoutEffect(() => {
    const fit = () => {
      const el = box.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const reserve = window.innerWidth < 768 ? 88 : 0; // the phone has a bottom menu bar
      setHeight(Math.max(300, window.innerHeight - (top - window.scrollY) - reserve));
    };
    // the typing bar floats at the very bottom of the window, exactly under the conversation column
    const place = () => {
      const el = threadRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setDock({ left: r.left, width: r.width, bottom: window.innerWidth < 768 ? 88 : 0 });
    };
    const all = () => { fit(); place(); };
    // the page itself does not scroll while the chat is open (so the chat, the typing bar and the window bottom always line up)
    window.scrollTo(0, 0);
    const prevOverflow = document.documentElement.style.overflowY;
    document.documentElement.style.overflowY = 'hidden';
    all();
    const ro = new ResizeObserver(all);
    if (box.current) ro.observe(box.current);
    window.addEventListener('resize', all);
    window.addEventListener('scroll', place, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', all);
      window.removeEventListener('scroll', place);
      document.documentElement.style.overflowY = prevOverflow;
    };
  }, [peer]);
  const lastCount = useRef(0);

  const people = useMemo(() => staffList.filter((u) => u.isActive !== false && u.id !== currentUser.id), [staffList, currentUser.id]);
  const nameOf = useCallback((id: string) => staffList.find((u) => u.id === id)?.fullName || 'کاربر', [staffList]);

  const loadConvs = useCallback(() => {
    api.chatConversations().then((r) => setConvs(r.conversations)).catch(() => {});
  }, []);
  const loadMsgs = useCallback(
    (id: string) => {
      api.chatMessages(id).then((r) => setMsgs(r.messages)).catch(() => {});
    },
    []
  );
  useEffect(() => {
    loadConvs();
    const t = window.setInterval(loadConvs, 5000);
    return () => window.clearInterval(t);
  }, [loadConvs]);

  // the open conversation: refreshed often so the ticks turn green quickly, and read as soon as it is visible
  useEffect(() => {
    setActiveChatPeer(peer);
    onPeerChange?.(peer);
    setMsgs([]);
    lastCount.current = 0;
    if (!peer) return;
    const read = () => {
      api.chatRead(peer).then(() => loadConvs()).catch(() => {});
      const ids = notifications.filter((n) => !n.read && n.kind === 'chat' && n.ref?.id === peer).map((n) => n.id);
      if (ids.length) markNotificationsRead(ids);
    };
    loadMsgs(peer);
    read();
    const t = window.setInterval(() => {
      loadMsgs(peer);
      if (document.visibilityState === 'visible') api.chatRead(peer).catch(() => {});
    }, 2500);
    return () => {
      window.clearInterval(t);
      setActiveChatPeer('');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer]);
  // a message that arrives while the conversation is open is read at once
  useEffect(() => {
    if (!peer) return;
    const ids = notifications.filter((n) => !n.read && n.kind === 'chat' && n.ref?.id === peer).map((n) => n.id);
    if (ids.length) {
      markNotificationsRead(ids);
      api.chatRead(peer).catch(() => {});
    }
  }, [notifications, peer, markNotificationsRead]);
  useEffect(() => {
    if (msgs.length !== lastCount.current) {
      lastCount.current = msgs.length;
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [msgs]);

  const send = async () => {
    const t = text.trim();
    if (!t || !peer || sending) return;
    setSending(true);
    const temp: ChatMessage = { id: 'tmp-' + Date.now(), from: currentUser.id, to: peer, text: t, at: new Date().toISOString(), read: false };
    setMsgs((m) => [...m, temp]);
    setText('');
    try {
      const saved = await api.chatSend(peer, t);
      setMsgs((m) => m.map((x) => (x.id === temp.id ? saved : x)));
      loadConvs();
    } catch {
      setMsgs((m) => m.filter((x) => x.id !== temp.id));
      setText(t);
    } finally {
      setSending(false);
    }
  };

  const convOf = (id: string) => convs.find((c) => c.userId === id);
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const withChat = convs.map((c) => c.userId);
    const ordered = [...withChat, ...people.map((p) => p.id).filter((id) => !withChat.includes(id))];
    return ordered.filter((id) => people.some((p) => p.id === id) && (!q || nameOf(id).toLowerCase().includes(q)));
  }, [convs, people, search, nameOf]);

  const peerUser = staffList.find((u) => u.id === peer);

  return (
    <div ref={box} style={height ? { height } : { height: 520 }} className="grid grid-cols-1 grid-rows-[minmax(0,1fr)] md:grid-cols-12 bg-white overflow-hidden">
      {/* conversations */}
      <aside className={`md:col-span-4 border-l border-[#EBDBCE]/60 flex flex-col min-h-0 ${peer ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-3 border-b border-[#EBDBCE]/60">
          <div className="relative">
            <Search className="w-4 h-4 text-[#8C6F66] absolute right-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجوی همکار…" className="w-full pr-9 pl-3 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 && <div className="p-6 text-center text-xs font-bold text-[#8C6F66]">همکاری پیدا نشد.</div>}
          {list.map((id) => {
            const c = convOf(id);
            const active = id === peer;
            return (
              <button key={id} type="button" onClick={() => setPeer(id)} className={`w-full flex items-center gap-3 px-3.5 py-3 text-right cursor-pointer border-b border-[#EBDBCE]/40 transition-colors ${active ? 'bg-[#FBEFEA]' : 'hover:bg-[#FAF5F1]'}`}>
                <Avatar name={nameOf(id)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-[12px] text-[#3A241F] truncate">{nameOf(id)}</span>
                    {c && <span className="text-[10px] text-[#8C6F66] shrink-0">{timeOf(c.lastAt)}</span>}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-[11px] text-[#8C6F66] truncate flex items-center gap-1">
                      {c ? (
                        <>
                          {c.lastFromMe && <Ticks read={c.lastRead} />}
                          <span className="truncate">{toPersianDigits(c.lastText)}</span>
                        </>
                      ) : (
                        <span className="text-[#B9A9A2]">{staffList.find((u) => u.id === id)?.departmentName}</span>
                      )}
                    </span>
                    {c && c.unread > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">{toPersianDigits(c.unread > 99 ? '99+' : c.unread)}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* thread */}
      <section ref={threadRef} className={`md:col-span-8 flex flex-col min-h-0 bg-[#FDFAF8] ${peer ? 'flex' : 'hidden md:flex'}`}>
        {!peer ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#8C6F66] p-8 text-center">
            <span className="w-16 h-16 rounded-3xl bg-[#F6D9CD] text-[#6E1B1B] flex items-center justify-center"><MessageCircle className="w-8 h-8" /></span>
            <div className="font-black text-sm text-[#3A241F]">گفتگو با همکاران</div>
            <p className="text-xs leading-6 max-w-xs">یک همکار را از فهرست انتخاب کنید. یک تیک یعنی پیام ارسال شده؛ دو تیک سبز یعنی دیده شده است.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-[#EBDBCE]/60 shrink-0">
              <button type="button" onClick={() => setPeer('')} className="md:hidden w-9 h-9 rounded-xl bg-[#FAF5F1] flex items-center justify-center cursor-pointer" aria-label="بازگشت"><ArrowRight className="w-4 h-4" /></button>
              <Avatar name={nameOf(peer)} size={38} />
              <div className="min-w-0">
                <div className="font-black text-sm text-[#3A241F] truncate">{nameOf(peer)}</div>
                <div className="text-[11px] text-[#8C6F66] truncate">{peerUser?.departmentName}</div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-1.5">
              {msgs.length === 0 && <div className="text-center text-xs font-bold text-[#8C6F66] py-10">هنوز پیامی نیست؛ اولین پیام را بنویسید.</div>}
              {msgs.map((m, i) => {
                const mine = m.from === currentUser.id;
                const newDay = i === 0 || isoDay(new Date(m.at)) !== isoDay(new Date(msgs[i - 1].at));
                return (
                  <React.Fragment key={m.id}>
                    {newDay && <div className="text-center py-2"><span className="px-3 py-1 rounded-full bg-white border border-[#EBDBCE] text-[10px] font-bold text-[#8C6F66]">{dayLabel(m.at)}</span></div>}
                    <div className={`flex ${mine ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[82%] rounded-2xl px-3.5 py-2 shadow-sm ${mine ? 'bg-[#E3F5E9] text-[#1b3a28] rounded-br-md' : 'bg-white border border-[#EBDBCE] text-[#3A241F] rounded-bl-md'}`}>
                        <div className="text-[13px] leading-6 whitespace-pre-wrap break-words">{toPersianDigits(m.text)}</div>
                        <div className="flex items-center justify-end gap-1 mt-0.5 text-[10px] text-[#8C6F66]">
                          <span>{timeOf(m.at)}</span>
                          {mine && <Ticks read={m.read} />}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={endRef} />
            </div>
            <div className="h-[68px] shrink-0" aria-hidden />
            <div
              style={dock ? { position: 'fixed', left: dock.left, width: dock.width, bottom: dock.bottom } : undefined}
              className="z-30 p-3 max-md:pl-[76px] bg-white border-t border-[#EBDBCE] shadow-[0_-6px_20px_rgba(58,36,31,0.10)] flex items-end gap-2"
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder="پیام خود را بنویسید…  (Enter = ارسال)"
                className="flex-1 resize-none max-h-32 px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl text-[13px] font-semibold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none"
              />
              <button type="button" onClick={() => void send()} disabled={!text.trim() || sending} className="w-11 h-11 rounded-2xl bg-[#6E1B1B] hover:bg-[#D34A32] disabled:opacity-40 text-white flex items-center justify-center cursor-pointer shrink-0" aria-label="ارسال">
                <Send className="w-4 h-4 -scale-x-100" />
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
