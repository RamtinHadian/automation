import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Clock,
  LayoutGrid,
  ListChecks,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  PhoneCall,
  Smartphone,
  Plus,
  ShieldCheck,
  Search,
  Trash2,
  TrendingUp,
  Trophy,
  Users,
  X,
  BarChart3,
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, isOverdue, todayIso } from '../../lib/taskDates';
import { ActivityType, CrmActivity, Customer, CustomerStatus, Deal, DealStage, User, Warranty } from '../../types';
import { Avatar, JalaliDateField } from '../tasks/TasksView';
import { ProformaModal } from './ProformaModal';
import { CallList } from '../common/CallLog';
import { SmsModal } from './SmsModal';
import { CustomerForm } from './CustomerForm';
import { ProformaSection } from './ProformaSection';
import { QuickProformaDialog } from './QuickProformaDialog';
import { formatMoney, formatNumber, fromDisplay, unitName, unitShort } from '../../lib/money';
import { callerNameOnly, normPhone, normText } from '../../lib/customerImport';
import { remainingText, STATE_LABEL, warrantyState } from '../../lib/warranty';
import { approvalRequired, canApproveProforma, isAnyApprover } from '../../lib/proformaApproval';
import { CustomerReportModal } from './CustomerReportModal';
import { Modal, field, label, SOURCES } from './crmUi';
import { CustomerImportModal } from './CustomerImportModal';
import type { VoipCall } from '../../lib/api';

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
  MISSING: { label: 'کالای ناموجود', cls: 'bg-rose-100 text-rose-700' },
};


const uid = (p: string) => p + '-' + Math.random().toString(36).substring(2, 10);
const nowIso = () => new Date().toISOString();
const toman = formatMoney;
const parseNumber = (s: string) => {
  const latin = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9]/g, '');
  return latin ? parseInt(latin, 10) : 0;
};
const timeText = (iso: string) => `${formatTaskDate(iso.slice(0, 10))} · ${toPersianDigits(new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))}`;


export const CrmView: React.FC = () => {
  const { customers, setCustomers, deals, setDeals, activities, setActivities, staffList, currentUser, showToast, settings } = useAppContext();
  const me = currentUser.id;
  const isAdmin = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEPT_ADMIN';

  const [tab, setTab] = useState<'overview' | 'customers' | 'pipeline' | 'followups' | 'proformas'>('overview');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | CustomerStatus>('ALL');
  const [mineOnly, setMineOnly] = useState(false);
  const [openCustomer, setOpenCustomer] = useState<string | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [importing, setImporting] = useState(false);
  const [editingDeal, setEditingDeal] = useState<{ deal: Deal; isNew: boolean } | null>(null);
  const [voip, setVoip] = useState<{ enabled: boolean; connected: boolean; extension: string } | null>(null);
  const [proformaFor, setProformaFor] = useState<Deal | null>(null);
  const [quickProforma, setQuickProforma] = useState(false);
  // a customer made from inside another window (new opportunity / proforma) is handed back to it when saved
  const [customerCb, setCustomerCb] = useState<((c: Customer) => void) | null>(null);
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
        const { type, id, phone, name } = JSON.parse(raw) as { type: string; id: string; phone?: string; name?: string };
        if (type === 'newCustomer') {
          setTab('customers');
          setEditingCustomer({ ...newCustomer(), phones: phone ? [normPhone(phone) || phone] : [], name: callerNameOnly(name, phone), source: 'تماس تلفنی' });
          return;
        }
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
      .filter((c) => !q || `${c.name} ${c.company || ''} ${c.phones.join(' ')} ${c.email || ''} ${c.tags.join(' ')} ${c.nationalCode || ''} ${c.nationalId || ''} ${c.economicCode || ''} ${c.city || ''} ${c.referrer?.name || ''}`.toLowerCase().includes(q))
      .sort((a, b) => (lastActivity.get(b.id) || b.updatedAt).localeCompare(lastActivity.get(a.id) || a.updatedAt));
  }, [customers, statusFilter, mineOnly, search, me, lastActivity]);

  // Marketing: who brought how many customers and how much sale (won deals) came from them.
  const referrerStats = useMemo(() => {
    const wonByCustomer = new Map<string, number>();
    for (const d of deals) if (d.stage === 'WON') wonByCustomer.set(d.customerId, (wonByCustomer.get(d.customerId) || 0) + d.amount);
    const map = new Map<string, { key: string; name: string; kind: string; count: number; won: number }>();
    for (const c of customers) {
      const r = c.referrer;
      if (!r || !r.name.trim()) continue;
      const key = r.id ? `${r.kind}:${r.id}` : `${r.kind}:${r.name.trim()}`;
      const row = map.get(key) || { key, name: r.name.trim(), kind: r.kind, count: 0, won: 0 };
      row.count += 1;
      row.won += wonByCustomer.get(c.id) || 0;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.won - a.won || b.count - a.count);
  }, [customers, deals]);

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

  const startCustomerFor = (cb: (c: Customer) => void) => {
    setCustomerCb(() => cb);
    setEditingCustomer(newCustomer());
  };
  const newCustomer = (): Customer => ({
    id: uid('cu'), name: '', company: '', phones: [], email: '', address: '', status: 'LEAD', source: '', tags: [],
    ownerId: me, ownerName: currentUser.fullName, notes: '', createdAt: nowIso(), updatedAt: nowIso(),
  });
  const newDeal = (customerId = ''): Deal => ({
    id: uid('dl'), title: '', customerId, customerName: customerById.get(customerId)?.name || '', amount: 0, stage: 'NEW',
    ownerId: me, ownerName: currentUser.fullName, createdById: me, createdByName: currentUser.fullName, expectedClose: undefined, notes: '', createdAt: nowIso(), updatedAt: nowIso(),
  });

  const mine = (d: Deal) => canApproveProforma(currentUser, settings, d.proformaIssuerId);
  const pendingProformas = deals.filter((d) => d.proformaApproval?.status === 'PENDING' && mine(d));
  const baseTabs = [
    ['overview', 'خلاصه', TrendingUp],
    ['customers', 'مشتریان', Users],
    ['pipeline', 'فرصت‌های فروش', LayoutGrid],
    ['followups', 'پیگیری‌ها', ListChecks],
  ] as const;
  // the CEO also has «پیش‌فاکتورهای ارسالی»: what waits for the signature and what was signed
  const tabs = isAnyApprover(currentUser, settings) ? ([...baseTabs, ['proformas', 'پیش‌فاکتورهای ارسالی', FileText]] as const) : baseTabs;

  const customerCard = (c: Customer) => {
    const st = STATUS[c.status];
    const open = openValueOf(c.id);
    const last = lastActivity.get(c.id);
    return (
      <div key={c.id} onClick={() => setOpenCustomer(c.id)} className="bg-white border border-[#EBDBCE] rounded-2xl p-3.5 space-y-2 hover:shadow-md transition-all cursor-pointer text-right">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-black text-[13px] text-[#3A241F] truncate">{c.name}</div>
            {c.company && c.company !== c.name && (
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
            {userById.get(c.ownerId)?.fullName || c.ownerName}
          </span>
          <span>{open > 0 ? `${toman(open)} ${unitName()} در جریان` : last ? `آخرین تعامل: ${formatTaskDate(last.slice(0, 10))}` : ''}</span>
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
        {d.productCode && <div className="text-[10px] font-black text-violet-700 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5 w-fit" dir="ltr">{toPersianDigits(d.productCode)}</div>}
        {approvalRequired(settings, d.proformaIssuerId) && d.proformaApproval && (
          <div
            className={`text-[10px] font-black rounded-full px-2 py-0.5 w-fit border ${
              d.proformaApproval.status === 'APPROVED'
                ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                : d.proformaApproval.status === 'REJECTED'
                  ? 'text-rose-700 bg-rose-50 border-rose-200'
                  : 'text-amber-800 bg-amber-50 border-amber-200'
            }`}
          >
            پیش‌فاکتور: {d.proformaApproval.status === 'APPROVED' ? 'تایید شد' : d.proformaApproval.status === 'REJECTED' ? 'رد شد' : 'منتظر تایید مدیرعامل'}
          </div>
        )}
        <div className="text-[11px] text-[#8C6F66] flex items-center gap-1">
          <Building2 className="w-3 h-3" />
          {d.customerName}
        </div>
        <div className="flex items-center justify-between">
          <span className="font-black text-xs text-violet-700">{toman(d.amount)} {unitName()}</span>
        </div>
        {/* the full name(s) of who is on this opportunity, under the price */}
        {(() => {
          const names = [userById.get(d.ownerId)?.fullName || d.ownerName, ...(d.coOwnerIds || []).map((id, i) => userById.get(id)?.fullName || d.coOwnerNames?.[i] || '')].filter(Boolean);
          return names.length > 0 ? (
            <div className="text-[11px] font-bold text-[#503730] leading-5 break-words" title="مسئول پیگیری">
              <span className="text-[#8C6F66] font-medium">مسئول: </span>
              {names.join('، ')}
            </div>
          ) : null;
        })()}
        {/* who created this opportunity (the full name, written by the server when it was created) */}
        <div className="text-[11px] font-bold text-[#503730] leading-5 break-words" title={d.createdByGuess ? 'سازندهٔ این فرصت دقیق ثبت نشده بود؛ از روی مسئول فرصت پر شده است' : 'ایجادکنندهٔ این فرصت'}>
          <span className="text-[#8C6F66] font-medium">ایجاد شده توسط: </span>
          {userById.get(d.createdById || '')?.fullName || d.createdByName || d.ownerName || <span className="text-[#8C6F66] font-medium">نامشخص</span>}
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
        <div className="grid grid-cols-2 sm:flex gap-2">
          <button
            onClick={() => setImporting(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-0 rounded-2xl bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-black cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            ورود از اکسل
          </button>
          <button
            onClick={() => setEditingDeal({ deal: newDeal(), isNew: true })}
            className="flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-0 rounded-2xl bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 text-xs font-black cursor-pointer"
          >
            <Briefcase className="w-4 h-4" />
            فرصت جدید
          </button>
          <button
            onClick={() => setQuickProforma(true)}
            className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] sm:min-h-0 rounded-2xl bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-black cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            صدور پیش‌فاکتور
          </button>
          <button
            onClick={() => setEditingCustomer(newCustomer())}
            className="order-first sm:order-none col-span-2 sm:col-span-1 flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] sm:min-h-0 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black shadow-md shadow-violet-600/25 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            مشتری جدید
          </button>
        </div>
      </div>

      <div className="flex flex-wrap sm:flex-nowrap gap-1 bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-1 sm:overflow-x-auto">
        {tabs.map(([id, text, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 basis-[45%] sm:basis-auto sm:flex-initial min-h-[44px] sm:min-h-0 whitespace-nowrap flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
              tab === id ? 'bg-white text-violet-700 shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'
            }`}
          >
            <Icon className="w-4 h-4" />
            {text}
            {id === 'proformas' && pendingProformas.length > 0 && <span className="bg-amber-500 text-white text-[10px] rounded-full px-1.5">{toPersianDigits(pendingProformas.length)}</span>}
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
              { l: `فرصت‌های در جریان (${toPersianDigits(stats.openDeals.length)})`, v: `${toman(stats.openValue)} ${unitName()}`, i: Briefcase, c: 'bg-sky-100 text-sky-700' },
              { l: `فروش موفق این ماه (${toPersianDigits(stats.wonMonth.length)})`, v: `${toman(stats.wonMonth.reduce((s, d) => s + d.amount, 0))} ${unitName()}`, i: Trophy, c: 'bg-emerald-100 text-emerald-700' },
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

          {pendingProformas.length > 0 && (
            <section className="bg-amber-50/70 border border-amber-200 rounded-3xl p-4 space-y-2.5">
              <h3 className="font-black text-sm text-amber-900">پیش‌فاکتورهای منتظر تایید شما</h3>
              {pendingProformas
                .map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 bg-white border border-amber-200 rounded-2xl px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="font-black text-xs text-[#3A241F] truncate">{d.title}</div>
                      <div className="text-[11px] text-[#8C6F66] truncate">
                        {d.customerName} · {toman(d.amount)} {unitName()} · ارسال‌کننده: {d.proformaApproval?.requestedByName || d.ownerName}
                      </div>
                    </div>
                    <button type="button" onClick={() => setProformaFor(d)} className="shrink-0 px-3.5 py-1.5 rounded-xl text-[11px] font-black text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer">
                      بررسی و تایید
                    </button>
                  </div>
                ))}
            </section>
          )}

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
                      <span className="text-[#8C6F66]">{toman(total)} {unitName()}</span>
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

          <section className="bg-white border border-[#EBDBCE] rounded-3xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-black text-sm text-[#3A241F]">معرف‌ها و بازاریابی</h3>
              <span className="text-[11px] font-bold text-[#8C6F66]">
                {toPersianDigits(customers.filter((c) => c.referrer?.name).length)} از {toPersianDigits(customers.length)} مشتری با معرف
              </span>
            </div>
            {referrerStats.length === 0 ? (
              <div className="text-center text-[11px] font-bold text-gray-400 py-6 border border-dashed border-[#EBDBCE] rounded-2xl">هنوز معرفی ثبت نشده است؛ در فرم مشتری، بخش «بازاریابی» معرف را مشخص کنید.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-[#8C6F66]">
                    <tr>
                      <th className="text-right font-black py-1.5">معرف</th>
                      <th className="text-right font-black py-1.5">نوع</th>
                      <th className="text-right font-black py-1.5">مشتریان معرفی‌شده</th>
                      <th className="text-right font-black py-1.5">فروش موفق از آن‌ها</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrerStats.slice(0, 8).map((r) => (
                      <tr key={r.key} className="border-t border-[#EBDBCE]/60">
                        <td className="py-2 font-black text-[#3A241F]">{r.name}</td>
                        <td className="py-2 text-[#8C6F66]">{r.kind === 'CUSTOMER' ? 'مشتری' : r.kind === 'STAFF' ? 'همکار' : 'دیگر'}</td>
                        <td className="py-2 font-bold">{toPersianDigits(r.count)}</td>
                        <td className="py-2 font-bold text-emerald-700">{toman(r.won)} {unitName()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
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
                  <div className="text-[10px] font-bold text-[#8C6F66] px-1">{toman(list.reduce((x, d) => x + d.amount, 0))} {unitName()}</div>
                  {list.map(dealCard)}
                  {list.length === 0 && <div className="text-center text-[10px] text-gray-400 font-bold py-4 border border-dashed border-[#EBDBCE] rounded-2xl">خالی</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---------- follow-ups ---------- */}
      {tab === 'proformas' && isAnyApprover(currentUser, settings) && (
        <div className="space-y-4">
          {([
            ['PENDING', 'در انتظار امضای شما', 'bg-amber-50/70 border-amber-200 text-amber-900', 'بررسی و تایید'],
            ['APPROVED', 'امضا شده', 'bg-emerald-50/60 border-emerald-200 text-emerald-900', 'مشاهده'],
            ['REJECTED', 'رد شده', 'bg-rose-50/60 border-rose-200 text-rose-900', 'مشاهده'],
          ] as const).map(([status, heading, tone, action]) => {
            const list = deals
              .filter((d) => d.proformaApproval?.status === status && mine(d))
              .sort((a, b) => (b.proformaApproval?.decidedAt || b.proformaApproval?.requestedAt || '').localeCompare(a.proformaApproval?.decidedAt || a.proformaApproval?.requestedAt || ''));
            return (
              <section key={status} className={`border rounded-3xl p-4 space-y-2.5 ${tone}`} data-pf-list={status}>
                <h3 className="font-black text-sm">
                  {heading} <span className="text-[11px] font-bold opacity-70">({toPersianDigits(list.length)})</span>
                </h3>
                {list.length === 0 && <div className="text-[11px] font-bold opacity-60 py-2">موردی نیست.</div>}
                {list.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 bg-white border border-[#EBDBCE] rounded-2xl px-3.5 py-2.5">
                    <div className="min-w-0">
                      <div className="font-black text-xs text-[#3A241F] truncate">
                        {d.title} {d.proformaNumber && <span className="text-[10px] text-violet-700 font-black" dir="ltr">· {toPersianDigits(d.proformaNumber)}</span>}
                      </div>
                      <div className="text-[11px] text-[#8C6F66] truncate">
                        {d.customerName} · {toman(d.amount)} {unitName()} · ارسال‌کننده: {d.proformaApproval?.requestedByName || d.ownerName}
                        {d.proformaApproval?.decidedAt ? ` · ${status === 'APPROVED' ? 'امضا' : 'رد'}: ${formatTaskDate(d.proformaApproval.decidedAt.slice(0, 10))}` : ''}
                      </div>
                    </div>
                    <button type="button" onClick={() => setProformaFor(d)} className="shrink-0 px-3.5 py-1.5 rounded-xl text-[11px] font-black text-white bg-violet-600 hover:bg-violet-700 cursor-pointer">
                      {action}
                    </button>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}

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
          customers={customers}
          staff={staffList.filter((u) => u.isActive && (u.canUseCrm || u.role === 'SUPER_ADMIN' || u.role === 'DEPT_ADMIN'))}
          canDelete={canDelete(editingCustomer.ownerId) && customers.some((c) => c.id === editingCustomer.id)}
          onClose={() => {
            setEditingCustomer(null);
            setCustomerCb(null);
          }}
          onSave={(c) => {
            const isNew = !customers.some((x) => x.id === c.id);
            saveCustomer(c);
            setEditingCustomer(null);
            showToast(isNew ? 'مشتری ثبت شد.' : 'اطلاعات مشتری ذخیره شد.');
            if (customerCb) {
              customerCb(c);
              setCustomerCb(null);
            } else if (isNew) setOpenCustomer(c.id);
          }}
          onDelete={() => removeCustomer(editingCustomer)}
        />
      )}

      {importing && (
        <CustomerImportModal
          existing={customers}
          ownerId={me}
          ownerName={currentUser.fullName}
          onClose={() => setImporting(false)}
          onImport={(list) => {
            setCustomers((prev) => [...list, ...prev]);
            showToast(`${toPersianDigits(list.length)} مشتری اضافه شد.`);
          }}
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
          onCreateCustomer={startCustomerFor}
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

      {quickProforma && (
        <QuickProformaDialog
          deals={deals}
          customers={customers}
          onCreateCustomer={startCustomerFor}
          onClose={() => setQuickProforma(false)}
          onExisting={(deal, issuerId) => {
            setQuickProforma(false);
            // an opportunity that already has a proforma keeps its company; otherwise the chosen company is used
            setProformaFor(deal.proformaNumber ? deal : { ...deal, proformaIssuerId: issuerId });
          }}
          onNew={(input, issuerId) => {
            const d: Deal = { ...newDeal(input.customerId), title: input.title, stage: 'PROPOSAL', proformaIssuerId: issuerId };
            saveDeal(d);
            setQuickProforma(false);
            showToast('فرصت فروش ساخته شد و پیش‌فاکتور به آن وصل می‌شود.');
            setProformaFor(d);
          }}
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
          referred={customers.filter((x) => x.referrer?.kind === 'CUSTOMER' && x.referrer.id === openCustomer)}
          allDeals={deals}
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
  onCreateCustomer: (cb: (c: Customer) => void) => void;
}> = ({ initial, isNew, customers, staff, canDelete, onClose, onSave, onProforma, onDelete, onCreateCustomer }) => {
  const [d, setD] = useState<Deal>(initial);
  const [amountText, setAmountText] = useState(initial.amount ? toman(initial.amount) : '');
  const patch = (u: Partial<Deal>) => setD((p) => ({ ...p, ...u }));
  const valid = d.title.trim() && d.customerId;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const owner = staff.find((u) => u.id === d.ownerId);
    const co = (d.coOwnerIds || []).filter((id) => id !== d.ownerId);
    onSave({ ...d, ownerName: owner?.fullName || d.ownerName, coOwnerIds: co, coOwnerNames: co.map((id) => staff.find((u) => u.id === id)?.fullName || '') });
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
        {!isNew && (
          <div className="rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] px-3 py-2 text-[11px] font-bold text-[#503730]" data-deal-creator>
            <span className="text-[#8C6F66] font-medium">ایجاد شده توسط: </span>
            {staff.find((u) => u.id === d.createdById)?.fullName || d.createdByName || d.ownerName || 'نامشخص'}
            {d.createdAt && <span className="text-[#8C6F66] font-medium"> · {formatTaskDate(d.createdAt.slice(0, 10))}</span>}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className={label}>عنوان فرصت *</label>
            <input className={field} value={d.title} onChange={(e) => patch({ title: e.target.value })} autoFocus={isNew} placeholder="مثلاً: قرارداد پشتیبانی سالانه" />
          </div>
          <div>
            <label className={label}>کد کالا</label>
            <input className={field} dir="ltr" value={d.productCode || ''} onChange={(e) => patch({ productCode: e.target.value })} placeholder="مثلاً A-1024" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={`${label} flex items-center justify-between`}>
              <span>مشتری *</span>
              <button type="button" onClick={() => onCreateCustomer((c) => patch({ customerId: c.id, customerName: c.name }))} className="text-[11px] font-black text-violet-700 hover:underline cursor-pointer">
                + مشتری جدید
              </button>
            </label>
            <select className={field} value={d.customerId} onChange={(e) => patch({ customerId: e.target.value })}>
              <option value="">انتخاب مشتری...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>مبلغ ({unitName()})</label>
            <input
              className={field}
              inputMode="numeric"
              value={amountText}
              onChange={(e) => {
                const n = parseNumber(e.target.value);
                setAmountText(n ? formatNumber(n) : '');
                patch({ amount: fromDisplay(n) });
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
            <label className={label}>مسئول اصلی</label>
            <select
              className={field}
              value={d.ownerId}
              onChange={(e) => patch({ ownerId: e.target.value, coOwnerIds: (d.coOwnerIds || []).filter((x) => x !== e.target.value) })}
            >
              {staff.map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={label}>مسئولان همراه (هر چند نفر)</label>
          <div className="flex flex-wrap gap-1.5 mb-2 empty:hidden">
            {(d.coOwnerIds || []).map((id) => (
              <span key={id} className="flex items-center gap-1 bg-violet-50 text-violet-800 border border-violet-200 rounded-full pl-1.5 pr-3 py-1 text-[11px] font-bold">
                {staff.find((u) => u.id === id)?.fullName || (d.coOwnerNames || [])[(d.coOwnerIds || []).indexOf(id)] || id}
                <button type="button" onClick={() => patch({ coOwnerIds: (d.coOwnerIds || []).filter((x) => x !== id) })} className="cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <select
            className={field}
            value=""
            onChange={(e) => {
              if (e.target.value) patch({ coOwnerIds: [...(d.coOwnerIds || []), e.target.value] });
            }}
          >
            <option value="">+ افزودن مسئول همراه...</option>
            {staff
              .filter((u) => u.id !== d.ownerId && !(d.coOwnerIds || []).includes(u.id))
              .map((u) => (
                <option key={u.id} value={u.id}>{u.fullName}</option>
              ))}
          </select>
        </div>
        <ProformaSection
          deal={d}
          customer={customers.find((c) => c.id === d.customerId)}
          ready={!!valid}
          onOpen={(issuerId) => onProforma({ ...d, ownerName: staff.find((u) => u.id === d.ownerId)?.fullName || d.ownerName, ...(issuerId ? { proformaIssuerId: issuerId } : {}) })}
        />
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
  referred: Customer[];
  allDeals: Deal[];
  canCall: boolean;
  onCall: (number: string, name: string) => void;
  onClose: () => void;
  onEdit: () => void;
  onNewDeal: () => void;
  onOpenDeal: (d: Deal) => void;
  onAddActivity: (type: ActivityType, text: string, extra?: Partial<CrmActivity>) => void;
  onToggle: (a: CrmActivity) => void;
  onDeleteActivity: (a: CrmActivity) => void;
}> = ({ customer: c, deals, activities, staff, me, referred, allDeals, canCall, onCall, onClose, onEdit, onNewDeal, onOpenDeal, onAddActivity, onToggle, onDeleteActivity }) => {
  const [type, setType] = useState<ActivityType>('NOTE');
  const [text, setText] = useState('');
  // «the customer looked for a product we did not have»: ticked, then the product's name (and how many, if known)
  const [missingOn, setMissingOn] = useState(false);
  const [missingName, setMissingName] = useState('');
  const [missingQty, setMissingQty] = useState('');
  const [due, setDue] = useState<string | undefined>(undefined);
  const [owner, setOwner] = useState(me.id);
  const isAdmin = me.role === 'SUPER_ADMIN' || me.role === 'DEPT_ADMIN';
  const st = STATUS[c.status];
  const [calls, setCalls] = useState<VoipCall[]>([]);
  const [smsOn, setSmsOn] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  // this customer's warranties (only for people who may use the warranty menu; the server refuses the others)
  const [warr, setWarr] = useState<Warranty[] | null>(null);
  useEffect(() => {
    let alive = true;
    api.warrantyList().then((r) => alive && setWarr(r.warranties.filter((w) => w.customerId === c.id))).catch(() => alive && setWarr(null));
    return () => { alive = false; };
  }, [c.id]);
  const openWarranty = (o: { type: string; customerId?: string }) => {
    try {
      sessionStorage.setItem('warranty_open', JSON.stringify(o));
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new Event('goto-warranty'));
    window.dispatchEvent(new Event('open-warranty-item'));
    onClose();
  };
  useEffect(() => {
    api.smsStatus().then((s) => setSmsOn(s.enabled)).catch(() => {});
  }, []);
  useEffect(() => {
    let alive = true;
    api
      .voipCalls({ customer: c.id, limit: 30 })
      .then((r) => alive && setCalls(r.calls))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [c.id]);

  const addMissing = () => {
    const name = missingName.trim();
    if (!name) return;
    const qty = Number(normText(missingQty).replace(/[^0-9.]/g, ''));
    onAddActivity('MISSING', `کالای ناموجود: ${name}${qty > 0 ? ' × ' + toPersianDigits(qty) : ''}`, { itemName: name, ...(qty > 0 ? { qty } : {}) });
    setMissingName('');
    setMissingQty('');
    setMissingOn(false);
  };

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
          <button type="button" onClick={() => setReportOpen(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 cursor-pointer">
            <BarChart3 className="w-4 h-4" />
            گزارش مشتری
          </button>
          <button type="button" onClick={onEdit} className="px-4 py-2 rounded-xl text-xs font-black text-violet-700 bg-violet-50 border border-violet-200 hover:bg-violet-100 cursor-pointer">ویرایش مشتری</button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">بستن</button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${st.cls}`}>{st.label}</span>
        {c.company && c.company !== c.name && (
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

      {c.phones.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
          {([
            ['موبایل‌ها', c.phones.filter((p) => /^\+?(98)?0?9\d{9}$/.test(p)), Smartphone, 'text-emerald-600'],
            ['تلفن‌های ثابت', c.phones.filter((p) => !/^\+?(98)?0?9\d{9}$/.test(p)), Phone, 'text-sky-600'],
          ] as const).map(([title, list, Icon, tone]) =>
            list.length === 0 ? null : (
              <div key={title} className="rounded-2xl border border-[#EBDBCE] bg-white p-3 space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-black text-[#3A241F]">
                  <Icon className={`w-4 h-4 ${tone}`} />
                  {title} ({toPersianDigits(list.length)})
                </div>
                {list.map((p) => (
                  <div key={p} className="flex items-center justify-between gap-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl px-3 py-2">
                    <span className="text-xs font-black text-[#3A241F]" dir="ltr">{toPersianDigits(p)}</span>
                    <span className="flex items-center gap-3">
                      {canCall && (
                        <button type="button" onClick={() => onCall(p, c.name)} className="flex items-center gap-1 text-[11px] font-black text-emerald-700 hover:underline cursor-pointer">
                          <PhoneCall className="w-3.5 h-3.5" />
                          تماس
                        </button>
                      )}
                      {smsOn && title === 'موبایل‌ها' && (
                        <button type="button" onClick={() => setSmsOpen(true)} className="flex items-center gap-1 text-[11px] font-black text-sky-700 hover:underline cursor-pointer">
                          <MessageSquare className="w-3.5 h-3.5" />
                          پیامک
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {reportOpen && <CustomerReportModal customer={c} deals={deals} onClose={() => setReportOpen(false)} />}
      {smsOpen && <SmsModal customerId={c.id} customerName={c.name} phones={c.phones} onClose={() => setSmsOpen(false)} />}
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
      {(() => {
        const rows: [string, string | undefined][] =
          c.kind === 'COMPANY'
            ? [
                ['نوع شرکت', c.companyType],
                ['شناسهٔ ملی', c.nationalId],
                ['کد اقتصادی', c.economicCode],
                ['شمارهٔ ثبت', c.registrationNumber],
                ['تاریخ ثبت', c.registrationDate ? formatTaskDate(c.registrationDate) : undefined],
                ['نماینده', [c.repName, c.repPosition].filter(Boolean).join(' - ') || undefined],
                ['موبایل نماینده', c.repMobile],
              ]
            : [
                ['نام پدر', c.fatherName],
                ['کد ملی', c.nationalCode],
                ['شمارهٔ شناسنامه', c.idNumber],
                ['تاریخ تولد', c.birthDate ? formatTaskDate(c.birthDate) : undefined],
                ['جنسیت', c.gender === 'M' ? 'آقا' : c.gender === 'F' ? 'خانم' : undefined],
              ];
        const loc = [c.province, c.city].filter(Boolean).join('، ');
        const all: [string, string | undefined][] = [...rows, ['استان / شهر', loc || undefined], ['کد پستی', c.postalCode], ['وب‌سایت', c.website], ['معرف', c.referrer?.name ? `${c.referrer.name}${c.referrer.phone ? ` (${c.referrer.phone})` : ''}` : undefined]];
        const shown = all.filter(([, v]) => v);
        return shown.length === 0 ? null : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {shown.map(([k, v]) => (
              <div key={k} className="bg-white border border-[#EBDBCE] rounded-xl px-3 py-2 min-w-0">
                <div className="text-[10px] font-black text-[#8C6F66]">{k}</div>
                <div className="text-xs font-bold text-[#3A241F] truncate">{toPersianDigits(v!)}</div>
              </div>
            ))}
          </div>
        );
      })()}
      {referred.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs font-bold text-emerald-900">
          این مشتری {toPersianDigits(referred.length)} مشتری را معرفی کرده است: {referred.map((x) => x.name).join('، ')}. فروش موفق از آن‌ها:{' '}
          {toman(allDeals.filter((d) => d.stage === 'WON' && referred.some((x) => x.id === d.customerId)).reduce((s, d) => s + d.amount, 0))} {unitName()}
        </div>
      )}
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
                  <span className="text-[11px] font-black text-violet-700">{toman(d.amount)} {unitShort()}</span>
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

      {warr !== null && (
        <section className="space-y-2" data-customer-warranties>
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-black text-xs text-[#3A241F] flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-teal-600" />گارانتی‌ها ({toPersianDigits(warr.length)})</h4>
            <button type="button" onClick={() => openWarranty({ type: 'new', customerId: c.id })} className="text-[11px] font-black text-teal-700 hover:underline cursor-pointer flex items-center gap-1"><Plus className="w-3.5 h-3.5" />ثبت گارانتی</button>
          </div>
          {warr.length === 0 ? (
            <div className="text-center text-[11px] text-gray-400 font-bold py-3 bg-white border border-[#EBDBCE] rounded-xl">برای این مشتری هنوز گارانتی ثبت نشده است.</div>
          ) : (
            warr.map((w) => {
              const sst = warrantyState(w);
              return (
                <button key={w.id} type="button" onClick={() => openWarranty({ type: 'customer', customerId: c.id })} className="w-full flex items-center justify-between gap-2 bg-white border border-[#EBDBCE] rounded-xl px-3 py-2 text-right hover:shadow-sm cursor-pointer">
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-[#3A241F] truncate">{w.productName}</span>
                    <span className="block text-[10px] text-[#8C6F66]">{toPersianDigits(w.warrantyNo)} · {remainingText(w)}</span>
                  </span>
                  <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border ${STATE_LABEL[sst].cls}`}>{STATE_LABEL[sst].label}</span>
                </button>
              );
            })
          )}
        </section>
      )}

      {/* timeline */}
      <section className="space-y-2.5">
        {calls.length > 0 && (
          <div className="rounded-2xl border border-[#EBDBCE] overflow-hidden">
            <div className="px-4 py-2 bg-[#FAF5F1] font-black text-xs text-[#3A241F]">تماس‌های تلفنی با این مشتری</div>
            <div className="max-h-56 overflow-y-auto">
              <CallList calls={calls} showUser onCall={canCall ? (n) => onCall(n, c.name) : undefined} />
            </div>
          </div>
        )}
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-3 space-y-2" data-missing-form>
          <label className="flex items-center gap-2.5 cursor-pointer min-h-[28px]">
            <input type="checkbox" checked={missingOn} onChange={(e) => setMissingOn(e.target.checked)} className="w-4 h-4 accent-rose-600" />
            <span className="text-xs font-black text-rose-800">مشتری دنبال کالایی بود که موجود نبود</span>
          </label>
          {missingOn && (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_auto] gap-2">
              <input className={field} value={missingName} onChange={(e) => setMissingName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMissing()} placeholder="نام کالا (مثلاً میل لنگ سانز)" />
              <input className={field} value={missingQty} onChange={(e) => setMissingQty(e.target.value)} inputMode="numeric" placeholder="تعداد (اختیاری)" />
              <button type="button" onClick={addMissing} disabled={!missingName.trim()} className="px-4 py-2 min-h-[44px] sm:min-h-0 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black cursor-pointer">ثبت کالای ناموجود</button>
            </div>
          )}
        </div>
        <h4 className="font-black text-xs text-[#3A241F]">سابقهٔ تعامل</h4>
        <div className="bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(ACTIVITY) as ActivityType[]).filter((k) => k !== 'MISSING').map((k) => (
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
