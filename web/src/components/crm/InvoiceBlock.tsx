import { directPrintOn, downloadDirectPrintInstaller } from '../../lib/directPrint';
import { openInvoiceThermal, rememberedThermalMm, rememberedThermalSize, THERMAL_SIZES, ThermalSize } from '../../lib/invoiceThermal';
import React, { useEffect, useState } from 'react';
import { Image, Printer, Receipt } from 'lucide-react';
import { Customer, Deal } from '../../types';
import { api } from '../../lib/api';
import { useSepidarConnected } from '../../lib/sepidarCustomerFields';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';
import { formatMoney, unitName } from '../../lib/money';
import { issuerOf } from '../../lib/proformaIssuer';
import { downloadBlob, renderProformaJpeg } from '../../lib/proformaFile';
import { askConfirm } from '../../lib/confirmDialog';
import { InvoiceSepidarFields, InvoiceExtra, emptyInvoiceExtra } from './InvoiceSepidarFields';
import { canIssueInvoice, hasInvoice, invoiceBlocker, invoiceRenderInput, invoiceTitle, openInvoicePdf } from '../../lib/invoice';

/** The invoice made in Hoormand → Sepidar: a button when Sepidar is connected and the person may issue invoices there, and what happened to the last try. */
const SepidarSend: React.FC<{ deal: Deal }> = ({ deal }) => {
  const connected = useSepidarConnected();
  const { showToast } = useAppContext();
  const [st, setSt] = useState<{ perms: string[]; links: { kind: string; ref: string; number?: number }[]; jobs: { id: string; kind: string; status: string; data: Record<string, unknown>; result?: { message?: string }; createdAt?: string }[] } | null>(null);
  const inv = deal.invoice;
  const load = React.useCallback(() => { api.sepidar().then((r) => setSt(r as never)).catch(() => setSt(null)); }, []);
  useEffect(() => {
    if (!connected) return undefined;
    load();
    const t = window.setInterval(load, 8000); // the answer of the accounting computer arrives by itself
    return () => window.clearInterval(t);
  }, [connected, load]);
  if (!connected || !st || !inv || inv.status === 'cancelled') return null;
  const isPending = inv.status === 'pending';
  const mine = st.jobs.filter((j) => j.kind === 'invoice.fromHoormand' && j.data.dealId === deal.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const waiting = mine.some((j) => j.status === 'pending' || j.status === 'running');
  const failed = !waiting && mine[0]?.status === 'failed' ? mine[0] : undefined;
  const link = st.links.find((l) => l.kind === 'invoice' && l.ref === deal.id);
  const can = st.perms.includes('invoice');
  const send = async () => {
    const ok = await askConfirm(`فاکتور ${toPersianDigits(inv.number)} به سپیدار فرستاده شود؟ ردیف‌های همین فاکتور مستقیم در «فاکتور فروش» سپیدار ثبت می‌شود، سپیدار شمارهٔ خودش را می‌دهد و موجودی کالا را کم می‌کند. بعد از آن دوباره فرستاده نمی‌شود، و اگر در هورمند باطل شود در سپیدار می‌ماند تا از داخل سپیدار پاک شود.`, { tone: 'info', title: 'ارسال فاکتور به سپیدار', confirmText: 'بله، فرستاده شود' });
    if (!ok) return;
    try {
      await api.sepidarJob({ kind: 'invoice.fromHoormand', dealId: deal.id });
      showToast('فاکتور برای سپیدار در صف قرار گرفت.');
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ارسال نشد.');
    }
  };
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/50 px-3 py-2.5 space-y-1.5" data-invoice-sepidar>
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-black text-sky-900">
        <span>سپیدار:</span>
        {inv.sepidar || (link && !isPending) ? (
          <span className="text-emerald-700" data-invoice-sepidar-done>صادر شد · شمارهٔ فاکتور سپیدار {toPersianDigits(String(inv.sepidar?.number ?? link?.number ?? '—'))}</span>
        ) : waiting || isPending ? (
          <span className="text-amber-700">در صف سپیدار است… (برنامهٔ حسابداری آن را برمی‌دارد و شمارهٔ فاکتور سپیدار را برمی‌گرداند)</span>
        ) : can ? (
          <button type="button" onClick={() => void send()} className="px-3 py-1 rounded-lg bg-sky-700 text-white text-[11px] font-black cursor-pointer" data-invoice-sepidar-send>ارسال به سپیدار</button>
        ) : (
          <span className="font-bold text-[#8C6F66]">برای فرستادن، اجازهٔ «صدور فاکتور» در بخش سپیدار لازم است.</span>
        )}
      </div>
      {failed && <div className="text-[11px] font-bold leading-6 text-rose-800" data-invoice-sepidar-failed>ارسال به سپیدار انجام نشد: {failed.result?.message || 'دلیلش نوشته نشده است.'}</div>}
    </div>
  );
};

/** «فاکتور»: turns the approved proforma into Hoormand's own sales invoice (official or unofficial, as its issuing company is), prints it, and can cancel it. */
export const InvoiceBlock: React.FC<{ deal: Deal; customer?: Customer; onChanged?: () => void }> = ({ deal: shown, customer, onChanged }) => {
  const { settings, currentUser, deals, setDeals, showToast, reloadState } = useAppContext();
  // the window may hold an older copy of the opportunity: the invoice is always read from the live one
  const deal: Deal = { ...shown, invoice: deals.find((x) => x.id === shown.id)?.invoice ?? shown.invoice };
  const [busy, setBusy] = useState(false);
  const [paidTick, setPaidTick] = useState(false);
  const [thermal, setThermal] = useState<ThermalSize>(rememberedThermalSize);
  const [thermalMm, setThermalMm] = useState<number>(rememberedThermalMm);
  const [extra, setExtra] = useState<InvoiceExtra>(emptyInvoiceExtra);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const inv = deal.invoice;
  const [info, setInfo] = useState<Awaited<ReturnType<typeof api.invoiceNumberingInfo>> | null>(null);
  useEffect(() => { api.invoiceNumberingInfo().then(setInfo).catch(() => setInfo(null)); }, [deal.id, deal.invoice?.status]);
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
          فاکتور از روی همین پیش‌فاکتور صادر می‌شود؛ یک نسخهٔ ثابت با شمارهٔ خودش که بعد از صدور تغییر نمی‌کند (فقط می‌شود آن را باطل کرد).{info?.[issuer.kind === 'OFFICIAL' ? 'OFFICIAL' : 'UNOFFICIAL']?.mode === 'sepidar' ? ' شمارهٔ فاکتور را سپیدار می‌دهد و همان شماره در هورمند هم می‌نشیند.' : info?.[issuer.kind === 'OFFICIAL' ? 'OFFICIAL' : 'UNOFFICIAL']?.mode === 'counter' ? ' شمارهٔ فاکتور ادامهٔ شمارهٔ سپیدار است و خودکار به سپیدار هم می‌رود.' : ''}
          {issuer.kind === 'OFFICIAL' ? ' فاکتور رسمی با همهٔ مشخصات هویتی فروشنده و خریدار چاپ می‌شود.' : ' فاکتور غیررسمی با نام کسب‌وکار غیررسمی چاپ می‌شود.'}
        </p>
        {blocker && <p className="text-[11px] font-bold text-amber-800 leading-6">{blocker}</p>}
        {!allowed && <p className="text-[11px] font-bold text-rose-700">صدور فاکتور به شما اجازه داده نشده است.</p>}
        <InvoiceSepidarFields value={extra} onChange={setExtra} />
        <label className="flex items-center gap-2 text-[11px] font-black text-[#3A241F] cursor-pointer" data-paid-tick><input type="checkbox" className="w-4 h-4 accent-emerald-700" checked={paidTick} onChange={(e) => setPaidTick(e.target.checked)} />این فاکتور پرداخت شده است (فروش نقدی)؛ بدون این تیک تا پرداخت‌شدن در سپیدار «تسویه‌نشده» می‌ماند</label>
        <button
          type="button"
          disabled={!!blocker || !allowed || busy}
          onClick={async () => {
            const kind = issuer.kind === 'OFFICIAL' ? 'OFFICIAL' : 'UNOFFICIAL';
            const mi = info?.[kind];
            const how =
              mi?.mode === 'sepidar'
                ? 'شمارهٔ فاکتور را سپیدار می‌دهد: فاکتور اول در سپیدار صادر می‌شود و همان شماره شمارهٔ فاکتور هورمند هم می‌شود (تا آن موقع «در انتظار سپیدار» است).'
                : mi?.mode === 'counter'
                  ? `شمارهٔ فاکتور ${toPersianDigits(mi.next)} می‌شود (ادامهٔ شمارهٔ سپیدار) و فاکتور خودکار به سپیدار هم فرستاده می‌شود.`
                  : `با شمارهٔ ${toPersianDigits(mi?.next || '')} صادر می‌شود.`;
            const ok = await askConfirm(`از روی پیش‌فاکتور ${toPersianDigits(deal.proformaNumber || '')}، «${invoiceTitle(kind)}» صادر شود؟ ${how} بعد از صدور قابل ویرایش نیست.`, { tone: 'info', title: 'صدور فاکتور', confirmText: 'بله، صادر شود' });
            if (!ok) return;
            setBusy(true);
            try {
              await api.invoiceIssue(deal.id, kind, paidTick, extra);
              reloadState();
              showToast(currentUser.role !== 'SUPER_ADMIN' ? 'فاکتور ثبت شد؛ اگر منتظر تأیید باشد، تأییدکنندگان شما خبر می‌گیرند.' : mi?.mode === 'sepidar' ? 'فاکتور برای سپیدار فرستاده شد؛ شمارهٔ آن بعد از صدور در سپیدار می‌آید.' : 'فاکتور صادر شد.');
            } catch (e) {
              showToast(e instanceof Error ? e.message : 'صدور فاکتور انجام نشد.');
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
  const awaiting = inv.status === 'awaiting';
  const pending = inv.status === 'pending' || awaiting;
  const payable = inv.amount ?? deal.amount;
  const small = 'text-[10px] font-bold text-[#8C6F66]';
  return (
    <section className={`rounded-2xl border p-4 space-y-3 ${cancelled ? 'border-rose-200 bg-rose-50/40' : 'border-emerald-200 bg-white'}`} data-invoice-block>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 font-black text-xs text-[#3A241F]">
          <Receipt className="w-4 h-4 text-emerald-700" />
          {invoiceTitle(inv.kind)} {awaiting ? <span className="text-amber-700">(در انتظار تأیید)</span> : pending ? <span className="text-amber-700">(در انتظار شمارهٔ سپیدار)</span> : toPersianDigits(inv.number)}
          <span className={`text-[10px] font-black rounded-full px-2 py-0.5 border ${inv.kind === 'OFFICIAL' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{inv.kind === 'OFFICIAL' ? 'رسمی' : 'غیررسمی'}</span>
        </div>
        <span className={`text-[11px] font-black ${cancelled ? 'text-rose-700' : pending ? 'text-amber-700' : 'text-emerald-700'}`}>{cancelled ? 'باطل شده' : awaiting ? 'در انتظار تأیید' : pending ? 'در انتظار سپیدار' : 'صادر شده'}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
        <div><div className={small}>تاریخ صدور</div><b>{formatTaskDate(inv.issuedAt.slice(0, 10))}</b></div>
        <div><div className={small}>صادرکننده</div><b>{inv.issuedByName || '—'}</b></div>
        <div><div className={small}>از پیش‌فاکتور</div><b>{toPersianDigits(inv.proformaNumber || '—')}</b></div>
        <div><div className={small}>مبلغ</div><b>{payable ? `${formatMoney(payable)} ${unitName()}` : '—'}</b></div>
      </div>
      {!awaiting && <SepidarSend deal={deal} />}
      {awaiting && <InvoiceApprovalBox deal={deal} />}
      {cancelled && <p className="text-[11px] font-bold text-rose-800 leading-6">ابطال: {inv.cancelReason}{inv.cancelledByName ? ` (${inv.cancelledByName})` : ''}</p>}
      <div className="flex flex-wrap gap-2">
        {!pending && <button type="button" onClick={() => openInvoicePdf(deal, customer, settings, currentUser.fullName)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black bg-white border border-emerald-200 text-emerald-800 hover:bg-emerald-50 cursor-pointer" data-invoice-print>
          <Printer className="w-3.5 h-3.5" />
          چاپ / PDF
        </button>}
        {!pending && !awaiting && !cancelled && (
          <span className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-white px-1.5 py-1" data-invoice-thermal>
            <select value={thermal} onChange={(e) => setThermal(e.target.value as ThermalSize)} className="text-[11px] font-black text-emerald-900 bg-transparent outline-hidden cursor-pointer max-w-[190px]" aria-label="اندازهٔ کاغذ پرینتر لیبل‌زن">
              {THERMAL_SIZES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            {thermal === 'custom' && <input type="number" min={30} max={200} value={thermalMm} onChange={(e) => setThermalMm(Number(e.target.value) || 80)} className="w-16 px-1.5 py-1 rounded-lg border border-emerald-200 text-[11px] font-black text-center" aria-label="عرض کاغذ به میلی‌متر" data-thermal-mm />}
            <button type="button" onClick={() => openInvoiceThermal(deal, customer, settings, currentUser.fullName, thermal, thermalMm)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-black bg-emerald-600 text-white cursor-pointer" data-invoice-print-thermal>
              <Printer className="w-3.5 h-3.5" />
              چاپ روی پرینتر لیبل‌زن
            </button>
            {directPrintOn() ? <span className="text-[10px] font-black text-emerald-700 px-1" data-direct-print-on>چاپ مستقیم فعال</span> : <button type="button" onClick={() => { downloadDirectPrintInstaller(); showToast('فایل «Hoormand-Direct-Print-Setup.cmd» دانلود شد؛ روی کامپیوتر پرینتر اجرایش کنید، پرینتر را انتخاب کنید و از آیکون تازهٔ روی دسکتاپ استفاده کنید.'); }} className="text-[10px] font-black text-sky-700 underline cursor-pointer px-1" data-direct-print-install>نصب چاپ مستقیم</button>}
          </span>
        )}
        {!pending && <button
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
        </button>}
        {!cancelled && allowed && !cancelling && (
          <button type="button" onClick={() => setCancelling(true)} className="px-3.5 py-2 rounded-xl text-[11px] font-black bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 cursor-pointer" data-invoice-cancel>
            {pending ? 'انصراف از صدور' : 'ابطال فاکتور'}
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
                const ok = await askConfirm(`${pending ? 'فاکتور در انتظار سپیدار' : 'فاکتور ' + toPersianDigits(inv.number)} باطل شود؟ ${inv.sepidar ? 'شمارهٔ آن شمارهٔ سپیدار است و دوباره استفاده نمی‌شود.' : pending ? '' : 'شمارهٔ آن آزاد می‌شود و فاکتور بعدی همین شماره را می‌گیرد.'}${inv.sepidar ? ' توجه: این فاکتور در سپیدار صادر شده و آنجا می‌ماند (موجودی هم برنمی‌گردد) تا خودتان از داخل سپیدار پاکش کنید.' : ''}`, { tone: 'danger', title: 'ابطال فاکتور', confirmText: 'بله، باطل شود' });
                if (!ok) return;
                const why = reason.trim();
                try {
                  await api.invoiceCancel(deal.id, why);
                  showToast('فاکتور باطل شد.');
                  setCancelling(false);
                  reloadState();
                  onChanged?.();
                } catch (e) {
                  showToast(e instanceof Error ? e.message : 'ابطال انجام نشد.');
                }
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


/** An invoice that waits for approval: who may approve it, and (for them) the two buttons. Any one approver is enough. */
const InvoiceApprovalBox: React.FC<{ deal: Deal }> = ({ deal }) => {
  const { currentUser, staffList, showToast, reloadState } = useAppContext();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const inv = deal.invoice;
  if (!inv) return null;
  const chain = inv.approvers || [];
  const step = Math.min(Math.max(inv.step || 0, 0), Math.max(chain.length - 1, 0));
  const nameOf = (id: string) => staffList.find((u) => u.id === id)?.fullName || '—';
  const byWorkflow = !!inv.workflowId;
  const mayDecide = !byWorkflow && (currentUser.role === 'SUPER_ADMIN' || chain[step] === currentUser.id);
  const decide = async (decision: 'approve' | 'reject') => {
    if (decision === 'reject' && !reason.trim()) { showToast('دلیل رد را بنویسید.'); return; }
    setBusy(true);
    try {
      await api.invoiceDecide(deal.id, decision, reason.trim());
      reloadState();
      window.dispatchEvent(new Event('hoormand-invoices-changed'));
      showToast(decision === 'approve' ? 'فاکتور تأیید و صادر شد.' : 'فاکتور رد شد.');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'انجام نشد.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2" data-invoice-approval>
      <p className="text-[11.5px] font-bold text-amber-900 leading-6">
        این فاکتور منتظر تأیید است؛ تا همهٔ مرحله‌ها تأیید نکنند شماره نمی‌گیرد، به سپیدار نمی‌رود و چاپ نمی‌شود.
      </p>
      {byWorkflow && <p className="text-[11.5px] font-black text-amber-950" data-invoice-by-workflow>با گردشکار «{inv.workflowName || 'تأیید فاکتور'}» پیش می‌رود؛ تأییدکننده در «امور اداری ← گردشکارها» تصمیم می‌گیرد و فاکتور بعد از «تأیید شد» خودکار صادر می‌شود.</p>}
      <ol className="space-y-1 text-[11px] font-bold" data-approval-chain>
        {chain.map((id, i) => (
          <li key={i} className={`flex items-center gap-2 ${i < step ? 'text-emerald-800' : i === step ? 'text-amber-900' : 'text-[#8C6F66]'}`}>
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px] shrink-0">{i < step ? '✓' : toPersianDigits(i + 1)}</span>
            {nameOf(id)}{i === step ? ' (نوبت اوست)' : ''}
          </li>
        ))}
      </ol>
      {mayDecide && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void decide('approve')} className="px-4 py-2 rounded-xl text-[11px] font-black bg-emerald-700 text-white cursor-pointer disabled:opacity-50" data-invoice-approve>تأیید و صدور</button>
            <button type="button" disabled={busy} onClick={() => setRejecting((v) => !v)} className="px-4 py-2 rounded-xl text-[11px] font-black bg-white border border-rose-200 text-rose-700 cursor-pointer">رد کردن</button>
          </div>
          {rejecting && (
            <div className="flex gap-2">
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="دلیل رد (لازم است)" className="flex-1 px-3 py-2 rounded-xl border border-[#EBDBCE] bg-white text-xs font-bold" />
              <button type="button" disabled={busy} onClick={() => void decide('reject')} className="px-4 py-2 rounded-xl text-[11px] font-black bg-rose-700 text-white cursor-pointer disabled:opacity-50">تأیید رد</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
