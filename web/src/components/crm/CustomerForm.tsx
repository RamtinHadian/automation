import React, { useMemo, useState } from 'react';
import { Building2, Landmark, Phone, Smartphone, Trash2, User as UserIcon, X } from 'lucide-react';
import { Customer, CustomerStatus, User } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { normPhone, normText } from '../../lib/customerImport';
import { JalaliDateField } from '../tasks/TasksView';
import { Modal, field, label, SOURCES } from './crmUi';

const STATUS_LABEL: Record<CustomerStatus, string> = { LEAD: 'مشتری بالقوه', ACTIVE: 'مشتری فعال', INACTIVE: 'غیرفعال' };
const COMPANY_TYPES = ['سهامی خاص', 'سهامی عام', 'مسئولیت محدود', 'تضامنی', 'نسبی', 'تعاونی', 'مؤسسه / انجمن', 'شخص حقیقی با کد اقتصادی', 'سایر'];
const PROVINCES = [
  'آذربایجان شرقی', 'آذربایجان غربی', 'اردبیل', 'اصفهان', 'البرز', 'ایلام', 'بوشهر', 'تهران', 'چهارمحال و بختیاری', 'خراسان جنوبی', 'خراسان رضوی',
  'خراسان شمالی', 'خوزستان', 'زنجان', 'سمنان', 'سیستان و بلوچستان', 'فارس', 'قزوین', 'قم', 'کردستان', 'کرمان', 'کرمانشاه', 'کهگیلویه و بویراحمد',
  'گلستان', 'گیلان', 'لرستان', 'مازندران', 'مرکزی', 'هرمزگان', 'همدان', 'یزد',
];

const digits = (v: string) => normText(v).replace(/\D/g, '');
/** Iranian national code check (10 digits + checksum). */
const validNationalCode = (code: string) => {
  if (!/^\d{10}$/.test(code) || /^(\d)\1{9}$/.test(code)) return false;
  const sum = code.split('').slice(0, 9).reduce((s, d, i) => s + Number(d) * (10 - i), 0) % 11;
  const check = Number(code[9]);
  return sum < 2 ? check === sum : check === 11 - sum;
};
const isMobile = (p: string) => /^09\d{9}$/.test(p) || /^\+?989\d{9}$/.test(p);
const cleanNumber = (v: string) => normPhone(v) || normText(v).replace(/[^0-9+]/g, '');

/** Any number of phone numbers of one sort (mobile or landline). */
const NumberList: React.FC<{ title: string; icon: React.ReactNode; items: string[]; placeholder: string; onChange: (items: string[]) => void; draft: string; setDraft: (v: string) => void }> = ({
  title,
  icon,
  items,
  placeholder,
  onChange,
  draft,
  setDraft,
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
          <span key={p} className="flex items-center gap-1 bg-[#FAF5F1] border border-[#EBDBCE] rounded-full pl-1.5 pr-3 py-1 text-xs font-bold text-[#3A241F]" dir="ltr">
            {toPersianDigits(p)}
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
  const [mobileDraft, setMobileDraft] = useState('');
  const [landlineDraft, setLandlineDraft] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const patch = (u: Partial<Customer>) => setC((p) => ({ ...p, ...u }));
  const isCompany = c.kind === 'COMPANY';

  const mobiles = c.phones.filter(isMobile);
  const landlines = c.phones.filter((p) => !isMobile(p));
  const setNumbers = (m: string[], l: string[]) => patch({ phones: [...new Set([...m, ...l])] });

  const displayName = isCompany ? (c.company || '').trim() : `${c.firstName || ''} ${c.lastName || ''}`.trim();
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
      company: isCompany ? displayName : (c.company || '').trim(),
      firstName: isCompany ? undefined : (c.firstName || '').trim(),
      lastName: isCompany ? undefined : (c.lastName || '').trim(),
      nationalCode: digits(c.nationalCode || '') || undefined,
      idNumber: digits(c.idNumber || '') || undefined,
      nationalId: digits(c.nationalId || '') || undefined,
      economicCode: digits(c.economicCode || '') || undefined,
      registrationNumber: digits(c.registrationNumber || '') || undefined,
      postalCode: digits(c.postalCode || '') || undefined,
      phones: [...new Set([...m, ...l].filter(Boolean))],
      ownerName: owner?.fullName || c.ownerName,
    };
    if (out.referrer && !out.referrer.name.trim()) delete out.referrer;
    onSave(out);
  };

  const typeBtn = (k: 'PERSON' | 'COMPANY', text: string, Icon: React.ElementType) => (
    <button
      type="button"
      onClick={() => patch({ kind: k })}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black cursor-pointer border transition-colors ${
        c.kind === k ? 'bg-violet-600 text-white border-violet-600 shadow-sm' : 'bg-white text-[#3A241F] border-[#EBDBCE] hover:bg-violet-50'
      }`}
    >
      <Icon className="w-4 h-4" />
      {text}
    </button>
  );

  const hint = (bad: boolean, text: string) => (bad ? <div className="text-[10px] font-bold text-rose-600 mt-1">{text}</div> : null);

  return (
    <form onSubmit={submit}>
      <Modal
        wide
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
        <div className="flex gap-2">
          {typeBtn('PERSON', 'شخص حقیقی', UserIcon)}
          {typeBtn('COMPANY', 'شرکت / شخص حقوقی', Building2)}
        </div>

        {!isCompany ? (
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
                <label className={label}>کد ملی</label>
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
                <JalaliDateField value={c.birthDate} onChange={(v) => patch({ birthDate: v })} />
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
                <JalaliDateField value={c.registrationDate} onChange={(v) => patch({ registrationDate: v })} />
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
            />
            <NumberList
              title="تلفن‌های ثابت"
              icon={<Phone className="w-4 h-4 text-sky-600" />}
              items={landlines}
              placeholder="مثلاً 02122334455"
              draft={landlineDraft}
              setDraft={setLandlineDraft}
              onChange={(l) => setNumbers(mobiles, l)}
            />
          </div>
        </Section>

        <Section title="نشانی و راه‌های ارتباطی">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={label}>استان</label>
              <input className={field} list="crm-provinces" value={c.province || ''} onChange={(e) => patch({ province: e.target.value })} />
              <datalist id="crm-provinces">
                {PROVINCES.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={label}>شهر</label>
              <input className={field} value={c.city || ''} onChange={(e) => patch({ city: e.target.value })} />
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
                  <select
                    className={field}
                    value={c.referrer?.id || ''}
                    onChange={(e) => {
                      const u = staff.find((x) => x.id === e.target.value);
                      patch({ referrer: { kind: 'STAFF', id: u?.id, name: u?.fullName || '' } });
                    }}
                  >
                    <option value="">انتخاب کنید</option>
                    {staff.map((u) => (
                      <option key={u.id} value={u.id}>{u.fullName}</option>
                    ))}
                  </select>
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
              <select className={field} value={c.ownerId} onChange={(e) => patch({ ownerId: e.target.value })}>
                {staff.map((u) => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
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
            <textarea className={`${field} min-h-[80px] leading-6`} value={c.notes || ''} onChange={(e) => patch({ notes: e.target.value })} />
          </div>
        </Section>
      </Modal>
    </form>
  );
};
