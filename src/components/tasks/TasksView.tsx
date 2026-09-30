import React, { useMemo, useState } from 'react';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  X,
  Trash2,
  CalendarDays,
  CheckSquare,
  MessageSquare,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ListChecks,
  User as UserIcon,
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { Task, TaskPriority, TaskStatus, User } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import {
  JALALI_MONTHS,
  formatTaskDate,
  isOverdue,
  isoToJalaliParts,
  jalaliPartsToIso,
  todayIso,
} from '../../lib/taskDates';

const STATUSES: { id: TaskStatus; label: string; dot: string; head: string }[] = [
  { id: 'TODO', label: 'انجام نشده', dot: 'bg-slate-400', head: 'text-slate-700' },
  { id: 'IN_PROGRESS', label: 'در حال انجام', dot: 'bg-sky-500', head: 'text-sky-700' },
  { id: 'REVIEW', label: 'در انتظار بررسی', dot: 'bg-amber-500', head: 'text-amber-700' },
  { id: 'DONE', label: 'انجام شده', dot: 'bg-emerald-500', head: 'text-emerald-700' },
];

const PRIORITIES: { id: TaskPriority; label: string; cls: string }[] = [
  { id: 'LOW', label: 'کم', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  { id: 'MEDIUM', label: 'متوسط', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'HIGH', label: 'بالا', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
  { id: 'URGENT', label: 'فوری', cls: 'bg-rose-50 text-rose-700 border-rose-300' },
];

const prio = (p: TaskPriority) => PRIORITIES.find((x) => x.id === p) || PRIORITIES[1];
const uid = (p: string) => p + '-' + Math.random().toString(36).substring(2, 10);
const nowIso = () => new Date().toISOString();

const Avatar: React.FC<{ user?: User; size?: number }> = ({ user, size = 24 }) => (
  <span
    title={user?.fullName}
    style={{ width: size, height: size, fontSize: size * 0.42 }}
    className="inline-flex items-center justify-center rounded-full bg-[#F6D9CD] text-[#6E1B1B] font-black border-2 border-white shrink-0 overflow-hidden"
  >
    {user?.avatarUrl && !user.avatarUrl.includes('unsplash') ? (
      <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
    ) : (
      user?.avatarInitials || user?.fullName?.slice(0, 2) || '؟'
    )}
  </span>
);

/** Jalali date picker (day / month / year selects) that stores a Gregorian yyyy-mm-dd string. */
const JalaliDateField: React.FC<{ value?: string; onChange: (iso: string | undefined) => void; disabled?: boolean }> = ({
  value,
  onChange,
  disabled,
}) => {
  const parts = value ? isoToJalaliParts(value) : null;
  const today = isoToJalaliParts(todayIso())!;
  const [jy, jm, jd] = parts || [today[0], today[1], today[2]];
  const set = (y: number, m: number, d: number) => onChange(jalaliPartsToIso(y, m, Math.min(d, m <= 6 ? 31 : m <= 11 ? 30 : 29)));
  const sel = 'px-2 py-2 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] outline-hidden focus:ring-2 focus:ring-[#6E1B1B]/20 disabled:opacity-60';
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <select disabled={disabled} className={sel} value={parts ? jd : ''} onChange={(e) => set(jy, jm, +e.target.value)}>
        {!parts && <option value="">روز</option>}
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{toPersianDigits(d)}</option>
        ))}
      </select>
      <select disabled={disabled} className={sel} value={parts ? jm : ''} onChange={(e) => set(jy, +e.target.value, jd)}>
        {!parts && <option value="">ماه</option>}
        {JALALI_MONTHS.map((m, i) => (
          <option key={m} value={i + 1}>{m}</option>
        ))}
      </select>
      <select disabled={disabled} className={sel} value={parts ? jy : ''} onChange={(e) => set(+e.target.value, jm, jd)}>
        {!parts && <option value="">سال</option>}
        {Array.from({ length: 8 }, (_, i) => today[0] - 1 + i).map((y) => (
          <option key={y} value={y}>{toPersianDigits(y)}</option>
        ))}
      </select>
      {parts && !disabled && (
        <button type="button" onClick={() => onChange(undefined)} className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer">
          حذف تاریخ
        </button>
      )}
    </div>
  );
};

const emptyTask = (me: User): Task => ({
  id: uid('task'),
  title: '',
  description: '',
  status: 'TODO',
  priority: 'MEDIUM',
  creatorId: me.id,
  creatorName: me.fullName,
  assigneeIds: [],
  checklist: [],
  comments: [],
  createdAt: nowIso(),
  updatedAt: nowIso(),
});

export const TasksView: React.FC = () => {
  const { tasks, setTasks, staffList, currentUser, showToast } = useAppContext();
  const isAdmin = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEPT_ADMIN';

  const [view, setView] = useState<'board' | 'list'>('board');
  const [scope, setScope] = useState<'ALL' | 'MINE' | 'CREATED'>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | TaskPriority>('ALL');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ task: Task; isNew: boolean } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const [mobileCol, setMobileCol] = useState<TaskStatus>('TODO');

  const userById = useMemo(() => new Map(staffList.map((u) => [u.id, u])), [staffList]);

  const isCreatorOrAdmin = (t: Task) => isAdmin || t.creatorId === currentUser.id;
  const isAssignee = (t: Task) => t.assigneeIds.includes(currentUser.id);
  const canMove = (t: Task) => isCreatorOrAdmin(t) || isAssignee(t);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (scope === 'MINE' && !t.assigneeIds.includes(currentUser.id)) return false;
      if (scope === 'CREATED' && t.creatorId !== currentUser.id) return false;
      if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;
      if (q) {
        const names = t.assigneeIds.map((id) => userById.get(id)?.fullName || '').join(' ');
        if (!`${t.title} ${t.description} ${t.creatorName} ${names}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, scope, priorityFilter, search, currentUser.id, userById]);

  const stats = useMemo(
    () => ({
      total: tasks.length,
      active: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
      overdue: tasks.filter((t) => isOverdue(t.dueDate, t.status === 'DONE')).length,
      done: tasks.filter((t) => t.status === 'DONE').length,
    }),
    [tasks]
  );

  const saveTask = (t: Task) => {
    const next: Task = {
      ...t,
      title: t.title.trim(),
      updatedAt: nowIso(),
      completedAt: t.status === 'DONE' ? t.completedAt || nowIso() : undefined,
    };
    setTasks((prev) => (prev.some((x) => x.id === next.id) ? prev.map((x) => (x.id === next.id ? next : x)) : [next, ...prev]));
  };

  const moveTask = (id: string, status: TaskStatus) => {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    if (!canMove(t)) {
      showToast('فقط سازندهٔ وظیفه یا مسئول انجام آن می‌تواند وضعیت را تغییر دهد.');
      return;
    }
    saveTask({ ...t, status });
  };

  const deleteTask = (t: Task) => {
    if (!isCreatorOrAdmin(t)) return;
    if (!window.confirm(`وظیفهٔ «${t.title}» حذف شود؟`)) return;
    setTasks((prev) => prev.filter((x) => x.id !== t.id));
    setEditing(null);
    showToast('وظیفه حذف شد.');
  };

  const renderCard = (t: Task) => {
    const p = prio(t.priority);
    const done = t.checklist.filter((c) => c.done).length;
    const overdue = isOverdue(t.dueDate, t.status === 'DONE');
    return (
      <div
        draggable={canMove(t)}
        onDragStart={() => setDragId(t.id)}
        onDragEnd={() => {
          setDragId(null);
          setDragOver(null);
        }}
        onClick={() => setEditing({ task: t, isNew: false })}
        className={`bg-white rounded-2xl border p-3.5 space-y-2.5 text-right shadow-2xs hover:shadow-md transition-all cursor-pointer ${
          dragId === t.id ? 'opacity-40' : ''
        } ${overdue ? 'border-rose-300' : 'border-[#EBDBCE]'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-black text-[13px] text-[#3A241F] leading-6">{t.title}</h4>
          <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border ${p.cls}`}>{p.label}</span>
        </div>
        {t.description && <p className="text-[11px] text-[#8C6F66] leading-5 line-clamp-2">{t.description}</p>}
        <div className="flex items-center flex-wrap gap-2 text-[10px] font-bold text-[#8C6F66]">
          {t.dueDate && (
            <span className={`inline-flex items-center gap-1 ${overdue ? 'text-rose-600' : ''}`}>
              <CalendarDays className="w-3 h-3" />
              {formatTaskDate(t.dueDate)}
              {overdue && ' (گذشته)'}
            </span>
          )}
          {t.checklist.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <CheckSquare className="w-3 h-3" />
              {toPersianDigits(done)}/{toPersianDigits(t.checklist.length)}
            </span>
          )}
          {t.comments.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {toPersianDigits(t.comments.length)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex -space-x-1.5 space-x-reverse">
            {t.assigneeIds.slice(0, 4).map((id) => (
              <Avatar key={id} user={userById.get(id)} />
            ))}
            {t.assigneeIds.length > 4 && (
              <span className="w-6 h-6 rounded-full bg-[#FAF5F1] border-2 border-white text-[9px] font-black flex items-center justify-center text-[#8C6F66]">
                +{toPersianDigits(t.assigneeIds.length - 4)}
              </span>
            )}
            {t.assigneeIds.length === 0 && <span className="text-[10px] text-gray-400">بدون مسئول</span>}
          </div>
          <span className="text-[10px] text-[#8C6F66]">از: {t.creatorName}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 p-3.5 sm:p-8 space-y-4 sm:space-y-5 pb-32 sm:pb-8 select-none overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-lg text-[#3A241F]">مدیریت وظایف</h2>
          <p className="text-xs text-[#8C6F66] mt-0.5">تعریف وظیفه، واگذاری به همکاران و پیگیری وضعیت انجام کار</p>
        </div>
        <button
          onClick={() => setEditing({ task: emptyTask(currentUser), isNew: true })}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-black shadow-md shadow-sky-600/25 transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>وظیفه جدید</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'کل', value: stats.total, icon: ListChecks, cls: 'text-[#6E1B1B] bg-[#F6D9CD]/50' },
          { label: 'در جریان', value: stats.active, icon: Clock, cls: 'text-sky-700 bg-sky-50' },
          { label: 'تأخیر', value: stats.overdue, icon: AlertTriangle, cls: 'text-rose-700 bg-rose-50' },
          { label: 'انجام‌شده', value: stats.done, icon: CheckCircle2, cls: 'text-emerald-700 bg-emerald-50' },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-[#EBDBCE] rounded-2xl p-2 sm:p-3.5 flex flex-col sm:flex-row items-center gap-1 sm:gap-3 text-center sm:text-right min-w-0">
            <span className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${s.cls}`}>
              <s.icon className="w-4 h-4 sm:w-5 sm:h-5" />
            </span>
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-black text-[#3A241F] leading-none">{toPersianDigits(s.value)}</div>
              <div className="text-[9px] sm:text-[11px] font-bold text-[#8C6F66] mt-1 truncate">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#8C6F66] absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو در عنوان، توضیحات، سازنده یا مسئول..."
            className="w-full pr-10 pl-4 py-2.5 bg-white border border-[#EBDBCE] rounded-2xl text-xs font-medium text-[#3A241F] outline-hidden focus:ring-2 focus:ring-sky-500/20"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-1 w-full sm:w-auto overflow-x-auto">
            {([
              ['ALL', isAdmin ? 'همه' : 'همهٔ من'],
              ['MINE', 'واگذار شده به من'],
              ['CREATED', 'ساخته‌ام'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setScope(id)}
                className={`flex-1 sm:flex-initial whitespace-nowrap px-3 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                  scope === id ? 'bg-white text-sky-700 shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'ALL' | TaskPriority)}
            className="flex-1 sm:flex-initial min-w-0 px-3 py-2 bg-white border border-[#EBDBCE] rounded-2xl text-[11px] font-black text-[#3A241F] outline-hidden cursor-pointer"
          >
            <option value="ALL">همهٔ اولویت‌ها</option>
            {PRIORITIES.map((p) => (
              <option key={p.id} value={p.id}>اولویت {p.label}</option>
            ))}
          </select>
          <div className="flex bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-1">
            <button
              onClick={() => setView('board')}
              title="نمای کانبان"
              className={`p-1.5 rounded-xl cursor-pointer ${view === 'board' ? 'bg-white text-sky-700 shadow-2xs' : 'text-[#8C6F66]'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('list')}
              title="نمای لیست"
              className={`p-1.5 rounded-xl cursor-pointer ${view === 'list' ? 'bg-white text-sky-700 shadow-2xs' : 'text-[#8C6F66]'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Board */}
      {view === 'board' && (
        <div className="md:hidden flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
          {STATUSES.map((c) => {
            const n = visible.filter((t) => t.status === c.id).length;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setMobileCol(c.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-2xl text-[11px] font-black border transition-all cursor-pointer ${
                  mobileCol === c.id ? 'bg-white border-sky-300 text-sky-700 shadow-2xs' : 'bg-[#FAF5F1] border-[#EBDBCE] text-[#8C6F66]'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                {c.label}
                <span className="bg-[#EBDBCE]/70 rounded-full px-1.5 text-[10px]">{toPersianDigits(n)}</span>
              </button>
            );
          })}
        </div>
      )}

      {view === 'board' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {STATUSES.map((col) => {
            const items = visible.filter((t) => t.status === col.id);
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(col.id);
                }}
                onDragLeave={() => setDragOver((c) => (c === col.id ? null : c))}
                onDrop={() => {
                  if (dragId) moveTask(dragId, col.id);
                  setDragId(null);
                  setDragOver(null);
                }}
                className={`${col.id === mobileCol ? '' : 'hidden'} md:block rounded-3xl p-3 space-y-3 border transition-colors min-h-[120px] ${
                  dragOver === col.id ? 'bg-sky-50 border-sky-300' : 'bg-[#FAF5F1]/70 border-[#EBDBCE]/70'
                }`}
              >
                <div className="flex items-center justify-between px-1">
                  <div className={`flex items-center gap-2 font-black text-xs ${col.head}`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                    {col.label}
                  </div>
                  <span className="text-[11px] font-black text-[#8C6F66] bg-white border border-[#EBDBCE] rounded-full px-2 py-0.5">
                    {toPersianDigits(items.length)}
                  </span>
                </div>
                {items.map((t) => (
                  <React.Fragment key={t.id}>{renderCard(t)}</React.Fragment>
                ))}
                {items.length === 0 && (
                  <div className="text-center text-[11px] text-gray-400 font-bold py-6 border border-dashed border-[#EBDBCE] rounded-2xl">
                    وظیفه‌ای وجود ندارد
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-[#EBDBCE] rounded-3xl overflow-hidden">
          {visible.length === 0 ? (
            <div className="text-center text-xs text-gray-400 font-bold py-12">وظیفه‌ای برای نمایش وجود ندارد.</div>
          ) : (
            <div className="divide-y divide-[#EBDBCE]/60">
              {visible.map((t) => {
                const p = prio(t.priority);
                const st = STATUSES.find((s) => s.id === t.status)!;
                const overdue = isOverdue(t.dueDate, t.status === 'DONE');
                return (
                  <div
                    key={t.id}
                    onClick={() => setEditing({ task: t, isNew: false })}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-[#FAF5F1]/60 cursor-pointer"
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dot}`} title={st.label} />
                    <div className="flex-1 min-w-[160px]">
                      <div className="font-black text-[13px] text-[#3A241F]">{t.title}</div>
                      <div className="text-[10px] text-[#8C6F66]">سازنده: {t.creatorName}</div>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${p.cls}`}>{p.label}</span>
                    <span className={`text-[11px] font-bold ${st.head}`}>{st.label}</span>
                    <span className={`text-[11px] font-bold w-28 ${overdue ? 'text-rose-600' : 'text-[#8C6F66]'}`}>
                      {t.dueDate ? formatTaskDate(t.dueDate) : '—'}
                    </span>
                    <div className="flex -space-x-1.5 space-x-reverse min-w-[40px]">
                      {t.assigneeIds.slice(0, 4).map((id) => (
                        <Avatar key={id} user={userById.get(id)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {editing && (
        <TaskModal
          initial={editing.task}
          isNew={editing.isNew}
          staff={staffList.filter((u) => u.isActive)}
          me={currentUser}
          fullEdit={editing.isNew || isCreatorOrAdmin(editing.task)}
          canMove={editing.isNew || canMove(editing.task)}
          canDelete={!editing.isNew && isCreatorOrAdmin(editing.task)}
          onClose={() => setEditing(null)}
          onSave={(t) => {
            saveTask(t);
            setEditing(null);
            showToast(editing.isNew ? 'وظیفه ثبت شد.' : 'تغییرات وظیفه ذخیره شد.');
          }}
          onDelete={() => deleteTask(editing.task)}
        />
      )}
    </div>
  );
};

interface TaskModalProps {
  initial: Task;
  isNew: boolean;
  staff: User[];
  me: User;
  /** Creator/admin: may edit every field. Otherwise only status, checklist ticks and comments. */
  fullEdit: boolean;
  canMove: boolean;
  canDelete: boolean;
  onClose: () => void;
  onSave: (t: Task) => void;
  onDelete: () => void;
}

const TaskModal: React.FC<TaskModalProps> = ({ initial, isNew, staff, me, fullEdit, canMove, canDelete, onClose, onSave, onDelete }) => {
  const [t, setT] = useState<Task>(initial);
  const [newItem, setNewItem] = useState('');
  const [newComment, setNewComment] = useState('');
  const patch = (u: Partial<Task>) => setT((prev) => ({ ...prev, ...u }));

  const field =
    'w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-medium text-[#3A241F] outline-hidden focus:ring-2 focus:ring-sky-500/20 disabled:opacity-70';
  const label = 'block text-[11px] font-black text-[#3A241F] mb-1.5';

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    patch({ checklist: [...t.checklist, { id: uid('ci'), text, done: false }] });
    setNewItem('');
  };
  const addComment = () => {
    const text = newComment.trim();
    if (!text) return;
    patch({ comments: [...t.comments, { id: uid('cm'), userId: me.id, userName: me.fullName, text, createdAt: nowIso() }] });
    setNewComment('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!t.title.trim()) return;
    onSave(t);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4" onMouseDown={onClose}>
      <form
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col border border-[#EBDBCE] text-right"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F]">{isNew ? 'تعریف وظیفه جدید' : 'جزئیات وظیفه'}</h3>
          <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {!fullEdit && (
            <div className="text-[11px] font-bold text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2">
              این وظیفه به شما واگذار شده است؛ می‌توانید وضعیت را تغییر دهید، موارد چک‌لیست را تیک بزنید و نظر بنویسید.
            </div>
          )}

          <div>
            <label className={label}>عنوان وظیفه</label>
            <input className={field} value={t.title} disabled={!fullEdit} onChange={(e) => patch({ title: e.target.value })} placeholder="مثلاً: تهیه گزارش عملکرد ماهانه" autoFocus={isNew} />
          </div>

          <div>
            <label className={label}>توضیحات</label>
            <textarea className={`${field} min-h-[88px] leading-6`} value={t.description} disabled={!fullEdit} onChange={(e) => patch({ description: e.target.value })} placeholder="جزئیات کار، انتظارات و نکات مهم..." />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>وضعیت</label>
              <select className={field} value={t.status} disabled={!canMove} onChange={(e) => patch({ status: e.target.value as TaskStatus })}>
                {STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>اولویت</label>
              <select className={field} value={t.priority} disabled={!fullEdit} onChange={(e) => patch({ priority: e.target.value as TaskPriority })}>
                {PRIORITIES.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={label}>مهلت انجام</label>
            <JalaliDateField value={t.dueDate} disabled={!fullEdit} onChange={(dueDate) => patch({ dueDate })} />
          </div>

          <div>
            <label className={label}>مسئول(ان) انجام</label>
            <div className="flex flex-wrap gap-2">
              {staff.map((u) => {
                const on = t.assigneeIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    disabled={!fullEdit}
                    onClick={() => patch({ assigneeIds: on ? t.assigneeIds.filter((x) => x !== u.id) : [...t.assigneeIds, u.id] })}
                    className={`flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full border text-[11px] font-bold transition-all ${
                      on ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-[#3A241F] border-[#EBDBCE] hover:bg-[#FAF5F1]'
                    } ${fullEdit ? 'cursor-pointer' : 'cursor-default opacity-80'}`}
                  >
                    <Avatar user={u} size={22} />
                    {u.fullName}
                  </button>
                );
              })}
              {staff.length === 0 && <span className="text-[11px] text-gray-400">کاربری وجود ندارد.</span>}
            </div>
          </div>

          <div>
            <label className={label}>
              چک‌لیست
              {t.checklist.length > 0 && (
                <span className="text-[#8C6F66] font-bold mr-2">
                  ({toPersianDigits(t.checklist.filter((c) => c.done).length)} از {toPersianDigits(t.checklist.length)})
                </span>
              )}
            </label>
            <div className="space-y-1.5">
              {t.checklist.map((c) => (
                <div key={c.id} className="flex items-center gap-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl px-3 py-2">
                  <input
                    type="checkbox"
                    checked={c.done}
                    disabled={!canMove}
                    onChange={(e) => patch({ checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, done: e.target.checked } : x)) })}
                    className="w-4 h-4 accent-sky-600 cursor-pointer"
                  />
                  <span className={`flex-1 text-xs font-medium ${c.done ? 'line-through text-gray-400' : 'text-[#3A241F]'}`}>{c.text}</span>
                  {fullEdit && (
                    <button type="button" onClick={() => patch({ checklist: t.checklist.filter((x) => x.id !== c.id) })} className="text-rose-500 hover:text-rose-700 cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {fullEdit && (
                <div className="flex gap-2">
                  <input
                    className={field}
                    value={newItem}
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addItem();
                      }
                    }}
                    placeholder="افزودن مورد جدید و زدن Enter"
                  />
                  <button type="button" onClick={addItem} className="px-3 rounded-xl bg-[#3A241F] text-white text-xs font-black cursor-pointer shrink-0">
                    افزودن
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className={label}>گفت‌وگو و گزارش پیشرفت</label>
            <div className="space-y-2">
              {t.comments.map((c) => (
                <div key={c.id} className="bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl px-3.5 py-2.5">
                  <div className="flex items-center justify-between text-[10px] font-bold text-[#8C6F66] mb-1">
                    <span className="inline-flex items-center gap-1 text-[#3A241F]">
                      <UserIcon className="w-3 h-3" />
                      {c.userName}
                    </span>
                    <span>
                      {formatTaskDate(c.createdAt.slice(0, 10))} – {toPersianDigits(new Date(c.createdAt).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))}
                    </span>
                  </div>
                  <p className="text-xs leading-6 text-[#3A241F] whitespace-pre-wrap">{c.text}</p>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  className={field}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addComment();
                    }
                  }}
                  placeholder="نظر یا گزارش خود را بنویسید..."
                />
                <button type="button" onClick={addComment} className="px-3 rounded-xl bg-sky-600 text-white text-xs font-black cursor-pointer shrink-0">
                  ارسال
                </button>
              </div>
            </div>
          </div>

          {!isNew && (
            <div className="text-[10px] font-bold text-[#8C6F66] flex flex-wrap gap-x-4 gap-y-1">
              <span>سازنده: {t.creatorName}</span>
              <span>ایجاد: {formatTaskDate(t.createdAt.slice(0, 10))}</span>
              {t.completedAt && <span>تکمیل: {formatTaskDate(t.completedAt.slice(0, 10))}</span>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#EBDBCE]">
          <div>
            {canDelete && (
              <button type="button" onClick={onDelete} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-rose-600 hover:bg-rose-50 cursor-pointer">
                <Trash2 className="w-4 h-4" />
                حذف وظیفه
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] hover:bg-white cursor-pointer">
              انصراف
            </button>
            <button type="submit" disabled={!t.title.trim()} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 cursor-pointer">
              {isNew ? 'ثبت وظیفه' : 'ذخیره'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
