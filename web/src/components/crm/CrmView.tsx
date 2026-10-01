import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileText,
  Clock,
  LayoutGrid,
  ListChecks,
  Mail,
  MapPin,
  MessageSquare,
  PhoneCall,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, isOverdue, todayIso } from '../../lib/taskDates';
import { ActivityType, CrmActivity, Customer, CustomerStatus, Deal, DealStage, User } from '../../types';
import { Avatar, JalaliDateField } from '../tasks/TasksView';
import { ProformaModal } from './ProformaModal';

const STATUS: Record<CustomerStatus, { label: string; cls: string }> = {
  LEAD: { label: 'مشتری بالقوه', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  ACTIVE: { label: 'مشتری فعال', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  INACTIVE: { label: 'غیرفعال', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const STAGES: { id: DealStage; label: string; dot: string; head: string }[] = [
  { id: 'NEW', label: 'جدید', dot: 'bg-slate-400', head: 'text-slate-700' },
  { id: 'CONTACTED', label: 'تماس گرفته شد', dot: 'bg-sky-500', head: 'text-sky-700' },
  { id: 'PROPOSAL', label: 'پیشنهاد ارسال شد', dot: 'bg-violet-500', head: 'text-violet-700' },
  { id: 'NEGOTIATION', label: 'مذاکره', dot: 'bg-amber-500', head: 'text-amber-700' },
  { id: 'WON', label: 'فروش موفق', dot: 'bg-emerald-500', head: 'text-emerald-700' },
  { id: 'LOST', label: 'از دست رفت', dot: 'bg-rose-500', head: 'text-rose-700' },
];
const stageOf = (s: DealStage) => STAGES.find((x) => x.id === s) || STAGES[0];
const OPEN_STAGES: DealStage[] = ['NEW', 'CONTACTED', 'PROPOSAL', 'NEGOTIATION'];

const ACTIVITY: Record<ActivityType, { label: string; cls: string }> = {
  NOTE: { label: 'یادداشت', cls: 'bg-slate-100 text-slate-700' },
  CALL: { label: 'تماس', cls: 'bg-emerald-100 text-emerald-700' },
  MEETING: { label: 'جلسه', cls: 'bg-sky-100 text-sky-700' },
  FOLLOWUP: { label: 'پیگیری', cls: 'bg-violet-100 text-violet-700' },
};

const SOURCES = ['معرفی دوستان', 'وب‌سایت', 'تماس ورودی', 'نمایشگاه', 'شبکه‌های اجتماعی', 'مشتری قبلی'];

const uid = (p: string) => p + '-' + Math.random().toString(36).substring(2, 10);
const nowIso = () => new Date().toISOString();
const toman = (n: number) => new Intl.NumberFormat('fa-IR').format(Math.round(n || 0));
const parseNumber = (s: string) => {
  const latin = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9]/g, '');
  return latin ? parseInt(latin, 10) : 0;
};
const timeText = (iso: string) => `${formatTaskDate(iso.slice(0, 10))} · ${toPersianDigits(new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))}`;

const field =
  'w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-medium text-[#3A241F] outline-hidden focus:ring-2 focus:ring-violet-500/20 disabled:opacity-70';
const label = 'block text-[11px] font-black text-[#3A241F] mb-1.5';

export const CrmView: React.FC = () => {
  const { customers, setCustomers, deals, setDeals, activities, setActivities, staffList, currentUser, showToast, settings } = useAppContext();
  const me = currentUser.id;
  const isAdmin = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEPT_ADMIN';

  const [tab, setTab] = useState<'overview' | 'customers' | 'pipeline' | 'followups'>('overview');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CustomerStatus>('ALL');
  const [mineOnly, setMineOnly] = useState(false);
  const [openCustomer, setOpenCustomer] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingDeal, setEditingDeal] = useState<{ deal: Deal; isNew: boolean } | null>(null);
  const [voip, setVoip] = useState<{ enabled: boolean; connected: boolean; extension: string } | null>(null);
  const [proformaFor, setProformaFor] = useState<Deal | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [mobileStage, setMobileStage] = useState<DealStage>('NEW');
  const [followScope, setFollowScope] = useState<'mine' | 'all'>('mine');

  const userById = useMemo(() => new Map(staffList.map((u) => [u.id, u])), [staffList]);
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  useEffect(() => {
    api.voipStatus().then(setVoip).catch(() => {});
  }, []);

  // A notification about a customer / deal opens it.
  useEffect(() => {
    const openFromNotification = () => {
      try {
        const raw = sessionStorage.getItem('crm_open');
        if (!raw) return;
        sessionStorage.removeItem('crm_open');
        const { type, id } = JSON.parse(raw) as { type: string; id: string };
        if (type === 'customer') setOpenCustomer(id);
        if (type === 'deal') {
          const d = deals.find((x) => x.id === id);
          if (d) setEditingDeal({ deal: d, isNew: false });
        }
      } catch {
        /* ignore */
      }
    };
    openFromNotification();
    window.addEventListener('open-crm-item', openFromNotification);
    return () => window.removeEventListener('open-crm-item', openFromNotification);
  }, [deals]);

  // ---------- derived data ----------
  const lastActivity = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of activities) if (!m.has(a.customerId) || a.createdAt > m.get(a.customerId)!) m.set(a.customerId, a.createdAt);
    return m;
  }, [activities]);
  const openValueOf = (cid: string) => deals.filter((d) => d.customerId === cid && OPEN_STAGES.includes(d.stage)).reduce((s, d) => s + d.amount, 0);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers
      .filter((c) => (statusFilter === 'ALL' ? true : c.status === statusFilter))
      .filter((c) => (mineOnly ? c.ownerId === me : true))
      .filter((c) => !q || `${c.name} ${c.company || ''} ${c.phones.join(' ')} ${c.email || ''} ${c.tags.join(' ')}`.toLowerCase().includes(q))
      .sort((a, b) => (lastActivity.get(b.id) || b.updatedAt).localeCompare(lastActivity.get(a.id) || a.updatedAt));
  }, [customers, statusFilter, mineOnly, search, me, lastActivity]);

  const openFollowups = useMemo(() => activities.filter((a) => a.type === 'FOLLOWUP' && !a.done), [activities]);
  const overdueFollowups = openFollowups.filter((a) => a.dueDate && a.dueDate < todayIso());
  const todayFollowups = openFollowups.filter((a) => a.dueDate === todayIso());

  const month = new Date().toISOString().slice(0, 7);
  const stats = useMemo(
    () => ({
      customers: customers.length,
      openDeals: deals.filter((d) => OPEN_STAGES.includes(d.stage)),
      openValue: deals.filter((d) => OPEN_STAGES.includes(d.stage)).reduce((s, d) => s + d.amount, 0),
      wonMonth: deals.filter((d) => d.stage === 'WON' && (d.closedAt || '').startsWith(month)),
    }),
    [customers, deals, month]
  );

  // ---------- actions ----------
  const saveCustomer = (c: Customer) => {
    const next = { ...c, name: c.name.trim(), updatedAt: nowIso() };
    setCustomers((prev) => (prev.some((x) => x.id === next.id) ? prev.map((x) => (x.id === next.id ? next : x)) : [next, ...prev]));
    // keep the customer's name on its deals in sync
    setDeals((prev) => prev.map((d) => (d.customerId === next.id && d.customerName !== next.name ? { ...d, customerName: next.name } : d)));
  };
  const removeCustomer = (c: Customer) => {
    if (!window.confirm(`«${c.name}» با همهٔ فرصت‌ها و سابقه‌اش حذف شود؟ این کار قابل بازگشت نیست.`)) return;
    setCustomers((prev) => prev.filter((x) => x.id !== c.id));
    setDeals((prev) => prev.filter((x) => x.customerId !== c.id));
    setActivities((prev) => prev.filter((x) => x.customerId !== c.id));
    setOpenCustomer(null);
    setEditingCustomer(null);
    showToast('مشتری حذف شد.');
  };
  const saveDeal = (d: Deal) => {
    const customer = customerById.get(d.customerId);
    const next = { ...d, title: d.title.trim(), customerName: customer?.name || d.customerName, updatedAt: nowIso() };
    const before = deals.find((x) => x.id === next.id);
    setDeals((prev) => (prev.some((x) => x.id === next.id) ? prev.map((x) => (x.id === next.id ? next : x)) : [next, ...prev]));
    if (before && before.stage !== next.stage) {
      addActivity(next.customerId, 'NOTE', `مرحلهٔ فرصت «${next.title}» از «${stageOf(before.stage).label}» به «${stageOf(next.stage).label}» تغییر کرد.`, { dealId: next.id });
    }
  };
  const moveDeal = (id: string, stage: DealStage) => {
    const d = deals.find((x) => x.id === id);
    if (d && d.stage !== stage) {
      saveDeal({ ...d, stage });
      if (stage === 'PROPOSAL' && !d.proformaNumber) setProformaFor({ ...d, stage });
    }
  };
  const removeDeal = (d: Deal) => {
    if (!window.confirm(`فرصت «${d.title}» حذف شود؟`)) return;
    setDeals((prev) => prev.filter((x) => x.id !== d.id));
    setEditingDeal(null);
  };
  const addActivity = (customerId: string, type: ActivityType, text: string, extra: Partial<CrmActivity> = {}) => {
    const a: CrmActivity = {
      id: uid('ac'),
      customerId,
      type,
      text,
      ownerId: me,
      ownerName: currentUser.fullName,
      authorId: me,
      authorName: currentUser.fullName,
      createdAt: nowIso(),
      ...extra,
    };
    setActivities((prev) => [a, ...prev]);
  };
  const toggleDone = (a: CrmActivity) =>
    setActivities((prev) => prev.map((x) => (x.id === a.id ? { ...x, done: !x.done, doneAt: !x.done ? nowIso() : undefined } : x)));

  const call = async (number: string, name: string) => {
    try {
      await api.voipCall(number);
      showToast(`تلفن داخلی شما زنگ می‌خورد؛ با برداشتن گوشی با ${name} وصل می‌شوید.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'تماس برقرار نشد.');
    }
  };
  const canCall = !!voip?.enabled && !!voip.extension;
  const canDelete = (ownerId: string) => isAdmin || ownerId === me;

  const newCustomer = (): Customer => ({
    id: uid('cu'), name: '', company: '', phones: [], email: '', address: '', status: 'LEAD', source: '', tags: [],
    ownerId: me, ownerName: currentUser.fullName, notes: '', createdAt: nowIso(), updatedAt: nowIso(),
  });
  const newDeal = (customerId = ''): Deal => ({
    id: uid('dl'), title: '', customerId, customerName: customerById.get(customerId)?.name || '', amount: 0, stage: 'NEW',
    ownerId: me, ownerName: currentUser.fullName, expectedClose: undefined, notes: '', createdAt: nowIso(), updatedAt: nowIso(),
  });

  const tabs = [
    ['overview', 'خلاصه', TrendingUp],
    ['customers', 'مشتریان', Users],
    ['pipeline', 'فرصت‌های فروش', LayoutGrid],
    ['followups', 'پیگیری‌ها', ListChecks],
  ] as const;

  const customerCard = (c: Customer) => {
    const st = STATUS[c.status];
    const open = openValueOf(c.id);
    const last = lastActivity.get(c.id);
    return (
      <div key={c.id} onClick={() => setOpenCustomer(c.id)} className="bg-white border border-[#EBDBCE] rounded-2xl p-3.5 space-y-2 hover:shadow-md transition-all cursor-pointer text-right">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-black text-[13px] text-[#3A241F] truncate">{c.name}</div>
            {c.company && (
              <div className="text-[11px] text-[#8C6F66] flex items-center gap-1 truncate">
                <Building2 className="w-3 h-3 shrink-0" />
                {c.company}
              </div>
            )}
          </div>
          <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-[#8C6F66]">
          <span className="truncate" dir="ltr">
            {c.phones[0] ? toPersianDigits(c.phones[0]) : '—'}
          </span>
          {c.phones[0] && canCall && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void call(c.phones[0], c.name);
              }}
              className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 cursor-pointer"
              title="تماس با یک کلیک"
            >
              <PhoneCall className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between text-[10px] font-bold text-[#8C6F66]">
          <span className="flex items-center gap-1.5">
            <Avatar user={userById.get(c.ownerId)} size={20} />
            {c.ownerName}
          </span>
          <span>{open > 0 ? `${toman(open)} تومان در جریان` : last ? `آخرین تعامل: ${formatTaskDate(last.slice(0, 10))}` : ''}</span>
        </div>
      </div>
    );
  };

  const dealCard = (d: Deal) => {
    const overdue = !!d.expectedClose && OPEN_STAGES.includes(d.stage) && d.expectedClose < todayIso();
    return (
      <div
        key={d.id}
        draggable
        onDragStart={() => setDragId(d.id)}
        onDragEnd={() => setDragId(null)}
        onClick={() => setEditingDeal({ deal: d, isNew: false })}
        className={`bg-white rounded-2xl border p-3.5 space-y-2 text-right shadow-2xs hover:shadow-md transition-all cursor-pointer ${dragId === d.id ? 'opacity-40' : ''} ${overdue ? 'border-rose-300' : 'border-[#EBDBCE]'}`}
      >
        <div className="font-black text-[13px] text-[#3A241F] leading-6">{d.title}</div>
        <div className="text-[11px] text-[#8C6F66] flex items-center gap-1">
          <Building2 className="w-3 h-3" />
          {d.customerName}
        </div>
        <div className="flex items-center justify-between">
          <span className="font-black text-xs text-violet-700">{toman(d.amount)} تومان</span>
          <Avatar user={userById.get(d.ownerId)} size={22} />
        </div>
        {d.expectedClose && (
          <div className={`text-[10px] font-bold flex items-center gap-1 ${overdue ? 'text-rose-600' : 'text-[#8C6F66]'}`}>
            <CalendarDays className="w-3 h-3" />
            پیش‌بینی بستن: {formatTaskDate(d.expectedClose)}
            {overdue && ' (گذشته)'}
          </div>
        )}
      </div>
    );
  };

  const followRow = (a: CrmActivity) => {
    const c = customerById.get(a.customerId);
    const late = !!a.dueDate && a.dueDate < todayIso();
    return (
      <div key={a.id} className="flex items-center gap-3 bg-white border border-[#EBDBCE] rounded-2xl px-3.5 py-2.5">
        <button type="button" onClick={() => toggleDone(a)} title="انجام شد" className="shrink-0 cursor-pointer text-[#8C6F66] hover:text-emerald-600">
          <CheckCircle2 className="w-5 h-5" />
        </button>
        <button type="button" onClick={() => c && setOpenCustomer(c.id)} className="flex-1 min-w-0 text-right cursor-pointer">
          <div className="text-xs font-black text-[#3A241F] truncate">{a.text}</div>
          <div className="text-[10px] text-[#8C6F66] truncate">
            {c?.name || 'مشتری حذف‌شده'} · {a.ownerName}
          </div>
        </button>
        {a.dueDate && (
          <span className={`text-[10px] font-black shrink-0 ${late ? 'text-rose-600' : 'text-[#8C6F66]'}`}>{formatTaskDate(a.dueDate)}</span>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 p-3.5 sm:p-8 space-y-4 sm:space-y-5 pb-32 sm:pb-8 select-none overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-lg text-[#3A241F]">مشتریان و فروش</h2>
          <p className="text-xs text-[#8C6F66] mt-0.5">مشتری‌ها، فرصت‌های فروش و پیگیری‌ها؛ همه در یک‌جا.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setEditingDeal({ deal: newDeal(), isNew: true })}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 text-xs font-black cursor-pointer"
          >
            <Briefcase className="w-4 h-4" />
            فرصت جدید
          </button>
          <button
            onClick={() => setEditingCustomer(newCustomer())}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black shadow-md shadow-violet-600/25 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            مشتری جدید
          </button>
        </div>
      </div>

      <div className="flex bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-1 overflow-x-auto">
        {tabs.map(([id, text, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 sm:flex-initial whitespace-nowrap flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              tab === id ? 'bg-white text-violet-700 shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'
            }`}
          >
            <Icon className="w-4 h-4" />
            {text}
            {id === 'followups' && overdueFollowups.length > 0 && <span className="bg-rose-500 text-white text-[10px] rounded-full px-1.5">{toPersianDigits(overdueFollowups.length)}</span>}
          </button>
        ))}
      </div>

      {/* ---------- overview ---------- */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { l: 'مشتریان', v: toPersianDigits(stats.customers), i: Users, c: 'bg-violet-100 text-violet-700' },
              { l: `فرصت‌های در جریان (${toPersianDigits(stats.openDeals.length)})`, v: `${toman(stats.openValue)} تومان`, i: Briefcase, c: 'bg-sky-100 text-sky-700' },
              { l: `فروش موفق این ماه (${toPersianDigits(stats.wonMonth.length)})`, v: `${toman(stats.wonMonth.reduce((s, d) => s + d.amount, 0))} تومان`, i: Trophy, c: 'bg-emerald-100 text-emerald-700' },
              { l: 'پیگیری عقب‌افتاده', v: toPersianDigits(overdueFollowups.length), i: AlertTriangle, c: 'bg-rose-100 text-rose-700' },
            ].map((s) => (
              <div key={s.l} className="bg-white border border-[#EBDBCE] rounded-2xl p-3.5 flex items-center gap-3 min-w-0">
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.c}`}>
                  <s.i className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-black text-[#3A241F] truncate">{s.v}</div>
                  <div className="text-[11px] font-bold text-[#8C6F66] truncate">{s.l}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="bg-white border border-[#EBDBCE] rounded-3xl p-4 space-y-3">
              <h3 className="font-black text-sm text-[#3A241F]">قیف فروش</h3>
              {STAGES.filter((s) => OPEN_STAGES.includes(s.id)).map((s) => {
                const list = deals.filter((d) => d.stage === s.id);
                const total = list.reduce((x, d) => x + d.amount, 0);
                const max = Math.max(1, ...STAGES.filter((x) => OPEN_STAGES.includes(x.id)).map((x) => deals.filter((d) => d.stage === x.id).reduce((a, d) => a + d.amount, 0)));
                return (
                  <div key={s.id} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className={`flex items-center gap-1.5 ${s.head}`}>
                        <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                        {s.label} ({toPersianDigits(list.length)})
                      </span>
                      <span className="text-[#8C6F66]">{toman(total)} تومان</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#FAF5F1] overflow-hidden">
                      <div className={`h-full ${s.dot}`} style={{ width: `${(total / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="bg-white border border-[#EBDBCE] rounded-3xl p-4 space-y-2.5">
              <h3 className="font-black text-sm text-[#3A241F]">پیگیری‌های امروز و عقب‌افتاده</h3>
              {[...overdueFollowups, ...todayFollowups].length === 0 ? (
                <div className="text-center text-[11px] font-bold text-gray-400 py-6 border border-dashed border-[#EBDBCE] rounded-2xl">پیگیری فوری وجود ندارد.</div>
              ) : (
                [...overdueFollowups, ...todayFollowups].slice(0, 6).map(followRow)
              )}
            </section>
          </div>
        </div>
      )}

      {/* ---------- customers ---------- */}
      {tab === 'customers' && (
        <div className="space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#8C6F66] absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جستجوی نام، شرکت، شماره تلفن، ایمیل یا برچسب..." className="w-full pr-10 pl-4 py-2.5 bg-white border border-[#EBDBCE] rounded-2xl text-xs outline-hidden focus:ring-2 focus:ring-violet-500/20" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | CustomerStatus)} className="px-3 py-2 bg-white border border-[#EBDBCE] rounded-2xl text-[11px] font-black text-[#3A241F] outline-hidden cursor-pointer">
                <option value="ALL">همهٔ وضعیت‌ها</option>
                {(Object.keys(STATUS) as CustomerStatus[]).map((k) => (
                  <option key={k} value={k}>{STATUS[k].label}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-[11px] font-black text-[#3A241F] cursor-pointer bg-white border border-[#EBDBCE] rounded-2xl px-3 py-2">
                <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="accent-violet-600" />
                فقط مشتریان من
              </label>
            </div>
          </div>
          {filteredCustomers.length === 0 ? (
            <div className="text-center text-xs font-bold text-gray-400 py-14 bg-white border border-[#EBDBCE] rounded-3xl">
              {customers.length === 0 ? 'هنوز مشتری ثبت نشده است. با «مشتری جدید» شروع کنید.' : 'مشتری با این جستجو پیدا نشد.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{filteredCustomers.map(customerCard)}</div>
          )}
        </div>
      )}

      {/* ---------- pipeline ---------- */}
      {tab === 'pipeline' && (
        <div className="space-y-3">
          <div className="md:hidden flex gap-1.5 overflow-x-auto pb-1">
            {STAGES.map((s) => (
              <button key={s.id} type="button" onClick={() => setMobileStage(s.id)} className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-2xl text-[11px] font-black border cursor-pointer ${mobileStage === s.id ? 'bg-white border-violet-300 text-violet-700' : 'bg-[#FAF5F1] border-[#EBDBCE] text-[#8C6F66]'}`}>
                <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                {s.label}
                <span className="bg-[#EBDBCE]/70 rounded-full px-1.5 text-[10px]">{toPersianDigits(deals.filter((d) => d.stage === s.id).length)}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3 items-start">
            {STAGES.map((s) => {
              const list = deals.filter((d) => d.stage === s.id);
              return (
                <div
                  key={s.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragId) moveDeal(dragId, s.id);
                    setDragId(null);
                  }}
                  className={`${s.id === mobileStage ? '' : 'hidden'} md:block rounded-3xl p-2.5 space-y-2.5 border bg-[#FAF5F1]/70 border-[#EBDBCE]/70 min-h-[110px]`}
                >
                  <div className="flex items-center justify-between px-1">
                    <div className={`flex items-center gap-1.5 font-black text-[11px] ${s.head}`}>
                      <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                      {s.label}
                    </div>
                    <span className="text-[10px] font-black text-[#8C6F66]">{toPersianDigits(list.length)}</span>
                  </div>
                  <div className="text-[10px] font-bold text-[#8C6F66] px-1">{toman(list.reduce((x, d) => x + d.amount, 0))} تومان</div>
                  {list.map(dealCard)}
                  {list.length === 0 && <div className="text-center text-[10px] text-gray-400 font-bold py-4 border border-dashed border-[#EBDBCE] rounded-2xl">خالی</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- follow-ups ---------- */}
      {tab === 'followups' && (
        <div className="space-y-3">
          <div className="flex bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-1 w-fit">
            {([['mine', 'پیگیری‌های من'], ['all', 'همه']] as const).map(([id, text]) => (
              <button key={id} type="button" onClick={() => setFollowScope(id)} className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black cursor-pointer ${followScope === id ? 'bg-white text-violet-700 shadow-2xs' : 'text-[#8C6F66]'}`}>
                {text}
              </button>
            ))}
          </div>
          {(() => {
            const list = openFollowups.filter((a) => followScope === 'all' || a.ownerId === me).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'));
            const groups: [string, CrmActivity[]][] = [
              ['عقب‌افتاده', list.filter((a) => a.dueDate && a.dueDate < todayIso())],
              ['امروز', list.filter((a) => a.dueDate === todayIso())],
              ['بعداً', list.filter((a) => !a.dueDate || a.dueDate > todayIso())],
            ];
            if (list.length === 0) return <div className="text-center text-xs font-bold text-gray-400 py-14 bg-white border border-[#EBDBCE] rounded-3xl">پیگیری بازی وجود ندارد.</div>;
            return groups.map(([title, items]) =>
              items.length === 0 ? null : (
                <section key={title} className="space-y-2">
                  <h3 className={`text-xs font-black ${title === 'عقب‌افتاده' ? 'text-rose-600' : 'text-[#3A241F]'}`}>
                    {title} ({toPersianDigits(items.length)})
                  </h3>
                  {items.map(followRow)}
                </section>
              )
            );
          })()}
        </div>
      )}

      {/* ---------- modals ---------- */}
      {editingCustomer && (
        <CustomerForm
          initial={editingCustomer}
          isNew={!customers.some((c) => c.id === editingCustomer.id)}
          staff={staffList.filter((u) => u.isActive && (u.canUseCrm || u.role === 'SUPER_ADMIN' || u.role === 'DEPT_ADMIN'))}
          canDelete={canDelete(editingCustomer.ownerId) && customers.some((c) => c.id === editingCustomer.id)}
          onClose={() => setEditingCustomer(null)}
          onSave={(c) => {
            const isNew = !customers.some((x) => x.id === c.id);
            saveCustomer(c);
            setEditingCustomer(null);
            showToast(isNew ? 'مشتری ثبت شد.' : 'اطلاعات مشتری ذخیره شد.');
            if (isNew) setOpenCustomer(c.id);
          }}
          onDelete={() => removeCustomer(editingCustomer)}
        />
      )}

      {editingDeal && (
        <DealForm
          initial={editingDeal.deal}
          isNew={editingDeal.isNew}
          customers={customers}
          staff={staffList.filter((u) => u.isActive && (u.canUseCrm || u.role === 'SUPER_ADMIN' || u.role === 'DEPT_ADMIN'))}
          canDelete={!editingDeal.isNew && canDelete(editingDeal.deal.ownerId)}
          onClose={() => setEditingDeal(null)}
          onProforma={(d) => {
            saveDeal(d);
            setEditingDeal(null);
            setProformaFor(d);
          }}
          onSave={(d) => {
            saveDeal(d);
            setEditingDeal(null);
            if (d.stage === 'PROPOSAL' && editingDeal.deal.stage !== 'PROPOSAL' && !d.proformaNumber) setProformaFor(d);
            showToast(editingDeal.isNew ? 'فرصت فروش ثبت شد.' : 'فرصت ذخیره شد.');
          }}
          onDelete={() => removeDeal(editingDeal.deal)}
        />
      )}

      {proformaFor && (
        <ProformaModal
          deal={proformaFor}
          allDeals={deals}
          customer={customerById.get(proformaFor.customerId)}
          settings={settings}
          issuerName={currentUser.fullName}
          onClose={() => setProformaFor(null)}
          onSave={(d) => {
            setDeals((prev) => prev.map((x) => (x.id === d.id ? { ...x, ...d, updatedAt: nowIso() } : x)));
            showToast('پیش‌فاکتور ذخیره شد.');
          }}
        />
      )}

      {openCustomer && customerById.get(openCustomer) && (
        <CustomerDetail
          customer={customerById.get(openCustomer)!}
          deals={deals.filter((d) => d.customerId === openCustomer)}
          activities={activities.filter((a) => a.customerId === openCustomer).sort((a, b) => b.createdAt.localeCompare(a.createdAt))}
          staff={staffList.filter((u) => u.isActive && (u.canUseCrm || u.role === 'SUPER_ADMIN' || u.role === 'DEPT_ADMIN'))}
          me={currentUser}
          canCall={canCall}
          onCall={call}
          onClose={() => setOpenCustomer(null)}
          onEdit={() => {
            setEditingCustomer(customerById.get(openCustomer)!);
          }}
          onNewDeal={() => setEditingDeal({ deal: newDeal(openCustomer), isNew: true })}
          onOpenDeal={(d) => setEditingDeal({ deal: d, isNew: false })}
          onAddActivity={(type, text, extra) => addActivity(openCustomer, type, text, extra)}
          onToggle={toggleDone}
          onDeleteActivity={(a) => setActivities((prev) => prev.filter((x) => x.id !== a.id))}
        />
      )}
    </div>
  );
};

// ======================= customer form =======================

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, footer, wide }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={onClose}>
    <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className={`bg-white rounded-3xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} max-h-[92vh] flex flex-col border border-[#EBDBCE] text-right`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE]">
        <h3 className="font-black text-sm text-[#3A241F] truncate">{title}</h3>
        <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-5 space-y-4 overflow-y-auto">{children}</div>
      <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#EBDBCE]">{footer}</div>
    </div>
  </div>
);

const CustomerForm: React.FC<{
  initial: Customer;
  isNew: boolean;
  staff: User[];
  canDelete: boolean;
  onClose: () => void;
  onSave: (c: Customer) => void;
  onDelete: () => void;
}> = ({ initial, isNew, staff, canDelete, onClose, onSave, onDelete }) => {
  const [c, setC] = useState<Customer>(initial);
  const [phoneDraft, setPhoneDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const patch = (u: Partial<Customer>) => setC((p) => ({ ...p, ...u }));
  const addPhone = () => {
    const v = phoneDraft.replace(/[^0-9+]/g, '');
    if (v && !c.phones.includes(v)) patch({ phones: [...c.phones, v] });
    setPhoneDraft('');
  };
  const addTag = () => {
    const v = tagDraft.trim();
    if (v && !c.tags.includes(v)) patch({ tags: [...c.tags, v] });
    setTagDraft('');
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!c.name.trim()) return;
    const phones = phoneDraft.replace(/[^0-9+]/g, '') ? [...c.phones, phoneDraft.replace(/[^0-9+]/g, '')] : c.phones;
    const owner = staff.find((u) => u.id === c.ownerId);
    onSave({ ...c, phones: [...new Set(phones)], ownerName: owner?.fullName || c.ownerName });
  };
  return (
    <form onSubmit={submit}>
      <Modal
        title={isNew ? 'مشتری جدید' : 'ویرایش مشتری'}
        onClose={onClose}
        footer={
          <>
            <div>
              {canDelete && (
                <button type="button" onClick={onDelete} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-rose-600 hover:bg-rose-50 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                  حذف مشتری
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">انصراف</button>
              <button type="submit" disabled={!c.name.trim()} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer">{isNew ? 'ثبت مشتری' : 'ذخیره'}</button>
            </div>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>نام مشتری *</label>
            <input className={field} value={c.name} onChange={(e) => patch({ name: e.target.value })} autoFocus={isNew} placeholder="نام و نام خانوادگی" />
          </div>
          <div>
            <label className={label}>شرکت / سازمان</label>
            <input className={field} value={c.company || ''} onChange={(e) => patch({ company: e.target.value })} />
          </div>
        </div>

        <div>
          <label className={label}>شمارهٔ تلفن</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {c.phones.map((p) => (
              <span key={p} className="flex items-center gap-1 bg-[#FAF5F1] border border-[#EBDBCE] rounded-full pl-1.5 pr-3 py-1 text-xs font-bold text-[#3A241F]" dir="ltr">
                {toPersianDigits(p)}
                <button type="button" onClick={() => patch({ phones: c.phones.filter((x) => x !== p) })} className="text-rose-500 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={field}
              dir="ltr"
              inputMode="tel"
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addPhone();
                }
              }}
              placeholder="مثلاً 09121234567"
            />
            <button type="button" onClick={addPhone} className="px-3 rounded-xl bg-[#3A241F] text-white text-xs font-black cursor-pointer shrink-0">افزودن</button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>ایمیل</label>
            <input className={field} dir="ltr" value={c.email || ''} onChange={(e) => patch({ email: e.target.value })} />
          </div>
          <div>
            <label className={label}>آدرس</label>
            <input className={field} value={c.address || ''} onChange={(e) => patch({ address: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={label}>وضعیت</label>
            <select className={field} value={c.status} onChange={(e) => patch({ status: e.target.value as CustomerStatus })}>
              {(Object.keys(STATUS) as CustomerStatus[]).map((k) => (
                <option key={k} value={k}>{STATUS[k].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>منبع آشنایی</label>
            <input className={field} list="crm-sources" value={c.source || ''} onChange={(e) => patch({ source: e.target.value })} />
            <datalist id="crm-sources">
              {SOURCES.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={label}>مسئول پیگیری</label>
            <select className={field} value={c.ownerId} onChange={(e) => patch({ ownerId: e.target.value })}>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={label}>برچسب‌ها</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {c.tags.map((t) => (
              <span key={t} className="flex items-center gap-1 bg-violet-50 text-violet-800 border border-violet-200 rounded-full pl-1.5 pr-3 py-1 text-[11px] font-bold">
                {t}
                <button type="button" onClick={() => patch({ tags: c.tags.filter((x) => x !== t) })} className="cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <input
            className={field}
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={addTag}
            placeholder="برچسب را بنویسید و Enter بزنید (مثلاً VIP)"
          />
        </div>

        <div>
          <label className={label}>توضیحات</label>
          <textarea className={`${field} min-h-[80px] leading-6`} value={c.notes || ''} onChange={(e) => patch({ notes: e.target.value })} />
        </div>
      </Modal>
    </form>
  );
};

// ======================= deal form =======================

const DealForm: React.FC<{
  initial: Deal;
  isNew: boolean;
  customers: Customer[];
  staff: User[];
  canDelete: boolean;
  onClose: () => void;
  onSave: (d: Deal) => void;
  onProforma: (d: Deal) => void;
  onDelete: () => void;
}> = ({ initial, isNew, customers, staff, canDelete, onClose, onSave, onProforma, onDelete }) => {
  const [d, setD] = useState<Deal>(initial);
  const [amountText, setAmountText] = useState(initial.amount ? toman(initial.amount) : '');
  const patch = (u: Partial<Deal>) => setD((p) => ({ ...p, ...u }));
  const valid = d.title.trim() && d.customerId;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const owner = staff.find((u) => u.id === d.ownerId);
    onSave({ ...d, ownerName: owner?.fullName || d.ownerName });
  };
  return (
    <form onSubmit={submit}>
      <Modal
        title={isNew ? 'فرصت فروش جدید' : 'ویرایش فرصت فروش'}
        onClose={onClose}
        footer={
          <>
            <div>
              {canDelete && (
                <button type="button" onClick={onDelete} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-rose-600 hover:bg-rose-50 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                  حذف
                </button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">انصراف</button>
              {valid && (
                <button type="button" onClick={() => onProforma({ ...d, ownerName: staff.find((u) => u.id === d.ownerId)?.fullName || d.ownerName })} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-violet-700 bg-violet-50 hover:bg-violet-100 cursor-pointer">
                  <FileText className="w-4 h-4" />
                  پیش‌فاکتور
                </button>
              )}
              <button type="submit" disabled={!valid} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer">{isNew ? 'ثبت فرصت' : 'ذخیره'}</button>
            </div>
          </>
        }
      >
        <div>
          <label className={label}>عنوان فرصت *</label>
          <input className={field} value={d.title} onChange={(e) => patch({ title: e.target.value })} autoFocus={isNew} placeholder="مثلاً: قرارداد پشتیبانی سالانه" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>مشتری *</label>
            <select className={field} value={d.customerId} onChange={(e) => patch({ customerId: e.target.value })}>
              <option value="">انتخاب مشتری...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>مبلغ (تومان)</label>
            <input
              className={field}
              inputMode="numeric"
              value={amountText}
              onChange={(e) => {
                const n = parseNumber(e.target.value);
                setAmountText(n ? toman(n) : '');
                patch({ amount: n });
              }}
              placeholder="۰"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>مرحله</label>
            <select className={field} value={d.stage} onChange={(e) => patch({ stage: e.target.value as DealStage })}>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>مسئول</label>
            <select className={field} value={d.ownerId} onChange={(e) => patch({ ownerId: e.target.value })}>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={label}>تاریخ پیش‌بینی‌شدهٔ بستن</label>
          <JalaliDateField value={d.expectedClose} onChange={(v) => patch({ expectedClose: v })} />
        </div>
        <div>
          <label className={label}>توضیحات</label>
          <textarea className={`${field} min-h-[80px] leading-6`} value={d.notes || ''} onChange={(e) => patch({ notes: e.target.value })} />
        </div>
      </Modal>
    </form>
  );
};

// ======================= customer detail =======================

const CustomerDetail: React.FC<{
  customer: Customer;
  deals: Deal[];
  activities: CrmActivity[];
  staff: User[];
  me: User;
  canCall: boolean;
  onCall: (number: string, name: string) => void;
  onClose: () => void;
  onEdit: () => void;
  onNewDeal: () => void;
  onOpenDeal: (d: Deal) => void;
  onAddActivity: (type: ActivityType, text: string, extra?: Partial<CrmActivity>) => void;
  onToggle: (a: CrmActivity) => void;
  onDeleteActivity: (a: CrmActivity) => void;
}> = ({ customer: c, deals, activities, staff, me, canCall, onCall, onClose, onEdit, onNewDeal, onOpenDeal, onAddActivity, onToggle, onDeleteActivity }) => {
  const [type, setType] = useState<ActivityType>('NOTE');
  const [text, setText] = useState('');
  const [due, setDue] = useState<string | undefined>(undefined);
  const [owner, setOwner] = useState(me.id);
  const isAdmin = me.role === 'SUPER_ADMIN' || me.role === 'DEPT_ADMIN';
  const st = STATUS[c.status];

  const add = () => {
    const t = text.trim();
    if (!t) return;
    if (type === 'FOLLOWUP' && !due) {
      window.alert('برای پیگیری، تاریخ را انتخاب کنید.');
      return;
    }
    const o = staff.find((u) => u.id === owner);
    onAddActivity(type, t, type === 'FOLLOWUP' ? { dueDate: due, done: false, ownerId: owner, ownerName: o?.fullName || me.fullName } : {});
    setText('');
    setDue(undefined);
  };

  return (
    <Modal
      wide
      title={c.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onEdit} className="px-4 py-2 rounded-xl text-xs font-black text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 cursor-pointer">ویرایش مشتری</button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">بستن</button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
        {c.company && (
          <span className="flex items-center gap-1 text-[11px] font-bold text-[#8C6F66]">
            <Building2 className="w-3.5 h-3.5" />
            {c.company}
          </span>
        )}
        <span className="flex items-center gap-1 text-[11px] font-bold text-[#8C6F66]">
          <Users className="w-3.5 h-3.5" />
          مسئول: {c.ownerName}
        </span>
        {c.source && <span className="text-[11px] font-bold text-[#8C6F66]">منبع: {c.source}</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {c.phones.map((p) => (
          <div key={p} className="flex items-center justify-between bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl px-3 py-2">
            <span className="text-xs font-black text-[#3A241F]" dir="ltr">{toPersianDigits(p)}</span>
            {canCall && (
              <button type="button" onClick={() => onCall(p, c.name)} className="flex items-center gap-1 text-[11px] font-black text-emerald-700 hover:underline cursor-pointer">
                <PhoneCall className="w-3.5 h-3.5" />
                تماس
              </button>
            )}
          </div>
        ))}
        {c.email && (
          <div className="flex items-center gap-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl px-3 py-2 text-xs font-bold text-[#3A241F] min-w-0">
            <Mail className="w-3.5 h-3.5 shrink-0 text-[#8C6F66]" />
            <span className="truncate" dir="ltr">{c.email}</span>
          </div>
        )}
        {c.address && (
          <div className="flex items-center gap-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl px-3 py-2 text-xs font-bold text-[#3A241F] min-w-0">
            <MapPin className="w-3.5 h-3.5 shrink-0 text-[#8C6F66]" />
            <span className="truncate">{c.address}</span>
          </div>
        )}
      </div>
      {c.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {c.tags.map((t) => (
            <span key={t} className="bg-violet-50 text-violet-800 border border-violet-200 rounded-full px-2.5 py-0.5 text-[11px] font-bold">{t}</span>
          ))}
        </div>
      )}
      {c.notes && <p className="text-xs leading-6 text-[#3A241F] bg-amber-50/50 border border-amber-100 rounded-xl px-3 py-2 whitespace-pre-wrap">{c.notes}</p>}

      {/* deals */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-black text-xs text-[#3A241F]">فرصت‌های فروش ({toPersianDigits(deals.length)})</h4>
          <button type="button" onClick={onNewDeal} className="flex items-center gap-1 text-[11px] font-black text-violet-700 hover:underline cursor-pointer">
            <Plus className="w-3.5 h-3.5" />
            فرصت جدید
          </button>
        </div>
        {deals.length === 0 ? (
          <div className="text-center text-[11px] text-gray-400 font-bold py-3 border border-dashed border-[#EBDBCE] rounded-xl">فرصتی ثبت نشده است.</div>
        ) : (
          deals.map((d) => {
            const s = stageOf(d.stage);
            return (
              <button key={d.id} type="button" onClick={() => onOpenDeal(d)} className="w-full flex items-center justify-between gap-2 bg-white border border-[#EBDBCE] rounded-xl px-3 py-2 text-right hover:shadow-sm cursor-pointer">
                <span className="text-xs font-black text-[#3A241F] truncate">{d.title}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] font-black text-violet-700">{toman(d.amount)} ت</span>
                  <span className={`text-[10px] font-black flex items-center gap-1 ${s.head}`}>
                    <span className={`w-2 h-2 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </section>

      {/* timeline */}
      <section className="space-y-2.5">
        <h4 className="font-black text-xs text-[#3A241F]">سابقهٔ تعامل</h4>
        <div className="bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ACTIVITY) as ActivityType[]).map((k) => (
              <button key={k} type="button" onClick={() => setType(k)} className={`px-3 py-1.5 rounded-xl text-[11px] font-black cursor-pointer border ${type === k ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>
                {ACTIVITY[k].label}
              </button>
            ))}
          </div>
          <textarea className={`${field} min-h-[64px] leading-6`} value={text} onChange={(e) => setText(e.target.value)} placeholder={type === 'FOLLOWUP' ? 'چه کاری باید پیگیری شود؟' : type === 'CALL' ? 'خلاصهٔ تماس...' : type === 'MEETING' ? 'خلاصهٔ جلسه...' : 'یادداشت...'} />
          {type === 'FOLLOWUP' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={label}>تاریخ پیگیری</label>
                <JalaliDateField value={due} onChange={setDue} />
              </div>
              <div>
                <label className={label}>مسئول پیگیری</label>
                <select className={field} value={owner} onChange={(e) => setOwner(e.target.value)}>
                  {staff.map((u) => (
                    <option key={u.id} value={u.id}>{u.fullName}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <button type="button" onClick={add} disabled={!text.trim()} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-black cursor-pointer">
            <MessageSquare className="w-4 h-4" />
            ثبت در سابقه
          </button>
        </div>

        <div className="space-y-2">
          {activities.map((a) => {
            const t = ACTIVITY[a.type];
            const late = a.type === 'FOLLOWUP' && !a.done && isOverdue(a.dueDate, false);
            return (
              <div key={a.id} className="flex items-start gap-2.5 bg-white border border-[#EBDBCE] rounded-xl px-3 py-2.5">
                {a.type === 'FOLLOWUP' ? (
                  <button type="button" onClick={() => onToggle(a)} title={a.done ? 'بازگرداندن' : 'انجام شد'} className={`mt-0.5 shrink-0 cursor-pointer ${a.done ? 'text-emerald-600' : 'text-[#8C6F66] hover:text-emerald-600'}`}>
                    <CheckCircle2 className="w-5 h-5" />
                  </button>
                ) : (
                  <span className={`mt-0.5 shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${t.cls}`}>{t.label}</span>
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-6 whitespace-pre-wrap ${a.done ? 'line-through text-gray-400' : 'text-[#3A241F]'}`}>{a.text}</p>
                  <div className="text-[10px] text-[#8C6F66] font-bold flex flex-wrap gap-x-3">
                    <span>{a.authorName}</span>
                    <span>{timeText(a.createdAt)}</span>
                    {a.type === 'FOLLOWUP' && a.dueDate && (
                      <span className={`flex items-center gap-1 ${late ? 'text-rose-600' : ''}`}>
                        <Clock className="w-3 h-3" />
                        موعد: {formatTaskDate(a.dueDate)}
                        {a.ownerId !== a.authorId && ` · مسئول: ${a.ownerName}`}
                      </span>
                    )}
                  </div>
                </div>
                {(isAdmin || a.authorId === me.id) && (
                  <button type="button" onClick={() => window.confirm('این مورد حذف شود؟') && onDeleteActivity(a)} className="text-gray-300 hover:text-rose-500 cursor-pointer shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
          {activities.length === 0 && <div className="text-center text-[11px] text-gray-400 font-bold py-4">هنوز تعاملی ثبت نشده است.</div>}
        </div>
      </section>
    </Modal>
  );
};
