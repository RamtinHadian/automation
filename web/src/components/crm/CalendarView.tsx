import { CustomerSelect } from '../common/CustomerSelect';
import React, { useMemo, useState } from 'react';
import { CalendarDays, Cake, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { CrmActivity, Customer, Deal } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, isoToJalaliParts, jalaliPartsToIso, JALALI_MONTHS, todayIso } from '../../lib/taskDates';
import { addMonths, Month, monthNow, monthRange, OPEN_STAGE_IDS } from '../../lib/team';
import { PersonPicker, customerItems } from '../common/PersonPicker';
import { JalaliDateField } from '../tasks/TasksView';
import { Modal, field, label } from './crmUi';
import { birthMonthDay } from '../../lib/club';

const WEEK = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
const KINDS = ['قرار حضوری', 'بازدید', 'تماس', 'جلسه'];

type Ev = { id: string; kind: 'follow' | 'deal' | 'birth'; text: string; sub: string; customerId?: string; deal?: Deal };
const TONE: Record<Ev['kind'], string> = { follow: 'bg-violet-500', deal: 'bg-amber-500', birth: 'bg-rose-500' };

/** A month of the Persian calendar with the follow-ups, appointments, expected closing days and birthdays on it. */
export const CalendarView: React.FC<{
  customers: Customer[];
  deals: Deal[];
  followups: CrmActivity[];
  me: string;
  seesTeam: boolean;
  onOpenCustomer: (id: string) => void;
  onOpenDeal: (d: Deal) => void;
  onAddAppointment: (customerId: string, text: string, dueDate: string) => void;
}> = ({ customers, deals, followups, me, seesTeam, onOpenCustomer, onOpenDeal, onAddAppointment }) => {
  const [month, setMonth] = useState<Month>(monthNow());
  const [picked, setPicked] = useState(todayIso());
  const [mineOnly, setMineOnly] = useState(!seesTeam);
  const [adding, setAdding] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const only = !seesTeam || mineOnly;

  const [start, end] = monthRange(month);
  const days = Math.round((new Date(end + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / 86400000);
  const lead = (new Date(start + 'T12:00:00').getDay() + 1) % 7; // the week starts on Saturday
  const nameOf = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  const events = useMemo(() => {
    const m = new Map<string, Ev[]>();
    const put = (iso: string, e: Ev) => m.set(iso, [...(m.get(iso) || []), e]);
    for (const a of followups) if (a.dueDate && a.dueDate >= start && a.dueDate < end && (!only || a.ownerId === me)) put(a.dueDate, { id: a.id, kind: 'follow', text: a.text, sub: nameOf.get(a.customerId) || '', customerId: a.customerId });
    for (const d of deals) if (OPEN_STAGE_IDS.includes(d.stage) && d.expectedClose && d.expectedClose >= start && d.expectedClose < end && (!only || d.ownerId === me || (d.coOwnerIds || []).includes(me))) put(d.expectedClose, { id: d.id, kind: 'deal', text: `پیش‌بینی بستن: ${d.title}`, sub: d.customerName, deal: d });
    for (const c of customers) {
      const md = birthMonthDay(c.birthDate);
      if (md && md[0] === month[1] && (!only || c.ownerId === me)) put(jalaliPartsToIso(month[0], md[0], md[1]), { id: 'b' + c.id, kind: 'birth', text: `تولد ${c.name}`, sub: '', customerId: c.id });
    }
    return m;
  }, [followups, deals, customers, month, only, me, nameOf, start, end]);

  const list = events.get(picked) || [];
  const today = todayIso();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => jalaliPartsToIso(month[0], month[1], i + 1))];

  return (
    <div className="space-y-4" data-calendar>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center bg-white border border-[#EBDBCE] rounded-xl">
          <button type="button" onClick={() => setMonth(addMonths(month, -1))} className="p-2.5 cursor-pointer" title="ماه قبل"><ChevronRight className="w-4 h-4" /></button>
          <span className="px-3 text-xs font-black min-w-[120px] text-center text-[#3A241F]">{JALALI_MONTHS[month[1] - 1]} {toPersianDigits(month[0])}</span>
          <button type="button" onClick={() => setMonth(addMonths(month, 1))} className="p-2.5 cursor-pointer" title="ماه بعد"><ChevronLeft className="w-4 h-4" /></button>
        </div>
        <div className="flex items-center gap-2">
          {seesTeam && (
            <div className="flex bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl p-1">
              {([[true, 'فقط من'], [false, 'همهٔ تیم']] as const).map(([v, t]) => (
                <button key={t} type="button" onClick={() => setMineOnly(v)} className={`px-3 py-1 rounded-lg text-[11px] font-black cursor-pointer ${mineOnly === v ? 'bg-white text-violet-700 shadow-sm' : 'text-[#5A4640]'}`}>{t}</button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black cursor-pointer" data-add-appointment>
            <Plus className="w-4 h-4" />
            قرار یا بازدید تازه
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#EBDBCE] rounded-3xl p-2.5 sm:p-4">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEK.map((w, i) => <div key={w} className={`text-center text-[10px] font-black py-1 ${i === 6 ? 'text-rose-600' : 'text-[#8C6F66]'}`}>{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((iso, i) => {
            if (!iso) return <div key={'e' + i} />;
            const ev = events.get(iso) || [];
            const jd = isoToJalaliParts(iso)?.[2] || 0;
            const kinds = [...new Set(ev.map((e) => e.kind))];
            return (
              <button key={iso} type="button" onClick={() => { setPicked(iso); setDayOpen(true); }} className={`min-h-[52px] sm:min-h-[68px] rounded-xl border p-1.5 text-right flex flex-col justify-between cursor-pointer ${picked === iso ? 'border-violet-500 bg-violet-50' : 'border-[#EBDBCE] bg-[#FAF5F1]/60 hover:bg-violet-50/50'} ${iso === today ? 'ring-2 ring-amber-400' : ''}`}>
                <span className={`text-[11px] font-black ${(i % 7) === 6 ? 'text-rose-600' : 'text-[#3A241F]'}`}>{toPersianDigits(jd)}</span>
                <span className="flex items-center gap-1 flex-wrap">
                  {kinds.map((k) => <span key={k} className={`w-2 h-2 rounded-full ${TONE[k]}`} />)}
                  {ev.length > 0 && <span className="text-[9px] font-black text-[#8C6F66]">{toPersianDigits(ev.length)}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-3 text-[10px] font-bold text-[#5A4640]">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500" />پیگیری و قرار</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />پیش‌بینی بستن فرصت</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" />تولد مشتری</span>
        </div>
      </div>

      {dayOpen && (
        <Modal
          title={`${formatTaskDate(picked)}${picked === today ? ' (امروز)' : ''}`}
          onClose={() => setDayOpen(false)}
          onTop="max"
          footer={
            <>
              <button type="button" onClick={() => setDayOpen(false)} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">بستن</button>
              <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 cursor-pointer"><Plus className="w-4 h-4" />قرار یا بازدید برای این روز</button>
            </>
          }
        >
          <div className="space-y-2" data-day-list>
            {list.length === 0 && <div className="text-center text-[11px] font-bold text-[#8C6F66] py-6">برای این روز چیزی ثبت نشده.</div>}
            {list.map((e) => (
              <button key={e.id} type="button" onClick={() => { setDayOpen(false); if (e.deal) onOpenDeal(e.deal); else if (e.customerId) onOpenCustomer(e.customerId); }} className="w-full text-right flex items-center gap-3 bg-[#FAF5F1] hover:bg-[#F3E8DF] border border-[#EBDBCE] rounded-2xl px-3.5 py-2.5 cursor-pointer">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${TONE[e.kind]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-black text-[#3A241F]">{e.text}</span>
                  {e.sub && <span className="block text-[10px] text-[#8C6F66]">{e.sub}</span>}
                </span>
                {e.kind === 'birth' && <Cake className="w-4 h-4 text-rose-500 shrink-0" />}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {adding && <AppointmentModal customers={customers} date={picked} onClose={() => setAdding(false)} onSave={(cid, text, date) => { onAddAppointment(cid, text, date); setAdding(false); setPicked(date); setDayOpen(true); }} />}
    </div>
  );
};

const AppointmentModal: React.FC<{ customers: Customer[]; date: string; onClose: () => void; onSave: (customerId: string, text: string, date: string) => void }> = ({ customers, date, onClose, onSave }) => {
  const [kind, setKind] = useState(KINDS[0]);
  const [cid, setCid] = useState('');
  const [text, setText] = useState('');
  const [day, setDay] = useState<string | undefined>(date);
  const [time, setTime] = useState('');
  const ok = !!cid && !!day;
  return (
    <Modal
      title="قرار یا بازدید تازه"
      onClose={onClose}
      onTop="max"
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">انصراف</button>
          <button type="button" disabled={!ok} onClick={() => onSave(cid, `${kind}${time ? ` ساعت ${toPersianDigits(time)}` : ''}${text.trim() ? `: ${text.trim()}` : ''}`, day!)} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer">ثبت در تقویم</button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`px-3 py-1.5 rounded-full text-[11px] font-black border cursor-pointer ${kind === k ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>{k}</button>
        ))}
      </div>
      <div>
        <label className={label}>مشتری *</label>
        <CustomerSelect value={cid} onChange={setCid} emptyLabel="انتخاب مشتری…" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label}>روز *</label>
          <JalaliDateField value={day} onChange={setDay} />
        </div>
        <div>
          <label className={label}>ساعت (اختیاری)</label>
          <input type="time" dir="ltr" className={field} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      <div>
        <label className={label}>توضیح (اختیاری)</label>
        <input className={field} value={text} onChange={(e) => setText(e.target.value)} placeholder="مثلاً بردن نمونهٔ کالا" />
      </div>
    </Modal>
  );
};
