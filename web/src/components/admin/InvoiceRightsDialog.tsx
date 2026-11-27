import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { User } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { matchesAll } from '../../lib/searchAll';

/** The details of issuing an invoice that the permission table keeps per person. */
export type InvoiceScope = 'visible' | 'own' | 'people';
export const INVOICE_SUBS: { id: string; label: string; hint: string }[] = [
  { id: 'crm.invoice.official', label: 'فاکتور رسمی', hint: 'صدور فاکتور رسمی (با مالیات و مشخصات رسمی).' },
  { id: 'crm.invoice.unofficial', label: 'فاکتور غیررسمی', hint: 'صدور فاکتور غیررسمی.' },
  { id: 'crm.invoice.standalone', label: 'فاکتور مستقل (بدون پیش‌فاکتور)', hint: 'صدور فاکتور مستقیم برای مشتری، بدون ساختن پیش‌فاکتور.' },
  { id: 'crm.invoice.paid', label: 'ثبت «پرداخت شده» هنگام صدور', hint: 'تیک «پرداخت‌شده» (فروش نقدی) هنگام صدور فاکتور.' },
  { id: 'crm.invoice.cancel', label: 'ابطال فاکتور', hint: 'ابطال فاکتورِ صادرشده با نوشتن دلیل.' },
];
const SCOPES: [InvoiceScope, string, string][] = [
  ['visible', 'هر مشتری که می‌بیند', 'برای هر مشتری و فرصتی که در هورمند به آن دسترسی دارد (طبق «مشتریان همکاران» و مشتریان مشخص).'],
  ['own', 'فقط مشتریان خودش', 'فقط فرصت‌هایی که خودش صاحب آن‌هاست.'],
  ['people', 'مشتریان خودش و همکاران انتخابی', 'فرصت‌های خودش، به‌علاوهٔ فرصت‌های همکارانی که پایین انتخاب می‌شوند.'],
];

export const invoiceSummary = (u: User, users: User[]) => {
  const sc = (u.invoiceScope || 'visible') as InvoiceScope;
  const off = INVOICE_SUBS.filter((s) => (u.hiddenSub || []).includes(s.id)).length;
  const who = sc === 'own' ? 'فقط مشتریان خودش' : sc === 'people' ? `خودش + ${toPersianDigits((u.invoiceTeamIds || []).filter((id) => users.some((x) => x.id === id)).length)} همکار` : 'هر مشتری که می‌بیند';
  return `فاکتور: ${who}${off ? ` · ${toPersianDigits(off)} محدودیت` : ''}`;
};

export const InvoiceRightsDialog: React.FC<{ u: User; users: User[]; onSave: (patch: Partial<User>) => void; onClose: () => void }> = ({ u, users, onSave, onClose }) => {
  const [scope, setScope] = useState<InvoiceScope>((u.invoiceScope as InvoiceScope) || 'visible');
  const [team, setTeam] = useState<string[]>(u.invoiceTeamIds || []);
  const [off, setOff] = useState<string[]>((u.hiddenSub || []).filter((x) => INVOICE_SUBS.some((s) => s.id === x)));
  const [q, setQ] = useState('');
  const people = users.filter((x) => x.isActive !== false && x.id !== u.id);
  const shown = q.trim() ? people.filter((x) => matchesAll(x, q)) : people;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const box = (on: boolean) => <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-[#6E1B1B] text-white' : 'border border-[#EBDBCE]'}`}>{on && <Check className="w-3.5 h-3.5" />}</span>;
  const save = () => {
    const rest = (u.hiddenSub || []).filter((x) => !INVOICE_SUBS.some((s) => s.id === x));
    onSave({ invoiceScope: scope, invoiceTeamIds: scope === 'people' ? team : [], hiddenSub: [...rest, ...off] });
    onClose();
  };
  return createPortal(
    <div className="fixed inset-0 z-[360] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={(e) => { stop(e); onClose(); }} onClick={stop} data-invoice-rights-dialog>
      <div dir="rtl" onMouseDown={stop} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col border border-[#EBDBCE] text-right max-h-[88vh]">
        <div className="px-5 py-3.5 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F]">صدور فاکتور برای «{u.fullName}»</h3>
          <p className="text-[11px] text-[#8C6F66] mt-1 leading-5">همهٔ جزئیات صدور فاکتور برای این فرد. اینکه فاکتورش «منتظر تأیید» می‌ماند یا نه، از «تنظیمات سیستم ← فاکتور» و گردشکارها می‌آید.</p>
        </div>
        <div className="p-4 overflow-y-auto space-y-4">
          <section>
            <div className="text-xs font-black text-[#6E1B1B] mb-2">برای چه کسانی می‌تواند فاکتور صادر کند؟</div>
            <div className="space-y-1.5" data-invoice-scope>
              {SCOPES.map(([id, l, h]) => (
                <button key={id} type="button" onClick={() => setScope(id)} className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border text-right cursor-pointer ${scope === id ? 'bg-[#F6D9CD] border-[#C98B6A]' : 'bg-white border-[#EBDBCE] hover:bg-[#FAF5F1]'}`} data-invoice-scope-opt={id}>
                  {box(scope === id)}
                  <span className="flex-1 min-w-0"><span className="block text-xs font-black text-[#3A241F]">{l}</span><span className="block text-[10px] text-[#8C6F66] leading-5">{h}</span></span>
                </button>
              ))}
            </div>
            {scope === 'people' && (
              <div className="mt-2 rounded-xl border border-[#EBDBCE] p-2" data-invoice-team>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام…" className="w-full px-3 py-2 min-h-[40px] bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs outline-hidden focus:border-[#6E1B1B]" />
                <div className="mt-2 max-h-44 overflow-y-auto space-y-1">
                  {shown.map((x) => {
                    const on = team.includes(x.id);
                    return (
                      <button key={x.id} type="button" onClick={() => setTeam((p) => (on ? p.filter((i) => i !== x.id) : [...p, x.id]))} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-right cursor-pointer ${on ? 'bg-[#F6D9CD]' : 'hover:bg-[#FAF5F1]'}`}>
                        <span className="flex-1 min-w-0"><span className="block text-xs font-black text-[#3A241F] truncate">{x.fullName}</span>{x.departmentName && <span className="block text-[10px] text-[#8C6F66] truncate">{x.departmentName}</span>}</span>
                        {box(on)}
                      </button>
                    );
                  })}
                  {shown.length === 0 && <div className="py-4 text-center text-xs font-bold text-gray-400">موردی پیدا نشد.</div>}
                </div>
              </div>
            )}
          </section>
          <section>
            <div className="text-xs font-black text-[#6E1B1B] mb-2">چه کارهایی از صدور فاکتور مجاز است؟</div>
            <div className="space-y-1.5" data-invoice-subs>
              {INVOICE_SUBS.map((s) => {
                const on = !off.includes(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => setOff((p) => (on ? [...p, s.id] : p.filter((i) => i !== s.id)))} className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border text-right cursor-pointer ${on ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-[#EBDBCE] hover:bg-[#FAF5F1]'}`} data-invoice-sub={s.id}>
                    {box(on)}
                    <span className="flex-1 min-w-0"><span className="block text-xs font-black text-[#3A241F]">{s.label}</span><span className="block text-[10px] text-[#8C6F66] leading-5">{s.hint}</span></span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#EBDBCE]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black border border-[#EBDBCE] cursor-pointer">انصراف</button>
          <button type="button" onClick={save} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-[#6E1B1B] cursor-pointer" data-invoice-rights-save>تأیید</button>
        </div>
      </div>
    </div>,
    document.body
  );
};
