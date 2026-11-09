import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, FileText, Printer } from 'lucide-react';
import { AdminOrder, api } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { formatCurrentJalaliDateTime, toPersianDigits } from '../../lib/jalali';
import { OrderPaper, printOrder } from './OrderPaper';

/** «دستورهای اداری» in the administrative affairs: the orders sent to me (and, for the CEO, the ones I sent), each opened on a page of its own with a print button. */
export const OrdersView: React.FC<{ onUnread?: (n: number) => void }> = ({ onUnread }) => {
  const { currentUser, settings } = useAppContext();
  const writer = !!currentUser.canSignOfficialLetters; // only the CEO writes orders
  // the CEO only sends orders (he never receives one): he sees only «دستورهای ارسالی من»; everybody else sees only what was sent to him
  const [box, setBox] = useState<'inbox' | 'sent'>(writer ? 'sent' : 'inbox');
  const [list, setList] = useState<AdminOrder[]>([]);
  const [open, setOpen] = useState<AdminOrder | null>(null);
  const load = useCallback(() => {
    api.orderList(box).then((r) => { setList(r.orders); if (box === 'inbox') onUnread?.(r.orders.filter((o) => !o.read).length); }).catch(() => setList([]));
  }, [box, onUnread]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);
  const show = (o: AdminOrder) => {
    setOpen(o);
    if (box === 'inbox' && !o.read) api.orderRead(o.id).then(load).catch(() => {});
  };
  const boxes: [typeof box, string][] = writer ? [['sent', 'دستورهای ارسالی من']] : [['inbox', 'دستورهای دریافتی']];
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4" data-orders-view>
      <div className="flex items-center gap-2">
        {boxes.map(([k, t]) => (
          <button key={k} type="button" onClick={() => setBox(k)} className={`px-4 py-2 rounded-xl text-xs font-black border cursor-pointer ${box === k ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>{t}</button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EBDBCE] p-10 text-center text-xs font-bold text-[#8C6F66]" data-orders-empty>{box === 'inbox' ? 'دستور اداری‌ای برای شما نیامده است.' : 'دستوری نفرستاده‌اید.'}</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {list.map((o) => (
            <button key={o.id} type="button" onClick={() => show(o)} className={`text-right rounded-2xl border p-4 bg-white hover:shadow-md hover:border-[#C98B6A] transition-all cursor-pointer ${box === 'inbox' && !o.read ? 'border-amber-300 bg-amber-50/40' : 'border-[#EBDBCE]'}`} data-order-card>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-xl bg-[#F6D9CD] text-[#6E1B1B] flex items-center justify-center shrink-0"><FileText className="w-4 h-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-black text-[#3A241F] truncate">{o.subject}</div>
                  <div className="text-[11px] font-bold text-[#8C6F66] truncate">{box === 'inbox' ? `از ${o.senderName}` : `به ${o.recipientNames.join('، ')}`} · شمارهٔ {toPersianDigits(o.number)} · {formatCurrentJalaliDateTime(new Date(o.createdAt))}</div>
                </div>
                {box === 'inbox' && o.copy && <span className="text-[10px] font-black rounded-full px-2 py-0.5 bg-sky-50 text-sky-800 border border-sky-200">رونوشت</span>}
                {box === 'inbox' && !o.read && <span className="text-[10px] font-black rounded-full px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200">تازه</span>}
              </div>
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-[90] bg-[#FAF5F1] overflow-y-auto" dir="rtl" data-order-detail onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 bg-white/95 backdrop-blur border-b border-[#EBDBCE]">
            <button type="button" onClick={() => setOpen(null)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] hover:bg-[#EBDBCE] cursor-pointer"><ArrowRight className="w-4 h-4" />بازگشت (Esc)</button>
            <button type="button" onClick={() => printOrder({ number: open.number, subject: open.subject, body: open.body, to: open.recipientNames.join('، '), from: open.senderName, fromTitle: open.senderTitle, at: open.createdAt, copy: (open.copyNames || []).join('، ') }, settings.companyName || '')} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-[#6E1B1B] hover:bg-[#561414] cursor-pointer"><Printer className="w-4 h-4" />چاپ</button>
          </div>
          <div className="max-w-3xl mx-auto p-4 sm:p-8"><OrderPaper number={open.number} subject={open.subject} body={open.body} to={open.recipientNames.join('، ')} from={open.senderName} fromTitle={open.senderTitle} at={open.createdAt} copy={(open.copyNames || []).join('، ')} /></div>
        </div>
      )}
    </div>
  );
};
