import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Inbox,
  Send,
  ClipboardList,
  LayoutGrid,
  List,
  Rows3,
  Maximize2,
  Minimize2,
  Minus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CalendarDays,
  Download,
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { getToken } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, isOverdue } from '../../lib/taskDates';
import { FileTransfer, Task } from '../../types';

type Layout = 'cards' | 'list' | 'compact';
type Size = 'drawer' | 'full';
interface Prefs {
  layout: Layout;
  size: Size;
  /** false: never open automatically after login, only show the small logo. */
  autoOpen: boolean;
}

const PREF_KEY = 'login_dashboard_v1';
const SHOWN_KEY = 'login_dashboard_shown_v1';
const DEFAULT_PREFS: Prefs = { layout: 'cards', size: 'drawer', autoOpen: true };

const loadPrefs = (): Prefs => {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') };
  } catch {
    return DEFAULT_PREFS;
  }
};

const PRIORITY_WEIGHT = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
const PRIORITY_LABEL = { URGENT: 'فوری', HIGH: 'بالا', MEDIUM: 'متوسط', LOW: 'کم' } as const;
const STATUS_LABEL = { TODO: 'انجام نشده', IN_PROGRESS: 'در حال انجام', REVIEW: 'در انتظار بررسی', DONE: 'انجام شده' } as const;

interface Props {
  canUseTasks: boolean;
  onOpenFiles: (box: 'received' | 'sent') => void;
  onOpenTasks: () => void;
}

/**
 * Full-width summary that drops down over everything right after login: received/sent file reports and
 * the task manager. It can be shown as a top drawer or full screen, as cards / list / compact rows, and it
 * can be reduced to just a small floating logo (also as the permanent start-up choice).
 */
export const LoginDashboard: React.FC<Props> = ({ canUseTasks, onOpenFiles, onOpenTasks }) => {
  const { transfers, tasks, currentUser, settings, unreadCount } = useAppContext();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [open, setOpen] = useState(false);

  const update = (p: Partial<Prefs>) =>
    setPrefs((prev) => {
      const next = { ...prev, ...p };
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });

  // Open once per login (a new login gets a new token), unless the user chose to keep it as a logo only.
  useEffect(() => {
    if (!currentUser.id) return;
    const token = getToken() || '';
    let shown = '';
    try {
      shown = sessionStorage.getItem(SHOWN_KEY) || '';
      sessionStorage.setItem(SHOWN_KEY, token);
    } catch {
      /* storage unavailable */
    }
    if (shown !== token && loadPrefs().autoOpen) setOpen(true);
  }, [currentUser.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const me = currentUser.id;
  const files = useMemo(() => transfers.filter((t) => !t.isOfficialLetter), [transfers]);
  const received = useMemo(() => files.filter((t) => t.recipients.some((r) => r.id === me) && t.sender.id !== me), [files, me]);
  const sent = useMemo(() => files.filter((t) => t.sender.id === me), [files, me]);
  const myTasks = useMemo(() => tasks.filter((t) => t.assigneeIds.includes(me)), [tasks, me]);
  const openTasks = useMemo(
    () =>
      myTasks
        .filter((t) => t.status !== 'DONE')
        .sort(
          (a, b) =>
            Number(isOverdue(b.dueDate, false)) - Number(isOverdue(a.dueDate, false)) ||
            PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] ||
            (a.dueDate || '9').localeCompare(b.dueDate || '9')
        ),
    [myTasks]
  );

  const overdue = openTasks.filter((t) => isOverdue(t.dueDate, false)).length;
  const waitingDownload = received.filter((t) => t.status !== 'DOWNLOADED').length;
  const sentDownloaded = sent.filter((t) => t.status === 'DOWNLOADED' || t.downloadsCount > 0).length;
  const attention = waitingDownload + overdue + unreadCount;

  const logo = settings.companyLogoUrl;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="نمای کلی: فایل‌ها و وظایف"
        className="fixed bottom-24 sm:bottom-6 left-4 z-[90] w-14 h-14 rounded-full bg-white border-2 border-[#EBDBCE] shadow-xl shadow-[#3A241F]/25 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer"
      >
        {logo ? (
          <img src={logo} alt="" className="w-9 h-9 object-contain" />
        ) : (
          <span className="w-9 h-9 rounded-2xl bg-[#6E1B1B] text-[#F6D9CD] flex items-center justify-center">
            <ArrowLeftRight className="w-5 h-5" />
          </span>
        )}
        {attention > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-white">
            {toPersianDigits(attention > 99 ? '99+' : attention)}
          </span>
        )}
      </button>
    );
  }

  const full = prefs.size === 'full';
  const fileRow = (t: FileTransfer, dir: 'in' | 'out') => (
    <div key={t.id} className="flex items-center gap-3 min-w-0">
      <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${dir === 'in' ? 'bg-[#F6D9CD] text-[#6E1B1B]' : 'bg-sky-100 text-sky-700'}`}>
        {dir === 'in' ? <Download className="w-4 h-4" /> : <Send className="w-4 h-4" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-black text-[#3A241F] truncate">{t.fileName}</span>
        <span className="block text-[10px] text-[#8C6F66] truncate">
          {dir === 'in' ? `از ${t.sender.fullName}` : `به ${t.recipients.map((r) => r.fullName).join('، ')}`} · {t.fileSize} · {t.sentAt}
        </span>
      </span>
      <span
        className={`text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0 ${
          t.status === 'DOWNLOADED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
        }`}
      >
        {t.status === 'DOWNLOADED' ? (dir === 'in' ? 'دریافت شده' : 'تحویل شد') : dir === 'in' ? 'دریافت‌نشده' : 'در انتظار'}
      </span>
    </div>
  );

  const taskRow = (t: Task) => {
    const od = isOverdue(t.dueDate, false);
    return (
      <div key={t.id} className="flex items-center gap-3 min-w-0">
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${od ? 'bg-rose-100 text-rose-700' : 'bg-sky-100 text-sky-700'}`}>
          {od ? <AlertTriangle className="w-4 h-4" /> : <ClipboardList className="w-4 h-4" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-black text-[#3A241F] truncate">{t.title}</span>
          <span className="block text-[10px] text-[#8C6F66] truncate">
            {STATUS_LABEL[t.status]} · اولویت {PRIORITY_LABEL[t.priority]}
            {t.dueDate && ` · ${formatTaskDate(t.dueDate)}`}
          </span>
        </span>
        {od && <span className="text-[10px] font-black text-rose-600 shrink-0 flex items-center gap-1"><CalendarDays className="w-3 h-3" />گذشته</span>}
      </div>
    );
  };

  const limit = prefs.layout === 'compact' ? 4 : 6;
  const Section: React.FC<{ title: string; icon: React.ReactNode; count: number; onMore: () => void; children: React.ReactNode }> = ({ title, icon, count, onMore, children }) => (
    <section className="bg-white border border-[#EBDBCE] rounded-3xl p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-black text-sm text-[#3A241F]">
          {icon}
          {title}
          <span className="text-[11px] text-[#8C6F66] font-bold">({toPersianDigits(count)})</span>
        </h3>
        <button type="button" onClick={onMore} className="text-[11px] font-black text-[#6E1B1B] hover:underline cursor-pointer">
          مشاهدهٔ همه
        </button>
      </div>
      <div className={prefs.layout === 'cards' ? 'space-y-3' : prefs.layout === 'list' ? 'divide-y divide-[#EBDBCE]/60 [&>*]:py-2.5' : 'space-y-2'}>{children}</div>
      {count === 0 && <div className="text-center text-[11px] font-bold text-gray-400 py-4">موردی وجود ندارد.</div>}
    </section>
  );

  const stat = (label: string, value: number, cls: string, Icon: React.ElementType) => (
    <div className="bg-white border border-[#EBDBCE] rounded-2xl px-4 py-3 flex items-center gap-3">
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${cls}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div>
        <div className="text-lg font-black text-[#3A241F] leading-none">{toPersianDigits(value)}</div>
        <div className="text-[10px] font-bold text-[#8C6F66] mt-1">{label}</div>
      </div>
    </div>
  );

  const segBtn = (active: boolean) =>
    `p-1.5 rounded-lg cursor-pointer transition-colors ${active ? 'bg-white text-[#6E1B1B] shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'}`;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" role="dialog" aria-label="نمای کلی">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs animate-in fade-in" onClick={() => setOpen(false)} />
      <div
        className={`relative w-full bg-[#FAF5F1] shadow-2xl border-[#EBDBCE] animate-in slide-in-from-top duration-300 flex flex-col ${
          full ? 'h-full' : 'max-h-[82vh] rounded-b-[32px] border-b-2'
        }`}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-8 py-3.5 border-b border-[#EBDBCE] bg-white/70">
          <div className="flex items-center gap-3 min-w-0">
            {logo ? (
              <img src={logo} alt="" className="w-9 h-9 object-contain shrink-0" />
            ) : (
              <span className="w-9 h-9 rounded-2xl bg-[#6E1B1B] text-[#F6D9CD] flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-5 h-5" />
              </span>
            )}
            <div className="min-w-0">
              <div className="font-black text-sm text-[#3A241F] truncate">سلام {currentUser.fullName}، خوش آمدید</div>
              <div className="text-[11px] text-[#8C6F66] font-medium">خلاصهٔ فایل‌های دریافتی و ارسالی و وظایف شما</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl p-0.5" title="مدل نمایش">
              <button type="button" onClick={() => update({ layout: 'cards' })} className={segBtn(prefs.layout === 'cards')} title="کارتی"><LayoutGrid className="w-4 h-4" /></button>
              <button type="button" onClick={() => update({ layout: 'list' })} className={segBtn(prefs.layout === 'list')} title="لیستی"><List className="w-4 h-4" /></button>
              <button type="button" onClick={() => update({ layout: 'compact' })} className={segBtn(prefs.layout === 'compact')} title="فشرده"><Rows3 className="w-4 h-4" /></button>
            </div>
            <button
              type="button"
              onClick={() => update({ size: full ? 'drawer' : 'full' })}
              title={full ? 'نمایش به‌صورت نوار بالا' : 'نمایش تمام‌صفحه'}
              className="p-2 rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] text-[#3A241F] hover:bg-white cursor-pointer"
            >
              {full ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-[#3A241F] cursor-pointer select-none">
              <input type="checkbox" checked={!prefs.autoOpen} onChange={(e) => update({ autoOpen: !e.target.checked })} className="accent-[#6E1B1B] w-4 h-4" />
              پس از ورود فقط به‌شکل لوگو باشد
            </label>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#6E1B1B] text-white text-xs font-black hover:bg-[#D34A32] cursor-pointer"
            >
              <Minus className="w-4 h-4" />
              بستن (تبدیل به لوگو)
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-5">
          <div className={`grid gap-3 ${canUseTasks ? 'grid-cols-2 lg:grid-cols-6' : 'grid-cols-2 lg:grid-cols-4'}`}>
            {stat('فایل دریافتی', received.length, 'bg-[#F6D9CD] text-[#6E1B1B]', Inbox)}
            {stat('دریافت‌نشده', waitingDownload, 'bg-amber-100 text-amber-700', Clock)}
            {stat('فایل ارسالی', sent.length, 'bg-sky-100 text-sky-700', Send)}
            {stat('تحویل‌شده به گیرنده', sentDownloaded, 'bg-emerald-100 text-emerald-700', CheckCircle2)}
            {canUseTasks && stat('وظایف باز من', openTasks.length, 'bg-sky-100 text-sky-700', ClipboardList)}
            {canUseTasks && stat('وظایف دارای تأخیر', overdue, 'bg-rose-100 text-rose-700', AlertTriangle)}
          </div>

          <div className={`grid gap-4 ${canUseTasks ? 'grid-cols-1 xl:grid-cols-3' : 'grid-cols-1 lg:grid-cols-2'}`}>
            <Section title="دریافتی‌ها" icon={<Inbox className="w-4 h-4 text-[#6E1B1B]" />} count={received.length} onMore={() => { setOpen(false); onOpenFiles('received'); }}>
              {received.slice(0, limit).map((t) => fileRow(t, 'in'))}
            </Section>
            <Section title="ارسالی‌ها" icon={<Send className="w-4 h-4 text-sky-600" />} count={sent.length} onMore={() => { setOpen(false); onOpenFiles('sent'); }}>
              {sent.slice(0, limit).map((t) => fileRow(t, 'out'))}
            </Section>
            {canUseTasks && (
              <Section title="وظایف من" icon={<ClipboardList className="w-4 h-4 text-sky-600" />} count={openTasks.length} onMore={() => { setOpen(false); onOpenTasks(); }}>
                {openTasks.slice(0, limit).map(taskRow)}
              </Section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
