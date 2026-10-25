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
export const UnknownNumberActions: React.FC<{ number: string; compact?: boolean }> = ({ number, compact }) => {
  const area = useVoipArea();
  const full = fullPhone(number, area);
  const [dlg, setDlg] = useState<'other' | 'existing' | null>(null);
  const cls = `shrink-0 flex items-center gap-1 rounded-lg font-black cursor-pointer ${compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1 text-[11px]'}`;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <span className="flex flex-wrap items-center gap-1.5" onClick={stop} data-unknown-number-actions>
      <button
        type="button"
        onClick={() => {
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
      <button type="button" onClick={() => setDlg('other')} className={`${cls} bg-white text-amber-900 border border-amber-300`} data-unknown-other>سایر</button>
      <button type="button" onClick={() => setDlg('existing')} className={`${cls} bg-white text-amber-900 border border-amber-300`} data-unknown-existing>
        <Plus className="w-3.5 h-3.5" />
        به شمارهٔ قبلی
      </button>
      {dlg === 'other' && <QuickCustomerDialog withType initialPhone={full} onClose={() => setDlg(null)} onCreated={() => setDlg(null)} />}
      {dlg === 'existing' && <AddToExisting number={normPhone(full) || full} onClose={() => setDlg(null)} />}
    </span>
  );
};
