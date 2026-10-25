import { CustomerSelect } from '../common/CustomerSelect';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, FileImage, Sparkles, Loader2, FilePlus2, Pencil, Plus, Printer, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { askConfirm } from '../../lib/confirmDialog';
import { toPersianDigits } from '../../lib/jalali';
import { fold, matchesQuery } from '../../lib/customerSearch';
import { formatTaskDate, todayIso, formatDateTime } from '../../lib/taskDates';
import { buildMinutesHtml, openMinutesPrint } from '../../lib/minutesHtml';
import { getMinutesConfig, nextMinutesNumber, typeOf } from '../../lib/minutesConfig';
import { downloadBlob, renderHtmlJpeg } from '../../lib/proformaFile';
import { Minutes, MinutesAttendee, MinutesConfig, MinutesDecision, MinutesGoodsLine, MinutesType } from '../../types';
import { Modal, field, label } from '../crm/crmUi';
import { PersonPicker, PersonPickerMulti, staffItems, customerItems } from '../common/PersonPicker';
import { JalaliDateField } from '../tasks/TasksView';
import { printCertificates } from '../warranty/certificate';
import { warrantyEnd } from '../../lib/warranty';
import { Warranty } from '../../types';

const uid = () => 'mn-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const STATUS_TEXT: Record<string, string> = { PRESENT: 'حاضر', ABSENT: 'غایب', EXCUSED: 'غایب موجه' };
const addDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const nowHm = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

export const blank = (cfg: MinutesConfig, list: Minutes[], who: string, typeId = 'general'): Minutes => {
  const t = typeOf(cfg, typeId);
  const date = todayIso();
  return {
    id: uid(),
    number: nextMinutesNumber(cfg, t.id, date, list),
    typeId: t.id,
    title: '',
    kind: '',
    date,
    startTime: nowHm(),
    endTime: '',
    place: '',
    chair: '',
    secretary: who,
    attendees: [],
    agenda: t.defaultAgenda.length ? [...t.defaultAgenda] : [''],
    discussion: '',
    decisions: [{ text: '', owner: '', due: undefined }],
    nextDate: undefined,
    nextTime: '',
    nextPlace: '',
    copies: '',
    parties: { first: { name: '' }, second: { name: '' } },
    goods: [{ title: '', code: '', qty: 1, unit: 'عدد', note: '' }],
    fields: {},
    conditions: t.defaultConditions,
    status: 'DRAFT',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

/** A complete example of the given sort, so the form can be seen filled in (colleagues are taken from the staff list). */
export const sample = (cfg: MinutesConfig, list: Minutes[], who: string, people: { id: string; fullName: string; departmentName?: string }[], typeId: string): Minutes => {
  const t = typeOf(cfg, typeId);
  const base = blank(cfg, list, who, t.id);
  const guests = people.slice(0, 3);
  const common = { ...base, date: todayIso(), startTime: '10:00', endTime: '11:30', place: 'اتاق جلسات، طبقهٔ دوم', chair: who, secretary: guests[0] ? guests[0].fullName : '' };
  const fields: Record<string, string> = {};
  if (t.sections.goods) {
    t.fields.forEach((f, i) => (fields[f.id] = f.kind === 'date' ? addDays(0) : ['F-۱۴۰۵-۰۴۲۱', 'PO-۸۸۱۲', 'خودروی باری، پلاک ۱۲ ب ۳۴۵ ایران ۱۰'][i] || ''));
    return {
      ...common,
      title: 'تحویل تجهیزات شبکه و سرور به انبار مرکزی',
      startTime: '14:00',
      endTime: '15:00',
      place: 'انبار مرکزی',
      parties: {
        first: { name: 'شرکت فناوران ابری ایران', position: 'آقای امیر کریمی، مسئول ارسال', phone: '۰۹۱۲۱۲۳۴۵۶۷' },
        second: { name: guests[0] ? guests[0].fullName : 'انباردار', position: 'انباردار شرکت', phone: '' },
      },
      goods: [
        { title: 'سوئیچ ۲۴ پورت گیگابیت', code: '۱۰۰۲', qty: 4, unit: 'دستگاه', note: 'سالم، پلمپ' },
        { title: 'روتر وای‌فای ax1800', code: '۱۰۰۱', qty: 6, unit: 'عدد', note: 'سالم' },
        { title: 'هارد SSD اینترنال ۵۱۲ گیگ', code: '۱۰۰۴', qty: 10, unit: 'عدد', note: 'یک عدد جعبه خراشیدگی دارد، دستگاه سالم است' },
        { title: 'کابل شبکه Cat6 (حلقه ۳۰۵ متری)', code: '۱۰۱۰', qty: 3, unit: 'رول', note: 'سالم' },
      ],
      fields,
      conditions: t.defaultConditions,
      copies: 'واحد مالی، انبار، بایگانی',
    };
  }
  if (t.sections.parties) {
    t.fields.forEach((f) => (fields[f.id] = 'پروژهٔ راه‌اندازی سامانهٔ اتوماسیون'));
    return {
      ...common,
      title: 'تحویل پروژهٔ راه‌اندازی سامانهٔ اتوماسیون',
      parties: { first: { name: guests[0] ? guests[0].fullName : 'تحویل‌دهنده', position: 'مدیر پروژه' }, second: { name: guests[1] ? guests[1].fullName : 'تحویل‌گیرنده', position: 'مسئول جدید پروژه' } },
      fields,
      discussion: 'مستندات فنی، دسترسی‌های سامانه و فهرست کارهای باز پروژه تحویل شد و توضیحات لازم داده شد.',
      decisions: [{ text: 'گزارش وضعیت پروژه ظرف یک هفته به مدیریت ارسال شود.', owner: guests[1] ? guests[1].fullName : '', ownerUserId: guests[1]?.id, due: addDays(7) }],
      copies: 'مدیریت، بایگانی',
    };
  }
  t.fields.forEach((f, i) => (fields[f.id] = ['نمونه', 'محل نمونه'][i] || ''));
  return {
    ...common,
    title: 'بررسی برنامهٔ فروش فصل و تقسیم وظایف واحدها',
    attendees: [
      ...guests.map((u, i): MinutesAttendee => ({ userId: u.id, name: u.fullName, position: u.departmentName || '', status: i === 2 ? 'EXCUSED' : 'PRESENT' })),
      { name: 'آقای مهندس رضایی', position: 'مشاور فنی (مهمان)', status: 'PRESENT' },
    ],
    agenda: ['گزارش عملکرد فروش ماه گذشته', 'بررسی پیشنهادهای قیمت ارسال‌شده و پیگیری مشتریان', 'تقسیم وظایف و تعیین مهلت اجرا'],
    discussion: 'در ابتدا گزارش فروش ماه گذشته ارائه شد. اعضا دربارهٔ تأخیر در پاسخ به مشتریان و لزوم پیگیری منظم پیشنهادهای قیمت گفتگو کردند. توافق شد پیگیری‌ها در سامانه ثبت و هر هفته مرور شود.',
    decisions: [
      { text: 'پیشنهادهای قیمت بدون پاسخ ظرف سه روز کاری پیگیری و نتیجه در پروندهٔ مشتری ثبت شود.', owner: guests[1] ? guests[1].fullName : 'مسئول فروش', ownerUserId: guests[1]?.id, due: addDays(3) },
      { text: 'گزارش هفتگی فروش هر یکشنبه برای مدیریت ارسال شود.', owner: guests[0] ? guests[0].fullName : 'دبیر جلسه', ownerUserId: guests[0]?.id, due: addDays(7) },
      { text: 'فهرست قیمت جدید تجهیزات تا پایان ماه به‌روز و به همهٔ همکاران فروش ابلاغ شود.', owner: 'واحد مالی', due: addDays(14) },
    ],
    nextDate: addDays(7),
    nextTime: '10:00',
    nextPlace: 'اتاق جلسات، طبقهٔ دوم',
    copies: 'مدیریت، واحد فروش، واحد مالی',
    fields,
  };
};

const statusBadge = (s: string) =>
  s === 'FINAL' ? <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">نهایی</span> : <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">پیش‌نویس</span>;

export const MinutesView: React.FC = () => {
  const { currentUser, staffList, settings, showToast } = useAppContext();
  const cfg = useMemo(() => getMinutesConfig(settings), [settings]);
  const activeTypes = cfg.types.filter((t) => t.active !== false);
  const [list, setList] = useState<Minutes[] | null>(null);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [editing, setEditing] = useState<Minutes | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<'new' | 'sample' | null>(null);
  const [view, setView] = useState<'all' | 'draft' | 'archive'>('all');

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
    const lines = (m: Minutes) => fold([m.number, m.title, m.place || '', m.chair || '', m.secretary || '', m.authorName || '', ...m.attendees.map((a) => a.name), ...m.decisions.map((d) => d.text), ...(m.goods || []).map((g) => g.title), m.parties?.first?.name || '', m.parties?.second?.name || '', ...Object.values(m.fields || {})].join(' '));
    return list.filter((m) => (view === 'all' || (view === 'archive' ? m.status === 'FINAL' : m.status !== 'FINAL')) && (!typeFilter || (m.typeId || 'general') === typeFilter) && matchesQuery(lines(m), q));
  }, [list, q, typeFilter, view]);
  const nFinal = (list || []).filter((m) => m.status === 'FINAL').length;

  // a finalised sheet is in the archive: it is locked and never deleted
  const canEdit = (m: Minutes) => m.status !== 'FINAL' && (m.authorId === currentUser.id || currentUser.role === 'SUPER_ADMIN');
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
  const TypeMenu: React.FC<{ onPick: (t: MinutesType) => void }> = ({ onPick }) => (
    <div className="fixed inset-x-4 z-30 mt-1 max-h-[60vh] overflow-y-auto sm:absolute sm:inset-x-auto sm:top-full sm:left-0 sm:min-w-[220px] sm:max-h-none rounded-2xl border border-[#EBDBCE] bg-white shadow-xl" data-minutes-type-menu>
      {activeTypes.map((t) => (
        <button key={t.id} type="button" onClick={() => { setMenu(null); onPick(t); }} className="w-full text-right px-3.5 py-2.5 text-xs font-black text-[#3A241F] hover:bg-[#FAF5F1] border-b border-[#EBDBCE]/50 last:border-b-0 cursor-pointer">
          {t.title}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4" data-minutes-view>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-[#3A241F]">صورتجلسه</h2>
          <p className="text-[11px] text-[#8C6F66]">انواع صورتجلسه (جلسه، تحویل کالا و…) با لوگو و قالب استاندارد؛ چاپ، PDF و JPG.</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <button type="button" onClick={() => setMenu(menu === 'sample' ? null : 'sample')} className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-black text-[#6E1B1B] bg-white border border-[#EBDBCE] hover:bg-[#F6D9CD]/40 cursor-pointer" data-minutes-sample>
              <FilePlus2 className="w-4 h-4" />
              ساخت از نمونه
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {menu === 'sample' && <TypeMenu onPick={(t) => setEditing(sample(cfg, list || [], currentUser.fullName, people.filter((u) => u.id !== currentUser.id), t.id))} />}
          </div>
          <div className="relative">
            <button type="button" onClick={() => setMenu(menu === 'new' ? null : 'new')} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-black text-white bg-[#6E1B1B] hover:bg-[#581717] cursor-pointer" data-minutes-new>
              <Plus className="w-4 h-4" />
              صورتجلسهٔ جدید
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {menu === 'new' && <TypeMenu onPick={(t) => setEditing(blank(cfg, list || [], currentUser.fullName, t.id))} />}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" data-minutes-views>
        {([['all', `همه (${toPersianDigits((list || []).length)})`], ['draft', `در حال تنظیم (${toPersianDigits((list || []).length - nFinal)})`], ['archive', `بایگانی صورتجلسه‌ها (${toPersianDigits(nFinal)})`]] as const).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setView(k)} className={`px-3.5 py-1.5 rounded-full text-[11px] font-black border cursor-pointer ${view === k ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white text-[#3A241F] border-[#EBDBCE] hover:bg-[#FAF5F1]'}`} data-minutes-view-tab={k}>
            {k === 'archive' ? '🔒 ' : ''}{l}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#8C6F66] absolute right-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در صورتجلسه‌ها…" className={`${field} pr-9`} />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={`${field} w-auto`} data-minutes-type-filter>
          <option value="">همهٔ انواع</option>
          {cfg.types.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
      </div>

      {list === null ? (
        <p className="text-xs text-[#8C6F66]">در حال بارگذاری…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EBDBCE] bg-[#FDFAF7] p-8 text-center space-y-2">
          <p className="text-sm font-black text-[#3A241F]">{list.length === 0 ? 'هنوز صورتجلسه‌ای ثبت نشده است.' : 'صورتجلسه‌ای با این شرایط پیدا نشد.'}</p>
          {list.length === 0 && <p className="text-[11px] text-[#8C6F66]">«ساخت از نمونه» یک صورتجلسهٔ کامل پرشده از هر نوع برای دیدن قالب می‌سازد.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-minutes-list>
          {shown.map((m) => {
            const t = typeOf(cfg, m.typeId);
            return (
              <div key={m.id} className="rounded-2xl border border-[#EBDBCE] bg-white p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] font-black text-[#8C6F66] flex items-center gap-2">
                      <span>{toPersianDigits(m.number)}</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#F6D9CD]/60 text-[#6E1B1B] text-[10px]">{t.title}</span>
                    </div>
                    <div className="font-black text-sm text-[#3A241F] leading-6">{m.title}</div>
                  </div>
                  {statusBadge(m.status)}
                </div>
                <div className="text-[11px] font-bold text-[#6B514A] flex flex-wrap gap-x-4 gap-y-1">
                  <span>{m.date ? formatTaskDate(m.date) : ''}</span>
                  {m.place && <span>{m.place}</span>}
                  {t.sections.attendees && <span className="flex items-center gap-1"><Users className="w-3 h-3" />{toPersianDigits(m.attendees.length)} نفر</span>}
                  {t.sections.goods && <span>{toPersianDigits((m.goods || []).filter((g) => g.title.trim()).length)} قلم کالا</span>}
                  {t.sections.decisions && <span>{toPersianDigits(m.decisions.filter((d) => d.text.trim()).length)} مصوبه</span>}
                  {t.sections.parties && m.parties?.first?.name && <span>{m.parties.first.name} ← {m.parties?.second?.name}</span>}
                </div>
                <div className="text-[11px] font-bold text-[#6B514A] flex flex-wrap gap-x-4 gap-y-0.5" data-minutes-author>
                  <span>تهیه‌کننده: <b className="text-[#3A241F]">{m.authorName || '—'}</b></span>
                  {m.status === 'FINAL' && m.finalizedAt && <span>نهایی و بایگانی‌شده: {formatDateTime(m.finalizedAt)}</span>}
                  {m.correctsNumber && <span>اصلاحیهٔ {toPersianDigits(m.correctsNumber)}</span>}
                </div>
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
            );
          })}
        </div>
      )}

      {editing && (
        <MinutesEditor
          initial={editing}
          all={list || []}
          cfg={cfg}
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

export const MinutesEditor: React.FC<{ initial: Minutes; all: Minutes[]; cfg: MinutesConfig; onClose: () => void; onSaved: () => void }> = ({ initial, all, cfg, onClose, onSaved }) => {
  const { staffList, settings, showToast, currentUser, customers } = useAppContext();
  const [m, setM] = useState<Minutes>(initial);
  const [saving, setSaving] = useState(false);
  const [numberTouched, setNumberTouched] = useState(false);
  const patch = (u: Partial<Minutes>) => setM((p) => ({ ...p, ...u }));
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState<'' | 'draft' | 'summary'>('');
  const [aiErr, setAiErr] = useState('');
  const people = useMemo(() => staffList.filter((u) => u.isActive !== false), [staffList]);
  const exists = all.some((x) => x.id === m.id);
  const aiDraft = async () => {
    const hasWork = m.agenda.some((x) => x.trim()) || (m.discussion || '').trim() || m.decisions.some((d) => d.text.trim());
    if (hasWork && !(await askConfirm('آنچه تا الان در دستور جلسه، شرح مذاکرات و مصوبات نوشته‌اید با نوشتهٔ هوش مصنوعی جایگزین شود؟ بعد از آن می‌توانید همه‌چیز را ویرایش کنید.', { tone: 'danger', confirmText: 'جایگزین شود', title: 'نوشتن با هوش مصنوعی' }))) return;
    setAiBusy('draft');
    setAiErr('');
    try {
      const r = await api.minutesAi({ mode: 'draft', text: aiText, people: people.map((u) => u.fullName) });
      const d = r.draft || {};
      const today = new Date();
      const decisions: MinutesDecision[] = (d.decisions || []).filter((x) => x && x.text).map((x) => {
        const u = x.owner ? people.find((p) => p.fullName === x.owner) : undefined;
        let due: string | undefined;
        if (typeof x.dueInDays === 'number' && x.dueInDays > 0 && x.dueInDays < 400) {
          const dt = new Date(today.getTime() + Math.round(x.dueInDays) * 86400000);
          due = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        }
        return { text: x.text, owner: x.owner || '', ownerUserId: u?.id, due };
      });
      setM((p) => ({
        ...p,
        title: p.title.trim() ? p.title : d.title || p.title,
        agenda: d.agenda && d.agenda.length ? d.agenda : p.agenda,
        discussion: d.discussion || p.discussion,
        decisions: decisions.length ? decisions : p.decisions,
      }));
      setAiOpen(false);
      showToast('صورتجلسه نوشته شد. آن را بخوانید و هر جا لازم است ویرایش کنید.');
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : 'نوشتن انجام نشد.');
    } finally {
      setAiBusy('');
    }
  };
  const aiSummarize = async () => {
    setAiBusy('summary');
    try {
      const r = await api.minutesAi({ mode: 'summary', text: m.discussion || '' });
      if (r.discussion) patch({ discussion: r.discussion });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'خلاصه‌نویسی انجام نشد.');
    } finally {
      setAiBusy('');
    }
  };
  const t = typeOf(cfg, m.typeId);
  const S = t.sections;
  const types = cfg.types.filter((x) => x.active !== false || x.id === m.typeId);

  // the number follows the sort and the date until it is written by hand
  useEffect(() => {
    if (exists || numberTouched) return;
    setM((p) => ({ ...p, number: nextMinutesNumber(cfg, p.typeId || 'general', p.date, all) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.typeId, m.date]);

  const changeType = (id: string) => {
    const nt = typeOf(cfg, id);
    setM((p) => ({
      ...p,
      typeId: nt.id,
      agenda: p.agenda.some((x) => x.trim()) ? p.agenda : nt.defaultAgenda.length ? [...nt.defaultAgenda] : [''],
      conditions: p.conditions && p.conditions.trim() && p.conditions !== typeOf(cfg, p.typeId).defaultConditions ? p.conditions : nt.defaultConditions,
    }));
  };

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
  const setGoods = (i: number, u: Partial<MinutesGoodsLine>) => patch({ goods: (m.goods || []).map((g, idx) => (idx === i ? { ...g, ...u } : g)) });
  const setParty = (side: 'first' | 'second', u: Partial<{ name: string; position: string; phone: string }>) =>
    patch({ parties: { first: { name: '', ...(m.parties?.first || {}) }, second: { name: '', ...(m.parties?.second || {}) }, [side]: { name: '', ...(m.parties?.[side] || {}), ...u } } });
  const clean = (): Minutes => ({
    ...m,
    title: m.title.trim(),
    agenda: m.agenda.map((x) => x.trim()).filter(Boolean),
    decisions: m.decisions.filter((d) => d.text.trim()),
    attendees: m.attendees.filter((a) => a.name.trim()),
    goods: (m.goods || []).filter((g) => g.title.trim()),
    updatedAt: new Date().toISOString(),
    authorId: m.authorId || currentUser.id,
    authorName: m.authorName || currentUser.fullName,
  });
  // the goods of a delivery whose product carries a warranty (months set): their certificates can be issued and printed right here
  const warrantyLines = (m.goods || []).filter((g) => g.title.trim() && (g.warrantyMonths || 0) > 0);
  const canWarrant = S.goods && !!m.customerId && warrantyLines.length > 0;
  const save = async (status: 'DRAFT' | 'FINAL') => {
    if (!m.title.trim()) return showToast('موضوع را بنویسید.');
    if (!m.date) return showToast('تاریخ را انتخاب کنید.');
    if (S.goods && !(m.goods || []).some((g) => g.title.trim()) && status === 'FINAL') return showToast('دست‌کم یک کالا در جدول بنویسید.');
    if (status === 'FINAL' && !(await askConfirm('پس از نهایی‌کردن، صورتجلسه در بایگانی قفل می‌شود: دیگر ویرایش و حذف نمی‌شود (برای اصلاح، صورتجلسهٔ اصلاحیه ساخته می‌شود) و همکاران نام‌برده اعلان می‌گیرند.\n\nنهایی شود؟', { tone: 'warning', title: 'نهایی‌کردن صورتجلسه', confirmText: 'بله، نهایی و بایگانی شود', cancelText: 'هنوز نه' }))) return;
    const next = { ...clean(), status };
    // goods with a warranty: ask first, and open the print window at once (a window opened after a wait is stopped by the browser)
    let issue = false;
    let win: Window | null = null;
    if (status === 'FINAL' && canWarrant) {
      issue = await askConfirm(`${toPersianDigits(warrantyLines.length)} قلم از این کالاها گارانتی دارد (${warrantyLines.map((g) => g.title).join('، ')}).

گواهی گارانتی برای مشتری هم صادر و همین‌جا چاپ شود؟`, { tone: 'info', title: 'گواهی گارانتی', confirmText: 'بله، صادر و چاپ شود', cancelText: 'نه، فقط صورتجلسه' });
      if (issue) win = window.open('', '_blank');
    }
    setSaving(true);
    try {
      await api.minutesSave(next);
      showToast(status === 'FINAL' ? 'صورتجلسه نهایی و ذخیره شد.' : 'پیش‌نویس ذخیره شد.');
    } catch (e) {
      win?.close();
      showToast(e instanceof Error ? e.message : 'ذخیره نشد.');
      setSaving(false);
      return;
    }
    if (issue) {
      try {
        const wl = await api.warrantyList();
        const made: Warranty[] = [];
        for (const g of warrantyLines) {
          const months = Math.min(120, Math.max(1, g.warrantyMonths || wl.settings.defaultMonths || 12));
          const w = await api.warrantyPut('wr-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4), {
            customerId: m.customerId,
            productName: g.title,
            productCode: g.code || '',
            serial: (g.serial || '').trim(),
            invoiceNumber: (next.fields || {}).invoice || next.proformaNumber || '',
            saleDate: next.date,
            startDate: next.date,
            months,
            endDate: warrantyEnd(next.date, months),
            maxKm: 0,
            notes: `صورتجلسه تحویل ${next.number} · تعداد: ${toPersianDigits(g.qty)} ${g.unit || ''}`.trim(),
          });
          made.push(w);
        }
        if (!printCertificates(made, wl.settings, settings.companyName || 'شرکت', win)) showToast('گواهی‌ها ساخته شد ولی پنجرهٔ چاپ باز نشد؛ اجازهٔ پنجره‌های بازشو را بدهید و از بخش گارانتی چاپ کنید.');
        else showToast(`${toPersianDigits(made.length)} گواهی گارانتی ساخته و برای چاپ باز شد.`);
      } catch (e) {
        win?.close();
        showToast('صورتجلسه ذخیره شد ولی گواهی گارانتی ساخته نشد: ' + (e instanceof Error ? e.message : ''));
      }
    }
    onSaved();
  };

  return (
    <Modal
      title={(exists ? 'ویرایش ' : 'جدید: ') + t.title}
      wide
      onTop="max"
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
      <div className="flex flex-wrap gap-1.5" data-minutes-types>
        {types.map((x) => (
          <button key={x.id} type="button" onClick={() => changeType(x.id)} className={`px-3 py-1.5 rounded-full text-[11px] font-black border cursor-pointer ${t.id === x.id ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white text-[#3A241F] border-[#EBDBCE] hover:bg-[#FAF5F1]'}`}>
            {x.title}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <span className={label}>موضوع *</span>
          <input className={field} value={m.title} onChange={(e) => patch({ title: e.target.value })} placeholder={S.goods ? 'مثلاً: تحویل تجهیزات شبکه به انبار' : 'مثلاً: بررسی برنامهٔ فروش فصل'} data-minutes-title />
        </div>
        <div>
          <span className={label}>شمارهٔ صورتجلسه</span>
          <input className={field} value={m.number} onChange={(e) => { setNumberTouched(true); patch({ number: toPersianDigits(e.target.value) }); }} />
        </div>
        <div className="sm:col-span-2">
          <span className={label}>تاریخ *</span>
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
        <div className={S.attendees ? '' : 'sm:col-span-2'}>
          <span className={label}>محل</span>
          <input className={field} value={m.place || ''} onChange={(e) => patch({ place: e.target.value })} placeholder="مثلاً: اتاق جلسات / انبار مرکزی" />
        </div>
        {S.attendees && (
          <>
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
          </>
        )}
      </div>

      {t.fields.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-minutes-fields>
          {t.fields.map((f) => (
            <div key={f.id}>
              <span className={label}>{f.label}</span>
              {f.kind === 'date' ? (
                <JalaliDateField value={(m.fields || {})[f.id] || undefined} onChange={(v) => patch({ fields: { ...(m.fields || {}), [f.id]: v || '' } })} />
              ) : (
                <input className={field} value={(m.fields || {})[f.id] || ''} onChange={(e) => patch({ fields: { ...(m.fields || {}), [f.id]: e.target.value } })} />
              )}
            </div>
          ))}
        </div>
      )}

      {S.parties && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-minutes-parties>
          {(['first', 'second'] as const).map((side, i) => (
            <div key={side} className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3 space-y-2">
              <span className={label}>{t.partyLabels[i]}</span>
              <PersonPicker title={t.partyLabels[i]} items={staffItems(people)} value={people.find((u) => u.fullName === m.parties?.[side]?.name)?.id || ''} onChange={(id) => { const u = people.find((x) => x.id === id); if (u) setParty(side, { name: u.fullName, position: u.departmentName || m.parties?.[side]?.position || '' }); }} emptyLabel="انتخاب همکار (یا بنویسید)…" />
              <CustomerSelect title={'مشتری — ' + t.partyLabels[i]} value="" onChange={(id) => { const c = customers.find((x) => x.id === id); if (c) setParty(side, { name: c.company && c.company !== c.name ? c.company : c.name, position: c.company && c.company !== c.name ? c.name : m.parties?.[side]?.position || '', phone: (c.phones || [])[0] || m.parties?.[side]?.phone || '' }); }} emptyLabel="انتخاب مشتری…" />
              <input className={field} value={m.parties?.[side]?.name || ''} onChange={(e) => setParty(side, { name: e.target.value })} placeholder="نام و نام خانوادگی / شرکت" />
              <input className={field} value={m.parties?.[side]?.position || ''} onChange={(e) => setParty(side, { position: e.target.value })} placeholder="سمت" />
              <input className={field} dir="ltr" value={m.parties?.[side]?.phone || ''} onChange={(e) => setParty(side, { phone: e.target.value })} placeholder="شمارهٔ تماس (اختیاری)" />
            </div>
          ))}
        </div>
      )}

      {S.goods && (
        <div className="space-y-2" data-minutes-goods>
          <span className={label}>کالاهای تحویل‌شده</span>
          {canWarrant && (
            <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-[11px] font-bold text-teal-900 leading-6" data-warranty-note>
              {toPersianDigits(warrantyLines.length)} قلم از این کالاها گارانتی دارد. با «ذخیره و نهایی‌کردن» پرسیده می‌شود که گواهی گارانتی برای مشتری هم صادر و چاپ شود.
            </div>
          )}
          {(m.goods || []).map((g, i) => (
            <div key={i} className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3 space-y-2">
              <div className="flex gap-2">
                <span className="w-6 text-center text-[11px] font-black text-[#8C6F66] pt-2.5">{toPersianDigits(i + 1)}</span>
                <input className={field} value={g.title} onChange={(e) => setGoods(i, { title: e.target.value })} placeholder="شرح کالا" data-goods-title />
                <button type="button" disabled={(m.goods || []).length === 1} onClick={() => patch({ goods: (m.goods || []).filter((_, idx) => idx !== i) })} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg disabled:opacity-30 cursor-pointer" aria-label="حذف">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pr-8">
                {t.goodsColumns.code && <input className={field} dir="ltr" value={g.code || ''} onChange={(e) => setGoods(i, { code: e.target.value })} placeholder="کد کالا" />}
                <input className={field} inputMode="numeric" value={g.qty ? toPersianDigits(g.qty) : ''} onChange={(e) => setGoods(i, { qty: Number(e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9.]/g, '')) || 0 })} placeholder="تعداد" />
                {t.goodsColumns.unit && <input className={field} list="minutes-units" value={g.unit || ''} onChange={(e) => setGoods(i, { unit: e.target.value })} placeholder="واحد" />}
                {t.goodsColumns.note && <input className={`${field} col-span-2 sm:col-span-1`} value={g.note || ''} onChange={(e) => setGoods(i, { note: e.target.value })} placeholder={t.goodsNoteLabel} />}
              </div>
              {m.customerId && (
                <div className="grid grid-cols-2 gap-2 pr-8" data-goods-warranty>
                  <input className={field} inputMode="numeric" value={g.warrantyMonths ? toPersianDigits(g.warrantyMonths) : ''} onChange={(e) => setGoods(i, { warrantyMonths: Number(e.target.value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9]/g, '')) || 0 })} placeholder="گارانتی (ماه؛ خالی = ندارد)" />
                  <input className={field} dir="ltr" value={g.serial || ''} onChange={(e) => setGoods(i, { serial: e.target.value })} placeholder="شمارهٔ سریال برای گواهی (اختیاری)" />
                </div>
              )}
            </div>
          ))}
          <datalist id="minutes-units">
            {['عدد', 'دستگاه', 'بسته', 'جعبه', 'کارتن', 'شاخه', 'متر', 'رول', 'جفت', 'ست', 'کیلوگرم', 'لیتر'].map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <button type="button" onClick={() => patch({ goods: [...(m.goods || []), { title: '', code: '', qty: 1, unit: 'عدد', note: '' }] })} className="flex items-center gap-1 text-[11px] font-black text-[#6E1B1B] cursor-pointer" data-add-goods>
            <Plus className="w-3.5 h-3.5" />
            کالای دیگر
          </button>
          <div>
            <span className={label}>{t.conditionsLabel}</span>
            <textarea className={`${field} min-h-[64px] leading-7`} value={m.conditions || ''} onChange={(e) => patch({ conditions: e.target.value })} />
          </div>
        </div>
      )}

      {S.attendees && (
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
      )}

      {(S.discussion || S.decisions) && (
        <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3 space-y-2" data-minutes-ai>
          <button type="button" onClick={() => setAiOpen(!aiOpen)} className="flex items-center gap-2 text-xs font-black text-violet-800 cursor-pointer" data-minutes-ai-toggle>
            <Sparkles className="w-4 h-4" />
            نوشتن صورتجلسه با هوش مصنوعی
            <ChevronDown className={`w-4 h-4 transition-transform ${aiOpen ? 'rotate-180' : ''}`} />
          </button>
          {aiOpen && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-violet-900/80 leading-6">هر چه از جلسه دارید اینجا بنویسید یا بچسبانید (یادداشت‌های پراکنده، متن پیاده‌شدهٔ گفتگو، حتی پیام‌های گروه). هوش مصنوعی دستور جلسه، شرح مذاکرات و مصوبات (با مسئول و مهلت، اگر در متن باشد) را می‌نویسد و در همین فرم می‌گذارد. چیزی ذخیره نمی‌شود تا شما بخوانید و ویرایش کنید. متن شما برای نوشتن به سرویس هوش مصنوعی فرستاده می‌شود.</p>
              <textarea className={`${field} min-h-[130px] leading-7`} value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="مثلاً: امروز آقای رضایی گزارش فروش را داد، قرار شد تا هفتهٔ بعد قیمت‌ها را به‌روز کند…" data-minutes-ai-text />
              {aiErr && <div className="text-[11px] font-bold text-rose-700">{aiErr}</div>}
              <button type="button" disabled={!!aiBusy || aiText.trim().length < 30} onClick={aiDraft} className="px-5 py-2.5 rounded-xl bg-violet-700 hover:bg-violet-800 text-white text-xs font-black cursor-pointer flex items-center gap-2 disabled:opacity-50" data-minutes-ai-run>
                {aiBusy === 'draft' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {aiBusy === 'draft' ? 'در حال نوشتن… (تا دو دقیقه)' : 'بنویس'}
              </button>
            </div>
          )}
        </div>
      )}

      {S.agenda && (
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
      )}

      {S.discussion && (
        <div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className={label}>{t.id === 'handover' || t.id === 'inspection' ? 'شرح و گزارش' : 'شرح مذاکرات (خلاصهٔ آنچه گفته شد)'}</span>
            {(m.discussion || '').trim().length >= 200 && (
              <button type="button" disabled={!!aiBusy} onClick={aiSummarize} className="flex items-center gap-1 text-[10px] font-black text-violet-700 cursor-pointer disabled:opacity-50" data-minutes-ai-summary>
                {aiBusy === 'summary' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                خلاصه‌کردن با هوش مصنوعی
              </button>
            )}
          </div>
          <textarea className={`${field} min-h-[90px] leading-7`} value={m.discussion || ''} onChange={(e) => patch({ discussion: e.target.value })} />
        </div>
      )}

      {S.decisions && (
        <div className="space-y-2" data-minutes-decisions>
          <span className={label}>{t.id === 'inspection' ? 'نتیجه و اقدامات لازم (مسئول و مهلت)' : 'مصوبات (مسئول اجرا و مهلت)'}</span>
          {m.decisions.map((d, i) => (
            <div key={i} className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3 space-y-2">
              <div className="flex gap-2">
                <span className="w-6 text-center text-[11px] font-black text-[#8C6F66] pt-2.5">{toPersianDigits(i + 1)}</span>
                <textarea className={`${field} min-h-[54px] leading-6`} value={d.text} onChange={(e) => setDecision(i, { text: e.target.value })} placeholder="شرح" />
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
          <button type="button" onClick={() => patch({ decisions: [...m.decisions, { text: '', owner: '', due: undefined }] })} className="flex items-center gap-1 text-[11px] font-black text-[#6E1B1B] cursor-pointer" data-add-decision>
            <Plus className="w-3.5 h-3.5" />
            بند دیگر
          </button>
        </div>
      )}

      {(S.nextMeeting || S.copies) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {S.nextMeeting && (
            <>
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
            </>
          )}
          {S.copies && (
            <div className="sm:col-span-3">
              <span className={label}>رونوشت (به چه کسانی ابلاغ می‌شود)</span>
              <input className={field} value={m.copies || ''} onChange={(e) => patch({ copies: e.target.value })} placeholder="مثلاً: مدیریت، واحد مالی" />
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] text-[#8C6F66] leading-6">
        {S.attendees ? 'همکارانی که در فهرست حاضرین انتخاب شده‌اند، پس از «نهایی‌کردن» صورتجلسه را در بخش صورتجلسه می‌بینند و اعلان می‌گیرند. ' : ''}
        لوگو، نام سازمان، شماره‌گذاری و طراحی برگه از «کنسول مدیریت ← تنظیمات ← صورتجلسه» می‌آید.
      </p>
    </Modal>
  );
};
