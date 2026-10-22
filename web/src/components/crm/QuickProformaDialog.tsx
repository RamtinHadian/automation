import React, { useMemo, useState } from 'react';
import { CheckCircle2, FilePlus2, Link2 } from 'lucide-react';
import { Customer, Deal } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { issuersOf, MAIN_ISSUER_ID } from '../../lib/proformaIssuer';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, unitName } from '../../lib/money';
import { Modal, field, label } from './crmUi';
import { fold, matchesQuery } from '../../lib/customerSearch';

const STAGE_TEXT: Record<string, string> = { NEW: 'جدید', CONTACTED: 'تماس گرفته شد', PROPOSAL: 'پیشنهاد ارسال شد', NEGOTIATION: 'مذاکره', WON: 'فروش موفق', LOST: 'از دست رفت' };

/**
 * «صدور پیش‌فاکتور»: pick the company that issues it, then the CUSTOMER (searchable list of names), then one of that customer's opportunities
 * or a new one made right here. A proforma never exists without an opportunity.
 */
export const QuickProformaDialog: React.FC<{
  deals: Deal[];
  customers: Customer[];
  onClose: () => void;
  /** open the customer form; the saved customer is handed to the callback */
  onCreateCustomer: (cb: (c: Customer) => void) => void;
  /** an existing opportunity was chosen */
  onExisting: (deal: Deal, issuerId: string) => void;
  /** a new opportunity must be made first */
  onNew: (input: { title: string; customerId: string }, issuerId: string) => void;
}> = ({ deals, customers, onClose, onCreateCustomer, onExisting, onNew }) => {
  const { settings } = useAppContext();
  const issuers = issuersOf(settings);
  const [issuerId, setIssuerId] = useState(MAIN_ISSUER_ID);
  const [customerId, setCustomerId] = useState('');
  const [dealId, setDealId] = useState(''); // an opportunity of that customer, or '' for a new one
  const [title, setTitle] = useState('');
  const [q, setQ] = useState('');

  const open = (d: Deal) => !['WON', 'LOST'].includes(d.stage);
  const dealsOf = useMemo(() => {
    const by = new Map<string, Deal[]>();
    for (const d of deals) (by.get(d.customerId) || by.set(d.customerId, []).get(d.customerId)!).push(d);
    for (const l of by.values()) l.sort((x, y) => Number(open(y)) - Number(open(x)) || y.updatedAt.localeCompare(x.updatedAt));
    return by;
  }, [deals]);
  const lines = useMemo(() => new Map(customers.map((c) => [c.id, fold([c.name, c.company || '', c.nationalId || '', ...(c.phones || [])].join(' '))])), [customers]);
  const list = useMemo(() => customers.filter((c) => matchesQuery(lines.get(c.id), q)).slice(0, 60), [customers, lines, q]);

  const customer = customers.find((c) => c.id === customerId);
  const mine = customerId ? dealsOf.get(customerId) || [] : [];
  const chosen = mine.find((d) => d.id === dealId);
  const ready = !!customerId && (dealId ? !!chosen : !!title.trim());
  const pickCustomer = (id: string) => {
    setCustomerId(id);
    // the newest open opportunity is the likely one; a customer without any gets a new opportunity
    const first = (dealsOf.get(id) || []).find(open);
    setDealId(first ? first.id : '');
    setTitle('');
  };
  const go = () => {
    if (!ready) return;
    if (chosen) onExisting(chosen, issuerId);
    else onNew({ title: title.trim(), customerId }, issuerId);
  };

  return (
    <Modal
      title="صدور پیش‌فاکتور"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">
            انصراف
          </button>
          <button type="button" disabled={!ready} onClick={go} className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer">
            <FilePlus2 className="w-4 h-4" />
            ادامه و ساخت پیش‌فاکتور
          </button>
        </>
      }
    >
      {issuers.length > 1 && (
        <div>
          <div className={label}>پیش‌فاکتور با نام کدام شرکت صادر شود؟</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {issuers.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => setIssuerId(i.id)}
                className={`text-right rounded-2xl border px-3.5 py-3 cursor-pointer transition-colors ${issuerId === i.id ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-200' : 'border-[#EBDBCE] bg-white hover:bg-[#FAF5F1]'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-xs text-[#3A241F] truncate">{i.label}</span>
                  {issuerId === i.id && <CheckCircle2 className="w-4 h-4 text-violet-600 shrink-0" />}
                </div>
                <div className="text-[10px] font-bold text-[#8C6F66] mt-0.5">{i.kind === 'OFFICIAL' ? 'رسمی (با شناسه‌های مالیاتی)' : 'غیررسمی'}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className={`${label} flex items-center justify-between gap-2`}>
          <span className="flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-violet-600" />
            مشتری *
          </span>
          <button type="button" onClick={() => onCreateCustomer((c) => pickCustomer(c.id))} className="text-[11px] font-black text-violet-700 hover:underline cursor-pointer" data-new-customer>
            + مشتری جدید (اگر در فهرست نیست)
          </button>
        </div>
        <div className="space-y-2">
          <input className={field} placeholder="نام مشتری، شرکت یا شماره…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus data-customer-search />
          <div className="max-h-56 overflow-y-auto rounded-2xl border border-[#EBDBCE] divide-y divide-[#EBDBCE]/60" data-customer-list>
            {list.length === 0 && <div className="p-4 text-center text-[11px] font-bold text-gray-400">مشتری‌ای پیدا نشد. «مشتری جدید» را بزنید.</div>}
            {list.map((c) => {
              const n = (dealsOf.get(c.id) || []).length;
              return (
                <button key={c.id} type="button" onClick={() => pickCustomer(c.id)} className={`w-full text-right px-3.5 py-2.5 cursor-pointer ${customerId === c.id ? 'bg-violet-50' : 'bg-white hover:bg-[#FAF5F1]'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-xs text-[#3A241F] truncate">{c.name}</span>
                    {customerId === c.id && <CheckCircle2 className="w-4 h-4 text-violet-600 shrink-0" />}
                  </div>
                  <div className="text-[11px] font-bold text-[#8C6F66] truncate">
                    {[c.company && c.company !== c.name ? c.company : '', (c.phones || [])[0] ? toPersianDigits((c.phones || [])[0]) : '', n ? `${toPersianDigits(n)} فرصت` : 'بدون فرصت'].filter(Boolean).join(' · ')}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {customer && (
        <div data-deal-choice>
          <div className={label}>پیش‌فاکتور به کدام فرصت فروش {customer.name} وصل شود؟</div>
          <div className="rounded-2xl border border-[#EBDBCE] divide-y divide-[#EBDBCE]/60 overflow-hidden">
            {mine.map((d) => (
              <button key={d.id} type="button" onClick={() => setDealId(d.id)} className={`w-full text-right px-3.5 py-2.5 cursor-pointer ${dealId === d.id ? 'bg-violet-50' : 'bg-white hover:bg-[#FAF5F1]'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black text-xs text-[#3A241F] truncate">{d.title}</span>
                  {d.proformaNumber && <span className="text-[10px] font-black text-violet-700 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5 shrink-0">پیش‌فاکتور دارد</span>}
                </div>
                <div className="text-[11px] font-bold text-[#8C6F66] truncate">
                  {STAGE_TEXT[d.stage] || d.stage}
                  {d.amount ? ` · ${formatMoney(d.amount)} ${unitName()}` : ''}
                </div>
              </button>
            ))}
            <button type="button" onClick={() => setDealId('')} className={`w-full text-right px-3.5 py-2.5 cursor-pointer ${!dealId ? 'bg-violet-50' : 'bg-white hover:bg-[#FAF5F1]'}`} data-deal-new>
              <span className="font-black text-xs text-violet-700">+ فرصت فروش جدید برای این مشتری</span>
            </button>
          </div>
          {!dealId && (
            <div className="mt-3">
              <label className={label}>عنوان فرصت جدید *</label>
              <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: تامین تجهیزات شبکه" data-deal-title />
              <p className="text-[11px] text-[#8C6F66] font-medium leading-6 mt-1.5">یک فرصت فروش با همین عنوان ساخته می‌شود و پیش‌فاکتور به آن وصل می‌شود.</p>
            </div>
          )}
          {chosen?.proformaNumber && (
            <p className="mt-2 text-[11px] font-bold text-amber-700">
              این فرصت از قبل پیش‌فاکتور {toPersianDigits(chosen.proformaNumber)} را دارد؛ ادامه، همان را برای ویرایش باز می‌کند (صادرکنندهٔ آن عوض نمی‌شود).
            </p>
          )}
        </div>
      )}
    </Modal>
  );
};
