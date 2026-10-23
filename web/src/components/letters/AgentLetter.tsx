import React, { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { api, ChatMessage } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';

const field = 'w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-semibold text-[#3A241F] outline-hidden focus:border-[#6E1B1B]';

const SUBJECT = 'نامه — ';

/**
 * The only correspondence of a sales representative: an internal letter to the managing director (subject and text). It is delivered as a message
 * with a notification and kept in the conversation; the page lists the letters sent so far.
 */
export const AgentLetter: React.FC = () => {
  const { staffList, currentUser, showToast } = useAppContext();
  const ceo = staffList.find((u) => u.canSignOfficialLetters && u.isActive !== false);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<ChatMessage[]>([]);
  const load = () => {
    if (!ceo) return;
    api.chatMessages(ceo.id).then((r) => setSent(r.messages.filter((m) => m.from === currentUser.id && m.text.startsWith(SUBJECT)).reverse())).catch(() => {});
  };
  useEffect(load, [ceo?.id]);
  const send = async () => {
    if (!ceo) return showToast('مدیرعامل در سامانه مشخص نشده است.');
    if (!subject.trim() || !text.trim()) return showToast('موضوع و متن نامه را بنویسید.');
    setBusy(true);
    try {
      await api.chatSend(ceo.id, `${SUBJECT}${subject.trim()}\n\n${text.trim()}`);
      setSubject('');
      setText('');
      showToast('نامه برای مدیرعامل ارسال شد.');
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ارسال نشد.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-2 gap-6" data-agent-letter>
      <section className="space-y-3">
        <h2 className="font-black text-[#3A241F]">نامهٔ داخلی به مدیرعامل</h2>
        <p className="text-[11px] text-[#8C6F66] leading-6">{ceo ? `نامه برای «${ceo.fullName}» فرستاده می‌شود و در گفتگوی ایشان هم دیده می‌شود.` : 'مدیرعامل هنوز در سامانه مشخص نشده است.'}</p>
        <div>
          <label className="block text-[11px] font-black text-[#3A241F] mb-1.5">موضوع</label>
          <input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="block text-[11px] font-black text-[#3A241F] mb-1.5">متن نامه</label>
          <textarea className={`${field} min-h-[160px] leading-7`} value={text} onChange={(e) => setText(e.target.value)} maxLength={1800} />
        </div>
        <button type="button" disabled={busy || !ceo} onClick={send} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#6E1B1B] text-white text-xs font-black disabled:opacity-50 cursor-pointer" data-agent-letter-send>
          <Send className="w-4 h-4" />
          {busy ? 'در حال ارسال…' : 'ارسال نامه'}
        </button>
      </section>
      <section className="space-y-2">
        <h2 className="font-black text-[#3A241F]">نامه‌های ارسال‌شده</h2>
        {sent.length === 0 && <div className="text-xs font-bold text-gray-400 py-6">هنوز نامه‌ای نفرستاده‌اید.</div>}
        {sent.map((m) => {
          const [first, ...rest] = m.text.slice(SUBJECT.length).split('\n\n');
          return (
            <div key={m.id} className="rounded-2xl border border-[#EBDBCE] p-3 bg-white">
              <div className="text-xs font-black text-[#3A241F]">{first}</div>
              <div className="text-[11px] text-[#3A241F] leading-6 whitespace-pre-wrap mt-1">{rest.join('\n\n')}</div>
              <div className="text-[10px] text-[#8C6F66] mt-1">{formatTaskDate(m.at.slice(0, 10))} · {toPersianDigits(new Date(m.at).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))}</div>
            </div>
          );
        })}
      </section>
    </div>
  );
};
