import React from 'react';
import { CheckCircle2, Clock, FileText, Printer, XCircle } from 'lucide-react';
import { Customer, Deal } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';
import { formatMoney, unitName } from '../../lib/money';
import { issuerOf, issuersOf } from '../../lib/proformaIssuer';
import { approvalRequired, proformaReleased } from '../../lib/proformaApproval';
import { openProformaPdf, proformaTotals } from '../../lib/proformaPdf';

/**
 * «پیش‌فاکتور» block of a sales opportunity: issue one (with the right company when there are several), see its number,
 * company, amount, validity and approval status at a glance, and open it, print it or send it from here.
 */
export const ProformaSection: React.FC<{
  deal: Deal;
  customer?: Customer;
  /** the opportunity is complete enough (title and customer) */
  ready: boolean;
  /** open the proforma window; with a company id when the person chose one */
  onOpen: (issuerId?: string) => void;
}> = ({ deal, customer, ready, onOpen }) => {
  const { settings, currentUser } = useAppContext();
  const issuers = issuersOf(settings);
  const has = !!deal.proformaNumber && !!deal.items?.length;
  const required = approvalRequired(settings);
  const released = proformaReleased(deal, settings);
  const status = deal.proformaApproval?.status;

  if (!has) {
    return (
      <section className="rounded-2xl border border-dashed border-violet-300 bg-violet-50/40 p-4 space-y-3">
        <div className="flex items-center gap-2 font-black text-xs text-[#3A241F]">
          <FileText className="w-4 h-4 text-violet-600" />
          پیش‌فاکتور
        </div>
        <p className="text-[11px] leading-6 text-[#8C6F66] font-medium">
          برای این فرصت هنوز پیش‌فاکتوری صادر نشده است.
          {issuers.length > 1 ? ' شرکتی را که پیش‌فاکتور با نام او صادر می‌شود انتخاب کنید.' : ''}
          {!ready ? ' اول عنوان فرصت و مشتری را وارد کنید.' : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          {issuers.length > 1 ? (
            issuers.map((i) => (
              <button
                key={i.id}
                type="button"
                disabled={!ready}
                onClick={() => onOpen(i.id)}
                className="px-3.5 py-2 rounded-xl text-[11px] font-black bg-white border border-violet-200 text-violet-800 hover:bg-violet-50 disabled:opacity-50 cursor-pointer"
              >
                صدور با «{i.label}» · {i.kind === 'OFFICIAL' ? 'رسمی' : 'غیررسمی'}
              </button>
            ))
          ) : (
            <button type="button" disabled={!ready} onClick={() => onOpen()} className="px-4 py-2 rounded-xl text-[11px] font-black bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 cursor-pointer">
              صدور پیش‌فاکتور
            </button>
          )}
        </div>
      </section>
    );
  }

  const issuer = issuerOf(deal, settings);
  const totals = proformaTotals(deal.items || [], deal.discountPercent || 0, deal.taxPercent ?? 0);
  const row = (k: string, v: React.ReactNode) => (
    <div className="min-w-0">
      <div className="text-[10px] font-black text-[#8C6F66]">{k}</div>
      <div className="text-xs font-black text-[#3A241F] truncate">{v}</div>
    </div>
  );
  return (
    <section className="rounded-2xl border border-violet-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 font-black text-xs text-[#3A241F]">
          <FileText className="w-4 h-4 text-violet-600" />
          پیش‌فاکتور {toPersianDigits(deal.proformaNumber || '')}
          <span className={`text-[10px] font-black rounded-full px-2 py-0.5 border ${issuer.kind === 'OFFICIAL' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
            {issuer.kind === 'OFFICIAL' ? 'رسمی' : 'غیررسمی'}
          </span>
        </div>
        {required &&
          (status === 'APPROVED' ? (
            <span className="flex items-center gap-1 text-[11px] font-black text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              تایید مدیرعامل
            </span>
          ) : status === 'REJECTED' ? (
            <span className="flex items-center gap-1 text-[11px] font-black text-rose-700">
              <XCircle className="w-3.5 h-3.5" />
              رد شد
            </span>
          ) : status === 'PENDING' ? (
            <span className="flex items-center gap-1 text-[11px] font-black text-amber-700">
              <Clock className="w-3.5 h-3.5" />
              منتظر تایید مدیرعامل
            </span>
          ) : (
            <span className="text-[11px] font-black text-[#8C6F66]">هنوز برای تایید فرستاده نشده</span>
          ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {row('صادرکننده', issuer.label)}
        {row('مبلغ قابل پرداخت', `${formatMoney(totals.payable)} ${unitName()}`)}
        {row('تاریخ صدور', deal.proformaAt ? formatTaskDate(deal.proformaAt) : '—')}
        {row('اعتبار تا', deal.validUntil ? formatTaskDate(deal.validUntil) : '—')}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onOpen(deal.proformaIssuerId)} className="px-3.5 py-2 rounded-xl text-[11px] font-black bg-violet-600 text-white hover:bg-violet-700 cursor-pointer">
          باز کردن / ویرایش
        </button>
        <button
          type="button"
          disabled={!released}
          title={released ? 'چاپ یا ذخیرهٔ PDF' : 'پس از تایید مدیرعامل'}
          onClick={() => openProformaPdf(deal, customer, settings, currentUser.fullName)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black bg-white border border-violet-200 text-violet-800 hover:bg-violet-50 disabled:opacity-50 cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5" />
          چاپ / PDF
        </button>
        {issuers.length > 1 && (
          <span className="text-[10px] text-[#8C6F66] self-center">برای پیش‌فاکتور دیگر با شرکت دیگر، یک فرصت جدید بسازید یا در پنجرهٔ پیش‌فاکتور صادرکننده را عوض کنید.</span>
        )}
      </div>
    </section>
  );
};
