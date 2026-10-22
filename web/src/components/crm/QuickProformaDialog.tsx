import React, { useMemo, useState } from 'react';
import { CheckCircle2, FilePlus2, Link2 } from 'lucide-react';
import { Customer, Deal } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { issuersOf, MAIN_ISSUER_ID } from '../../lib/proformaIssuer';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, unitName } from '../../lib/money';
import { formatTaskDate } from '../../lib/taskDates';
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
  const [dealId, setDealId] = useState(''); // '' = not chosen yet, 'new' = a new opportunity, else the id of one of that customer's opportunities
  const [showClosed, setShowClosed] = useState(false);
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
  const openOnes = mine.filter(open);
  const closedOnes = mine.filter((d) => !open(d));
  const chosen = mine.find((d) => d.id === dealId);
  const ready = !!customerId && (dealId === 'new' ? !!title.trim() : !!chosen);
  const pickCustomer = (id: string) => {
    setCustomerId(id);
    // a customer with an open opportunity is asked which it is (nothing is chosen for them); one without any gets a new opportunity
    setDealId((dealsOf.get(id) || []).some(open) ? '' : 'new');
    setShowClosed(false);
    setTitle('');
  };
  const go = () => {
    if (!ready) return;
    if (dealId === 'new') onNew({ title: title.trim(), customerId }, issuerId);
    else if (chosen) onExisting(chosen, issuerId);
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
        <div data-deal-choice className="space-y-3">
          {openOnes.length > 0 ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-3.5 space-y-3" data-open-deal-question>
              <div className="text-xs font-black text-[#3A241F] leading-6">
                {customer.name} {openOnes.length === 1 ? 'یک فرصت فروش باز دارد' : `${toPersianDigits(openOnes.length)} فرصت فروش باز دارد`}.
                <br />
                این پیش‌فاکتور را به {openOnes.length === 1 ? 'همین فرصت' : 'یکی از این فرصت‌ها'} وصل کنم، یا پیش‌فاکتور جدیدی است؟
              </div>
              {openOnes.map((d) => (
                <div key={d.id} className={`rounded-xl border bg-white p-3 space-y-2 ${dealId === d.id ? 'border-violet-500 ring-2 ring-violet-200' : 'border-[#EBDBCE]'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-black text-xs text-[#3A241F] leading-6">{d.title}</div>
                    <span className="shrink-0 text-[10px] font-black text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">{STAGE_TEXT[d.stage] || d.stage}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-bold text-[#6B514A]">
                    {d.amount ? <div>مبلغ: <b className="text-[#3A241F]">{formatMoney(d.amount)} {unitName()}</b></div> : null}
                    {d.ownerName ? <div>مسئول: <b className="text-[#3A241F]">{d.ownerName}</b></div> : null}
                    {d.createdAt ? <div>ساخته شده: <b className="text-[#3A241F]">{formatTaskDate(d.createdAt.slice(0, 10))}</b></div> : null}
                    {d.updatedAt ? <div>آخرین تغییر: <b className="text-[#3A241F]">{formatTaskDate(d.updatedAt.slice(0, 10))}</b></div> : null}
                    {d.expectedClose ? <div>پیش‌بینی بسته‌شدن: <b className="text-[#3A241F]">{formatTaskDate(d.expectedClose)}</b></div> : null}
                    {d.items?.length ? <div>اقلام: <b className="text-[#3A241F]">{toPersianDigits(d.items.length)} ردیف</b></div> : null}
                  </div>
                  {d.notes?.trim() && <div className="text-[11px] font-medium text-[#6B514A] leading-6 bg-[#FAF5F1] rounded-lg px-2.5 py-1.5">{d.notes.trim()}</div>}
                  {d.proformaNumber && (
                    <div className="text-[11px] font-bold text-violet-700">پیش‌فاکتور {toPersianDigits(d.proformaNumber)} از قبل دارد؛ اتصال، همان را برای ویرایش باز می‌کند (صادرکنندهٔ آن عوض نمی‌شود).</div>
                  )}
                  <button type="button" onClick={() => setDealId(d.id)} className={`w-full py-2 rounded-xl text-xs font-black cursor-pointer border ${dealId === d.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-700 border-violet-300 hover:bg-violet-50'}`} data-link-deal>
                    {dealId === d.id ? '✓ به این فرصت وصل می‌شود' : 'اتصال به این فرصت'}
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setDealId('new')} className={`w-full py-2.5 rounded-xl text-xs font-black cursor-pointer border ${dealId === 'new' ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-[#3A241F] border-[#EBDBCE] hover:bg-violet-50'}`} data-deal-new>
                {dealId === 'new' ? '✓ پیش‌فاکتور جدید (با فرصت فروش تازه)' : 'نه، این یک پیش‌فاکتور جدید است'}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3 text-[11px] font-bold text-[#6B514A] leading-6" data-no-open-deal>
              {customer.name} فرصت فروش بازی ندارد؛ برای این پیش‌فاکتور یک فرصت جدید ساخته می‌شود.
              {closedOnes.length > 0 && (
                <>
                  {' '}
                  <button type="button" onClick={() => setShowClosed((v) => !v)} className="text-violet-700 underline cursor-pointer">
                    {showClosed ? 'پنهان‌کردن' : `دیدن ${toPersianDigits(closedOnes.length)} فرصت بسته‌شده`}
                  </button>
                </>
              )}
            </div>
          )}

          {(openOnes.length === 0 && showClosed ? closedOnes : []).map((d) => (
            <button key={d.id} type="button" onClick={() => setDealId(d.id)} className={`w-full text-right px-3.5 py-2.5 rounded-xl border cursor-pointer ${dealId === d.id ? 'border-violet-500 bg-violet-50' : 'border-[#EBDBCE] bg-white hover:bg-[#FAF5F1]'}`}>
              <div className="font-black text-xs text-[#3A241F] truncate">{d.title}</div>
              <div className="text-[11px] font-bold text-[#8C6F66] truncate">{STAGE_TEXT[d.stage] || d.stage}{d.amount ? ` · ${formatMoney(d.amount)} ${unitName()}` : ''}</div>
            </button>
          ))}

          {dealId === 'new' && (
            <div>
              <label className={label}>عنوان فرصت جدید *</label>
              <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: تامین تجهیزات شبکه" data-deal-title />
              <p className="text-[11px] text-[#8C6F66] font-medium leading-6 mt-1.5">یک فرصت فروش با همین عنوان ساخته می‌شود و پیش‌فاکتور به آن وصل می‌شود.</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
