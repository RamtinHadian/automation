import React, { useState } from 'react';
import { Image, Printer, Receipt } from 'lucide-react';
import { Customer, Deal } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';
import { formatMoney, unitName } from '../../lib/money';
import { issuerOf } from '../../lib/proformaIssuer';
import { downloadBlob, renderProformaJpeg } from '../../lib/proformaFile';
import { askConfirm } from '../../lib/confirmDialog';
import { canIssueInvoice, draftInvoice, hasInvoice, invoiceBlocker, invoiceRenderInput, invoiceTitle, openInvoicePdf } from '../../lib/invoice';

/** «فاکتور»: turns the approved proforma into Hoormand's own sales invoice (official or unofficial, as its issuing company is), prints it, and can cancel it. */
export const InvoiceBlock: React.FC<{ deal: Deal; customer?: Customer }> = ({ deal: shown, customer }) => {
  const { settings, currentUser, deals, setDeals, showToast } = useAppContext();
  // the window may hold an older copy of the opportunity: the invoice is always read from the live one
  const deal: Deal = { ...shown, invoice: deals.find((x) => x.id === shown.id)?.invoice ?? shown.invoice };
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const inv = deal.invoice;
  const allowed = canIssueInvoice(currentUser);
  const issuer = issuerOf(deal, settings);
  const kindWord = issuer.kind === 'OFFICIAL' ? 'رسمی' : 'غیررسمی';

  if (!hasInvoice(deal) || !inv) {
    const blocker = invoiceBlocker(deal, settings, customer);
    return (
      <section className="rounded-2xl border border-dashed border-emerald-300 bg-emerald-50/40 p-4 space-y-2.5" data-invoice-block>
        <div className="flex items-center gap-2 font-black text-xs text-[#3A241F]">
          <Receipt className="w-4 h-4 text-emerald-700" />
          فاکتور فروش ({kindWord})
        </div>
        <p className="text-[11px] leading-6 text-[#8C6F66] font-medium">
          فاکتور از روی همین پیش‌فاکتور صادر می‌شود؛ یک نسخهٔ ثابت با شمارهٔ خودش که بعد از صدور تغییر نمی‌کند (فقط می‌شود آن را باطل کرد).
          {issuer.kind === 'OFFICIAL' ? ' فاکتور رسمی با همهٔ مشخصات هویتی فروشنده و خریدار چاپ می‌شود.' : ' فاکتور غیررسمی با نام کسب‌وکار غیررسمی چاپ می‌شود.'}
        </p>
        {blocker && <p className="text-[11px] font-bold text-amber-800 leading-6">{blocker}</p>}
        {!allowed && <p className="text-[11px] font-bold text-rose-700">صدور فاکتور به شما اجازه داده نشده است.</p>}
        <button
          type="button"
          disabled={!!blocker || !allowed || busy}
          onClick={async () => {
            const draft = draftInvoice(deal, deals, settings, currentUser);
            const ok = await askConfirm(`از روی پیش‌فاکتور ${toPersianDigits(deal.proformaNumber || '')}، «${invoiceTitle(draft.kind)}» با شمارهٔ ${toPersianDigits(draft.number)} صادر شود؟ بعد از صدور قابل ویرایش نیست.`, { tone: 'info', title: 'صدور فاکتور', confirmText: 'بله، صادر شود' });
            if (!ok) return;
            setBusy(true);
            try {
              setDeals((prev) => prev.map((x) => (x.id === deal.id ? { ...x, invoice: draft } : x)));
              showToast(`فاکتور ${toPersianDigits(draft.number)} صادر شد.`);
            } finally {
              setBusy(false);
            }
          }}
          className="px-3.5 py-2 rounded-xl text-[11px] font-black bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer"
          data-invoice-issue
        >
          تبدیل به فاکتور {kindWord}
        </button>
      </section>
    );
  }

  const cancelled = inv.status === 'cancelled';
  const payable = inv.amount ?? deal.amount;
  const small = 'text-[10px] font-bold text-[#8C6F66]';
  return (
    <section className={`rounded-2xl border p-4 space-y-3 ${cancelled ? 'border-rose-200 bg-rose-50/40' : 'border-emerald-200 bg-white'}`} data-invoice-block>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 font-black text-xs text-[#3A241F]">
          <Receipt className="w-4 h-4 text-emerald-700" />
          {invoiceTitle(inv.kind)} {toPersianDigits(inv.number)}
          <span className={`text-[10px] font-black rounded-full px-2 py-0.5 border ${inv.kind === 'OFFICIAL' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{inv.kind === 'OFFICIAL' ? 'رسمی' : 'غیررسمی'}</span>
        </div>
        <span className={`text-[11px] font-black ${cancelled ? 'text-rose-700' : 'text-emerald-700'}`}>{cancelled ? 'باطل شده' : 'صادر شده'}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
        <div><div className={small}>تاریخ صدور</div><b>{formatTaskDate(inv.issuedAt.slice(0, 10))}</b></div>
        <div><div className={small}>صادرکننده</div><b>{inv.issuedByName || '—'}</b></div>
        <div><div className={small}>از پیش‌فاکتور</div><b>{toPersianDigits(inv.proformaNumber || '—')}</b></div>
        <div><div className={small}>مبلغ</div><b>{payable ? `${formatMoney(payable)} ${unitName()}` : '—'}</b></div>
      </div>
      {cancelled && <p className="text-[11px] font-bold text-rose-800 leading-6">ابطال: {inv.cancelReason}{inv.cancelledByName ? ` (${inv.cancelledByName})` : ''}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => openInvoicePdf(deal, customer, settings, currentUser.fullName)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-50 cursor-pointer" data-invoice-print>
          <Printer className="w-3.5 h-3.5" />
          چاپ / PDF
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              downloadBlob(await renderProformaJpeg(invoiceRenderInput(deal, customer, settings, currentUser.fullName)), `${inv.number}.jpg`);
            } catch (e) {
              showToast(e instanceof Error ? e.message : 'ساخت JPG ممکن نشد.');
            } finally {
              setBusy(false);
            }
          }}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black bg-white border border-sky-200 text-sky-800 hover:bg-sky-50 disabled:opacity-50 cursor-pointer"
        >
          <Image className="w-3.5 h-3.5" />
          دریافت JPG
        </button>
        {!cancelled && allowed && !cancelling && (
          <button type="button" onClick={() => setCancelling(true)} className="px-3.5 py-2 rounded-xl text-[11px] font-black bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 cursor-pointer" data-invoice-cancel>
            ابطال فاکتور
          </button>
        )}
      </div>
      {cancelling && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 space-y-2">
          <label className="block text-[11px] font-black text-rose-800">دلیل ابطال (لازم است)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-rose-200 bg-white text-xs font-bold" placeholder="مثلاً: اشتباه در مبلغ، سفارش لغو شد" />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!reason.trim()}
              onClick={async () => {
                const ok = await askConfirm(`فاکتور ${toPersianDigits(inv.number)} باطل شود؟ شمارهٔ آن می‌ماند و دوباره استفاده نمی‌شود.`, { tone: 'danger', title: 'ابطال فاکتور', confirmText: 'بله، باطل شود' });
                if (!ok) return;
                const why = reason.trim();
                setDeals((prev) => prev.map((x) => (x.id === deal.id && x.invoice ? { ...x, invoice: { ...x.invoice, status: 'cancelled', cancelReason: why, cancelledAt: new Date().toISOString(), cancelledByName: currentUser.fullName } } : x)));
                showToast('فاکتور باطل شد.');
                setCancelling(false);
              }}
              className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-rose-700 text-white disabled:opacity-50 cursor-pointer"
            >
              تأیید ابطال
            </button>
            <button type="button" onClick={() => setCancelling(false)} className="px-3 py-1.5 rounded-xl text-[11px] font-black bg-white border border-[#EBDBCE] cursor-pointer">انصراف</button>
          </div>
        </div>
      )}
    </section>
  );
};
