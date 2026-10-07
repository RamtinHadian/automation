import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, CalendarClock, ClipboardList, Headset, LifeBuoy, Plus, Search, Timer, UserPlus } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { api } from '../../lib/api';
import { formatMoney, unitName } from '../../lib/money';
import { toPersianDigits } from '../../lib/jalali';
import { todayIso } from '../../lib/taskDates';
import { SOON_DAYS } from '../../lib/warranty';
import { SupportPlan, SupportSub, SupportTicket } from '../../types';
import {
  codeText, dayText, hoursText, isOpenTicket, PLAN_COLOR, PRIORITY, resolveSla, responseSla, SLA_CLS, subRemaining, subState, SUB_STATE, TICKET_STATUS, visitsUsed,
} from '../../lib/support';
import { C, ChartCard, Donut, HBars, Kpi } from '../admin/charts';
import { Modal, field, label } from '../crm/crmUi';
import { PlanCard, PlanForm, SubForm, TicketForm } from './SupportForms';
import { TicketDetail } from './TicketDetail';

type Tab = 'overview' | 'tickets' | 'subs' | 'plans';

/** The support menu: plans the company sells, customers' subscriptions, support requests with their deadlines and the numbers. */
export const SupportView: React.FC = () => {
  const { customers, staffList, currentUser, showToast } = useAppContext();
  const isAdmin = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEPT_ADMIN';
  const [tab, setTab] = useState<Tab>('overview');
  const [plans, setPlans] = useState<SupportPlan[]>([]);
  const [subs, setSubs] = useState<SupportSub[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const [editingSub, setEditingSub] = useState<{ s: SupportSub | null; customerId?: string } | null>(null);
  const [newTicket, setNewTicket] = useState<{ customerId?: string } | null>(null);
  const [editingPlan, setEditingPlan] = useState<{ p: SupportPlan | null } | null>(null);
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<SupportSub | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [q, setQ] = useState('');
  const [ticketFilter, setTicketFilter] = useState<'OPEN' | 'LATE' | 'DONE' | 'ALL'>('OPEN');
  const [subFilter, setSubFilter] = useState<'ALL' | 'ACTIVE' | 'SOON' | 'EXPIRED' | 'CANCELLED'>('ALL');
  const [, setTick] = useState(0);

  const load = useCallback(() => {
    api
      .supportList()
      .then((r) => {
        setPlans(r.plans);
        setSubs(r.subs);
        setTickets(r.tickets);
        setLoaded(true);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 30000);
    const clock = window.setInterval(() => setTick((n) => n + 1), 60000); // the deadlines count down
    return () => {
      window.clearInterval(t);
      window.clearInterval(clock);
    };
  }, [load]);

  // opened from a notification, or from a customer's page
  useEffect(() => {
    const go = () => {
      try {
        const raw = sessionStorage.getItem('support_open');
        if (!raw) return;
        sessionStorage.removeItem('support_open');
        const o = JSON.parse(raw) as { type: string; id?: string; customerId?: string };
        if (o.type === 'ticket' && o.id) {
          setTab('tickets');
          setTicketFilter('ALL');
          setOpenTicket(o.id);
        } else if (o.type === 'newSub') {
          setTab('subs');
          setEditingSub({ s: null, customerId: o.customerId });
        } else if (o.type === 'newTicket') {
          setTab('tickets');
          setNewTicket({ customerId: o.customerId });
        }
      } catch {
        /* ignore */
      }
    };
    go();
    window.addEventListener('open-support-item', go);
    return () => window.removeEventListener('open-support-item', go);
  }, []);

  const today = todayIso();
  const staff = useMemo(() => staffList.filter((u) => u.isActive && (u.canUseWarranty || u.canUseCrm || u.role === 'SUPER_ADMIN' || u.role === 'DEPT_ADMIN')), [staffList]);
  const fail = (m: string) => showToast(m);

  const stats = useMemo(() => {
    const states = subs.map((s) => subState(s, today));
    const open = tickets.filter(isOpenTicket);
    const late = open.filter((t) => responseSla(t).kind === 'late' || resolveSla(t).kind === 'late');
    const answered = tickets.filter((t) => t.firstResponseAt);
    const onTime = answered.filter((t) => new Date(t.firstResponseAt!).getTime() <= new Date(t.responseDue).getTime());
    const waits = answered.map((t) => new Date(t.firstResponseAt!).getTime() - new Date(t.createdAt).getTime());
    const byCustomer = new Map<string, number>();
    for (const t of tickets) byCustomer.set(t.customerName, (byCustomer.get(t.customerName) || 0) + 1);
    const running = subs.filter((_, i) => states[i] === 'ACTIVE' || states[i] === 'SOON');
    return {
      running,
      value: running.reduce((a, s) => a + (s.price || 0), 0),
      soon: subs.filter((_, i) => states[i] === 'SOON').sort((a, b) => a.endDate.localeCompare(b.endDate)),
      open,
      late,
      onTimePct: answered.length ? Math.round((onTime.length / answered.length) * 100) : null,
      avgWait: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null,
      byCustomer: [...byCustomer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
      byStatus: (Object.keys(TICKET_STATUS) as (keyof typeof TICKET_STATUS)[]).map((k) => ({ k, n: tickets.filter((t) => t.status === k).length })),
      perPlan: plans.map((p) => ({ p, n: running.filter((s) => s.planId === p.id).length })),
    };
  }, [subs, tickets, plans, today]);

  const shownTickets = useMemo(() => {
    const t = q.trim().toLowerCase();
    return tickets.filter((x) => {
      if (ticketFilter === 'OPEN' && !isOpenTicket(x)) return false;
      if (ticketFilter === 'DONE' && isOpenTicket(x)) return false;
      if (ticketFilter === 'LATE' && !(isOpenTicket(x) && (responseSla(x).kind === 'late' || resolveSla(x).kind === 'late'))) return false;
      return !t || `${x.ticketNo} ${x.customerName} ${x.subject} ${x.description} ${x.handlerName || ''}`.toLowerCase().includes(t);
    });
  }, [tickets, q, ticketFilter]);
  const shownSubs = useMemo(() => {
    const t = q.trim().toLowerCase();
    return subs.filter((s) => (subFilter === 'ALL' || subState(s, today) === subFilter) && (!t || `${s.subNo} ${s.customerName} ${s.planName}`.toLowerCase().includes(t)));
  }, [subs, q, subFilter, today]);

  const doCancel = async () => {
    if (!cancelling) return;
    try {
      await api.supportSubCancel(cancelling.id, cancelReason.trim());
      setCancelling(null);
      setCancelReason('');
      showToast('اشتراک لغو شد.');
      load();
    } catch (e) {
      fail(e instanceof Error ? e.message : 'لغو نشد.');
    }
  };

  const tabs: [Tab, string, React.ElementType][] = [
    ['overview', 'خلاصه', LifeBuoy],
    ['tickets', 'درخواست‌ها', Headset],
    ['subs', 'اشتراک‌ها', BadgeCheck],
    ['plans', 'پلن‌ها', ClipboardList],
  ];

  const ticketCard = (t: SupportTicket) => {
    const st = TICKET_STATUS[t.status];
    const pr = PRIORITY[t.priority];
    const sla = !t.firstResponseAt ? responseSla(t) : resolveSla(t);
    return (
      <button key={t.id} type="button" onClick={() => setOpenTicket(t.id)} className="w-full text-right bg-white border border-[#EBDBCE] rounded-2xl p-3.5 space-y-1.5 hover:shadow-md transition-all cursor-pointer" data-ticket-card>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-black text-[13px] text-[#3A241F] truncate">{t.subject}</div>
            <div className="text-[11px] text-[#8C6F66] truncate">{t.customerName} · {codeText(t.ticketNo)}</div>
          </div>
          <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
        </div>
        <p className="text-[11px] leading-5 text-[#503730] line-clamp-2">{t.description}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-[#8C6F66]">
          <span className={`px-1.5 rounded border ${pr.cls}`}>{pr.label}</span>
          {t.planName ? <span>{t.planName}</span> : <span className="text-rose-600">بدون پلن</span>}
          {t.handlerName && <span>مسئول: {t.handlerName}</span>}
          {sla.label && isOpenTicket(t) && <span className={`flex items-center gap-1 ${SLA_CLS[sla.kind]}`}>{sla.kind === 'late' && <AlertTriangle className="w-3 h-3" />}{sla.label}</span>}
        </div>
      </button>
    );
  };

  const subCard = (s: SupportSub) => {
    const state = subState(s, today);
    const st = SUB_STATE[state];
    const used = visitsUsed(s, tickets);
    const n = tickets.filter((t) => t.subId === s.id).length;
    const c = PLAN_COLOR[s.planColor] || PLAN_COLOR.teal;
    return (
      <div key={s.id} className="bg-white border border-[#EBDBCE] rounded-2xl p-3.5 space-y-2 text-right" data-sub-card>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-black text-[13px] text-[#3A241F] truncate">{s.customerName}</div>
            <div className="text-[11px] text-[#8C6F66]">{codeText(s.subNo)}</div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${c.chip}`}>{s.planName}</span>
          </div>
        </div>
        <div className="text-[11px] font-bold text-[#503730] leading-6">
          <div><span className="text-[#8C6F66] font-medium">از </span>{dayText(s.startDate)}<span className="text-[#8C6F66] font-medium"> تا </span>{dayText(s.endDate)}</div>
          <div className={state === 'SOON' ? 'text-amber-700' : state === 'ACTIVE' ? 'text-emerald-700' : 'text-[#8C6F66]'}>{subRemaining(s, today)}{n > 0 && ` · ${toPersianDigits(n)} درخواست`}</div>
          {s.visits > 0 && <div><span className="text-[#8C6F66] font-medium">بازدید حضوری: </span>{toPersianDigits(used)} از {toPersianDigits(s.visits)}</div>}
          {s.price > 0 && <div><span className="text-[#8C6F66] font-medium">مبلغ: </span>{formatMoney(s.price)} {unitName()}</div>}
          {s.status === 'CANCELLED' && s.cancelReason && <div className="text-rose-700">دلیل لغو: {s.cancelReason}</div>}
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {s.status === 'ACTIVE' && (
            <>
              <button type="button" onClick={() => setNewTicket({ customerId: s.customerId })} className="flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg bg-teal-50 border border-teal-200 text-[11px] font-black text-teal-800 cursor-pointer"><Headset className="w-3.5 h-3.5" />درخواست پشتیبانی</button>
              {(isAdmin || s.createdById === currentUser.id) && (
                <>
                  <button type="button" onClick={() => setEditingSub({ s })} className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-white border border-[#EBDBCE] text-[11px] font-black text-[#3A241F] cursor-pointer">ویرایش</button>
                  <button type="button" onClick={() => { setCancelling(s); setCancelReason(''); }} className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-white border border-rose-200 text-[11px] font-black text-rose-700 cursor-pointer">لغو</button>
                </>
              )}
            </>
          )}
          {state === 'EXPIRED' && <button type="button" onClick={() => setEditingSub({ s: null, customerId: s.customerId })} className="px-2.5 py-1.5 min-h-[36px] rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-black text-amber-800 cursor-pointer">تمدید (اشتراک تازه)</button>}
        </div>
      </div>
    );
  };

  const tabBtn = ([id, text, Icon]: [Tab, string, React.ElementType]) => (
    <button key={id} type="button" onClick={() => { setTab(id); setQ(''); }} className={`flex-1 basis-[45%] sm:basis-auto sm:flex-initial min-h-[44px] sm:min-h-0 whitespace-nowrap flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${tab === id ? 'bg-white text-teal-700 shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'}`}>
      <Icon className="w-4 h-4" />
      {text}
      {id === 'tickets' && stats.open.length > 0 && <span className={`${stats.late.length ? 'bg-rose-500' : 'bg-amber-500'} text-white text-[10px] rounded-full px-1.5`}>{toPersianDigits(stats.open.length)}</span>}
    </button>
  );

  const searchBox = (ph: string) => (
    <div className="relative flex-1 min-w-[200px]">
      <Search className="w-4 h-4 text-[#8C6F66] absolute right-3.5 top-1/2 -translate-y-1/2" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ph} className="w-full pr-10 pl-4 py-2.5 bg-white border border-[#EBDBCE] rounded-2xl text-xs outline-hidden focus:ring-2 focus:ring-teal-500/20" />
    </div>
  );
  const pills = <T extends string>(value: T, set: (v: T) => void, list: readonly (readonly [T, string])[]) => (
    <div className="flex gap-1 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-1 overflow-x-auto">
      {list.map(([id, text]) => <button key={id} type="button" onClick={() => set(id)} className={`px-3.5 py-1.5 min-h-[36px] rounded-xl text-[11px] font-black cursor-pointer whitespace-nowrap ${value === id ? 'bg-white text-teal-700 shadow-2xs' : 'text-[#8C6F66]'}`}>{text}</button>)}
    </div>
  );
  const empty = (text: string) => <div className="text-center text-xs font-bold text-gray-400 py-14 bg-white border border-[#EBDBCE] rounded-3xl">{text}</div>;
  const openTicketDoc = tickets.find((t) => t.id === openTicket);

  return (
    <div className="flex-1 p-3.5 sm:p-8 space-y-4 sm:space-y-5 pb-32 sm:pb-8 select-none overflow-x-hidden" data-support-view>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-lg text-[#3A241F]">پشتیبانی</h2>
          <p className="text-xs text-[#8C6F66] mt-0.5">پلن‌های پشتیبانی، اشتراک مشتریان و درخواست‌ها با مهلت پاسخ‌گویی و حل مشکل.</p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2">
          <button type="button" onClick={() => setNewTicket({})} className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-0 rounded-2xl bg-white border border-teal-200 text-teal-800 hover:bg-teal-50 text-xs font-black cursor-pointer"><Headset className="w-4 h-4" />درخواست پشتیبانی</button>
          <button type="button" onClick={() => setEditingSub({ s: null })} className="flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] sm:min-h-0 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black shadow-md shadow-teal-600/25 cursor-pointer"><UserPlus className="w-4 h-4" />اشتراک تازه</button>
        </div>
      </div>

      <div className="flex flex-wrap sm:flex-nowrap gap-1 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-1 sm:overflow-x-auto">{tabs.map(tabBtn)}</div>

      {failed && !loaded && <div className="py-16 text-center text-xs font-bold text-rose-600">دریافت اطلاعات پشتیبانی ممکن نشد؛ اتصال یا دسترسی را بررسی کنید.</div>}
      {!loaded && !failed && <div className="py-16 text-center text-xs font-bold text-gray-400">در حال بارگذاری…</div>}

      {loaded && tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi accent={C.green} icon={<BadgeCheck className="w-5 h-5" />} label="اشتراک فعال" value={toPersianDigits(stats.running.length)} sub={stats.value ? `ارزش ${formatMoney(stats.value)} ${unitName()}` : undefined} />
            <Kpi accent={C.orange} icon={<CalendarClock className="w-5 h-5" />} label={`پایان در ${toPersianDigits(SOON_DAYS)} روز آینده`} value={toPersianDigits(stats.soon.length)} sub={stats.soon.length ? 'وقت پیشنهاد تمدید' : undefined} />
            <Kpi accent={C.red} icon={<Headset className="w-5 h-5" />} label="درخواست باز" value={toPersianDigits(stats.open.length)} sub={stats.late.length ? `${toPersianDigits(stats.late.length)} مورد از مهلت گذشته` : 'همه در مهلت'} />
            <Kpi accent={C.blue} icon={<Timer className="w-5 h-5" />} label="پاسخ به‌موقع" value={stats.onTimePct === null ? '—' : `${toPersianDigits(stats.onTimePct)}٪`} sub={stats.avgWait === null ? undefined : `میانگین انتظار ${hoursText(stats.avgWait)}`} />
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <ChartCard title="کدام مشتریان بیشتر پشتیبانی خواسته‌اند؟" subtitle="تعداد درخواست هر مشتری">
              <HBars empty="هنوز درخواستی ثبت نشده است." rows={stats.byCustomer.map(([name, n]) => ({ label: name, segments: [{ value: n, color: C.blue, name: 'درخواست' }] }))} />
            </ChartCard>
            <ChartCard title="وضعیت درخواست‌ها" subtitle="همهٔ درخواست‌های ثبت‌شده">
              <Donut centerLabel="درخواست" data={stats.byStatus.filter((s) => s.n > 0).map((s, i) => ({ label: TICKET_STATUS[s.k].label, value: s.n, color: [C.blue, C.yellow, C.violet, C.green, C.magenta][i % 5] }))} />
            </ChartCard>
          </div>
          {stats.late.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-black text-xs text-rose-700 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />درخواست‌هایی که از مهلت گذشته‌اند</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{stats.late.slice(0, 6).map(ticketCard)}</div>
            </div>
          )}
          {stats.soon.length > 0 && (
            <div className="bg-white rounded-3xl border border-[#EBDBCE] overflow-hidden">
              <div className="px-5 py-3 bg-amber-50 font-black text-[12px] text-amber-900">اشتراک‌هایی که به‌زودی تمام می‌شوند</div>
              <div className="divide-y divide-[#EBDBCE]/60">
                {stats.soon.slice(0, 8).map((s) => (
                  <div key={s.id} className="px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-black text-[#3A241F]">{s.customerName} · {s.planName}</span>
                    <span className="font-bold text-amber-700">{dayText(s.endDate)} ({subRemaining(s, today)})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats.perPlan.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {stats.perPlan.map(({ p, n }) => <span key={p.id} className={`px-3 py-1.5 rounded-full border text-[11px] font-black ${(PLAN_COLOR[p.color] || PLAN_COLOR.teal).chip}`}>{p.name}: {toPersianDigits(n)} مشترک</span>)}
            </div>
          )}
        </div>
      )}

      {loaded && tab === 'tickets' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            {searchBox('جستجوی مشتری، موضوع، شمارهٔ درخواست یا مسئول…')}
            {pills(ticketFilter, setTicketFilter, [['OPEN', 'باز'], ['LATE', 'از مهلت گذشته'], ['DONE', 'پایان‌یافته'], ['ALL', 'همه']] as const)}
          </div>
          {shownTickets.length === 0 ? empty(tickets.length === 0 ? 'هنوز درخواستی ثبت نشده است.' : 'درخواستی با این فیلتر پیدا نشد.') : <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{shownTickets.map(ticketCard)}</div>}
        </div>
      )}

      {loaded && tab === 'subs' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            {searchBox('جستجوی مشتری، پلن یا شمارهٔ اشتراک…')}
            {pills(subFilter, setSubFilter, [['ALL', 'همه'], ['ACTIVE', 'فعال'], ['SOON', 'نزدیک به پایان'], ['EXPIRED', 'پایان‌یافته'], ['CANCELLED', 'لغوشده']] as const)}
          </div>
          {shownSubs.length === 0 ? empty(subs.length === 0 ? 'هنوز اشتراکی ثبت نشده است. با «اشتراک تازه» شروع کنید.' : 'اشتراکی با این جستجو پیدا نشد.') : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{shownSubs.map(subCard)}</div>}
        </div>
      )}

      {loaded && tab === 'plans' && (
        <div className="space-y-3">
          {isAdmin && <button type="button" onClick={() => setEditingPlan({ p: null })} className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] sm:min-h-0 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black cursor-pointer"><Plus className="w-4 h-4" />پلن تازه</button>}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {plans.map((p) => (
              <PlanCard
                key={p.id}
                plan={p}
                footer={
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px] font-black">
                    <span className="text-[#8C6F66]">{toPersianDigits(stats.perPlan.find((x) => x.p.id === p.id)?.n || 0)} مشترک فعال</span>
                    {isAdmin && <button type="button" onClick={() => setEditingPlan({ p })} className="px-3 py-1.5 min-h-[36px] rounded-lg bg-[#FAF5F1] border border-[#EBDBCE] text-[#3A241F] cursor-pointer">ویرایش</button>}
                  </div>
                }
              />
            ))}
          </div>
          {!isAdmin && <p className="text-[11px] font-bold text-[#8C6F66]">پلن‌ها را فقط مدیر تغییر می‌دهد.</p>}
        </div>
      )}

      {editingSub && <SubForm initial={editingSub.s} presetCustomerId={editingSub.customerId} customers={customers} plans={plans} onClose={() => setEditingSub(null)} onError={fail} onSaved={() => { setEditingSub(null); showToast('اشتراک ذخیره شد.'); load(); }} />}
      {newTicket && <TicketForm customers={customers} subs={subs} presetCustomerId={newTicket.customerId} staff={staff} onClose={() => setNewTicket(null)} onError={fail} onSaved={() => { setNewTicket(null); setTab('tickets'); setTicketFilter('OPEN'); showToast('درخواست پشتیبانی ثبت شد.'); load(); }} />}
      {editingPlan && <PlanForm initial={editingPlan.p} onClose={() => setEditingPlan(null)} onError={fail} onSaved={() => { setEditingPlan(null); showToast('پلن ذخیره شد.'); load(); }} />}
      {openTicketDoc && <TicketDetail ticket={openTicketDoc} isAdmin={isAdmin} staff={staff} onClose={() => setOpenTicket(null)} onError={fail} onChange={(t) => { setTickets((list) => list.map((x) => (x.id === t.id ? t : x))); load(); }} />}
      {cancelling && (
        <Modal
          title={`لغو اشتراک ${codeText(cancelling.subNo)}`}
          onClose={() => setCancelling(null)}
          onTop
          footer={
            <>
              <button type="button" onClick={() => setCancelling(null)} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">انصراف</button>
              <button type="button" onClick={doCancel} disabled={!cancelReason.trim()} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 cursor-pointer">لغو اشتراک</button>
            </>
          }
        >
          <p className="text-xs text-[#503730] leading-6">اشتراک پاک نمی‌شود؛ فقط لغو می‌شود و در سابقهٔ مشتری می‌ماند.</p>
          <div>
            <label className={label}>دلیل لغو *</label>
            <textarea className={`${field} min-h-[72px] leading-6`} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  );
};
