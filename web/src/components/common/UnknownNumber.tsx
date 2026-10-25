import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, UserPlus, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { normPhone } from '../../lib/customerImport';
import { fullPhone, useVoipArea } from '../../lib/voipArea';
import { digitsOf } from './MoneyInput';
import { ContactKind, KIND_INFO } from './ContactDialog';
import { CustomerForm } from '../crm/CustomerForm';
import { toPersianDigits } from '../../lib/jalali';
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
    <div className="fixed inset-0 z-[2147483200] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={(e) => { e.stopPropagation(); onClose(); }} onClick={(e) => e.stopPropagation()} data-add-to-existing>
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

type Dlg = { kind: 'choose' | 'existing'; number: string } | { kind: 'contact'; type: ContactKind; number: string };

/** Opens the customer form of «مشتریان» with this number already in it. */
const openNewCustomer = (number: string) => {
  try {
    sessionStorage.setItem('crm_open', JSON.stringify({ type: 'newCustomer', phone: normPhone(number) || number, name: '' }));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event('goto-crm'));
  window.dispatchEvent(new Event('open-crm-item'));
};

/** «ذخیره در دفتر تلفن»: the window that asks what this number is, in four big choices. */
const ChooseType: React.FC<{ number: string; onPick: (t: 'CUSTOMER' | ContactKind) => void; onExisting: () => void; onClose: () => void }> = ({ number, onPick, onExisting, onClose }) => {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const tiles: { id: 'CUSTOMER' | ContactKind; label: string; hint: string; Icon: React.ElementType; tone: string }[] = [
    { id: 'CUSTOMER', label: 'مشتری', hint: 'ثبت مشتری جدید در «مشتریان» و پیگیری فروش', Icon: UserPlus, tone: 'bg-violet-50 text-violet-700 border-violet-200' },
    ...(['SUPPLIER', 'COLLEAGUE', 'OTHER'] as ContactKind[]).map((k) => ({ id: k, label: KIND_INFO[k].label, hint: KIND_INFO[k].hint, Icon: KIND_INFO[k].Icon, tone: KIND_INFO[k].tone })),
  ];
  return createPortal(
    <div className="fixed inset-0 z-[2147483200] flex items-center justify-center bg-black/55 backdrop-blur-xs p-3" onMouseDown={(e) => { stop(e); onClose(); }} onClick={stop} data-choose-type>
      <div dir="rtl" onMouseDown={stop} className="bg-white rounded-[28px] shadow-2xl w-full max-w-md border border-[#EBDBCE] text-right overflow-hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h3 className="font-black text-base text-[#3A241F]">ذخیره در دفتر تلفن</h3>
            <p className="text-[12px] text-[#8C6F66] mt-1">این شماره مال کیست؟ <b dir="ltr" className="text-[#3A241F] inline-block">{toPersianDigits(digitsOf(number))}</b></p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] rounded-xl cursor-pointer" aria-label="بستن"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 pb-4 grid grid-cols-2 gap-3">
          {tiles.map((t) => (
            <button key={t.id} type="button" onClick={() => onPick(t.id)} data-choose={t.id} className="group text-right rounded-2xl border border-[#EBDBCE] bg-[#FAF5F1]/60 hover:bg-white hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] transition-all p-3.5 cursor-pointer">
              <span className={`w-11 h-11 rounded-2xl border flex items-center justify-center mb-2.5 ${t.tone}`}><t.Icon className="w-5 h-5" /></span>
              <span className="block text-[13px] font-black text-[#3A241F]">{t.label}</span>
              <span className="block text-[10px] leading-4 text-[#8C6F66] mt-0.5">{t.hint}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={onExisting} className="w-full flex items-center justify-center gap-1.5 px-5 py-3 border-t border-[#EBDBCE] text-[11px] font-black text-amber-800 hover:bg-amber-50 cursor-pointer" data-choose-existing>
          <Plus className="w-3.5 h-3.5" />
          این شماره مال کسی است که در دفتر تلفن هست؛ اضافه به شماره‌های او
        </button>
      </div>
    </div>,
    document.body
  );
};

/** Supplier / colleague / other: the same full form as «مشتری جدید», without what only a customer has; the entry goes to the phone book. */
const ContactFormHost: React.FC<{ kind: ContactKind; number: string; onClose: () => void }> = ({ kind, number, onClose }) => {
  const { customers, setCustomers, staffList, currentUser, showToast } = useAppContext();
  const now = new Date().toISOString();
  const norm = normPhone(number) || number;
  const initial: Customer = {
    id: 'cu-' + Math.random().toString(36).substring(2, 10), contactType: kind, name: '', company: '', phones: norm ? [norm] : [], email: '', address: '', status: 'LEAD', source: '', tags: [],
    ownerId: currentUser.id, ownerName: currentUser.fullName, notes: '', createdAt: now, updatedAt: now,
  };
  return (
    <CustomerForm
      initial={initial}
      isNew
      staff={staffList}
      customers={customers}
      canDelete={false}
      contactKind={kind}
      onClose={onClose}
      onDelete={() => {}}
      onSave={(c) => {
        setCustomers((prev) => [{ ...c, contactType: kind, name: c.name.trim(), updatedAt: new Date().toISOString() }, ...prev]);
        showToast(`«${c.name.trim()}» به‌عنوان ${KIND_INFO[kind].label} در دفتر تلفن ذخیره شد.`);
        onClose();
      }}
    />
  );
};

/** The windows live here, once, outside any list, so closing the notification list never takes them away; a new one always replaces the one before. */
export const UnknownNumberHost: React.FC = () => {
  const [dlg, setDlg] = useState<Dlg | null>(null);
  React.useEffect(() => {
    const on = (e: Event) => setDlg((e as CustomEvent).detail);
    window.addEventListener('open-unknown-dialog', on);
    return () => window.removeEventListener('open-unknown-dialog', on);
  }, []);
  if (!dlg) return null;
  const close = () => setDlg(null);
  if (dlg.kind === 'existing') return <AddToExisting number={dlg.number} onClose={close} />;
  if (dlg.kind === 'contact') return <ContactFormHost kind={dlg.type} number={dlg.number} onClose={close} />;
  return (
    <ChooseType
      number={dlg.number}
      onClose={close}
      onExisting={() => setDlg({ kind: 'existing', number: dlg.number })}
      onPick={(t) => {
        if (t === 'CUSTOMER') {
          close();
          openNewCustomer(dlg.number);
        } else setDlg({ kind: 'contact', type: t, number: dlg.number });
      }}
    />
  );
};

/** Next to a number nobody has saved: one «+ دفتر تلفن» button (call pop-up, notification list, call history). */
export const UnknownNumberActions: React.FC<{ number: string; compact?: boolean }> = ({ number, compact }) => {
  const area = useVoipArea();
  const full = fullPhone(number, area);
  return (
    <span className="flex items-center" onClick={(e) => e.stopPropagation()} data-unknown-number-actions>
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new Event('close-popovers'));
          window.dispatchEvent(new CustomEvent('open-unknown-dialog', { detail: { kind: 'choose', number: normPhone(full) || full } }));
        }}
        className={`shrink-0 flex items-center gap-1 rounded-lg font-black cursor-pointer bg-amber-600 text-white hover:bg-amber-700 ${compact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-[11px]'}`}
        data-unknown-phonebook
      >
        <Plus className="w-3.5 h-3.5" />
        دفتر تلفن
      </button>
    </span>
  );
};
