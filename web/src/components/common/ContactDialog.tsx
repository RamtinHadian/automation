import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, Contact, Plus, Truck, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { Customer } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { askConfirm } from '../../lib/confirmDialog';
import { digitsOf } from './MoneyInput';

export type ContactKind = 'SUPPLIER' | 'COLLEAGUE' | 'OTHER';

/** The three kinds of phone-book entry that are not customers, with what each one is for (the customer has its own form in «مشتریان»). */
export const KIND_INFO: Record<ContactKind, { label: string; hint: string; Icon: React.ElementType; tone: string }> = {
  SUPPLIER: { label: 'تأمین‌کننده', hint: 'فروشندهٔ کالا یا خدمات به شرکت', Icon: Truck, tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  COLLEAGUE: { label: 'همکار', hint: 'همکار شرکت یا شرکت همکار', Icon: Briefcase, tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  OTHER: { label: 'سایر', hint: 'هر شمارهٔ دیگری که می‌خواهید بماند', Icon: Contact, tone: 'bg-slate-50 text-slate-700 border-slate-200' },
};

const inp = 'w-full px-3 py-2.5 min-h-[42px] bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] outline-hidden focus:border-[#6E1B1B]';
const lab = 'block text-[11px] font-black text-[#8C6F66] mb-1';

/**
 * «تأمین‌کننده / همکار / سایر جدید»: a form like the new-customer one, for a number that called and has no name yet.
 * The entry is kept in the phone book (searchable there, with its type), never in the customers' lists.
 */
export const ContactDialog: React.FC<{ kind: ContactKind; number: string; onClose: () => void; onSaved?: (c: Customer) => void }> = ({ kind, number, onClose, onSaved }) => {
  const { customers, setCustomers, currentUser, showToast } = useAppContext();
  const info = KIND_INFO[kind];
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [phones, setPhones] = useState<string[]>(digitsOf(number) ? [digitsOf(number)] : []);
  const [extra, setExtra] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const addPhone = () => {
    const d = digitsOf(extra);
    if (!d) return;
    if (!/^\d{7,15}$/.test(d)) return showToast('شمارهٔ تماس درست نیست.');
    setPhones((p) => (p.includes(d) ? p : [...p, d]));
    setExtra('');
  };

  const save = () => {
    const n = name.trim();
    const list = [...phones];
    const pending = digitsOf(extra);
    if (pending && /^\d{7,15}$/.test(pending) && !list.includes(pending)) list.push(pending);
    if (!n) return showToast('نام را بنویسید.');
    const norm = (x: string) => x.replace(/[‌\s]+/g, ' ').trim();
    const samePhone = customers.find((c) => list.some((ph) => (c.phones || []).some((p) => digitsOf(p).slice(-10) === ph.slice(-10))));
    if (samePhone) {
      showToast(`این شماره از قبل برای «${samePhone.name}» ثبت است.`);
      onSaved?.(samePhone);
      onClose();
      return;
    }
    const sameName = customers.find((c) => norm(c.name) === norm(n));
    if (sameName) {
      void askConfirm(`«${sameName.name}» از قبل در دفتر تلفن هست. این شماره‌ها به شماره‌هایش اضافه شود؟`, { title: 'این نفر قبلاً ثبت شده', confirmText: 'بله، اضافه شود' }).then((ok) => {
        if (!ok) return;
        setCustomers((prev) => prev.map((x) => (x.id === sameName.id ? { ...x, phones: [...(x.phones || []), ...list], updatedAt: new Date().toISOString() } : x)));
        showToast(`شماره به «${sameName.name}» اضافه شد.`);
        onSaved?.(sameName);
        onClose();
      });
      return;
    }
    const now = new Date().toISOString();
    const c: Customer = {
      id: 'cu-' + Math.random().toString(36).substring(2, 10),
      contactType: kind,
      name: n, company: company.trim(), phones: list, email: email.trim(), address: address.trim(), status: 'LEAD', source: '', tags: [],
      ownerId: currentUser.id, ownerName: currentUser.fullName, notes: notes.trim(), createdAt: now, updatedAt: now,
    };
    setCustomers((prev) => [c, ...prev]);
    showToast(`«${n}» به‌عنوان ${info.label} در دفتر تلفن ذخیره شد.`);
    onSaved?.(c);
    onClose();
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <div className="fixed inset-0 z-[2147483200] flex items-center justify-center bg-black/55 backdrop-blur-xs p-3" onMouseDown={(e) => { stop(e); onClose(); }} onClick={stop} data-contact-dialog={kind}>
      <div dir="rtl" onMouseDown={stop} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col border border-[#EBDBCE] text-right max-h-[92dvh]">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#EBDBCE]">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${info.tone}`}><info.Icon className="w-5 h-5" /></span>
            <div className="min-w-0">
              <h3 className="font-black text-sm text-[#3A241F]">{info.label} جدید</h3>
              <p className="text-[11px] text-[#8C6F66] truncate">در دفتر تلفن ذخیره می‌شود؛ قابل جستجو و پیگیری</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] rounded-xl cursor-pointer" aria-label="بستن"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3.5 overflow-y-auto">
          <div><span className={lab}>نام و نام خانوادگی *</span><input autoFocus className={inp} value={name} onChange={(e) => setName(e.target.value)} data-contact-name /></div>
          <div><span className={lab}>{kind === 'SUPPLIER' ? 'شرکت / فروشگاه' : 'شرکت یا سازمان (اختیاری)'}</span><input className={inp} value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          <div>
            <span className={lab}>شماره‌های تماس (موبایل یا ثابت)</span>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {phones.map((p) => (
                <span key={p} className="flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-900 rounded-full pl-1.5 pr-3 py-1 text-[12px] font-black" dir="ltr">
                  {toPersianDigits(p)}
                  <button type="button" onClick={() => setPhones((cur) => cur.filter((x) => x !== p))} className="p-0.5 text-amber-700 cursor-pointer" aria-label="حذف"><X className="w-3.5 h-3.5" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className={inp} dir="ltr" inputMode="numeric" placeholder="شمارهٔ دیگر…" value={extra ? toPersianDigits(digitsOf(extra)) : ''} onChange={(e) => setExtra(digitsOf(e.target.value))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPhone(); } }} />
              <button type="button" onClick={addPhone} className="shrink-0 flex items-center gap-1 px-3 rounded-xl bg-[#3A241F] text-white text-xs font-black cursor-pointer"><Plus className="w-4 h-4" />افزودن</button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><span className={lab}>ایمیل (اختیاری)</span><input className={inp} dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><span className={lab}>نشانی (اختیاری)</span><input className={inp} value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          </div>
          <div><span className={lab}>توضیحات</span><textarea className={`${inp} min-h-[70px] leading-6`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثلاً: چه کالایی می‌فروشد، چه کاری با ما دارد…" /></div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-[#EBDBCE]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black border border-[#EBDBCE] cursor-pointer">انصراف</button>
          <button type="button" onClick={save} className="px-6 py-2 rounded-xl text-xs font-black text-white bg-[#6E1B1B] cursor-pointer" data-contact-save>ذخیره در دفتر تلفن</button>
        </div>
      </div>
    </div>,
    document.body
  );
};
