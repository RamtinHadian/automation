import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FileImage, FilePlus2, Pencil, Plus, Printer, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { askConfirm } from '../../lib/confirmDialog';
import { toPersianDigits } from '../../lib/jalali';
import { fold, matchesQuery } from '../../lib/customerSearch';
import { formatTaskDate, isoToJalaliParts, todayIso } from '../../lib/taskDates';
import { buildMinutesHtml, openMinutesPrint } from '../../lib/minutesHtml';
import { downloadBlob, renderHtmlJpeg } from '../../lib/proformaFile';
import { Minutes, MinutesAttendee, MinutesDecision } from '../../types';
import { Modal, field, label } from '../crm/crmUi';
import { PersonPicker, PersonPickerMulti, staffItems } from '../common/PersonPicker';
import { JalaliDateField } from '../tasks/TasksView';

const uid = () => 'mn-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const STATUS_TEXT: Record<string, string> = { PRESENT: 'حاضر', ABSENT: 'غایب', EXCUSED: 'غایب موجه' };
const KINDS = ['جلسهٔ هیئت‌مدیره', 'جلسهٔ هماهنگی', 'جلسهٔ کمیته', 'جلسهٔ فروش', 'جلسهٔ واحد', 'جلسه با مشتری'];

/** The next number of the year, like «ص‌ج-۱۴۰۵-۰۰۳». */
export const nextMinutesNumber = (list: Minutes[], dateIso: string) => {
  const y = (isoToJalaliParts(dateIso) || isoToJalaliParts(todayIso()) || [1400])[0];
  const latin = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
  const used = list.map((m) => new RegExp(`^ص‌ج-${y}-(\\d+)$`).exec(latin(m.number))).filter(Boolean).map((r) => Number(r![1]));
  return toPersianDigits(`ص‌ج-${y}-${String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0')}`);
};

const blank = (list: Minutes[], who: string): Minutes => ({
  id: uid(),
  number: nextMinutesNumber(list, todayIso()),
  title: '',
  kind: '',
  date: todayIso(),
  startTime: '',
  endTime: '',
  place: '',
  chair: '',
  secretary: who,
  attendees: [],
  agenda: [''],
  discussion: '',
  decisions: [{ text: '', owner: '', due: undefined }],
  nextDate: undefined,
  nextTime: '',
  nextPlace: '',
  copies: '',
  status: 'DRAFT',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

/** A complete example, so the form can be seen filled in (colleagues are taken from the staff list). */
const sample = (list: Minutes[], who: string, people: { id: string; fullName: string; departmentName?: string }[]): Minutes => {
  const base = blank(list, who);
  const guests = people.slice(0, 3);
  const today = todayIso();
  const next = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const due = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  return {
    ...base,
    title: 'بررسی برنامهٔ فروش فصل و تقسیم وظایف واحدها',
    kind: 'جلسهٔ هماهنگی',
    date: today,
    startTime: '10:00',
    endTime: '11:30',
    place: 'اتاق جلسات، طبقهٔ دوم',
    chair: who,
    secretary: guests[0] ? guests[0].fullName : '',
    attendees: [
      ...guests.map((u, i): MinutesAttendee => ({ userId: u.id, name: u.fullName, position: u.departmentName || '', status: i === 2 ? 'EXCUSED' : 'PRESENT' })),
      { name: 'آقای مهندس رضایی', position: 'مشاور فنی (مهمان)', status: 'PRESENT' },
    ],
    agenda: ['گزارش عملکرد فروش ماه گذشته', 'بررسی پیشنهادهای قیمت ارسال‌شده و پیگیری مشتریان', 'تقسیم وظایف و تعیین مهلت اجرا'],
    discussion:
      'در ابتدا گزارش فروش ماه گذشته ارائه شد. اعضا دربارهٔ تأخیر در پاسخ به مشتریان و لزوم پیگیری منظم پیشنهادهای قیمت گفتگو کردند. توافق شد پیگیری‌ها در سامانه ثبت و هر هفته مرور شود.',
    decisions: [
      { text: 'پیشنهادهای قیمت بدون پاسخ ظرف سه روز کاری پیگیری و نتیجه در پروندهٔ مشتری ثبت شود.', owner: guests[1] ? guests[1].fullName : 'مسئول فروش', ownerUserId: guests[1]?.id, due: due(3) },
      { text: 'گزارش هفتگی فروش هر یکشنبه برای مدیریت ارسال شود.', owner: guests[0] ? guests[0].fullName : 'دبیر جلسه', ownerUserId: guests[0]?.id, due: due(7) },
      { text: 'فهرست قیمت جدید تجهیزات تا پایان ماه به‌روز و به همهٔ همکاران فروش ابلاغ شود.', owner: 'واحد مالی', due: due(14) },
    ],
    nextDate: next,
    nextTime: '10:00',
    nextPlace: 'اتاق جلسات، طبقهٔ دوم',
    copies: 'مدیریت، واحد فروش، واحد مالی',
    status: 'DRAFT',
  };
};

const statusBadge = (s: string) =>
  s === 'FINAL' ? <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">نهایی</span> : <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">پیش‌نویس</span>;

export const MinutesView: React.FC = () => {
  const { currentUser, staffList, settings, showToast } = useAppContext();
  const [list, setList] = useState<Minutes[] | null>(null);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Minutes | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.minutesList().then((r) => setList(r.minutes)).catch(() => setList([]));
  }, []);
  useEffect(load, [load]);
  // a notification about a minutes sheet opens the list
  useEffect(() => {
    const h = () => load();
    window.addEventListener('open-minutes-item', h);
    return () => window.removeEventListener('open-minutes-item', h);
  }, [load]);

  const people = useMemo(() => staffList.filter((u) => u.isActive !== false), [staffList]);
  const shown = useMemo(() => {
    if (!list) return [];
    const lines = (m: Minutes) => fold([m.number, m.title, m.place || '', m.chair || '', m.secretary || '', m.authorName || '', ...m.attendees.map((a) => a.name), ...m.decisions.map((d) => d.text)].join(' '));
    return list.filter((m) => matchesQuery(lines(m), q));
  }, [list, q]);

  const canEdit = (m: Minutes) => m.authorId === currentUser.id || currentUser.role === 'SUPER_ADMIN';
  const remove = async (m: Minutes) => {
    if (!(await askConfirm(`صورتجلسهٔ «${m.title}» حذف شود؟`))) return;
    try {
      await api.minutesDelete(m.id);
      showToast('صورتجلسه حذف شد.');
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'حذف نشد.');
    }
  };
  const jpg = async (m: Minutes) => {
    setBusy(m.id);
    try {
      const blob = await renderHtmlJpeg(buildMinutesHtml(m, settings, 'preview'));
      downloadBlob(blob, `${m.number || 'minutes'}.jpg`);
      showToast('تصویر JPG صورتجلسه ساخته و دریافت شد.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ساخت JPG ممکن نشد.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4" data-minutes-view>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-[#3A241F]">صورتجلسه</h2>
          <p className="text-[11px] text-[#8C6F66]">فرم کامل صورتجلسه با لوگو و قالب استاندارد؛ چاپ، PDF و JPG.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(sample(list || [], currentUser.fullName, people.filter((u) => u.id !== currentUser.id)))} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-black text-[#6E1B1B] bg-white border border-[#EBDBCE] hover:bg-[#F6D9CD]/40 cursor-pointer" data-minutes-sample>
            <FilePlus2 className="w-4 h-4" />
            ساخت از نمونه
          </button>
          <button type="button" onClick={() => setEditing(blank(list || [], currentUser.fullName))} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black text-white bg-[#6E1B1B] hover:bg-[#581717] cursor-pointer" data-minutes-new>
            <Plus className="w-4 h-4" />
            صورتجلسهٔ جدید
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-[#8C6F66] absolute right-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در شماره، موضوع، حاضرین و مصوبات…" className={`${field} pr-9`} />
      </div>

      {list === null ? (
        <p className="text-xs text-[#8C6F66]">در حال بارگذاری…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EBDBCE] bg-[#FDFAF7] p-8 text-center space-y-2">
          <p className="text-sm font-black text-[#3A241F]">{list.length === 0 ? 'هنوز صورتجلسه‌ای ثبت نشده است.' : 'صورتجلسه‌ای با این عبارت پیدا نشد.'}</p>
          {list.length === 0 && <p className="text-[11px] text-[#8C6F66]">«ساخت از نمونه» یک صورتجلسهٔ کامل پر‌شده برای دیدن قالب می‌سازد.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-minutes-list>
          {shown.map((m) => (
            <div key={m.id} className="rounded-2xl border border-[#EBDBCE] bg-white p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-black text-[#8C6F66]">{toPersianDigits(m.number)}</div>
                  <div className="font-black text-sm text-[#3A241F] leading-6">{m.title}</div>
                </div>
                {statusBadge(m.status)}
              </div>
              <div className="text-[11px] font-bold text-[#6B514A] flex flex-wrap gap-x-4 gap-y-1">
                <span>{m.date ? formatTaskDate(m.date) : ''}</span>
                {m.place && <span>{m.place}</span>}
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{toPersianDigits(m.attendees.length)} نفر</span>
                <span>{toPersianDigits(m.decisions.filter((d) => d.text.trim()).length)} مصوبه</span>
              </div>
              {m.authorName && <div className="text-[10px] text-[#8C6F66]">تنظیم‌کننده: {m.authorName}</div>}
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" onClick={() => openMinutesPrint(m, settings)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black bg-white border border-[#EBDBCE] hover:bg-[#FAF5F1] cursor-pointer" data-minutes-print>
                  <Printer className="w-3.5 h-3.5" />
                  چاپ / PDF
                </button>
                <button type="button" disabled={busy === m.id} onClick={() => jpg(m)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black bg-white border border-sky-200 text-sky-800 hover:bg-sky-50 disabled:opacity-50 cursor-pointer" data-minutes-jpg>
                  <FileImage className="w-3.5 h-3.5" />
                  {busy === m.id ? 'در حال ساخت…' : 'JPG'}
                </button>
                {canEdit(m) && (
                  <>
                    <button type="button" onClick={() => setEditing(m)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black text-white bg-[#6E1B1B] hover:bg-[#581717] cursor-pointer">
                      <Pencil className="w-3.5 h-3.5" />
                      ویرایش
                    </button>
                    <button type="button" onClick={() => remove(m)} className="p-1.5 rounded-xl text-rose-600 hover:bg-rose-50 cursor-pointer" title="حذف">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <MinutesEditor
          initial={editing}
          all={list || []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
};

const MinutesEditor: React.FC<{ initial: Minutes; all: Minutes[]; onClose: () => void; onSaved: () => void }> = ({ initial, all, onClose, onSaved }) => {
  const { staffList, settings, showToast, currentUser } = useAppContext();
  const [m, setM] = useState<Minutes>(initial);
  const [saving, setSaving] = useState(false);
  const patch = (u: Partial<Minutes>) => setM((p) => ({ ...p, ...u }));
  const people = useMemo(() => staffList.filter((u) => u.isActive !== false), [staffList]);
  const exists = all.some((x) => x.id === m.id);

  const attendeeIds = m.attendees.filter((a) => a.userId).map((a) => a.userId as string);
  const setColleagues = (ids: string[]) => {
    const keep = m.attendees.filter((a) => !a.userId || ids.includes(a.userId));
    const add = ids
      .filter((id) => !attendeeIds.includes(id))
      .map((id): MinutesAttendee => {
        const u = people.find((x) => x.id === id);
        return { userId: id, name: u?.fullName || '', position: u?.departmentName || '', status: 'PRESENT' };
      });
    patch({ attendees: [...keep, ...add] });
  };
  const setAttendee = (i: number, u: Partial<MinutesAttendee>) => patch({ attendees: m.attendees.map((a, idx) => (idx === i ? { ...a, ...u } : a)) });
  const setDecision = (i: number, u: Partial<MinutesDecision>) => patch({ decisions: m.decisions.map((d, idx) => (idx === i ? { ...d, ...u } : d)) });
  const clean = (): Minutes => ({
    ...m,
    title: m.title.trim(),
    agenda: m.agenda.map((x) => x.trim()).filter(Boolean),
    decisions: m.decisions.filter((d) => d.text.trim()),
    attendees: m.attendees.filter((a) => a.name.trim()),
    updatedAt: new Date().toISOString(),
    authorId: m.authorId || currentUser.id,
    authorName: m.authorName || currentUser.fullName,
  });
  const save = async (status: 'DRAFT' | 'FINAL', then?: (x: Minutes) => void) => {
    if (!m.title.trim()) return showToast('موضوع جلسه را بنویسید.');
    if (!m.date) return showToast('تاریخ جلسه را انتخاب کنید.');
    const next = { ...clean(), status };
    setSaving(true);
    try {
      await api.minutesSave(next);
      showToast(status === 'FINAL' ? 'صورتجلسه نهایی و ذخیره شد.' : 'پیش‌نویس ذخیره شد.');
      then?.(next);
      onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ذخیره نشد.');
      setSaving(false);
    }
  };
  const addDecision = () => patch({ decisions: [...m.decisions, { text: '', owner: '', due: undefined }] });

  return (
    <Modal
      title={exists ? 'ویرایش صورتجلسه' : 'صورتجلسهٔ جدید'}
      wide
      onClose={onClose}
      footer={
        <>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={() => openMinutesPrint(clean(), settings)} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[#EBDBCE] text-xs font-black cursor-pointer" data-minutes-preview>
              <Printer className="w-4 h-4" />
              پیش‌نمایش و چاپ
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[#EBDBCE] text-xs font-black cursor-pointer">
              انصراف
            </button>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={() => save('DRAFT')} className="px-4 py-2.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-black cursor-pointer disabled:opacity-60" data-minutes-draft>
              ذخیرهٔ پیش‌نویس
            </button>
            <button type="button" disabled={saving} onClick={() => save('FINAL')} className="px-5 py-2.5 rounded-xl bg-[#6E1B1B] text-white text-xs font-black cursor-pointer disabled:opacity-60" data-minutes-final>
              ذخیره و نهایی‌کردن
            </button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <span className={label}>موضوع جلسه *</span>
          <input className={field} value={m.title} onChange={(e) => patch({ title: e.target.value })} placeholder="مثلاً: بررسی برنامهٔ فروش فصل" data-minutes-title />
        </div>
        <div>
          <span className={label}>شمارهٔ صورتجلسه</span>
          <input className={field} value={m.number} onChange={(e) => patch({ number: toPersianDigits(e.target.value) })} />
        </div>
        <div>
          <span className={label}>نوع جلسه</span>
          <input className={field} list="minutes-kinds" value={m.kind || ''} onChange={(e) => patch({ kind: e.target.value })} placeholder="مثلاً: جلسهٔ هماهنگی" />
          <datalist id="minutes-kinds">
            {KINDS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </div>
        <div className="sm:col-span-2">
          <span className={label}>تاریخ جلسه *</span>
          <JalaliDateField value={m.date} onChange={(d) => patch({ date: d || m.date })} />
        </div>
        <div>
          <span className={label}>ساعت شروع</span>
          <input className={field} type="time" value={m.startTime || ''} onChange={(e) => patch({ startTime: e.target.value })} dir="ltr" />
        </div>
        <div>
          <span className={label}>ساعت پایان</span>
          <input className={field} type="time" value={m.endTime || ''} onChange={(e) => patch({ endTime: e.target.value })} dir="ltr" />
        </div>
        <div>
          <span className={label}>محل جلسه</span>
          <input className={field} value={m.place || ''} onChange={(e) => patch({ place: e.target.value })} placeholder="مثلاً: اتاق جلسات" />
        </div>
        <div>
          <span className={label}>رئیس جلسه</span>
          <PersonPicker title="رئیس جلسه" items={staffItems(people)} value={people.find((u) => u.fullName === m.chair)?.id || ''} onChange={(id) => patch({ chair: people.find((u) => u.id === id)?.fullName || '' })} emptyLabel={m.chair || 'انتخاب (یا در کادر زیر بنویسید)'} />
          <input className={`${field} mt-1.5`} value={m.chair || ''} onChange={(e) => patch({ chair: e.target.value })} placeholder="یا نام را بنویسید" />
        </div>
        <div>
          <span className={label}>دبیر جلسه</span>
          <PersonPicker title="دبیر جلسه" items={staffItems(people)} value={people.find((u) => u.fullName === m.secretary)?.id || ''} onChange={(id) => patch({ secretary: people.find((u) => u.id === id)?.fullName || '' })} emptyLabel={m.secretary || 'انتخاب (یا در کادر زیر بنویسید)'} />
          <input className={`${field} mt-1.5`} value={m.secretary || ''} onChange={(e) => patch({ secretary: e.target.value })} placeholder="یا نام را بنویسید" />
        </div>
      </div>

      <div className="space-y-2" data-minutes-attendees>
        <div className="flex items-center justify-between gap-2">
          <span className={`${label} mb-0`}>حاضرین و دعوت‌شدگان</span>
          <button type="button" onClick={() => patch({ attendees: [...m.attendees, { name: '', position: '', status: 'PRESENT' }] })} className="flex items-center gap-1 text-[11px] font-black text-[#6E1B1B] cursor-pointer" data-add-guest>
            <UserPlus className="w-3.5 h-3.5" />
            افزودن مهمان یا فرد بیرون از سازمان
          </button>
        </div>
        <PersonPickerMulti title="انتخاب همکاران حاضر" placeholder="افزودن همکاران از فهرست کارکنان…" items={staffItems(people)} values={attendeeIds} onChange={setColleagues} />
        {m.attendees.length > 0 && (
          <div className="rounded-2xl border border-[#EBDBCE] divide-y divide-[#EBDBCE]/60">
            {m.attendees.map((a, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 p-2 items-center">
                <input className={`${field} col-span-12 sm:col-span-4`} value={a.name} onChange={(e) => setAttendee(i, { name: e.target.value })} placeholder="نام و نام خانوادگی" disabled={!!a.userId} />
                <input className={`${field} col-span-7 sm:col-span-4`} value={a.position || ''} onChange={(e) => setAttendee(i, { position: e.target.value })} placeholder="سمت" />
                <select className={`${field} col-span-4 sm:col-span-3`} value={a.status} onChange={(e) => setAttendee(i, { status: e.target.value as MinutesAttendee['status'] })}>
                  {Object.entries(STATUS_TEXT).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <button type="button" onClick={() => patch({ attendees: m.attendees.filter((_, idx) => idx !== i) })} className="col-span-1 p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer" aria-label="حذف">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <span className={label}>دستور جلسه</span>
        {m.agenda.map((x, i) => (
          <div key={i} className="flex gap-2">
            <span className="w-6 text-center text-[11px] font-black text-[#8C6F66] pt-2.5">{toPersianDigits(i + 1)}</span>
            <input className={field} value={x} onChange={(e) => patch({ agenda: m.agenda.map((y, idx) => (idx === i ? e.target.value : y)) })} placeholder="موضوع مورد بحث" />
            <button type="button" disabled={m.agenda.length === 1} onClick={() => patch({ agenda: m.agenda.filter((_, idx) => idx !== i) })} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg disabled:opacity-30 cursor-pointer" aria-label="حذف">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => patch({ agenda: [...m.agenda, ''] })} className="flex items-center gap-1 text-[11px] font-black text-[#6E1B1B] cursor-pointer">
          <Plus className="w-3.5 h-3.5" />
          بند دیگر
        </button>
      </div>

      <div>
        <span className={label}>شرح مذاکرات (خلاصهٔ آنچه گفته شد)</span>
        <textarea className={`${field} min-h-[90px] leading-7`} value={m.discussion || ''} onChange={(e) => patch({ discussion: e.target.value })} />
      </div>

      <div className="space-y-2" data-minutes-decisions>
        <span className={label}>مصوبات جلسه (مسئول اجرا و مهلت)</span>
        {m.decisions.map((d, i) => (
          <div key={i} className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3 space-y-2">
            <div className="flex gap-2">
              <span className="w-6 text-center text-[11px] font-black text-[#8C6F66] pt-2.5">{toPersianDigits(i + 1)}</span>
              <textarea className={`${field} min-h-[54px] leading-6`} value={d.text} onChange={(e) => setDecision(i, { text: e.target.value })} placeholder="شرح مصوبه" />
              <button type="button" disabled={m.decisions.length === 1 && !d.text} onClick={() => patch({ decisions: m.decisions.length === 1 ? [{ text: '', owner: '', due: undefined }] : m.decisions.filter((_, idx) => idx !== i) })} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg disabled:opacity-30 cursor-pointer h-fit" aria-label="حذف">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pr-8">
              <div>
                <span className={label}>مسئول اجرا</span>
                <PersonPicker title="مسئول اجرا" items={staffItems(people)} value={d.ownerUserId || ''} onChange={(id) => setDecision(i, { ownerUserId: id || undefined, owner: people.find((u) => u.id === id)?.fullName || d.owner })} emptyLabel={d.owner || 'انتخاب همکار…'} />
                <input className={`${field} mt-1.5`} value={d.owner || ''} onChange={(e) => setDecision(i, { owner: e.target.value, ownerUserId: undefined })} placeholder="یا نام واحد / فرد را بنویسید" />
              </div>
              <div>
                <span className={label}>مهلت اجرا</span>
                <JalaliDateField value={d.due} onChange={(due) => setDecision(i, { due })} />
                {d.due && (
                  <button type="button" onClick={() => setDecision(i, { due: undefined })} className="text-[10px] font-black text-rose-600 mt-1 cursor-pointer">حذف تاریخ</button>
                )}
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={addDecision} className="flex items-center gap-1 text-[11px] font-black text-[#6E1B1B] cursor-pointer" data-add-decision>
          <Plus className="w-3.5 h-3.5" />
          مصوبهٔ دیگر
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <span className={label}>تاریخ جلسهٔ بعد</span>
          <JalaliDateField value={m.nextDate} onChange={(nextDate) => patch({ nextDate })} />
          {m.nextDate && (
            <button type="button" onClick={() => patch({ nextDate: undefined })} className="text-[10px] font-black text-rose-600 mt-1 cursor-pointer">حذف تاریخ</button>
          )}
        </div>
        <div>
          <span className={label}>ساعت جلسهٔ بعد</span>
          <input className={field} type="time" value={m.nextTime || ''} onChange={(e) => patch({ nextTime: e.target.value })} dir="ltr" />
        </div>
        <div>
          <span className={label}>محل جلسهٔ بعد</span>
          <input className={field} value={m.nextPlace || ''} onChange={(e) => patch({ nextPlace: e.target.value })} />
        </div>
        <div className="sm:col-span-3">
          <span className={label}>رونوشت (به چه کسانی ابلاغ می‌شود)</span>
          <input className={field} value={m.copies || ''} onChange={(e) => patch({ copies: e.target.value })} placeholder="مثلاً: مدیریت، واحد مالی" />
        </div>
      </div>
      <p className="text-[11px] text-[#8C6F66] leading-6">همکارانی که در فهرست حاضرین انتخاب شده‌اند، پس از «نهایی‌کردن» صورتجلسه را در بخش صورتجلسه می‌بینند و اعلان می‌گیرند. لوگو و نام سازمان از تنظیمات سازمان می‌آید.</p>
    </Modal>
  );
};
