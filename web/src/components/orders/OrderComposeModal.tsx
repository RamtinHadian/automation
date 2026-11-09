import React, { useState } from 'react';
import { Check, Send, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { User } from '../../types';
import { OrderPaper } from './OrderPaper';

/**
 * The page where the CEO writes an administrative order to one or more people (opened, for example, right after a commission payment is recorded):
 * the subject and the text are already filled in and can be changed; on the left the sheet shows how it will look. After sending, the people find it in
 * their «امور اداری ← دستورهای اداری» and get a notice.
 */
export const OrderComposeModal: React.FC<{
  subject: string;
  body: string;
  recipientIds: string[];
  staff: User[];
  kind?: string;
  ref?: Record<string, unknown>;
  onClose: () => void;
  onSent?: () => void;
}> = ({ subject: s0, body: b0, recipientIds: r0, staff, kind, ref, onClose, onSent }) => {
  const { showToast, currentUser, settings } = useAppContext();
  const [subject, setSubject] = useState(s0);
  const [body, setBody] = useState(b0);
  const [to, setTo] = useState<string[]>(r0);
  const [busy, setBusy] = useState(false);
  const names = to.map((id) => staff.find((u) => u.id === id)?.fullName || '').filter(Boolean).join('، ');
  const send = async () => {
    if (!subject.trim() || !body.trim() || to.length === 0) { showToast('موضوع، متن و گیرنده را کامل کنید.'); return; }
    setBusy(true);
    try {
      await api.orderCreate({ subject, body, recipientIds: to, kind, ref });
      showToast('دستور ارسال شد؛ گیرنده آن را در «امور اداری ← دستورهای اداری» می‌بیند.');
      onSent?.();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ارسال نشد.');
    } finally { setBusy(false); }
  };
  const field = 'w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-violet-500 focus:outline-none';
  return (
    <div className="fixed inset-0 z-[95] bg-[#FAF5F1] overflow-y-auto" dir="rtl" data-order-compose onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 bg-white/95 backdrop-blur border-b border-[#EBDBCE]">
        <h2 className="font-black text-sm text-[#3A241F]">دستور اداری تازه</h2>
        <button type="button" onClick={onClose} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] hover:bg-[#EBDBCE] cursor-pointer"><X className="w-4 h-4" />بستن</button>
      </div>
      <div className="max-w-6xl mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-5 gap-5">
        <section className="lg:col-span-2 space-y-4 self-start rounded-3xl bg-white border border-[#EBDBCE] p-5">
          <div>
            <div className="text-[11px] font-black text-[#8C6F66] mb-1.5">گیرنده (یک نفر یا چند نفر)</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {to.map((id) => (
                <span key={id} className="flex items-center gap-1 bg-violet-50 text-violet-800 border border-violet-200 rounded-full pl-1.5 pr-3 py-1 text-[11px] font-black">
                  {staff.find((u) => u.id === id)?.fullName || id}
                  <button type="button" onClick={() => setTo(to.filter((x) => x !== id))} className="cursor-pointer" aria-label="حذف گیرنده"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <select className={field} value="" onChange={(e) => { if (e.target.value && !to.includes(e.target.value)) setTo([...to, e.target.value]); }} data-order-add-recipient>
              <option value="">+ افزودن گیرندهٔ دیگر…</option>
              {staff.filter((u) => u.isActive && !to.includes(u.id)).map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[11px] font-black text-[#8C6F66] mb-1.5">موضوع</div>
            <input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} data-order-subject />
          </div>
          <div>
            <div className="text-[11px] font-black text-[#8C6F66] mb-1.5">متن دستور</div>
            <textarea className={`${field} leading-8 min-h-[260px]`} value={body} onChange={(e) => setBody(e.target.value)} data-order-body />
          </div>
          <button type="button" disabled={busy} onClick={send} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#6E1B1B] hover:bg-[#561414] text-white text-sm font-black disabled:opacity-60 cursor-pointer" data-order-send><Send className="w-4 h-4" />ارسال دستور</button>
          <p className="text-[10.5px] font-bold text-[#8C6F66] leading-6 flex gap-1.5"><Check className="w-3.5 h-3.5 shrink-0 text-emerald-600 mt-0.5" />گیرنده دستور را در «امور اداری ← دستورهای اداری» می‌بیند، اعلان می‌گیرد و می‌تواند آن را چاپ کند.</p>
        </section>
        <section className="lg:col-span-3">
          <OrderPaper number="—" subject={subject} body={body} to={names} from={currentUser.fullName} fromTitle={settings.ceoTitle || 'مدیریت'} at={new Date().toISOString()} />
        </section>
      </div>
    </div>
  );
};
