import React, { useState } from 'react';
import { CheckCircle2, Clock, MessageSquare, Phone, UserCog } from 'lucide-react';
import { SupportTicket, TicketStatus, User } from '../../types';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { CHANNEL, codeText, dayText, PRIORITY, resolveSla, responseSla, SLA_CLS, TICKET_BUTTON, TICKET_NEXT, TICKET_STATUS } from '../../lib/support';
import { Modal, field, label } from '../crm/crmUi';
import { PersonPicker, staffItems } from '../common/PersonPicker';

const when = (iso: string) => {
  const d = new Date(iso);
  return toPersianDigits(d.toLocaleDateString('fa-IR') + ' ' + d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));
};

/** One support request: facts, the two deadlines, the buttons for the next step, notes and the full history. */
export const TicketDetail: React.FC<{
  ticket: SupportTicket;
  isAdmin: boolean;
  staff: User[];
  onClose: () => void;
  onChange: (t: SupportTicket) => void;
  onError: (msg: string) => void;
}> = ({ ticket, isAdmin, staff, onClose, onChange, onError }) => {
  const [step, setStep] = useState<TicketStatus | null>(null);
  const [note, setNote] = useState('');
  const [minutes, setMinutes] = useState('');
  const [visit, setVisit] = useState(false);
  const [text, setText] = useState('');
  const [pub, setPub] = useState(false);
  const [busy, setBusy] = useState(false);

  const st = TICKET_STATUS[ticket.status];
  const pr = PRIORITY[ticket.priority];
  const next = TICKET_NEXT[ticket.status].filter((s) => !(ticket.status === 'CLOSED' && !isAdmin));
  const r1 = responseSla(ticket);
  const r2 = resolveSla(ticket);
  const run = async (fn: () => Promise<SupportTicket>) => {
    if (busy) return;
    setBusy(true);
    try {
      onChange(await fn());
      setStep(null);
      setNote('');
      setMinutes('');
      setVisit(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'انجام نشد.');
    } finally {
      setBusy(false);
    }
  };
  const confirmStep = () => {
    if (!step) return;
    if (step === 'RESOLVED' && !note.trim()) return onError('خلاصهٔ کاری که انجام شد را بنویسید.');
    const mins = parseInt(minutes.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9]/g, ''), 10) || 0;
    run(() => api.ticketStatus(ticket.id, { status: step, note: note.trim(), ...(step === 'RESOLVED' ? { minutes: mins, visit } : {}) }));
  };

  return (
    <Modal
      title={`درخواست پشتیبانی ${codeText(ticket.ticketNo)}`}
      onClose={onClose}
      onTop
      wide
      footer={<button type="button" onClick={onClose} className="px-5 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer mr-auto">بستن</button>}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`px-3 py-1 rounded-full border text-[11px] font-black ${st.cls}`}>{st.label}</span>
        <span className={`px-3 py-1 rounded-full border text-[11px] font-black ${pr.cls}`}>اولویت {pr.label}</span>
        {ticket.coverage !== 'IN' && <span className="px-3 py-1 rounded-full border border-rose-200 bg-rose-50 text-rose-700 text-[11px] font-black">{ticket.coverage === 'NONE' ? 'بدون پلن فعال' : 'پلن تمام شده بود'}</span>}
        {ticket.visit && ticket.resolvedAt && <span className="px-3 py-1 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-black">بازدید حضوری</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
        {([
          ['مشتری', ticket.customerName],
          ['پلن', ticket.planName ? `${ticket.planName} (${codeText(ticket.subNo || '')})` : '—'],
          ['موضوع', ticket.subject],
          ['راه ارتباط', CHANNEL[ticket.channel]],
          ['مسئول پیگیری', ticket.handlerName || 'تعیین نشده'],
          ['ثبت‌کننده', ticket.createdByName],
          ['زمان ثبت', when(ticket.createdAt)],
          ...(ticket.minutes ? [['زمان صرف‌شده', `${toPersianDigits(ticket.minutes)} دقیقه`] as [string, string]] : []),
        ] as [string, string][]).map(([k, v]) => (
          <div key={k} className="flex gap-2"><span className="text-[#8C6F66] shrink-0 w-24">{k}:</span><span className="font-bold text-[#3A241F]">{v}</span></div>
        ))}
        {ticket.customerPhone && (
          <a href={`tel:${ticket.customerPhone}`} className="flex items-center gap-1.5 text-teal-700 font-black text-[11px] hover:underline sm:col-span-2" dir="ltr"><Phone className="w-3.5 h-3.5" />{toPersianDigits(ticket.customerPhone)}</a>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-black" data-ticket-sla>
        {([['پاسخ‌گویی', r1, ticket.responseDue], ['حل مشکل', r2, ticket.resolveDue]] as const).map(([name, sla, due]) => (
          <div key={name} className="rounded-xl border border-[#EBDBCE] bg-white px-3 py-2">
            <div className="text-[#8C6F66]">{name} <span className="font-bold">· مهلت {when(due)}</span></div>
            <div className={SLA_CLS[sla.kind]}>{sla.label || '—'}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE] p-3.5">
        <div className="text-[11px] font-black text-[#8C6F66] mb-1">شرح درخواست</div>
        <p className="text-xs leading-7 text-[#3A241F] whitespace-pre-wrap">{ticket.description}</p>
      </div>
      {ticket.resolution && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-3.5">
          <div className="text-[11px] font-black text-emerald-800 mb-1">کار انجام‌شده {ticket.resolvedAt ? `(${dayText(ticket.resolvedAt)})` : ''}</div>
          <p className="text-xs leading-7 text-[#3A241F] whitespace-pre-wrap">{ticket.resolution}</p>
        </div>
      )}

      {next.length > 0 && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/50 p-3.5 space-y-3" data-ticket-actions>
          <div className="text-[11px] font-black text-teal-900">مرحلهٔ بعد</div>
          <div className="flex flex-wrap gap-2">
            {next.map((s) => (
              <button key={s} type="button" onClick={() => setStep(step === s ? null : s)} className={`px-4 py-2 min-h-[44px] sm:min-h-0 rounded-xl border text-xs font-black cursor-pointer ${step === s ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-teal-800 border-teal-200'}`}>
                {ticket.status === 'CLOSED' || (ticket.status === 'RESOLVED' && s === 'IN_PROGRESS') ? 'باز کردن دوباره' : TICKET_BUTTON[s]}
              </button>
            ))}
          </div>
          {step === 'RESOLVED' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label className={label}>زمان صرف‌شده (دقیقه)</label>
                <input className={field} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-xs font-black text-[#3A241F] cursor-pointer min-h-[44px]"><input type="checkbox" checked={visit} onChange={(e) => setVisit(e.target.checked)} />این کار بازدید حضوری بود</label>
            </div>
          )}
          {step && (
            <>
              <textarea className={`${field} min-h-[56px] leading-6`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={step === 'RESOLVED' ? 'چه کاری انجام شد؟ (برای سابقهٔ مشتری) *' : 'توضیح (اختیاری)'} />
              <button type="button" onClick={confirmStep} disabled={busy} className="w-full flex items-center justify-center gap-1.5 py-2.5 min-h-[44px] sm:min-h-0 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-xs font-black cursor-pointer">
                <CheckCircle2 className="w-4 h-4" />
                تأیید و ثبت در سابقه
              </button>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label}>مسئول پیگیری</label>
          <div className="flex gap-2">
            <PersonPicker title="مسئول پیگیری" items={staffItems(staff)} value={ticket.handlerId || ''} onChange={(id) => run(() => api.ticketAssign(ticket.id, id))} emptyLabel="(تعیین نشده)" />
            <span className="self-center text-[#8C6F66]"><UserCog className="w-4 h-4" /></span>
          </div>
        </div>
        <div>
          <label className={label}>یادداشت تازه</label>
          <div className="flex gap-2">
            <input className={field} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text.trim() && run(async () => { const t = await api.ticketNote(ticket.id, text.trim(), pub); setText(''); return t; })} placeholder="یادداشت یا پاسخ به مشتری" />
            <button type="button" disabled={!text.trim() || busy} onClick={() => run(async () => { const t = await api.ticketNote(ticket.id, text.trim(), pub); setText(''); return t; })} className="shrink-0 px-3 rounded-xl bg-white border border-[#EBDBCE] text-teal-700 disabled:opacity-50 cursor-pointer" aria-label="ثبت یادداشت"><MessageSquare className="w-4 h-4" /></button>
          </div>
          <label className="mt-1.5 flex items-center gap-2 text-[11px] font-black text-[#503730] cursor-pointer min-h-[32px]"><input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} />نمایش به مشتری در صفحهٔ مشتریان</label>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="font-black text-xs text-[#3A241F] flex items-center gap-1.5"><Clock className="w-4 h-4 text-[#8C6F66]" />تاریخچهٔ کامل</h4>
        <div className="space-y-2">
          {[...(ticket.log || [])].reverse().map((e, i) => (
            <div key={i} className="flex gap-2.5 bg-white border border-[#EBDBCE] rounded-xl px-3 py-2.5">
              <span className={`mt-0.5 shrink-0 h-fit text-[10px] font-black px-2 py-0.5 rounded-full border ${e.to ? TICKET_STATUS[e.to].cls : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                {e.kind === 'status' || e.kind === 'create' ? TICKET_STATUS[e.to as TicketStatus]?.label : e.kind === 'assign' ? 'مسئول' : e.kind === 'customer' ? 'پیام مشتری' : e.kind === 'ai' ? 'پاسخ هوشمند' : e.public ? 'پاسخ به مشتری' : 'یادداشت داخلی'}
              </span>
              <div className="min-w-0 flex-1">
                {e.note && <p className="text-xs leading-6 text-[#3A241F] whitespace-pre-wrap">{e.note}</p>}
                <div className="text-[10px] text-[#8C6F66] font-bold flex flex-wrap gap-x-3"><span>{e.byName}</span><span>{when(e.at)}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};
