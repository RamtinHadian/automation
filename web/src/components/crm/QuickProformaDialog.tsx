import React, { useMemo, useState } from 'react';
import { CheckCircle2, FilePlus2, Link2 } from 'lucide-react';
import { Customer, Deal } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { issuersOf, MAIN_ISSUER_ID } from '../../lib/proformaIssuer';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, unitName } from '../../lib/money';
import { Modal, field, label } from './crmUi';

const STAGE_TEXT: Record<string, string> = { NEW: 'جدید', CONTACTED: 'تماس گرفته شد', PROPOSAL: 'پیشنهاد ارسال شد', NEGOTIATION: 'مذاکره', WON: 'فروش موفق', LOST: 'از دست رفت' };

/**
 * «صدور پیش‌فاکتور»: pick the company that issues it and the sales opportunity it belongs to (an existing one, or a new one
 * made right here). A proforma never exists without an opportunity.
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
  const [mode, setMode] = useState<'existing' | 'new'>(deals.length ? 'existing' : 'new');
  const [dealId, setDealId] = useState('');
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...deals]
      .filter((d) => !s || `${d.title} ${d.customerName} ${d.productCode || ''}`.toLowerCase().includes(s))
      .sort((a, b) => Number(['WON', 'LOST'].includes(a.stage)) - Number(['WON', 'LOST'].includes(b.stage)) || b.updatedAt.localeCompare(a.updatedAt));
  }, [deals, q]);

  const chosen = deals.find((d) => d.id === dealId);
  const ready = mode === 'existing' ? !!chosen : !!title.trim() && !!customerId;
  const go = () => {
    if (!ready) return;
    if (mode === 'existing' && chosen) onExisting(chosen, issuerId);
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
        <div className={`${label} flex items-center gap-1.5`}>
          <Link2 className="w-3.5 h-3.5 text-violet-600" />
          فرصت فروش مربوط به این پیش‌فاکتور *
        </div>
        <div className="flex gap-2 mb-3">
          {([['existing', 'یکی از فرصت‌های موجود'], ['new', 'فرصت جدید']] as const).map(([k, text]) => (
            <button
              key={k}
              type="button"
              disabled={k === 'existing' && deals.length === 0}
              onClick={() => setMode(k)}
              className={`flex-1 py-2 rounded-xl text-xs font-black border cursor-pointer disabled:opacity-40 ${mode === k ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-[#3A241F] border-[#EBDBCE] hover:bg-violet-50'}`}
            >
              {text}
            </button>
          ))}
        </div>

        {mode === 'existing' ? (
          <div className="space-y-2">
            <input className={field} placeholder="جستجو در عنوان فرصت یا نام مشتری..." value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-64 overflow-y-auto rounded-2xl border border-[#EBDBCE] divide-y divide-[#EBDBCE]/60">
              {list.length === 0 && <div className="p-4 text-center text-[11px] font-bold text-gray-400">فرصتی پیدا نشد.</div>}
              {list.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDealId(d.id)}
                  className={`w-full text-right px-3.5 py-2.5 cursor-pointer ${dealId === d.id ? 'bg-violet-50' : 'bg-white hover:bg-[#FAF5F1]'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-xs text-[#3A241F] truncate">{d.title}</span>
                    {d.proformaNumber && <span className="text-[10px] font-black text-violet-700 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5 shrink-0">پیش‌فاکتور دارد</span>}
                  </div>
                  <div className="text-[11px] font-bold text-[#8C6F66] truncate">
                    {d.customerName} · {STAGE_TEXT[d.stage] || d.stage}
                    {d.amount ? ` · ${formatMoney(d.amount)} ${unitName()}` : ''}
                  </div>
                </button>
              ))}
            </div>
            {chosen?.proformaNumber && (
              <p className="text-[11px] font-bold text-amber-700">
                این فرصت از قبل پیش‌فاکتور {toPersianDigits(chosen.proformaNumber)} را دارد؛ ادامه، همان را برای ویرایش باز می‌کند (صادرکنندهٔ آن عوض نمی‌شود).
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className={label}>عنوان فرصت *</label>
              <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: تامین تجهیزات شبکه" autoFocus />
            </div>
            <div className="sm:col-span-2">
              <label className={`${label} flex items-center justify-between`}>
                <span>مشتری *</span>
                <button type="button" onClick={() => onCreateCustomer((c) => setCustomerId(c.id))} className="text-[11px] font-black text-violet-700 hover:underline cursor-pointer">
                  + مشتری جدید (اگر در فهرست نیست)
                </button>
              </label>
              <select className={field} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">انتخاب مشتری...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.company && c.company !== c.name ? ` — ${c.company}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <p className="sm:col-span-2 text-[11px] text-[#8C6F66] font-medium leading-6">یک فرصت فروش با همین عنوان ساخته می‌شود و پیش‌فاکتور به آن وصل می‌شود.</p>
          </div>
        )}
      </div>
    </Modal>
  );
};
