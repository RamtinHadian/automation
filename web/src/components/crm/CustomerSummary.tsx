import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BadgeDollarSign, Briefcase, MessageSquare, PhoneCall, Tag, X } from 'lucide-react';
import { CrmActivity, Customer, Deal } from '../../types';
import { VoipCall } from '../../lib/api';
import { formatMoney, unitName } from '../../lib/money';
import { toPersianDigits } from '../../lib/jalali';
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
            <Stat icon={<MessageSquare className="w-4 h-4" />} title="تعامل‌ها" value={`${toPersianDigits(s.others.length)} مورد، ${toPersianDigits(s.callCount)} تماس`} sub={`آخرین: ${ago(s.last)}`} />
            <Stat icon={<BadgeDollarSign className="w-4 h-4" />} title="فروش" value={s.won.length ? `${formatMoney(s.wonTotal)} ${unitName()}` : 'خریدی ثبت نشده'} sub={s.won.length ? `${toPersianDigits(s.won.length)} خرید، آخرین ${formatTaskDate((s.won[0].closedAt || s.won[0].updatedAt).slice(0, 10))}` : 'هنوز فروشی نداشته'} />
            <Stat icon={<Tag className="w-4 h-4" />} title="قیمت‌های داده‌شده" value={`${toPersianDigits(s.quotes.length)} مورد`} sub={q ? `${q.itemName || ''}: ${formatMoney(q.price || 0)}` : 'قیمتی ثبت نشده'} />
            <Stat icon={<Briefcase className="w-4 h-4" />} title="فرصت‌های باز" value={`${toPersianDigits(s.open.length)} فرصت`} sub={s.open.length ? `${formatMoney(s.openTotal)} ${unitName()}` : '—'} />
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
            ['مجموع خرید', `${formatMoney(s.wonTotal)} ${unitName()}`],
            ['تعداد خرید', toPersianDigits(s.won.length)],
            ['قیمت‌های داده‌شده', toPersianDigits(s.quotes.length)],
            ['آخرین تعامل', ago(s.last)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white/12 border border-white/20 px-4 py-3">
              <div className="text-[11px] font-bold opacity-80">{k}</div>
              <div className="text-lg font-black">{v}</div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
          <Block title="یادداشت‌ها، پیگیری‌ها و جلسه‌ها" count={s.others.length}>
            {s.others.slice(0, 40).map((a) => (
              <div key={a.id} className="px-4 py-2.5 text-xs">
                <div className="leading-6 whitespace-pre-wrap">{a.text}</div>
                <div className="text-[10px] opacity-75">{when(a.createdAt)} · {a.authorName}</div>
              </div>
            ))}
          </Block>
          <Block title="تماس‌های تلفنی" count={calls.length}>
            {calls.slice(0, 40).map((c) => (
              <div key={c.id} className="px-4 py-2.5 text-xs flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 font-bold"><PhoneCall className="w-3.5 h-3.5" />{c.direction === 'out' ? 'خروجی' : 'ورودی'} · {toPersianDigits(c.number || '')}</span>
                <span className="text-[10px] opacity-75">{when(c.startedAt)}</span>
              </div>
            ))}
          </Block>
        </div>
        <div className="text-center text-[11px] font-bold opacity-70 pb-4">با یک کلیک روی هر جای این صفحه بسته می‌شود</div>
      </div>
    </div>,
    document.body,
  );
};
