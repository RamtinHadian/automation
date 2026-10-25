import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { Customer } from '../../types';
import { PersonPicker, customerItems } from './PersonPicker';
import { toPersianDigits } from '../../lib/jalali';
import { digitsOf } from './MoneyInput';
import { askConfirm } from '../../lib/confirmDialog';
import { CONTACT_TYPES } from '../../lib/contactTypes';

const inp = 'w-full px-3 py-2.5 min-h-[42px] bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] outline-hidden focus:border-[#6E1B1B]';

/** The quick form that adds a new customer from any place where a customer is searched (name, company, mobile); the full record is completed later in «مشتریان». */
export const QuickCustomerDialog: React.FC<{ initialName?: string; initialPhone?: string; withType?: boolean; onClose: () => void; onCreated: (c: Customer) => void }> = ({ initialName = '', initialPhone = '', withType, onClose, onCreated }) => {
  const { customers, setCustomers, currentUser, showToast } = useAppContext();
  const [name, setName] = useState(initialName);
  const [company, setCompany] = useState('');
  const [phone, setPhone] = useState(digitsOf(initialPhone));
  const [type, setType] = useState<string>('CUSTOMER');
  const save = () => {
    const n = name.trim();
    const ph = digitsOf(phone);
    if (!n) return showToast('نام مشتری را بنویسید.');
    if (ph && !/^\d{7,15}$/.test(ph)) return showToast('شمارهٔ تماس درست نیست.');
    const norm = (x: string) => x.replace(/[‌\s]+/g, ' ').trim();
    const samePhone = customers.find((c) => ph && (c.phones || []).some((p) => digitsOf(p) === ph));
    if (samePhone) {
      showToast(`این شماره از قبل برای «${samePhone.name}» ثبت است.`);
      onCreated(samePhone);
      return;
    }
    const sameName = customers.find((c) => norm(c.name) === norm(n));
    if (sameName) {
      // the same person is already in the phone book: offer to add the number to his numbers (the form sorts it into mobiles or landlines by itself)
      void askConfirm(`«${sameName.name}» از قبل در دفتر تلفن هست. این شماره به شماره‌هایش اضافه شود؟`, { title: 'این نفر قبلاً ثبت شده', confirmText: 'بله، اضافه شود' }).then((ok) => {
        if (!ok) return;
        if (ph) setCustomers((prev) => prev.map((x) => (x.id === sameName.id ? { ...x, phones: [...(x.phones || []), ph], updatedAt: new Date().toISOString() } : x)));
        showToast(`شماره به «${sameName.name}» اضافه شد.`);
        if (!sameName.contactType) {
          try {
            sessionStorage.setItem('crm_open', JSON.stringify({ type: 'customer', id: sameName.id }));
          } catch {
            /* storage unavailable */
          }
          window.dispatchEvent(new Event('goto-crm'));
          window.dispatchEvent(new Event('open-crm-item'));
        }
        onCreated(sameName);
      });
      return;
    }
    const now = new Date().toISOString();
    const c: Customer = {
      id: 'cu-' + Math.random().toString(36).substring(2, 10),
      ...(type !== 'CUSTOMER' ? { contactType: type as Customer['contactType'] } : {}),
      name: n, company: company.trim(), phones: ph ? [ph] : [], email: '', address: '', status: 'LEAD', source: '', tags: [],
      ownerId: currentUser.id, ownerName: currentUser.fullName, notes: '', createdAt: now, updatedAt: now,
    };
    setCustomers((prev) => [c, ...prev]);
    showToast(type === 'CUSTOMER' ? 'مشتری تازه ثبت شد.' : 'در دفتر تلفن ذخیره شد.');
    onCreated(c);
  };
  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={(e) => { e.stopPropagation(); onClose(); }} onClick={(e) => e.stopPropagation()} data-quick-customer>
      <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-sm border border-[#EBDBCE] text-right">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F]">{withType ? 'ذخیره در دفتر تلفن' : 'مشتری تازه'}</h3>
          <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] rounded-xl cursor-pointer" aria-label="بستن"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          {withType && (
            <div data-contact-types>
              <span className="block text-[11px] font-black text-[#8C6F66] mb-1">این شماره مال کیست؟</span>
              <div className="flex flex-wrap gap-1.5">
                {CONTACT_TYPES.map((t) => (
                  <button key={t.id} type="button" onClick={() => setType(t.id)} className={`px-3 py-1.5 rounded-full text-[11px] font-black border cursor-pointer ${type === t.id ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : t.cls}`}>{t.label}</button>
                ))}
              </div>
            </div>
          )}
          <div><span className="block text-[11px] font-black text-[#8C6F66] mb-1">نام و نام خانوادگی *</span><input autoFocus className={inp} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><span className="block text-[11px] font-black text-[#8C6F66] mb-1">شرکت (اختیاری)</span><input className={inp} value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          <div><span className="block text-[11px] font-black text-[#8C6F66] mb-1">شمارهٔ موبایل (اختیاری)</span><input className={inp} dir="ltr" inputMode="numeric" value={phone ? toPersianDigits(digitsOf(phone)) : ''} onChange={(e) => setPhone(digitsOf(e.target.value))} /></div>
          <p className="text-[10px] font-bold text-[#8C6F66]">بقیهٔ مشخصات را بعداً در «مشتریان» کامل کنید.</p>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#EBDBCE]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black border border-[#EBDBCE] cursor-pointer">انصراف</button>
          <button type="button" onClick={save} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-[#6E1B1B] cursor-pointer" data-quick-customer-save>{type === 'CUSTOMER' ? 'ثبت مشتری' : 'ثبت'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

/** Choose one customer (searchable box); the box has a «مشتری تازه» button that adds one on the spot and chooses it. */
export const CustomerSelect: React.FC<{ value: string; onChange: (id: string) => void; title?: string; emptyLabel?: string; placeholder?: string; disabled?: boolean; className?: string }> = ({ value, onChange, title = 'انتخاب مشتری', emptyLabel, placeholder, disabled, className }) => {
  const { customers } = useAppContext();
  const [adding, setAdding] = useState<string | null>(null);
  return (
    <>
      <PersonPicker title={title} items={customerItems(customers)} value={value} onChange={onChange} emptyLabel={emptyLabel} placeholder={placeholder} disabled={disabled} className={className} onAdd={(q) => setAdding(q)} addLabel="مشتری تازه" />
      {adding !== null && <QuickCustomerDialog initialName={adding} onClose={() => setAdding(null)} onCreated={(c) => { onChange(c.id); setAdding(null); }} />}
    </>
  );
};
