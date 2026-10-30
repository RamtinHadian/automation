import React, { useMemo, useState } from 'react';
import { AlertTriangle, Cake, CalendarClock, CalendarDays, ChevronDown, ChevronUp, LayoutGrid, ListChecks, Moon, Snowflake, Sparkles } from 'lucide-react';
import { CrmActivity, Customer, Deal } from '../../types';
import { birthMonthDay, buildMembers, normalizeClub } from '../../lib/club';
import { formatMoney, unitName } from '../../lib/money';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, isoToJalaliParts, todayIso } from '../../lib/taskDates';
import { monthNow, personStats, Targets } from '../../lib/team';

const STALLED_DAYS = 7;
const OPEN = ['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION'];

const CARD_IDS = ['follow', 'stalled', 'closing', 'birthday', 'quiet'];
const CARD_TITLES: Record<string, string> = {
  follow: 'پیگیری‌های امروز و عقب‌افتاده',
  stalled: 'فرصت‌های بدون تغییر بیش از ۷ روز',
  closing: 'فرصت‌هایی که تا یک هفته دیگر باید بسته شوند',
  birthday: 'تولد امروز مشتری‌های شما',
  quiet: 'مشتریانی که مدتی خرید نکرده‌اند',
};
const LAYOUT_KEY = 'crm_today_layout_v1_';
/** at most this many cards at once: two by two keeps the page tidy */
const MAX_CARDS = 4;
const DEFAULT_HIDDEN = ['birthday']; // the birthdays are also counted in the top tiles
interface TodayLayout { order: string[]; hidden: string[] }
/** The saved choice of this person; a card added later is appended, one that no longer exists is dropped. */
const loadLayout = (me: string): TodayLayout => {
  try {
    const v = JSON.parse(localStorage.getItem(LAYOUT_KEY + me) || 'null') as Partial<TodayLayout> | null;
    if (v && Array.isArray(v.order)) {
      const order = [...v.order.filter((id) => CARD_IDS.includes(id)), ...CARD_IDS.filter((id) => !v.order!.includes(id))];
      const hidden = (Array.isArray(v.hidden) ? v.hidden : []).filter((id) => CARD_IDS.includes(id));
      const on = order.filter((id) => !hidden.includes(id));
      return { order, hidden: [...hidden, ...on.slice(MAX_CARDS)] };
    }
  } catch { /* an unreadable choice is the same as none */ }
  return { order: [...CARD_IDS], hidden: [...DEFAULT_HIDDEN] };
};

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

  const [layout, setLayout] = useState<TodayLayout>(() => loadLayout(me));
  const [layoutOpen, setLayoutOpen] = useState(false);
  const saveLayout = (next: TodayLayout) => {
    setLayout(next);
    try { localStorage.setItem(LAYOUT_KEY + me, JSON.stringify(next)); } catch { /* the choice is only kept for this visit */ }
  };
  const move = (id: string, dir: -1 | 1) => {
    const i = layout.order.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= layout.order.length) return;
    const order = [...layout.order];
    [order[i], order[j]] = [order[j], order[i]];
    saveLayout({ ...layout, order });
  };
  const shown = layout.order.filter((id) => !layout.hidden.includes(id)).length;
  const [layoutNote, setLayoutNote] = useState('');
  const toggle = (id: string) => {
    if (layout.hidden.includes(id)) {
      if (shown >= MAX_CARDS) { setLayoutNote(`حداکثر ${toPersianDigits(MAX_CARDS)} کادر می‌تواند روشن باشد تا صفحه به‌هم نریزد؛ اول یکی را خاموش کنید.`); return; }
      setLayoutNote('');
      saveLayout({ ...layout, hidden: layout.hidden.filter((x) => x !== id) });
    } else {
      setLayoutNote('');
      saveLayout({ ...layout, hidden: [...layout.hidden, id] });
    }
  };
  // the cards of the page; the person chooses which of them are shown and in what order (kept in this browser)
  const secs: Record<string, React.ReactNode> = {
    follow: (
          <Section icon={<ListChecks className="w-4 h-4" />} title="پیگیری‌های امروز و عقب‌افتاده" count={mineF.length} tone="bg-violet-50 text-violet-800">
            {mineF.map(renderFollow)}
          </Section>
    ),
    stalled: (
          <Section icon={<Snowflake className="w-4 h-4" />} title={`فرصت‌های بدون تغییر بیش از ${toPersianDigits(STALLED_DAYS)} روز`} count={stalled.length} tone="bg-sky-50 text-sky-800">
            {stalled.slice(0, 12).map((d) => dealRow(d, `${toPersianDigits(daysSince(d.updatedAt || d.createdAt))} روز`))}
          </Section>
    ),
    closing: (
          <Section icon={<CalendarClock className="w-4 h-4" />} title="فرصت‌هایی که تا یک هفته دیگر باید بسته شوند" count={closingSoon.length} tone="bg-amber-50 text-amber-800">
            {closingSoon.slice(0, 12).map((d) => dealRow(d, d.expectedClose! < today ? 'گذشته' : formatTaskDate(d.expectedClose), d.expectedClose! < today))}
          </Section>
    ),
    birthday: (
          <Section icon={<Cake className="w-4 h-4" />} title="تولد امروز مشتری‌های شما" count={birthdays.length} tone="bg-rose-50 text-rose-800">
            {birthdays.map((c) => (
              <button key={c.id} type="button" onClick={() => onOpenCustomer(c.id)} className="w-full text-right bg-[#FAF5F1] hover:bg-[#F3E8DF] border border-[#EBDBCE] rounded-2xl px-3.5 py-2.5 text-[12px] font-black text-[#3A241F] cursor-pointer">
                {c.name}
              </button>
            ))}
          </Section>
    ),
    quiet: (
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
    ),
  };

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
        <button type="button" onClick={() => setLayoutOpen((v) => !v)} className="mt-3 flex items-center gap-1.5 bg-white/15 hover:bg-white/25 border border-white/25 rounded-xl px-3 py-1.5 text-[11px] font-black cursor-pointer" data-today-layout-toggle>
          <LayoutGrid className="w-3.5 h-3.5" />
          چیدمان صفحه
        </button>
        {layoutOpen && (
          <div className="mt-2 rounded-2xl bg-white text-[#3A241F] p-3 space-y-1.5 max-w-xl" data-today-layout>
            <div className="text-[11px] font-bold text-[#8C6F66] leading-6">حداکثر {toPersianDigits(MAX_CARDS)} کادر را روشن کنید ({toPersianDigits(shown)} از {toPersianDigits(MAX_CARDS)}) و ترتیبشان را با فلش‌ها بچینید. این چیدمان فقط برای شماست و در همین مرورگر می‌ماند.</div>
            {layoutNote && <div className="text-[11px] font-black text-rose-700 leading-6" data-today-layout-note>{layoutNote}</div>}
            {layout.order.map((id, i) => (
              <div key={id} className="flex items-center gap-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl px-3 py-1.5" data-today-layout-row={id}>
                <label className="flex items-center gap-2 text-xs font-black flex-1 min-w-0 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4" checked={!layout.hidden.includes(id)} onChange={() => toggle(id)} />
                  <span className="truncate">{CARD_TITLES[id]}</span>
                </label>
                <button type="button" disabled={i === 0} onClick={() => move(id, -1)} className="p-1 rounded-lg hover:bg-white disabled:opacity-30 cursor-pointer" aria-label="بالاتر"><ChevronUp className="w-4 h-4" /></button>
                <button type="button" disabled={i === layout.order.length - 1} onClick={() => move(id, 1)} className="p-1 rounded-lg hover:bg-white disabled:opacity-30 cursor-pointer" aria-label="پایین‌تر"><ChevronDown className="w-4 h-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => saveLayout({ order: [...CARD_IDS], hidden: [...DEFAULT_HIDDEN] })} className="text-[11px] font-black text-violet-700 underline cursor-pointer">بازگشت به چیدمان اولیه</button>
          </div>
        )}
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

      <div className="grid lg:grid-cols-2 gap-4" data-today-grid>
        {layout.order.filter((id) => !layout.hidden.includes(id) && secs[id]).map((id) => <React.Fragment key={id}>{secs[id]}</React.Fragment>)}
      </div>
      {layout.order.every((id) => layout.hidden.includes(id)) && <div className="text-center text-[12px] font-bold text-[#8C6F66] py-8">همهٔ کادرها پنهان است. از «چیدمان صفحه» هر کدام را که می‌خواهید روشن کنید.</div>}
    </div>
  );
};
