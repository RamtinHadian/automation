import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, UserPlus, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { normPhone } from '../../lib/customerImport';
import { fullPhone, useVoipArea } from '../../lib/voipArea';
import { digitsOf } from './MoneyInput';
import { QuickCustomerDialog } from './CustomerSelect';
import { PersonPicker } from './PersonPicker';
import { CONTACT_TYPES, contactTypeOf } from '../../lib/contactTypes';
import { Customer } from '../../types';

/** «افزودن به شماره‌های قبلی»: choose a person who is already in the phone book (customer or not) and add this number to the numbers he has. */
const AddToExisting: React.FC<{ number: string; onClose: () => void }> = ({ number, onClose }) => {
  const { customers, setCustomers, showToast } = useAppContext();
  const [id, setId] = useState('');
  const items = customers.map((c) => ({ id: c.id, name: c.name, sub: [CONTACT_TYPES.find((t) => t.id === contactTypeOf(c))?.label, c.company && c.company !== c.name ? c.company : '', (c.phones || [])[0] || ''].filter(Boolean).join(' · ') }));
  const save = () => {
    const c = customers.find((x) => x.id === id);
    if (!c) return showToast('یک نفر را از دفتر تلفن انتخاب کنید.');
    const have = (c.phones || []).some((p) => digitsOf(p) === digitsOf(number));
    if (!have) setCustomers((prev) => prev.map((x) => (x.id === id ? { ...x, phones: [...(x.phones || []), number], updatedAt: new Date().toISOString() } : x)));
    showToast(have ? `این شماره از قبل برای «${c.name}» ثبت بود.` : `شماره به «${c.name}» اضافه شد.`);
    onClose();
  };
  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={(e) => { e.stopPropagation(); onClose(); }} onClick={(e) => e.stopPropagation()} data-add-to-existing>
      <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-sm border border-[#EBDBCE] text-right">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F]">افزودن به شماره‌های یک نفر</h3>
          <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] rounded-xl cursor-pointer" aria-label="بستن"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[11px] text-[#8C6F66]">شمارهٔ <b dir="ltr" className="text-[#3A241F]">{number}</b> به شماره‌های چه کسی اضافه شود؟</p>
          <PersonPicker title="انتخاب از دفتر تلفن" items={items} value={id} onChange={setId} emptyLabel="انتخاب (مشتری، همکار، تأمین‌کننده…)" />
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#EBDBCE]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black border border-[#EBDBCE] cursor-pointer">انصراف</button>
          <button type="button" onClick={save} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-[#6E1B1B] cursor-pointer" data-add-existing-save>افزودن</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

/**
 * What to do with a number nobody has saved, in three short buttons: «مشتری» (the CRM's new customer form), «سایر» (a phone-book entry of another kind:
 * supplier, colleague, agent, other) and «شمارهٔ قبلی» (add it to the numbers of somebody already saved).
 * It is the same in the call pop-up, the notification list and the call history.
 */
/** The person (customer or phone-book entry) who already has this number, if anyone: the last ten digits are compared, so «+98…», «0…» and «۰۹…» all match. */
/** A short number is a colleague's extension inside the company, never a number to save. */
export const isExtensionNumber = (number: string) => digitsOf(number).length < 7;

// the phone book as a lookup (last ten digits -> person), built once per list of customers, so a long list of calls does not search it again for every row
const indexCache = new WeakMap<Customer[], Map<string, Customer>>();
const phoneIndex = (customers: Customer[]) => {
  let m = indexCache.get(customers);
  if (!m) {
    m = new Map();
    for (const c of customers) for (const p of c.phones || []) {
      const k = digitsOf(p).slice(-10);
      if (k.length >= 7 && !m.has(k)) m.set(k, c);
    }
    indexCache.set(customers, m);
  }
  return m;
};

export const findSavedContact = (customers: Customer[], number: string) => {
  const key = digitsOf(number).slice(-10);
  return key.length < 7 ? undefined : phoneIndex(customers).get(key);
};

export const useSavedContact = (number: string) => findSavedContact(useAppContext().customers, number);

/** The title an old «call from a number» notification gets once the number is saved: the same wording the server uses for known callers. */
export const savedCallTitle = (c: Customer) => {
  const type = contactTypeOf(c);
  const kind = type === 'CUSTOMER' ? 'مشتری' : CONTACT_TYPES.find((t) => t.id === type)?.label || 'دفتر تلفن';
  return `تماس ورودی از ${kind}: ${c.name}`;
};

/** What a saved number shows instead of the three buttons: who it is, and the type when it is not a customer. */
export const SavedContactLine: React.FC<{ number: string; compact?: boolean }> = ({ number, compact }) => {
  const c = useSavedContact(number);
  if (!c) return null;
  const type = CONTACT_TYPES.find((t) => t.id === contactTypeOf(c))?.label;
  return (
    <span className={`font-black text-emerald-800 ${compact ? 'text-[11px]' : 'text-xs'}`} data-saved-contact>
      ذخیره‌شده: {c.name}{c.company && c.company !== c.name ? ` · ${c.company}` : ''}{type ? ` (${type})` : ''}
    </span>
  );
};

/** The two small dialogs live here, once, outside any list, so closing the notification list never takes them away. */
export const UnknownNumberHost: React.FC = () => {
  const [dlg, setDlg] = useState<{ kind: 'other' | 'existing'; number: string } | null>(null);
  React.useEffect(() => {
    const on = (e: Event) => setDlg((e as CustomEvent).detail);
    window.addEventListener('open-unknown-dialog', on);
    return () => window.removeEventListener('open-unknown-dialog', on);
  }, []);
  if (!dlg) return null;
  const close = () => setDlg(null);
  return dlg.kind === 'other' ? <QuickCustomerDialog withType initialPhone={dlg.number} onClose={close} onCreated={close} /> : <AddToExisting number={dlg.number} onClose={close} />;
};

export const UnknownNumberActions: React.FC<{ number: string; compact?: boolean }> = ({ number, compact }) => {
  const area = useVoipArea();
  const full = fullPhone(number, area);
  // a new window always replaces the one before it: the notification list closes
  const openDlg = (kind: 'other' | 'existing') => {
    window.dispatchEvent(new Event('close-popovers'));
    window.dispatchEvent(new CustomEvent('open-unknown-dialog', { detail: { kind, number: kind === 'existing' ? normPhone(full) || full : full } }));
  };
  const cls = `shrink-0 flex items-center gap-1 rounded-lg font-black cursor-pointer ${compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1 text-[11px]'}`;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <span className="flex flex-wrap items-center gap-1.5" onClick={stop} data-unknown-number-actions>
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new Event('close-popovers'));
          try {
            sessionStorage.setItem('crm_open', JSON.stringify({ type: 'newCustomer', phone: normPhone(full) || full, name: '' }));
          } catch {
            /* storage unavailable */
          }
          window.dispatchEvent(new Event('goto-crm'));
          window.dispatchEvent(new Event('open-crm-item'));
        }}
        className={`${cls} bg-amber-600 text-white`}
        data-unknown-customer
      >
        <UserPlus className="w-3.5 h-3.5" />
        مشتری
      </button>
      <button type="button" onClick={() => openDlg('other')} className={`${cls} bg-white text-amber-900 border border-amber-300`} data-unknown-other>سایر</button>
      <button type="button" onClick={() => openDlg('existing')} className={`${cls} bg-white text-amber-900 border border-amber-300`} data-unknown-existing>
        <Plus className="w-3.5 h-3.5" />
        به شمارهٔ قبلی
      </button>
    </span>
  );
};
