import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Landmark, Printer, Phone, Smartphone, Star, Store, Trash2, User as UserIcon, X } from 'lucide-react';
import { Customer, CustomerStatus, User } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { isMobileNumber, normPhone, normText } from '../../lib/customerImport';
import { JalaliDateField } from '../tasks/TasksView';
import { Modal, field, label, SOURCES } from './crmUi';
import { PersonPicker, staffItems } from '../common/PersonPicker';
import { IRAN_CITIES, PROVINCE_LIST } from '../../lib/iranCities';
import { PhraseChips } from '../common/PhraseChips';
import { api } from '../../lib/api';
import { askConfirm } from '../../lib/confirmDialog';

const STATUS_LABEL: Record<CustomerStatus, string> = { LEAD: 'مشتری بالقوه', ACTIVE: 'مشتری فعال', INACTIVE: 'غیرفعال' };
const COMPANY_TYPES = ['سهامی خاص', 'سهامی عام', 'مسئولیت محدود', 'تضامنی', 'نسبی', 'تعاونی', 'مؤسسه / انجمن', 'شخص حقیقی با کد اقتصادی', 'سایر'];

const digits = (v: string) => normText(v).replace(/\D/g, '');
/** Iranian national code check (10 digits + checksum). */
const validNationalCode = (code: string) => {
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false;
  const sum = code.split('').slice(0, 9).reduce((s, d, i) => s + Number(d) * (10 - i), 0) % 11;
  const check = Number(code[9]);
  return sum < 2 ? check === sum : check === 11 - sum;
};
const isMobile = (p: string) => isMobileNumber(p);
const cleanNumber = (v: string) => normPhone(v) || normText(v).replace(/[^0-9+]/g, '');

/** Any number of phone numbers of one sort (mobile or landline). */
const NumberList: React.FC<{ title: string; icon: React.ReactNode; items: string[]; placeholder: string; onChange: (items: string[]) => void; draft: string; setDraft: (v: string) => void; main?: string; onMain: (p: string) => void; fax?: string; onFax?: (p: string) => void }> = ({
  title,
  icon,
  items,
  placeholder,
  onChange,
  draft,
  setDraft,
  main,
  onMain,
  fax,
  onFax,
}) => {
  const add = () => {
    const v = cleanNumber(draft);
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft('');
  };
  return (
    <div className="rounded-2xl border border-[#EBDBCE] bg-white p-3.5">
      <div className="flex items-center gap-2 mb-2.5 text-xs font-black text-[#3A241F]">
        {icon}
        {title}
        <span className="text-[10px] font-bold text-[#8C6F66]">({toPersianDigits(items.length)})</span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2.5 empty:hidden">
        {items.map((p) => (
          <span key={p} className={`flex items-center gap-1 border rounded-full pl-1.5 pr-2 py-1 text-xs font-bold text-[#3A241F] ${main === p ? 'bg-amber-50 border-amber-300' : 'bg-[#FAF5F1] border-[#EBDBCE]'}`} dir="ltr">
            <button type="button" onClick={() => onMain(p)} title={main === p ? 'شمارهٔ اصلی' : 'اصلی کن'} className={`cursor-pointer ${main === p ? 'text-amber-500' : 'text-[#C9B8AE] hover:text-amber-500'}`}>
              <Star className={`w-3.5 h-3.5 ${main === p ? 'fill-amber-400' : ''}`} />
            </button>
            {toPersianDigits(p)}
            {onFax && (
              <button type="button" onClick={() => onFax(fax === p ? '' : p)} title={fax === p ? 'این شماره فکس است' : 'این شماره فکس است؟'} className={`flex items-center gap-0.5 rounded-full px-1.5 text-[10px] font-black cursor-pointer ${fax === p ? 'bg-sky-600 text-white' : 'text-[#8C6F66] border border-[#EBDBCE] hover:bg-sky-50'}`}>
                <Printer className="w-3 h-3" />
                {fax === p ? 'فکس' : ''}
              </button>
            )}
            <button type="button" onClick={() => onChange(items.filter((x) => x !== p))} className="text-rose-500 cursor-pointer">
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
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
        />
        <button type="button" onClick={add} className="px-3 rounded-xl bg-[#3A241F] text-white text-xs font-black cursor-pointer shrink-0">
          افزودن
        </button>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-3">
    <h4 className="text-[11px] font-black text-violet-700 flex items-center gap-2">
      <span className="h-px flex-1 bg-violet-100" />
      {title}
      <span className="h-px w-4 bg-violet-100" />
    </h4>
    {children}
  </section>
);

export const CustomerForm: React.FC<{
  initial: Customer;
  isNew: boolean;
  staff: User[];
  customers: Customer[];
  canDelete: boolean;
  onClose: () => void;
  onSave: (c: Customer) => void;
  onDelete: () => void;
}> = ({ initial, isNew, staff, customers, canDelete, onClose, onSave, onDelete }) => {
  const [c, setC] = useState<Customer>(() => {
    const kind = initial.kind || 'PERSON';
    const parts = (initial.name || '').trim().split(/\s+/);
    return {
      ...initial,
      kind,
      firstName: initial.firstName ?? (kind === 'PERSON' ? parts[0] || '' : ''),
      lastName: initial.lastName ?? (kind === 'PERSON' ? parts.slice(1).join(' ') : ''),
    };
  });
  const [mainPhone, setMainPhone] = useState<string>(initial.phones?.[0] || '');
  const [mobileDraft, setMobileDraft] = useState('');
  const [landlineDraft, setLandlineDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const patch = (u: Partial<Customer>) => setC((p) => ({ ...p, ...u }));
  const isCompany = c.kind === 'COMPANY';
  const isShop = c.kind === 'SHOP';

  const mobiles = c.phones.filter(isMobile);
  const landlines = c.phones.filter((p) => !isMobile(p));
  const setNumbers = (m: string[], l: string[]) => patch({ phones: [...new Set([...m, ...l])] });

  const displayName = isCompany || isShop ? (c.company || '').trim() : `${c.firstName || ''} ${c.lastName || ''}`.trim();
  const nationalCodeBad = !isCompany && !!c.nationalCode && !validNationalCode(digits(c.nationalCode));
  const nationalIdBad = isCompany && !!c.nationalId && digits(c.nationalId).length !== 11;
  const economicBad = !!c.economicCode && digits(c.economicCode).length !== 12;
  const postalBad = !!c.postalCode && digits(c.postalCode).length !== 10;

  const referrerCandidates = useMemo(() => customers.filter((x) => x.id !== c.id), [customers, c.id]);
  const [refText, setRefText] = useState(c.referrer?.kind === 'CUSTOMER' ? c.referrer.name : '');
  const refKind = c.referrer?.kind || '';

  const addTag = () => {
    const v = tagDraft.trim();
    if (v && !c.tags.includes(v)) patch({ tags: [...c.tags, v] });
    setTagDraft('');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName) return;
    let m = mobiles;
    let l = landlines;
    const md = cleanNumber(mobileDraft);
    const ld = cleanNumber(landlineDraft);
    if (md) m = [...new Set([...m, md])];
    if (ld) l = [...new Set([...l, ld])];
    const owner = staff.find((u) => u.id === c.ownerId);
    const out: Customer = {
      ...c,
      name: displayName,
      company: isCompany || isShop ? displayName : (c.company || '').trim(),
      shopType: isShop ? (c.shopType || '').trim() || undefined : undefined,
      licenseNumber: isShop ? (c.licenseNumber || '').trim() || undefined : undefined,
      firstName: isCompany ? undefined : (c.firstName || '').trim(),
      lastName: isCompany ? undefined : (c.lastName || '').trim(),
      nationalCode: digits(c.nationalCode || '') || undefined,
      idNumber: digits(c.idNumber || '') || undefined,
      nationalId: digits(c.nationalId || '') || undefined,
      economicCode: digits(c.economicCode || '') || undefined,
      registrationNumber: digits(c.registrationNumber || '') || undefined,
      postalCode: digits(c.postalCode || '') || undefined,
      phones: ((all) => (mainPhone && all.includes(mainPhone) ? [mainPhone, ...all.filter((x) => x !== mainPhone)] : all))([...new Set([...m, ...l].filter(Boolean))]),
      faxNumber: c.faxNumber && l.includes(c.faxNumber) ? c.faxNumber : undefined,
      interest: (c.interest || '').trim() || undefined,
      ownerName: owner?.fullName || c.ownerName,
    };
    if (out.referrer && !out.referrer.name.trim()) delete out.referrer;
    onSave(out);
  };

  const typeBtn = (k: 'PERSON' | 'COMPANY' | 'SHOP', text: string, Icon: React.ElementType) => (
    <button
      type="button"
      onClick={() => patch({ kind: k })}
      className={`flex-1 min-w-0 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2.5 px-1 rounded-xl text-[11px] sm:text-xs leading-4 text-center font-black cursor-pointer border transition-colors ${
        c.kind === k ? 'bg-violet-600 text-white border-violet-600 shadow-sm' : 'bg-white text-[#3A241F] border-[#EBDBCE] hover:bg-violet-50'
      }`}
    >
      <Icon className="w-4 h-4" />
      {text}
    </button>
  );

  // is this number / national code already in the file (even a colleague's customer that this person cannot see)?
  const [dups, setDups] = useState<{ id: string; name: string; ownerName: string; mine: boolean }[]>([]);
  // customers Sepidar (accounting) already has under this number / national code, and the one this customer is already tied to
  type SepMatch = { sepidarId: number; name: string; code?: string; linkedCustomerId?: string };
  const [sepMatches, setSepMatches] = useState<SepMatch[]>([]);
  const [sepLinked, setSepLinked] = useState<{ sepidarId: number; name: string } | null>(null);
  const [sepBusy, setSepBusy] = useState(false);
  const [sepError, setSepError] = useState('');
  const dupKey = JSON.stringify([c.phones, mobileDraft, landlineDraft, c.nationalCode, c.nationalId]);
  useEffect(() => {
    const phones = [...c.phones, cleanNumber(mobileDraft), cleanNumber(landlineDraft)].filter((p) => p && digits(p).length >= 7);
    const nat = digits(c.nationalCode || '');
    const nid = digits(c.nationalId || '');
    if (phones.length === 0 && nat.length !== 10 && nid.length !== 11) {
      setDups([]);
      setSepMatches([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .crmDuplicates({ phones, nationalCode: nat.length === 10 ? nat : undefined, nationalId: nid.length === 11 ? nid : undefined, exceptId: initial.id })
        .then((r) => {
          setDups(r.matches);
          setSepMatches(r.sepidar || []);
          setSepLinked(r.sepidarLinked || null);
        })
        .catch(() => {
          setDups([]);
          setSepMatches([]);
        });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupKey]);

  /** The customer keeps the name Sepidar already has: the name fields are filled with it. */
  const useSepidarName = (name: string) => {
    if (isCompany || isShop) return patch({ company: name });
    const parts = name.trim().split(/\s+/);
    patch({ firstName: parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] || '', lastName: parts.length > 1 ? parts[parts.length - 1] : '' });
  };
  const linkToSepidar = async (m: SepMatch) => {
    setSepBusy(true);
    setSepError('');
    try {
      await api.crmSepidarLink(initial.id, m.sepidarId);
      setSepLinked({ sepidarId: m.sepidarId, name: m.name });
      setSepMatches((x) => x.filter((y) => y.sepidarId !== m.sepidarId));
    } catch (e) {
      setSepError(e instanceof Error ? e.message : 'اتصال انجام نشد.');
    } finally {
      setSepBusy(false);
    }
  };
  const unlinkSepidar = async () => {
    if (!(await askConfirm('اتصال این مشتری به مشتری سپیدار برداشته شود؟ (مشتری در سپیدار پاک نمی‌شود.)'))) return;
    setSepBusy(true);
    try {
      await api.crmSepidarLink(initial.id, 0);
      setSepLinked(null);
    } catch (e) {
      setSepError(e instanceof Error ? e.message : 'انجام نشد.');
    } finally {
      setSepBusy(false);
    }
  };

  const hint = (bad: boolean, text: string) => (bad ? <div className="text-[10px] font-bold text-rose-600 mt-1">{text}</div> : null);

  return (
    <form onSubmit={submit}>
      <Modal
        wide
        onTop
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
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">
                انصراف
              </button>
              <button type="submit" disabled={!displayName} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer">
                {isNew ? 'ثبت مشتری' : 'ذخیره'}
              </button>
            </div>
          </>
        }
      >
        {dups.length > 0 && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-900 space-y-1" data-duplicate-warning>
            <div className="font-black">این مشتری شاید قبلاً ثبت شده باشد:</div>
            {dups.map((d) => (
              <div key={d.id}>«{d.name}»{d.ownerName ? ` · مسئول: ${d.ownerName}` : ''}{d.mine ? '' : ' (در پروندهٔ همکار شما)'}</div>
            ))}
            <div className="font-medium text-amber-800">اگر همان مشتری است، به‌جای ثبت دوباره، با مسئولش هماهنگ کنید.</div>
          </div>
        )}
        {sepLinked && !isNew && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-[11px] font-bold text-emerald-900 flex flex-wrap items-center gap-2" data-sepidar-linked>
            <Landmark className="w-4 h-4 shrink-0" />
            <span className="flex-1 min-w-0">در سپیدار با نام «{sepLinked.name}» ثبت است و پیش‌فاکتورها به همان نام می‌روند.</span>
            <button type="button" disabled={sepBusy} onClick={unlinkSepidar} className="px-3 py-1.5 rounded-xl text-[11px] font-black text-emerald-800 bg-white border border-emerald-300 cursor-pointer disabled:opacity-50">
              برداشتن اتصال
            </button>
          </div>
        )}
        {!sepLinked && sepMatches.length > 0 && (
          <div className="rounded-2xl border border-sky-300 bg-sky-50 px-4 py-3 text-[11px] font-bold text-sky-900 space-y-2" data-sepidar-match>
            <div className="font-black flex items-center gap-2">
              <Landmark className="w-4 h-4 shrink-0" />
              این شماره (یا کد ملی) در سپیدار از قبل ثبت شده است:
            </div>
            {sepMatches.map((m) => (
              <div key={m.sepidarId} className="flex flex-wrap items-center gap-2 bg-white/70 rounded-xl px-3 py-2">
                <span className="flex-1 min-w-0">
                  «{m.name}»{m.code ? ` · کد سپیدار ${toPersianDigits(m.code)}` : ''}
                  {m.linkedCustomerId ? <span className="text-sky-700 font-medium"> (به مشتری دیگری در هورمند وصل است)</span> : null}
                </span>
                {!m.linkedCustomerId && (
                  <>
                    <button type="button" onClick={() => useSepidarName(m.name)} className="px-3 py-1.5 rounded-xl text-[11px] font-black text-sky-800 bg-white border border-sky-300 cursor-pointer">
                      نام را همین بگذار
                    </button>
                    {!isNew && (
                      <button type="button" disabled={sepBusy} onClick={() => linkToSepidar(m)} className="px-3 py-1.5 rounded-xl text-[11px] font-black text-white bg-sky-700 hover:bg-sky-800 cursor-pointer disabled:opacity-50">
                        اتصال به همین مشتری
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
            <div className="font-medium text-sky-800">
              {isNew ? 'بعد از ثبت، مشتری خودکار به همین نام در سپیدار وصل می‌شود و دوباره ساخته نمی‌شود.' : 'با «اتصال»، پیش‌فاکتورها به همین مشتری در سپیدار می‌روند و مشتری تکراری ساخته نمی‌شود.'}
            </div>
            {sepError && <div className="text-rose-600">{sepError}</div>}
          </div>
        )}
        <div className="flex gap-2">
          {typeBtn('PERSON', 'شخص حقیقی', UserIcon)}
          {typeBtn('COMPANY', 'شرکت / شخص حقوقی', Building2)}
          {typeBtn('SHOP', 'فروشگاه / مغازه', Store)}
        </div>

        {isShop ? (
          <>
            <Section title="مشخصات فروشگاه">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className={label}>نام فروشگاه *</label>
                  <input className={field} value={c.company || ''} onChange={(e) => patch({ company: e.target.value })} autoFocus={isNew} placeholder="مثلاً لوازم یدکی نمونه" data-shop-name />
                </div>
                <div>
                  <label className={label}>نوع فعالیت / صنف</label>
                  <input className={field} list="crm-shop-types" value={c.shopType || ''} onChange={(e) => patch({ shopType: e.target.value })} placeholder="مثلاً لوازم یدکی" />
                  <datalist id="crm-shop-types">
                    {[...new Set(customers.map((x) => (x.shopType || '').trim()).filter(Boolean))].map((x) => (
                      <option key={x} value={x} />
                    ))}
                  </datalist>
                </div>
                <div className="sm:col-span-3 sm:max-w-sm">
                  <label className={label}>شمارهٔ پروانهٔ کسب / شناسهٔ صنفی</label>
                  <input className={field} dir="ltr" value={c.licenseNumber || ''} onChange={(e) => patch({ licenseNumber: e.target.value })} />
                </div>
              </div>
            </Section>
            <Section title="مالک یا مسئول فروشگاه">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={label}>نام</label>
                  <input className={field} value={c.firstName || ''} onChange={(e) => patch({ firstName: e.target.value })} />
                </div>
                <div>
                  <label className={label}>نام خانوادگی</label>
                  <input className={field} value={c.lastName || ''} onChange={(e) => patch({ lastName: e.target.value })} />
                </div>
                <div>
                  <label className={label}>کد ملی مالک</label>
                  <input className={field} dir="ltr" inputMode="numeric" maxLength={10} value={c.nationalCode || ''} onChange={(e) => patch({ nationalCode: e.target.value })} />
                  {hint(nationalCodeBad, 'کد ملی معتبر نیست.')}
                </div>
                <div>
                  <label className={label}>کد اقتصادی (اگر دارد)</label>
                  <input className={field} dir="ltr" inputMode="numeric" maxLength={12} value={c.economicCode || ''} onChange={(e) => patch({ economicCode: e.target.value })} />
                  {hint(economicBad, 'کد اقتصادی باید ۱۲ رقم باشد.')}
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>تاریخ تولد مالک</label>
                  <JalaliDateField value={c.birthDate} minYear={1300} onChange={(v) => patch({ birthDate: v })} />
                </div>
              </div>
            </Section>
          </>
        ) : !isCompany ? (
          <Section title="مشخصات شخص">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={label}>نام *</label>
                <input className={field} value={c.firstName || ''} onChange={(e) => patch({ firstName: e.target.value })} autoFocus={isNew} />
              </div>
              <div>
                <label className={label}>نام خانوادگی *</label>
                <input className={field} value={c.lastName || ''} onChange={(e) => patch({ lastName: e.target.value })} />
              </div>
              <div>
                <label className={label}>نام پدر</label>
                <input className={field} value={c.fatherName || ''} onChange={(e) => patch({ fatherName: e.target.value })} />
              </div>
              <div>
                <label className={label}>کد ملی <span className="font-medium text-[#8C6F66]">(چهار رقم آخر، رمز ورود به صفحهٔ پشتیبانی مشتری است)</span></label>
                <input className={field} dir="ltr" inputMode="numeric" maxLength={10} value={c.nationalCode || ''} onChange={(e) => patch({ nationalCode: e.target.value })} />
                {hint(nationalCodeBad, 'کد ملی معتبر نیست.')}
              </div>
              <div>
                <label className={label}>شمارهٔ شناسنامه</label>
                <input className={field} dir="ltr" inputMode="numeric" value={c.idNumber || ''} onChange={(e) => patch({ idNumber: e.target.value })} />
              </div>
              <div>
                <label className={label}>جنسیت</label>
                <select className={field} value={c.gender || ''} onChange={(e) => patch({ gender: (e.target.value || undefined) as Customer['gender'] })}>
                  <option value="">—</option>
                  <option value="M">آقا</option>
                  <option value="F">خانم</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={label}>تاریخ تولد</label>
                <JalaliDateField value={c.birthDate} minYear={1300} onChange={(v) => patch({ birthDate: v })} />
              </div>
              <div>
                <label className={label}>شغل / محل کار</label>
                <input className={field} value={c.company || ''} onChange={(e) => patch({ company: e.target.value })} />
              </div>
            </div>
          </Section>
        ) : (
          <Section title="مشخصات رسمی شرکت">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className={label}>نام شرکت *</label>
                <input className={field} value={c.company || ''} onChange={(e) => patch({ company: e.target.value })} autoFocus={isNew} />
              </div>
              <div>
                <label className={label}>نوع شرکت</label>
                <select className={field} value={c.companyType || ''} onChange={(e) => patch({ companyType: e.target.value })}>
                  <option value="">—</option>
                  {COMPANY_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>شناسهٔ ملی (۱۱ رقم)</label>
                <input className={field} dir="ltr" inputMode="numeric" maxLength={11} value={c.nationalId || ''} onChange={(e) => patch({ nationalId: e.target.value })} />
                {hint(nationalIdBad, 'شناسهٔ ملی باید ۱۱ رقم باشد.')}
              </div>
              <div>
                <label className={label}>کد اقتصادی (۱۲ رقم)</label>
                <input className={field} dir="ltr" inputMode="numeric" maxLength={12} value={c.economicCode || ''} onChange={(e) => patch({ economicCode: e.target.value })} />
                {hint(economicBad, 'کد اقتصادی باید ۱۲ رقم باشد.')}
              </div>
              <div>
                <label className={label}>شمارهٔ ثبت</label>
                <input className={field} dir="ltr" inputMode="numeric" value={c.registrationNumber || ''} onChange={(e) => patch({ registrationNumber: e.target.value })} />
              </div>
              <div className="sm:col-span-3">
                <label className={label}>تاریخ ثبت</label>
                <JalaliDateField value={c.registrationDate} minYear={1380} onChange={(v) => patch({ registrationDate: v })} />
              </div>
            </div>
            <div className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3.5 space-y-3">
              <div className="text-xs font-black text-[#3A241F] flex items-center gap-2">
                <Landmark className="w-4 h-4 text-violet-600" />
                نمایندهٔ شرکت (مدیرعامل / رابط)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={label}>نام و نام خانوادگی</label>
                  <input className={field} value={c.repName || ''} onChange={(e) => patch({ repName: e.target.value })} />
                </div>
                <div>
                  <label className={label}>سمت</label>
                  <input className={field} value={c.repPosition || ''} onChange={(e) => patch({ repPosition: e.target.value })} placeholder="مثلاً مدیرعامل" />
                </div>
                <div>
                  <label className={label}>موبایل نماینده</label>
                  <input className={field} dir="ltr" inputMode="tel" value={c.repMobile || ''} onChange={(e) => patch({ repMobile: e.target.value })} />
                </div>
              </div>
            </div>
          </Section>
        )}

        <Section title="شماره‌های تماس (هر تعداد)">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumberList
              title="موبایل‌ها"
              icon={<Smartphone className="w-4 h-4 text-emerald-600" />}
              items={mobiles}
              placeholder="مثلاً 09121234567"
              draft={mobileDraft}
              setDraft={setMobileDraft}
              onChange={(m) => setNumbers(m, landlines)}
              main={mainPhone}
              onMain={setMainPhone}
            />
            <NumberList
              title="تلفن‌های ثابت"
              icon={<Phone className="w-4 h-4 text-sky-600" />}
              items={landlines}
              placeholder="مثلاً 02122334455"
              draft={landlineDraft}
              setDraft={setLandlineDraft}
              onChange={(l) => setNumbers(mobiles, l)}
              main={mainPhone}
              onMain={setMainPhone}
              fax={c.faxNumber}
              onFax={(p) => patch({ faxNumber: p || undefined })}
            />
          </div>
        </Section>

        <Section title="نشانی و راه‌های ارتباطی">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={label}>استان</label>
              <select className={field} value={c.province || ''} onChange={(e) => patch({ province: e.target.value, city: IRAN_CITIES[e.target.value]?.includes(c.city || '') ? c.city : '' })}>
                <option value="">انتخاب استان</option>
                {PROVINCE_LIST.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
                {c.province && !PROVINCE_LIST.includes(c.province) && <option value={c.province}>{c.province}</option>}
              </select>
            </div>
            <div>
              <label className={label}>شهر</label>
              <input className={field} list="crm-cities" value={c.city || ''} onChange={(e) => patch({ city: e.target.value })} placeholder={c.province ? 'شهرستان را انتخاب یا بنویسید' : 'اول استان را انتخاب کنید'} />
              <datalist id="crm-cities">
                {(IRAN_CITIES[c.province || ''] || []).map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={label}>کد پستی (۱۰ رقم)</label>
              <input className={field} dir="ltr" inputMode="numeric" maxLength={10} value={c.postalCode || ''} onChange={(e) => patch({ postalCode: e.target.value })} />
              {hint(postalBad, 'کد پستی باید ۱۰ رقم باشد.')}
            </div>
            <div className="sm:col-span-3">
              <label className={label}>نشانی کامل</label>
              <textarea className={`${field} min-h-[64px] leading-6`} value={c.address || ''} onChange={(e) => patch({ address: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>ایمیل</label>
              <input className={field} dir="ltr" value={c.email || ''} onChange={(e) => patch({ email: e.target.value })} />
            </div>
            <div>
              <label className={label}>وب‌سایت</label>
              <input className={field} dir="ltr" value={c.website || ''} onChange={(e) => patch({ website: e.target.value })} />
            </div>
          </div>
        </Section>

        <Section title="بازاریابی">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              <label className={label}>معرف</label>
              <select
                className={field}
                value={refKind}
                onChange={(e) => {
                  const k = e.target.value as '' | 'CUSTOMER' | 'STAFF' | 'OTHER';
                  setRefText('');
                  patch({ referrer: k ? { kind: k, name: '' } : undefined });
                }}
              >
                <option value="">بدون معرف</option>
                <option value="CUSTOMER">یکی از مشتریان</option>
                <option value="STAFF">یکی از همکاران</option>
                <option value="OTHER">شخص دیگر</option>
              </select>
            </div>
            <div>
              {refKind === 'CUSTOMER' && (
                <>
                  <label className={label}>نام مشتری معرف</label>
                  <input
                    className={field}
                    list="crm-ref-customers"
                    value={refText}
                    onChange={(e) => {
                      setRefText(e.target.value);
                      const m = referrerCandidates.find((x) => x.name === e.target.value);
                      patch({ referrer: { kind: 'CUSTOMER', id: m?.id, name: m ? m.name : e.target.value, phone: m?.phones[0] } });
                    }}
                    placeholder="نام را بنویسید و انتخاب کنید"
                  />
                  <datalist id="crm-ref-customers">
                    {referrerCandidates.map((x) => (
                      <option key={x.id} value={x.name} />
                    ))}
                  </datalist>
                </>
              )}
              {refKind === 'STAFF' && (
                <>
                  <label className={label}>همکار معرف</label>
                  <PersonPicker
                    title="همکار معرف"
                    items={staffItems(staff)}
                    value={c.referrer?.id || ''}
                    onChange={(id) => {
                      const u = staff.find((x) => x.id === id);
                      patch({ referrer: { kind: 'STAFF', id: u?.id, name: u?.fullName || '' } });
                    }}
                    emptyLabel="انتخاب کنید"
                  />
                </>
              )}
              {refKind === 'OTHER' && (
                <>
                  <label className={label}>نام معرف</label>
                  <input className={field} value={c.referrer?.name || ''} onChange={(e) => patch({ referrer: { kind: 'OTHER', name: e.target.value, phone: c.referrer?.phone } })} />
                </>
              )}
            </div>
            {refKind === 'OTHER' && (
              <div className="sm:col-span-3 sm:max-w-xs">
                <label className={label}>شمارهٔ تماس معرف</label>
                <input className={field} dir="ltr" inputMode="tel" value={c.referrer?.phone || ''} onChange={(e) => patch({ referrer: { kind: 'OTHER', name: c.referrer?.name || '', phone: e.target.value } })} />
              </div>
            )}
          </div>
        </Section>

        <Section title="نیاز مشتری">
          <div>
            <label className={label}>مشتری دنبال چه کالایی می‌گردد؟</label>
            <input className={field} list="crm-interests" value={c.interest || ''} onChange={(e) => patch({ interest: e.target.value })} placeholder="مثلاً کولر گازی ۲۴ هزار، بودجه ۴۰ میلیون" />
            <datalist id="crm-interests">
              {[...new Set(customers.map((x) => (x.interest || '').trim()).filter(Boolean))].slice(0, 60).map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </div>
        </Section>

        <Section title="پیگیری">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>وضعیت</label>
              <select className={field} value={c.status} onChange={(e) => patch({ status: e.target.value as CustomerStatus })}>
                {(Object.keys(STATUS_LABEL) as CustomerStatus[]).map((k) => (
                  <option key={k} value={k}>{STATUS_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>مسئول پیگیری</label>
              <PersonPicker title="مسئول پیگیری" items={staffItems(staff)} value={c.ownerId} onChange={(id) => patch({ ownerId: id })} />
            </div>
          </div>
          <div>
            <label className={label}>برچسب‌ها</label>
            <div className="flex flex-wrap gap-1.5 mb-2 empty:hidden">
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
            <PhraseChips sources={customers.map((x) => x.notes || '')} onPick={(t) => patch({ notes: (c.notes ? c.notes.replace(/\s+$/, '') + '\n' : '') + t })} />
            <textarea className={`${field} min-h-[80px] leading-6`} value={c.notes || ''} onChange={(e) => patch({ notes: e.target.value })} />
          </div>
        </Section>
      </Modal>
    </form>
  );
};
