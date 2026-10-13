import React, { useMemo, useState } from 'react';
import { AlertTriangle, Cake, CalendarClock, CalendarDays, ListChecks, Moon, Snowflake, Sparkles } from 'lucide-react';
import { CrmActivity, Customer, Deal } from '../../types';
import { birthMonthDay, buildMembers, normalizeClub } from '../../lib/club';
import { formatMoney, unitName } from '../../lib/money';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, isoToJalaliParts, todayIso } from '../../lib/taskDates';
import { monthNow, personStats, Targets } from '../../lib/team';

const STALLED_DAYS = 7;
const OPEN = ['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION'];

const Section: React.FC<{ icon: React.ReactNode; title: string; count: number; tone: string; children: React.ReactNode }> = ({ icon, title, count, tone, children }) => (
  <section className="bg-white border border-[#EBDBCE] rounded-3xl overflow-hidden" data-today-section>
    <div className={`px-4 py-3 border-b border-[#EBDBCE] flex items-center justify-between gap-2 ${tone}`}>
      <div className="flex items-center gap-2 text-xs font-black">
        {icon}
        {title}
      </div>
      <span className="text-[11px] font-black bg-white/70 rounded-full px-2 py-0.5">{toPersianDigits(count)}</span>
    </div>
    <div className="p-3 space-y-2">{count === 0 ? <div className="text-center text-[11px] font-bold text-[#8C6F66] py-4">موردی نیست.</div> : children}</div>
  </section>
);

/** «امروز من»: what this person should do today, in one page. */
export const TodayView: React.FC<{
  me: string;
  myName: string;
  customers: Customer[];
  deals: Deal[];
  isAdmin: boolean;
  /** sees the whole team's customers (administrators, or people with the «مشتریان همکاران» right) */
  seesTeam: boolean;
  targets: Targets | null;
  followups: CrmActivity[];
  renderFollow: (a: CrmActivity) => React.ReactNode;
  onOpenDeal: (d: Deal) => void;
  onOpenCustomer: (id: string) => void;
}> = ({ me, myName, customers, deals, isAdmin, seesTeam, targets, followups, renderFollow, onOpenDeal, onOpenCustomer }) => {
  const today = todayIso();
  // managers can look at the whole team's day, everyone else sees only their own
  const [scope, setScope] = useState<'mine' | 'all'>(isAdmin ? 'all' : 'mine');
  const all = seesTeam && scope === 'all';
  const mineF = followups.filter((a) => (all || a.ownerId === me) && a.dueDate && a.dueDate <= today).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  const myOpen = useMemo(() => deals.filter((d) => OPEN.includes(d.stage) && (all || d.ownerId === me || (d.coOwnerIds || []).includes(me))), [deals, me, all]);
  const stalled = useMemo(() => {
    const limit = Date.now() - STALLED_DAYS * 86400000;
    return myOpen.filter((d) => new Date(d.updatedAt || d.createdAt).getTime() < limit).sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''));
  }, [myOpen]);
  const closingSoon = myOpen
    .filter((d) => d.expectedClose && d.expectedClose <= new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-CA'))
    .sort((a, b) => (a.expectedClose || '').localeCompare(b.expectedClose || ''));
  const jt = isoToJalaliParts(today);
  const myCustomers = useMemo(() => customers.filter((c) => all || c.ownerId === me), [customers, me, all]);
  const birthdays = jt ? myCustomers.filter((c) => { const md = birthMonthDay(c.birthDate); return !!md && md[0] === jt[1] && md[1] === jt[2]; }) : [];
  const quiet = useMemo(() => {
    const cfg = normalizeClub(null);
    const limit = Date.now() - cfg.dormantDays * 86400000;
    return buildMembers(myCustomers, deals, cfg).filter((m) => m.last && new Date(m.last).getTime() < limit).slice(0, 8);
  }, [myCustomers, deals]);

  // my sales this month against my target
  const myStat = useMemo(() => personStats([me], deals, followups, monthNow(), targets)[0], [me, deals, followups, targets]);
  const lateCount = mineF.filter((a) => a.dueDate! < today).length;
  const dealRow = (d: Deal, note: string, danger?: boolean) => (
    <button key={d.id} type="button" onClick={() => onOpenDeal(d)} className="w-full text-right flex items-center justify-between gap-3 bg-[#FAF5F1] hover:bg-[#F3E8DF] border border-[#EBDBCE] rounded-2xl px-3.5 py-2.5 cursor-pointer">
      <div className="min-w-0">
        <div className="text-[12px] font-black text-[#3A241F] truncate">{d.title}</div>
        <div className="text-[10px] text-[#8C6F66] truncate">{d.customerName} · {formatMoney(d.amount)} {unitName()}</div>
      </div>
      <span className={`shrink-0 text-[10px] font-black ${danger ? 'text-rose-600' : 'text-amber-700'}`}>{note}</span>
    </button>
  );
  const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

  return (
    <div className="space-y-4" data-today>
      <div className="rounded-3xl bg-gradient-to-l from-[#7C3AED] via-[#9333EA] to-[#BE123C] text-white p-5 shadow-lg shadow-violet-700/20">
        <div className="flex items-center gap-2 text-lg font-black">
          <Sparkles className="w-5 h-5" />
          {myName}، امروز این‌ها را دارید
        </div>
        {seesTeam && (
          <div className="flex bg-white/15 rounded-xl p-1 w-fit mt-3">
            {([['all', 'همهٔ تیم'], ['mine', 'فقط من']] as const).map(([id, text]) => (
              <button key={id} type="button" onClick={() => setScope(id)} className={`px-3 py-1 rounded-lg text-[11px] font-black cursor-pointer ${scope === id ? 'bg-white text-violet-700' : 'text-white/90'}`}>
                {text}
              </button>
            ))}
          </div>
        )}
        <div className="text-[11px] font-bold opacity-85 mt-1">{formatTaskDate(today)}</div>
        {myStat.target > 0 && (
          <div className="mt-3 rounded-2xl bg-white/15 border border-white/20 px-3.5 py-3" data-my-target>
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span>فروش این ماه شما</span>
              <span>{formatMoney(myStat.won)} از {formatMoney(myStat.target)} {unitName()}</span>
            </div>
            <div className="h-2 rounded-full bg-white/25 mt-2 overflow-hidden"><div className="h-full bg-white rounded-full" style={{ width: `${Math.min(100, Math.round((myStat.won / myStat.target) * 100))}%` }} /></div>
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {([
            ['پیگیری برای امروز', mineF.length - lateCount, ListChecks],
            ['پیگیری عقب‌افتاده', lateCount, AlertTriangle],
            ['فرصت گیرکرده', stalled.length, Snowflake],
            ['تولد امروز', birthdays.length, Cake],
          ] as const).map(([k, v, Ic]) => (
            <div key={k} className="rounded-2xl bg-white/15 border border-white/20 px-3.5 py-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold opacity-85">
                <Ic className="w-4 h-4" />
                {k}
              </div>
              <div className="text-base font-black mt-0.5">{toPersianDigits(v)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Section icon={<ListChecks className="w-4 h-4" />} title="پیگیری‌های امروز و عقب‌افتاده" count={mineF.length} tone="bg-violet-50 text-violet-800">
          {mineF.map(renderFollow)}
        </Section>
        <Section icon={<Snowflake className="w-4 h-4" />} title={`فرصت‌های بدون تغییر بیش از ${toPersianDigits(STALLED_DAYS)} روز`} count={stalled.length} tone="bg-sky-50 text-sky-800">
          {stalled.slice(0, 12).map((d) => dealRow(d, `${toPersianDigits(daysSince(d.updatedAt || d.createdAt))} روز`))}
        </Section>
        <Section icon={<CalendarClock className="w-4 h-4" />} title="فرصت‌هایی که تا یک هفته دیگر باید بسته شوند" count={closingSoon.length} tone="bg-amber-50 text-amber-800">
          {closingSoon.slice(0, 12).map((d) => dealRow(d, d.expectedClose! < today ? 'گذشته' : formatTaskDate(d.expectedClose), d.expectedClose! < today))}
        </Section>
        <Section icon={<Cake className="w-4 h-4" />} title="تولد امروز مشتری‌های شما" count={birthdays.length} tone="bg-rose-50 text-rose-800">
          {birthdays.map((c) => (
            <button key={c.id} type="button" onClick={() => onOpenCustomer(c.id)} className="w-full text-right bg-[#FAF5F1] hover:bg-[#F3E8DF] border border-[#EBDBCE] rounded-2xl px-3.5 py-2.5 text-[12px] font-black text-[#3A241F] cursor-pointer">
              {c.name}
            </button>
          ))}
        </Section>
        <Section icon={<Moon className="w-4 h-4" />} title="مشتریانی که مدتی خرید نکرده‌اند" count={quiet.length} tone="bg-indigo-50 text-indigo-800">
          {quiet.map((m) => (
            <button key={m.customer.id} type="button" onClick={() => onOpenCustomer(m.customer.id)} className="w-full text-right flex items-center justify-between gap-3 bg-[#FAF5F1] hover:bg-[#F3E8DF] border border-[#EBDBCE] rounded-2xl px-3.5 py-2.5 cursor-pointer">
              <span className="text-[12px] font-black text-[#3A241F] truncate">{m.customer.name}</span>
              <span className="shrink-0 text-[10px] font-bold text-[#8C6F66] flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {formatTaskDate(m.last.slice(0, 10))}
              </span>
            </button>
          ))}
        </Section>
      </div>
    </div>
  );
};
