import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BadgeDollarSign, Briefcase, Clock3, Handshake, MessageSquare, NotebookPen, PhoneCall, PhoneIncoming, PhoneMissed, PhoneOutgoing, Tag, Users, X } from 'lucide-react';
import { CrmActivity, Customer, Deal } from '../../types';
import { VoipCall } from '../../lib/api';
import { formatMoney, unitName } from '../../lib/money';
import { useAppContext } from '../../context/AppContext';
import { canSeeSalesTotals } from '../../lib/permissions';
import { toPersianDigits } from '../../lib/jalali';
import { RecordingButton } from '../common/CallLog';
import { CustomerAiAnalysis } from './CustomerAiAnalysis';
import { noteEntries } from '../common/ParagraphNotes';
import { SocialStrip } from './SocialNetworks';
import { formatTaskDate } from '../../lib/taskDates';

const when = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${formatTaskDate(iso.slice(0, 10))} · ${toPersianDigits(d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}`;
};
const ago = (iso?: string) => {
  if (!iso) return 'هنوز تماسی ثبت نشده';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? 'امروز' : days === 1 ? 'دیروز' : `${toPersianDigits(days)} روز پیش`;
};

export function summarize(customer: Customer, deals: Deal[], activities: CrmActivity[], calls: VoipCall[]) {
  const mine = deals.filter((d) => d.customerId === customer.id);
  const won = mine.filter((d) => d.stage === 'WON').sort((a, b) => (b.closedAt || b.updatedAt).localeCompare(a.closedAt || a.updatedAt));
  const open = mine.filter((d) => d.stage !== 'WON' && d.stage !== 'LOST');
  const quotes = activities.filter((a) => a.type === 'QUOTE').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const others = activities.filter((a) => a.type !== 'QUOTE').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const times = [...activities.map((a) => a.createdAt), ...calls.map((c) => c.startedAt)].filter(Boolean).sort();
  return {
    won,
    wonTotal: won.reduce((s, d) => s + (d.amount || 0), 0),
    open,
    openTotal: open.reduce((s, d) => s + (d.amount || 0), 0),
    quotes,
    others,
    callCount: calls.length + activities.filter((a) => a.type === 'CALL').length,
    all: activities.filter((a) => a.type !== 'MISSING'),
    deals: mine,
    last: times[times.length - 1],
  };
}

const Stat: React.FC<{ icon: React.ReactNode; title: string; value: string; sub: string }> = ({ icon, title, value, sub }) => (
  <div className="flex items-center gap-2.5 min-w-0">
    <span className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">{icon}</span>
    <div className="min-w-0">
      <div className="text-[10px] font-bold opacity-85 truncate">{title}</div>
      <div className="text-[13px] font-black leading-5">{value}</div>
      <div className="text-[10px] opacity-80 truncate">{sub}</div>
    </div>
  </div>
);

/** The small pop-up at the top of a customer's page; one click opens the whole picture over the full screen. */
export const CustomerSummaryStrip: React.FC<{ customer: Customer; deals: Deal[]; activities: CrmActivity[]; calls: VoipCall[] }> = ({ customer, deals, activities, calls }) => {
  const { currentUser } = useAppContext();
  const [hidden, setHidden] = useState(false);
  const [full, setFull] = useState(false);
  const s = useMemo(() => summarize(customer, deals, activities, calls), [customer, deals, activities, calls]);
  if (hidden) return null;
  const q = s.quotes[0];
  return (
    <>
      <div className="sticky top-0 z-10 -mx-1 rounded-2xl bg-gradient-to-l from-[#7C3AED] via-[#9333EA] to-[#BE123C] text-white shadow-lg shadow-violet-700/25 overflow-hidden" data-customer-summary>
        <button type="button" onClick={() => setFull(true)} className="w-full text-right px-3.5 py-3 cursor-pointer">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 pl-8">
            <Stat icon={<MessageSquare className="w-4 h-4" />} title="تعامل‌ها" value={`${toPersianDigits(s.others.length + noteEntries(customer.noteLog, customer.notes).length)} مورد، ${toPersianDigits(s.callCount)} تماس`} sub={`آخرین: ${ago(s.last)}`} />
            {canSeeSalesTotals(currentUser) && <Stat icon={<BadgeDollarSign className="w-4 h-4" />} title="فروش" value={s.won.length ? `${formatMoney(s.wonTotal)} ${unitName()}` : 'خریدی ثبت نشده'} sub={s.won.length ? `${toPersianDigits(s.won.length)} خرید، آخرین ${formatTaskDate((s.won[0].closedAt || s.won[0].updatedAt).slice(0, 10))}` : 'هنوز فروشی نداشته'} />}
            <Stat icon={<Tag className="w-4 h-4" />} title="قیمت‌های داده‌شده" value={`${toPersianDigits(s.quotes.length)} مورد`} sub={q ? `${q.itemName || ''}: ${formatMoney(q.price || 0)}` : 'قیمتی ثبت نشده'} />
            {canSeeSalesTotals(currentUser) && <Stat icon={<Briefcase className="w-4 h-4" />} title="فرصت‌های باز" value={`${toPersianDigits(s.open.length)} فرصت`} sub={s.open.length ? `${formatMoney(s.openTotal)} ${unitName()}` : '—'} />}
          </div>
          <div className="mt-2 text-[10px] font-bold opacity-80">برای دیدن همهٔ تعامل‌ها و فروش‌ها بزنید</div>
        </button>
        <button type="button" onClick={() => setHidden(true)} title="بستن" className="absolute top-2 left-2 p-1.5 rounded-lg hover:bg-white/20 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      {full && <CustomerFullSummary customer={customer} s={s} calls={calls} onClose={() => setFull(false)} />}
    </>
  );
};

type Summary = ReturnType<typeof summarize>;

interface Ev { id: string; at: string; title: string; by?: string; text?: string; Icon: React.ComponentType<{ className?: string }>; call?: VoipCall }
const ACT_LABEL: Record<string, string> = { NOTE: 'یادداشت', CALL: 'ثبت تماس', MEETING: 'جلسه', FOLLOWUP: 'پیگیری', QUOTE: 'قیمت داده شد' };

/** The player, the «متن مکالمه» button and (when it is already written) the text of one recorded call; a click here does not close the page. */
const CallExtras: React.FC<{ c: VoipCall }> = ({ c }) => (
  <div onClick={(e) => e.stopPropagation()} className={`cursor-default flex flex-wrap items-center gap-1 rounded-xl text-[#3A241F] px-2 py-1 w-fit max-w-full ${c.hasTranscript ? 'bg-violet-100 ring-2 ring-violet-300' : 'bg-white'}`} data-call-extras data-has-transcript={c.hasTranscript ? '1' : '0'}>
    <span className={`text-[10px] font-black ${c.hasTranscript ? 'text-violet-800' : 'text-rose-700'}`}>{c.hasTranscript ? 'مکالمه با متن (تبدیل‌شده)' : 'مکالمهٔ ضبط‌شده'}</span>
    <RecordingButton id={c.id} hasTranscript={c.hasTranscript} autoShow />
  </div>
);

const CallRow: React.FC<{ c: VoipCall }> = ({ c }) => {
  const missed = c.direction === 'in' && c.status !== 'answered';
  return (
    <div className="px-4 py-2.5 text-xs space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 font-bold min-w-0">
          <PhoneCall className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{c.direction === 'out' ? 'خروجی' : c.direction === 'internal' ? 'داخلی' : 'ورودی'}{missed ? ' (بی‌پاسخ)' : ''} · {toPersianDigits(c.number || '')}{c.userName ? ` · ${c.userName}` : ''}{c.duration > 0 ? ` · ${toPersianDigits(Math.floor(c.duration / 60))}:${toPersianDigits(String(c.duration % 60).padStart(2, '0'))}` : ''}</span>
        </span>
        <span className="text-[10px] opacity-75 shrink-0">{when(c.startedAt)}</span>
      </div>
      {c.hasRecording ? <CallExtras c={c} /> : <div className="text-[10px] opacity-60">ضبط‌شده نیست</div>}
    </div>
  );
};

const Block: React.FC<{ title: string; count: number; children: React.ReactNode }> = ({ title, count, children }) => (
  <section className="rounded-2xl bg-white/10 border border-white/20 overflow-hidden">
    <div className="px-4 py-2.5 bg-white/10 text-xs font-black flex items-center justify-between">
      <span>{title}</span>
      <span className="opacity-80">{toPersianDigits(count)}</span>
    </div>
    <div className="divide-y divide-white/10">{count === 0 ? <div className="px-4 py-4 text-[11px] opacity-70 text-center">موردی نیست</div> : children}</div>
  </section>
);

/** Everything about the customer over the whole screen; a click anywhere closes it. */
const CustomerFullSummary: React.FC<{ customer: Customer; s: Summary; calls: VoipCall[]; onClose: () => void }> = ({ customer, s, calls, onClose }) => {
  const { currentUser } = useAppContext();
  const seesMoney = canSeeSalesTotals(currentUser);
  // everything that happened with this customer in one list, newest first
  const timeline = useMemo(() => {
    const ev: Ev[] = [];
    for (const a of s.all) {
      const text = a.type === 'QUOTE' ? `قیمت «${a.itemName || ''}»${a.spec ? ` (${a.spec})` : ''}: ${formatMoney(a.price || 0)} ${unitName()}${a.qty ? ` · تعداد ${toPersianDigits(a.qty)}` : ''}${a.text ? ` — ${a.text}` : ''}` : a.text;
      ev.push({ id: 'a' + a.id, at: a.createdAt, title: ACT_LABEL[a.type] || 'تعامل', by: a.authorName, text, Icon: a.type === 'CALL' ? PhoneCall : a.type === 'MEETING' ? Users : a.type === 'QUOTE' ? Tag : a.type === 'FOLLOWUP' ? Clock3 : NotebookPen });
    }
    for (const [i, n] of noteEntries(customer.noteLog, customer.notes).entries()) {
      ev.push({ id: 'n' + i, at: n.at, title: 'توضیحات مشتری', by: n.byName, text: n.text, Icon: NotebookPen });
    }
    for (const c of calls) {
      const missed = c.direction === 'in' && c.status !== 'answered';
      ev.push({ id: 'c' + c.id, at: c.startedAt, title: `تماس ${c.direction === 'out' ? 'خروجی' : c.direction === 'internal' ? 'داخلی' : 'ورودی'}${missed ? ' (بی‌پاسخ)' : ''}`, by: c.userName, text: `${toPersianDigits(c.number || '')}${c.duration > 0 ? ` · مدت ${toPersianDigits(Math.floor(c.duration / 60))}:${toPersianDigits(String(c.duration % 60).padStart(2, '0'))}` : ''}`, Icon: missed ? PhoneMissed : c.direction === 'out' ? PhoneOutgoing : PhoneIncoming, call: c.hasRecording ? c : undefined });
    }
    for (const d of s.deals) {
      const amount = seesMoney && d.amount ? ` · ${formatMoney(d.amount)} ${unitName()}` : '';
      ev.push({ id: 'd' + d.id, at: d.createdAt, title: 'فرصت فروش ساخته شد', by: d.ownerName, text: `«${d.title}»${amount}`, Icon: Handshake });
      if (d.stage === 'WON' || d.stage === 'LOST') ev.push({ id: 'dc' + d.id, at: d.closedAt || d.updatedAt, title: d.stage === 'WON' ? 'فروش موفق' : 'فرصت از دست رفت', by: d.ownerName, text: `«${d.title}»${amount}${d.stage === 'LOST' && d.lostReason ? ` · دلیل: ${d.lostReason}` : ''}`, Icon: Handshake });
    }
    return ev.filter((e) => e.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 120);
  }, [s, calls, seesMoney, customer]);
  const custNotes = noteEntries(customer.noteLog, customer.notes);
  const noteActs = s.others.filter((a) => a.type === 'NOTE');
  const followActs = s.others.filter((a) => a.type === 'FOLLOWUP');
  const meetActs = s.others.filter((a) => a.type === 'MEETING' || a.type === 'CALL');
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return createPortal(
    <div dir="rtl" onClick={onClose} className="fixed inset-0 z-[400] overflow-y-auto bg-[radial-gradient(circle_at_20%_10%,#7C3AED,#2E1065_55%,#14061F)] text-white cursor-pointer" data-customer-fullsummary>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold opacity-75">خلاصهٔ کامل مشتری</div>
            <h2 className="text-2xl font-black truncate">{customer.name}</h2>
            <div className="text-xs font-bold opacity-80">
              {customer.company && customer.company !== customer.name ? `${customer.company} · ` : ''}
              {customer.phones[0] ? toPersianDigits(customer.phones[0]) : ''}
            </div>
          </div>
          <span className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-xl bg-white/15 text-xs font-black"><X className="w-4 h-4" />بستن (کلیک روی هر جا)</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ...(canSeeSalesTotals(currentUser) ? [
              ['مجموع خرید', `${formatMoney(s.wonTotal)} ${unitName()}`],
              ['تعداد خرید', toPersianDigits(s.won.length)],
            ] : []),
            ['قیمت‌های داده‌شده', toPersianDigits(s.quotes.length)],
            ['آخرین تعامل', ago(s.last)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white/12 border border-white/20 px-4 py-3">
              <div className="text-[11px] font-bold opacity-80">{k}</div>
              <div className="text-lg font-black">{v}</div>
            </div>
          ))}
        </div>
        <CustomerAiAnalysis customerId={customer.id} />
        <div onClick={(e) => e.stopPropagation()} className="cursor-default"><SocialStrip customer={customer} /></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Block title="یادداشت‌ها" count={noteActs.length + custNotes.length}>
            {custNotes.map((n, i) => (
              <div key={'cn' + i} className="px-4 py-2.5 text-xs" data-summary-customer-note>
                <div className="leading-6 whitespace-pre-wrap">{n.text}</div>
                <div className="text-[10px] opacity-75">توضیحات مشتری{n.at ? ` · ${when(n.at)}` : ''}{n.byName ? ` · ${n.byName}` : ''}</div>
              </div>
            ))}
            {noteActs.slice(0, 40).map((a) => (
              <div key={a.id} className="px-4 py-2.5 text-xs">
                <div className="leading-6 whitespace-pre-wrap">{a.text}</div>
                <div className="text-[10px] opacity-75">{when(a.createdAt)} · {a.authorName}</div>
              </div>
            ))}
          </Block>
          <Block title="پیگیری‌ها" count={followActs.length}>
            {followActs.slice(0, 40).map((a) => (
              <div key={a.id} className="px-4 py-2.5 text-xs" data-summary-followup>
                <div className="leading-6 whitespace-pre-wrap">{a.text}</div>
                <div className="text-[10px] opacity-75">{a.done ? 'انجام شد' : a.dueDate ? `موعد: ${formatTaskDate(a.dueDate)}` : 'باز'} · ثبت: {when(a.createdAt)} · {a.authorName}</div>
              </div>
            ))}
          </Block>
          <Block title="فروش‌ها و خریدها" count={s.won.length}>
            {s.won.map((d) => (
              <div key={d.id} className="px-4 py-2.5 text-xs">
                <div className="flex items-center justify-between gap-3 font-black">
                  <span className="truncate">{d.title}</span>
                  <span className="shrink-0">{formatMoney(d.amount)} {unitName()}</span>
                </div>
                <div className="text-[10px] opacity-75">{formatTaskDate((d.closedAt || d.updatedAt).slice(0, 10))}{d.proformaNumber ? ` · پیش‌فاکتور ${toPersianDigits(d.proformaNumber)}` : ''}{(d.items || []).length ? ` · ${(d.items || []).map((i) => i.title).slice(0, 3).join('، ')}` : ''}</div>
              </div>
            ))}
          </Block>
          <Block title="قیمت‌هایی که داده‌ایم" count={s.quotes.length}>
            {s.quotes.map((a) => (
              <div key={a.id} className="px-4 py-2.5 text-xs">
                <div className="flex items-center justify-between gap-3 font-black">
                  <span className="truncate">{a.itemName || a.text}{a.spec ? ` (${a.spec})` : ''}</span>
                  <span className="shrink-0">{formatMoney(a.price || 0)} {unitName()}</span>
                </div>
                <div className="text-[10px] opacity-75">{when(a.createdAt)} · {a.authorName}{a.qty ? ` · تعداد ${toPersianDigits(a.qty)}` : ''}{a.askedPrice ? ` · مشتری ${formatMoney(a.askedPrice)} می‌خواست` : ''}</div>
              </div>
            ))}
          </Block>
          <Block title="جلسه‌ها و تماس‌های ثبت‌شده" count={meetActs.length}>
            {meetActs.slice(0, 40).map((a) => (
              <div key={a.id} className="px-4 py-2.5 text-xs">
                <div className="leading-6 whitespace-pre-wrap">{a.text}</div>
                <div className="text-[10px] opacity-75">{ACT_LABEL[a.type] || 'تعامل'} · {when(a.createdAt)} · {a.authorName}</div>
              </div>
            ))}
          </Block>
          <Block title="تماس‌های تلفنی (با ضبط و متن مکالمه)" count={calls.length}>
            {calls.slice(0, 40).map((c) => <CallRow key={c.id} c={c} />)}
          </Block>
          <div className="lg:col-span-2">
            <Block title="همهٔ تعامل‌ها به ترتیب زمان (تماس، یادداشت، پیگیری، جلسه، قیمت، فرصت)" count={timeline.length}>
              {timeline.map((e) => (
                <div key={e.id} className="px-4 py-2.5 text-xs space-y-1" data-timeline-row>
                  <div className="flex items-center justify-between gap-3 text-[10px]">
                    <span className="flex items-center gap-1.5 font-black text-[11px]"><e.Icon className="w-3.5 h-3.5 shrink-0" />{e.title}{e.by ? <span className="font-bold opacity-80"> · {e.by}</span> : null}</span>
                    <span className="opacity-75 shrink-0">{when(e.at)}</span>
                  </div>
                  {e.text && <div className="leading-6 whitespace-pre-wrap opacity-95">{e.text}</div>}
                  {e.call && <CallExtras c={e.call} />}
                </div>
              ))}
            </Block>
          </div>
        </div>
        <div className="text-center text-[11px] font-bold opacity-70 pb-4">با یک کلیک روی هر جای این صفحه بسته می‌شود</div>
      </div>
    </div>,
    document.body,
  );
};
