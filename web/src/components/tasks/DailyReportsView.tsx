import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  History,
  ListPlus,
  Plus,
  Save,
  Send,
  Trash2,
  Users,
  AlertTriangle,
  X,
  FileText,
} from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { DailyReport, DailyReportItem, ReportItemStatus, User } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate, todayIso } from '../../lib/taskDates';
import { Avatar, JalaliDateField } from './TasksView';

const STATUS: { id: ReportItemStatus; label: string; cls: string }[] = [
  { id: 'DONE', label: 'انجام شد', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'IN_PROGRESS', label: 'در جریان', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  { id: 'BLOCKED', label: 'متوقف', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
];
const statusOf = (s: ReportItemStatus) => STATUS.find((x) => x.id === s) || STATUS[0];
const uid = (p: string) => p + '-' + Math.random().toString(36).substring(2, 10);
const totalHours = (r: Pick<DailyReport, 'items'>) => r.items.reduce((sum, i) => sum + (Number(i.hours) || 0), 0);
const fmtHours = (h: number) => toPersianDigits(Number.isInteger(h) ? h : h.toFixed(1));

const field =
  'w-full px-3.5 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-medium text-[#3A241F] outline-hidden focus:ring-2 focus:ring-sky-500/20 disabled:opacity-70';
const label = 'block text-[11px] font-black text-[#3A241F] mb-1.5';

interface FormState {
  summary: string;
  items: DailyReportItem[];
  blockers: string;
  tomorrow: string;
  recipientIds: string[];
}
const blank = (recipientIds: string[]): FormState => ({ summary: '', items: [], blockers: '', tomorrow: '', recipientIds });

export const DailyReportsView: React.FC = () => {
  const { reports, setReports, tasks, staffList, currentUser, showToast } = useAppContext();
  const me = currentUser.id;
  const isAdmin = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEPT_ADMIN';

  const [tab, setTab] = useState<'mine' | 'team'>('mine');
  const [date, setDate] = useState(todayIso());
  const [teamDate, setTeamDate] = useState(todayIso());
  const [viewing, setViewing] = useState<DailyReport | null>(null);

  const userById = useMemo(() => new Map(staffList.map((u) => [u.id, u])), [staffList]);
  const myReports = useMemo(() => reports.filter((r) => r.userId === me).sort((a, b) => b.date.localeCompare(a.date)), [reports, me]);
  const othersReports = useMemo(() => reports.filter((r) => r.userId !== me), [reports, me]);
  const canSeeTeam = isAdmin || othersReports.length > 0;
  const current = myReports.find((r) => r.date === date);

  // Default recipients: the last ones the person used, otherwise nobody (admins see every report anyway).
  const lastRecipients = myReports[0]?.recipientIds || [];
  const [form, setForm] = useState<FormState>(() => blank(lastRecipients));
  useEffect(() => {
    setForm(
      current
        ? { summary: current.summary, items: current.items, blockers: current.blockers, tomorrow: current.tomorrow, recipientIds: current.recipientIds }
        : blank(lastRecipients)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, current?.updatedAt]);

  const myTasks = useMemo(() => tasks.filter((t) => t.assigneeIds.includes(me)), [tasks, me]);
  const [draftText, setDraftText] = useState('');
  const [draftTask, setDraftTask] = useState('');
  const [draftHours, setDraftHours] = useState('');
  const [draftStatus, setDraftStatus] = useState<ReportItemStatus>('DONE');

  const addItem = () => {
    const linked = myTasks.find((t) => t.id === draftTask);
    const text = draftText.trim() || linked?.title || '';
    if (!text) return;
    const hours = parseFloat(draftHours.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
    setForm((f) => ({
      ...f,
      items: [...f.items, { id: uid('ri'), text, taskId: linked?.id, hours: isNaN(hours) ? undefined : hours, status: draftStatus }],
    }));
    setDraftText('');
    setDraftTask('');
    setDraftHours('');
    setDraftStatus('DONE');
  };

  const canSave = form.summary.trim() !== '' || form.items.length > 0;
  const save = () => {
    if (!canSave) return;
    const now = new Date().toISOString();
    const report: DailyReport = {
      id: `${me}_${date}`,
      userId: me,
      authorName: currentUser.fullName,
      date,
      summary: form.summary.trim(),
      items: form.items,
      blockers: form.blockers.trim(),
      tomorrow: form.tomorrow.trim(),
      recipientIds: form.recipientIds,
      createdAt: current?.createdAt || now,
      updatedAt: now,
    };
    setReports((prev) => (prev.some((r) => r.id === report.id) ? prev.map((r) => (r.id === report.id ? report : r)) : [report, ...prev]));
    showToast(current ? 'گزارش به‌روز شد.' : 'گزارش روزانه ثبت شد.');
  };

  const remove = (r: DailyReport) => {
    if (!window.confirm(`گزارش ${formatTaskDate(r.date)} حذف شود؟`)) return;
    setReports((prev) => prev.filter((x) => x.id !== r.id));
    setViewing(null);
    showToast('گزارش حذف شد.');
  };

  const isToday = date === todayIso();
  const recipientChoices = staffList.filter((u) => u.isActive && u.id !== me);

  // ---------- team view ----------
  const teamReports = useMemo(() => othersReports.filter((r) => r.date === teamDate).sort((a, b) => a.authorName.localeCompare(b.authorName, 'fa')), [othersReports, teamDate]);
  const missing = useMemo(() => {
    if (!isAdmin) return [] as User[];
    const submitted = new Set(reports.filter((r) => r.date === teamDate).map((r) => r.userId));
    return staffList.filter(
      (u) => u.isActive && (u.canUseTasks || u.role === 'SUPER_ADMIN' || u.role === 'DEPT_ADMIN') && !submitted.has(u.id)
    );
  }, [isAdmin, reports, staffList, teamDate]);
  const teamHours = teamReports.reduce((sum, r) => sum + totalHours(r), 0);

  const reportCard = (r: DailyReport, showAuthor: boolean) => {
    const author = userById.get(r.userId);
    const h = totalHours(r);
    const blocked = r.items.filter((i) => i.status === 'BLOCKED').length;
    return (
      <button
        key={r.id}
        type="button"
        onClick={() => setViewing(r)}
        className="w-full text-right bg-white border border-[#EBDBCE] rounded-2xl p-3.5 space-y-2 hover:shadow-md transition-all cursor-pointer"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {showAuthor && <Avatar user={author} size={28} />}
            <div className="min-w-0">
              <div className="font-black text-[13px] text-[#3A241F] truncate">{showAuthor ? r.authorName : formatTaskDate(r.date)}</div>
              {showAuthor && <div className="text-[10px] text-[#8C6F66]">{formatTaskDate(r.date)}</div>}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 text-[10px] font-black">
            {h > 0 && (
              <span className="inline-flex items-center gap-1 bg-[#FAF5F1] border border-[#EBDBCE] rounded-full px-2 py-0.5 text-[#3A241F]">
                <Clock className="w-3 h-3" />
                {fmtHours(h)} ساعت
              </span>
            )}
            {blocked > 0 && <span className="bg-rose-50 text-rose-700 border border-rose-200 rounded-full px-2 py-0.5">{toPersianDigits(blocked)} متوقف</span>}
          </div>
        </div>
        {r.summary && <p className="text-[11px] text-[#8C6F66] leading-6 line-clamp-2">{r.summary}</p>}
        <div className="text-[10px] font-bold text-[#8C6F66]">{toPersianDigits(r.items.length)} مورد کاری</div>
      </button>
    );
  };

  return (
    <div className="flex-1 p-3.5 sm:p-8 space-y-4 sm:space-y-5 pb-32 sm:pb-8 select-none overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-lg text-[#3A241F]">گزارش روزانه</h2>
          <p className="text-xs text-[#8C6F66] mt-0.5">هر روز کارهای انجام‌شده، موانع و برنامهٔ فردا را ثبت کنید.</p>
        </div>
        {canSeeTeam && (
          <div className="flex bg-[#FAF5F1] border border-[#EBDBCE] rounded-2xl p-1 self-start">
            {([
              ['mine', 'گزارش من', FileText],
              ['team', isAdmin ? 'گزارش‌های همکاران' : 'گزارش‌های دریافتی', Users],
            ] as const).map(([id, text, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black transition-all cursor-pointer ${
                  tab === id ? 'bg-white text-sky-700 shadow-2xs' : 'text-[#8C6F66] hover:text-[#3A241F]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {text}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'mine' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5 items-start">
          {/* form */}
          <div className="xl:col-span-2 bg-white border border-[#EBDBCE] rounded-3xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label className={label}>تاریخ گزارش</label>
                <JalaliDateField
                  value={date}
                  onChange={(d) => {
                    if (d && d <= todayIso()) setDate(d);
                    else if (d) showToast('تاریخ آینده مجاز نیست.');
                  }}
                />
              </div>
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-black px-3 py-1.5 rounded-full border ${
                  current ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {current ? <CheckCircle2 className="w-3.5 h-3.5" /> : <CalendarCheck className="w-3.5 h-3.5" />}
                {current ? 'ثبت شده؛ می‌توانید ویرایش کنید' : isToday ? 'گزارش امروز هنوز ثبت نشده' : 'برای این روز گزارشی ثبت نشده'}
              </span>
            </div>

            <div>
              <label className={label}>خلاصهٔ کار امروز</label>
              <textarea className={`${field} min-h-[84px] leading-6`} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="امروز چه کارهایی انجام دادید؟" />
            </div>

            <div>
              <label className={label}>
                موارد انجام‌شده
                {totalHours(form) > 0 && <span className="text-[#8C6F66] font-bold mr-2">({fmtHours(totalHours(form))} ساعت)</span>}
              </label>
              <div className="space-y-1.5">
                {form.items.map((it) => {
                  const st = statusOf(it.status);
                  const linked = it.taskId ? tasks.find((t) => t.id === it.taskId) : undefined;
                  return (
                    <div key={it.id} className="flex items-center gap-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl px-3 py-2">
                      <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                      <span className="flex-1 min-w-0 text-xs font-medium text-[#3A241F]">
                        {it.text}
                        {linked && <span className="text-[10px] text-sky-700 font-bold mr-2">وظیفه: {linked.title}</span>}
                      </span>
                      {it.hours !== undefined && <span className="text-[10px] font-black text-[#8C6F66] shrink-0">{fmtHours(it.hours)} ساعت</span>}
                      <button type="button" onClick={() => setForm({ ...form, items: form.items.filter((x) => x.id !== it.id) })} className="text-rose-500 hover:text-rose-700 cursor-pointer shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}

                <div className="bg-white border border-dashed border-[#C98B6A] rounded-2xl p-3 space-y-2">
                  <input
                    className={field}
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addItem();
                      }
                    }}
                    placeholder="کار انجام‌شده را بنویسید (یا از وظایف خود انتخاب کنید)"
                  />
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <select className={`${field} col-span-2`} value={draftTask} onChange={(e) => setDraftTask(e.target.value)}>
                      <option value="">بدون ارتباط با وظیفه</option>
                      {myTasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                    <input className={field} inputMode="decimal" value={draftHours} onChange={(e) => setDraftHours(e.target.value)} placeholder="ساعت (مثلاً ۱٫۵)" />
                    <select className={field} value={draftStatus} onChange={(e) => setDraftStatus(e.target.value as ReportItemStatus)}>
                      {STATUS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="button" onClick={addItem} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[#3A241F] text-white text-xs font-black cursor-pointer">
                    <ListPlus className="w-4 h-4" />
                    افزودن به گزارش
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={label}>موانع و مشکلات</label>
                <textarea className={`${field} min-h-[72px] leading-6`} value={form.blockers} onChange={(e) => setForm({ ...form, blockers: e.target.value })} placeholder="اگر مانعی برای انجام کار داشتید بنویسید" />
              </div>
              <div>
                <label className={label}>برنامهٔ فردا</label>
                <textarea className={`${field} min-h-[72px] leading-6`} value={form.tomorrow} onChange={(e) => setForm({ ...form, tomorrow: e.target.value })} placeholder="فردا چه کارهایی را انجام می‌دهید؟" />
              </div>
            </div>

            <div>
              <label className={label}>ارسال گزارش برای (علاوه بر مدیران)</label>
              <div className="flex flex-wrap gap-2">
                {recipientChoices.map((u) => {
                  const on = form.recipientIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setForm({ ...form, recipientIds: on ? form.recipientIds.filter((x) => x !== u.id) : [...form.recipientIds, u.id] })}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold transition-all cursor-pointer ${
                        on ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-[#3A241F] border-[#EBDBCE] hover:bg-[#FAF5F1]'
                      }`}
                    >
                      <Avatar user={u} size={22} />
                      {u.fullName}
                    </button>
                  );
                })}
                {recipientChoices.length === 0 && <span className="text-[11px] text-gray-400">کاربر دیگری وجود ندارد.</span>}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              {current ? (
                <button type="button" onClick={() => remove(current)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-rose-600 hover:bg-rose-50 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                  حذف گزارش
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                disabled={!canSave}
                onClick={save}
                className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-black shadow-md shadow-sky-600/25 cursor-pointer"
              >
                {current ? <Save className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                {current ? 'ذخیرهٔ تغییرات' : 'ثبت گزارش'}
              </button>
            </div>
          </div>

          {/* history */}
          <div className="bg-[#FAF5F1]/70 border border-[#EBDBCE] rounded-3xl p-4 space-y-3">
            <div className="flex items-center gap-2 font-black text-sm text-[#3A241F]">
              <History className="w-4 h-4 text-sky-600" />
              گزارش‌های قبلی من
            </div>
            {myReports.length === 0 ? (
              <div className="text-center text-[11px] font-bold text-gray-400 py-6 border border-dashed border-[#EBDBCE] rounded-2xl">هنوز گزارشی ثبت نکرده‌اید.</div>
            ) : (
              <div className="space-y-2 max-h-[560px] overflow-y-auto">{myReports.slice(0, 30).map((r) => reportCard(r, false))}</div>
            )}
          </div>
        </div>
      )}

      {tab === 'team' && canSeeTeam && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <label className={label}>گزارش‌های روز</label>
              <JalaliDateField value={teamDate} onChange={(d) => d && setTeamDate(d)} />
            </div>
            <div className="flex items-center gap-2 text-[11px] font-black">
              <span className="bg-white border border-[#EBDBCE] rounded-full px-3 py-1.5">{toPersianDigits(teamReports.length)} گزارش</span>
              <span className="bg-white border border-[#EBDBCE] rounded-full px-3 py-1.5">{fmtHours(teamHours)} ساعت کار</span>
              {isAdmin && missing.length > 0 && (
                <span className="bg-amber-50 text-amber-800 border border-amber-200 rounded-full px-3 py-1.5">{toPersianDigits(missing.length)} نفر ثبت نکرده‌اند</span>
              )}
            </div>
          </div>

          {teamReports.length === 0 ? (
            <div className="text-center text-xs font-bold text-gray-400 py-12 bg-white border border-[#EBDBCE] rounded-3xl">برای این روز گزارشی ثبت نشده است.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{teamReports.map((r) => reportCard(r, true))}</div>
          )}

          {isAdmin && missing.length > 0 && (
            <div className="bg-amber-50/60 border border-amber-200 rounded-3xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 font-black text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                گزارش این روز را ثبت نکرده‌اند
              </div>
              <div className="flex flex-wrap gap-2">
                {missing.map((u) => (
                  <span key={u.id} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-amber-200 text-[11px] font-bold text-[#3A241F]">
                    <Avatar user={u} size={22} />
                    {u.fullName}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={() => setViewing(null)}>
          <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col border border-[#EBDBCE] text-right">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE]">
              <div>
                <h3 className="font-black text-sm text-[#3A241F]">گزارش روزانهٔ {viewing.authorName}</h3>
                <div className="text-[11px] text-[#8C6F66] font-bold mt-0.5">
                  {formatTaskDate(viewing.date)} · {fmtHours(totalHours(viewing))} ساعت
                </div>
              </div>
              <button type="button" onClick={() => setViewing(null)} className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              {viewing.summary && (
                <section>
                  <div className={label}>خلاصهٔ کار</div>
                  <p className="leading-7 text-[#3A241F] whitespace-pre-wrap">{viewing.summary}</p>
                </section>
              )}
              {viewing.items.length > 0 && (
                <section>
                  <div className={label}>موارد انجام‌شده</div>
                  <div className="space-y-1.5">
                    {viewing.items.map((it) => {
                      const st = statusOf(it.status);
                      const linked = it.taskId ? tasks.find((t) => t.id === it.taskId) : undefined;
                      return (
                        <div key={it.id} className="flex items-center gap-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl px-3 py-2">
                          <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border ${st.cls}`}>{st.label}</span>
                          <span className="flex-1 min-w-0 font-medium text-[#3A241F]">
                            {it.text}
                            {linked && <span className="text-[10px] text-sky-700 font-bold mr-2">وظیفه: {linked.title}</span>}
                          </span>
                          {it.hours !== undefined && <span className="text-[10px] font-black text-[#8C6F66] shrink-0">{fmtHours(it.hours)} ساعت</span>}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
              {viewing.blockers && (
                <section>
                  <div className={label}>موانع و مشکلات</div>
                  <p className="leading-7 text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2 whitespace-pre-wrap">{viewing.blockers}</p>
                </section>
              )}
              {viewing.tomorrow && (
                <section>
                  <div className={label}>برنامهٔ فردا</div>
                  <p className="leading-7 text-[#3A241F] whitespace-pre-wrap">{viewing.tomorrow}</p>
                </section>
              )}
              {viewing.recipientIds.length > 0 && (
                <div className="text-[10px] font-bold text-[#8C6F66]">
                  ارسال‌شده برای: {viewing.recipientIds.map((id) => userById.get(id)?.fullName || '—').join('، ')}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#EBDBCE]">
              {isAdmin || viewing.userId === me ? (
                <button type="button" onClick={() => remove(viewing)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-rose-600 hover:bg-rose-50 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                  حذف
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
                {viewing.userId === me && (
                  <button
                    type="button"
                    onClick={() => {
                      setDate(viewing.date);
                      setTab('mine');
                      setViewing(null);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-sky-600 hover:bg-sky-700 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    ویرایش
                  </button>
                )}
                <button type="button" onClick={() => setViewing(null)} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] hover:bg-white cursor-pointer">
                  بستن
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
