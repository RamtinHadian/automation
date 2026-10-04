import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Link2, Plus, Send, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { renderProformaPdf } from '../../lib/proformaFile';
import { formatTaskDate } from '../../lib/taskDates';
import { useAppContext } from '../../context/AppContext';
import { approvalRequired, canApproveProforma, proformaReleased } from '../../lib/proformaApproval';
import { issuersOf, MAIN_ISSUER_ID, officialProblems, titleFor } from '../../lib/proformaIssuer';
import { toPersianDigits } from '../../lib/jalali';
import { addDaysIso, DEFAULT_PROFORMA_TERMS, nextProformaNumber, openProformaPdf, proformaTotals } from '../../lib/proformaPdf';
import { normalizeTemplate } from '../../lib/proformaTemplates';
import { todayIso } from '../../lib/taskDates';
import { Customer, Deal, ProformaFields, ProformaIssuer, ProformaItem, SystemSettings } from '../../types';
import { JalaliDateField } from '../tasks/TasksView';
import { formatMoney, fromDisplay, unitName } from '../../lib/money';

const toman = formatMoney;
const parseNumber = (s: string) => {
  const latin = s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[^0-9]/g, '');
  return latin ? parseInt(latin, 10) : 0;
};

const field = 'w-full px-3 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-medium text-[#3A241F] outline-hidden focus:ring-2 focus:ring-violet-500/20';
const label = 'block text-[11px] font-black text-[#3A241F] mb-1.5';

export const ProformaModal: React.FC<{
  deal: Deal;
  allDeals: Deal[];
  customer?: Customer;
  settings: SystemSettings;
  issuerName: string;
  onClose: () => void;
  /** Called with the deal updated by the proforma (items, number, amount...). */
  onSave: (d: Deal) => void;
}> = ({ deal, allDeals, customer, settings, issuerName, onClose, onSave }) => {
  const [items, setItems] = useState<ProformaItem[]>(
    deal.items && deal.items.length ? deal.items : [{ title: deal.title, qty: 1, unitPrice: deal.amount || 0, code: deal.productCode }]
  );
  const [discountPercent, setDiscountPercent] = useState(deal.discountPercent || 0);
  const [taxPercent, setTaxPercent] = useState(deal.taxPercent ?? settings.proformaTaxPercent ?? 10);
  const [date, setDate] = useState(deal.proformaAt || todayIso());
  const [valid, setValid] = useState(deal.validUntil || addDaysIso(deal.proformaAt || todayIso(), settings.proformaValidDays || 7));
  const [terms, setTerms] = useState(deal.terms ?? settings.proformaTerms ?? DEFAULT_PROFORMA_TERMS);

  // Every text on the invoice can be changed here; what is typed is kept with this proforma.
  const tpl = useMemo(() => normalizeTemplate(settings.proformaTemplate), [settings.proformaTemplate]);
  // Which company issues it: the organisation itself or another company / office (official or not).
  const issuers = issuersOf(settings);
  const [issuerId, setIssuerId] = useState(deal.proformaIssuerId && issuers.some((i) => i.id === deal.proformaIssuerId) ? deal.proformaIssuerId : MAIN_ISSUER_ID);
  const issuer = issuers.find((i) => i.id === issuerId) || issuers[0];
  const official = issuer.kind === 'OFFICIAL';
  // every company counts its own proformas (with its own prefix)
  const numberFor = (iss: ProformaIssuer) => {
    const pre = iss.numberPrefix || '';
    const same = allDeals
      .filter((d) => (d.proformaIssuerId || MAIN_ISSUER_ID) === iss.id)
      .map((d) => ({ ...d, proformaNumber: pre && d.proformaNumber?.startsWith(pre) ? d.proformaNumber.slice(pre.length) : d.proformaNumber }));
    return pre + nextProformaNumber(same, tpl);
  };
  // an official proforma is headed «پیش‌فاکتور رسمی» unless the admin gave the template its own title
  const defaultTitleFor = (iss: ProformaIssuer) => titleFor(iss, tpl.title);
  const [number, setNumber] = useState(deal.proformaNumber || numberFor(issuer));
  const [f, setF] = useState<Required<Omit<ProformaFields, 'showStamp' | 'showSignature'>>>(() => {
    const o = deal.proformaFields || {};
    return {
      title: o.title ?? defaultTitleFor(issuer),
      subject: o.subject ?? deal.title,
      sellerName: o.sellerName ?? issuer.name,
      sellerAddress: o.sellerAddress ?? issuer.address ?? '',
      sellerPhone: o.sellerPhone ?? issuer.phone ?? '',
      sellerEconomicCode: o.sellerEconomicCode ?? issuer.economicCode ?? '',
      sellerNationalId: o.sellerNationalId ?? issuer.nationalId ?? '',
      sellerRegistrationNumber: o.sellerRegistrationNumber ?? issuer.registrationNumber ?? '',
      sellerPostalCode: o.sellerPostalCode ?? issuer.postalCode ?? '',
      buyerName: o.buyerName ?? (customer?.name || deal.customerName),
      buyerCompany: o.buyerCompany ?? customer?.company ?? '',
      buyerPhones: o.buyerPhones ?? (customer?.phones || []).join('، '),
      buyerAddress: o.buyerAddress ?? customer?.address ?? '',
      buyerEmail: o.buyerEmail ?? customer?.email ?? '',
      buyerNationalId: o.buyerNationalId ?? (customer?.kind === 'COMPANY' ? customer.nationalId : customer?.nationalCode) ?? '',
      buyerEconomicCode: o.buyerEconomicCode ?? customer?.economicCode ?? '',
      buyerPostalCode: o.buyerPostalCode ?? customer?.postalCode ?? '',
      bankInfo: o.bankInfo ?? issuer.bankInfo ?? '',
      footerText: o.footerText ?? tpl.footerText,
    };
  });
  const setField = (k: Exclude<keyof ProformaFields, 'showStamp' | 'showSignature'>, v: string) => setF((p) => ({ ...p, [k]: v }));
  const changeIssuer = (id: string) => {
    const iss = issuers.find((i) => i.id === id);
    if (!iss) return;
    setIssuerId(id);
    setF((p) => ({
      ...p,
      title: p.title === defaultTitleFor(issuer) ? defaultTitleFor(iss) : p.title,
      sellerName: iss.name,
      sellerAddress: iss.address ?? '',
      sellerPhone: iss.phone ?? '',
      sellerEconomicCode: iss.economicCode ?? '',
      sellerNationalId: iss.nationalId ?? '',
      sellerRegistrationNumber: iss.registrationNumber ?? '',
      sellerPostalCode: iss.postalCode ?? '',
      bankInfo: iss.bankInfo ?? '',
    }));
    if (!deal.proformaNumber) setNumber(numberFor(iss));
    if (iss.taxPercent !== undefined) setTaxPercent(iss.taxPercent);
  };
  // The stamp and the signature picture of the company are optional on each proforma.
  const [showStamp, setShowStamp] = useState(deal.proformaFields?.showStamp !== false);
  const [showSignature, setShowSignature] = useState(deal.proformaFields?.showSignature !== false);
  // ---- send straight to the customer's Telegram / Bale ----
  const { showToast, currentUser } = useAppContext();
  // CEO approval: with the setting on, only an approved proforma may be printed or sent
  const required = approvalRequired(settings);
  const isCeo = canApproveProforma(currentUser);
  const released = proformaReleased(deal, settings);
  const approval = deal.proformaApproval;
  const [msgr, setMsgr] = useState<{ telegram: boolean; bale: boolean } | null>(null);
  const [chat, setChat] = useState({ telegram: customer?.telegramChatId || '', bale: customer?.baleChatId || '' });
  const [sending, setSending] = useState<string | null>(null);
  useEffect(() => {
    api.msgrStatus().then(setMsgr).catch(() => {});
  }, []);
  const numberTaken =  !!number.trim() && allDeals.some((d) => d.id !== deal.id && d.proformaNumber === number.trim());

  const totals = useMemo(() => proformaTotals(items, discountPercent, taxPercent), [items, discountPercent, taxPercent]);
  const patchItem = (i: number, u: Partial<ProformaItem>) => setItems((p) => p.map((x, idx) => (idx === i ? { ...x, ...u } : x)));
  const okItems = items.filter((i) => i.title.trim() && i.qty > 0);
  const problems = official ? officialProblems(f, okItems) : [];

  const build = (): Deal => ({
    ...deal,
    items: okItems.map((i) => ({ ...i, title: i.title.trim() })),
    discountPercent,
    taxPercent,
    proformaAt: date,
    validUntil: valid,
    terms,
    proformaNumber: number.trim() || nextProformaNumber(allDeals, tpl),
    proformaFields: { ...f, showStamp, showSignature },
    proformaIssuerId: issuerId,
    amount: totals.payable,
  });

  const sendTo = async (ch: 'telegram' | 'bale') => {
    if (!okItems.length || !released) return;
    if (problems.length) {
      showToast('اطلاعات پیش‌فاکتور رسمی کامل نیست: ' + problems.join('، '));
      return;
    }
    if (!customer) {
      showToast('برای ارسال، فرصت باید به یک مشتری وصل باشد.');
      return;
    }
    setSending(ch);
    try {
      const next = build();
      onSave(next);
      const blob = await renderProformaPdf({ deal: next, customer, settings, issuerName });
      const caption = toPersianDigits(`پیش‌فاکتور شمارهٔ ${next.proformaNumber}\nمبلغ قابل پرداخت: ${toman(totals.payable)} ${unitName()}\nاعتبار تا: ${formatTaskDate(valid)}`);
      await api.msgrSendFile({ channel: ch, chatId: chat[ch].trim(), customerId: customer.id, caption, file: blob, filename: `${next.proformaNumber || 'proforma'}.pdf` });
      showToast(`پیش‌فاکتور در ${ch === 'bale' ? 'بله' : 'تلگرام'} ارسال شد.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ارسال نشد.');
    } finally {
      setSending(null);
    }
  };

  const copyLink = async (ch: 'telegram' | 'bale') => {
    if (!customer) return;
    try {
      const { link } = await api.msgrLink(ch, customer.id);
      if (!link) {
        showToast('اول در تنظیمات، ربات را بررسی اتصال کنید تا لینک ساخته شود.');
        return;
      }
      await navigator.clipboard.writeText(link);
      showToast('لینک اتصال کپی شد؛ آن را برای مشتری بفرستید.');
    } catch {
      showToast('کپی لینک ممکن نشد.');
    }
  };

  const decide = (status: 'PENDING' | 'APPROVED' | 'REJECTED') => {
    if (!okItems.length) return;
    if (status !== 'REJECTED' && problems.length) {
      showToast('اطلاعات پیش‌فاکتور رسمی کامل نیست: ' + problems.join('، '));
      return;
    }
    let note = '';
    if (status === 'REJECTED') {
      const answer = window.prompt('دلیل رد پیش‌فاکتور (اختیاری):', '');
      if (answer === null) return;
      note = answer.trim();
    }
    const base = build();
    const next: Deal = { ...base, proformaApproval: { ...(deal.proformaApproval || {}), status, ...(note ? { note } : {}) } };
    // the CEO's approval puts the stamp and the signature on automatically
    if (status === 'APPROVED') next.proformaFields = { ...(base.proformaFields || {}), showStamp: true, showSignature: true };
    onSave(next);
    showToast(
      status === 'PENDING' ? 'پیش‌فاکتور برای تایید مدیرعامل فرستاده شد.' : status === 'APPROVED' ? 'پیش‌فاکتور تایید شد؛ مهر و امضای مدیرعامل درج شد.' : 'پیش‌فاکتور رد شد.'
    );
    onClose();
  };

  const save = (pdf: boolean) => {
    if (!okItems.length) return;
    if (pdf && problems.length) {
      showToast('اطلاعات پیش‌فاکتور رسمی کامل نیست: ' + problems.join('، '));
      return;
    }
    const next = build();
    onSave(next);
    if (pdf) openProformaPdf(next, customer, settings, issuerName);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={onClose}>
      <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col border border-[#EBDBCE] text-right">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2">
            <FileText className="w-4 h-4 text-violet-600" />
            پیش‌فاکتور «{deal.title}»{deal.proformaNumber ? ` — ${toPersianDigits(deal.proformaNumber)}` : ''}
          </h3>
          <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {issuers.length > 1 && (
            <div className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] px-4 py-3 flex flex-wrap items-center gap-3">
              <label className="text-xs font-black text-[#3A241F]">صادرکننده پیش‌فاکتور</label>
              <select className={`${field} sm:max-w-xs`} value={issuerId} onChange={(e) => changeIssuer(e.target.value)}>
                {issuers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label} — {i.kind === 'OFFICIAL' ? 'رسمی' : 'غیررسمی'}
                  </option>
                ))}
              </select>
              <span className={`text-[11px] font-black rounded-full px-3 py-1 border ${official ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                {official ? 'پیش‌فاکتور رسمی (با شناسه‌های مالیاتی)' : 'پیش‌فاکتور غیررسمی'}
              </span>
            </div>
          )}
          {official && problems.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-6 text-amber-900">
              برای پیش‌فاکتور رسمی این موارد را تکمیل کنید (در «مشخصات فروشنده»، «مشخصات خریدار» و ردیف‌ها): {problems.join('، ')}.
            </div>
          )}
          {required && (
            <div
              className={`rounded-2xl border px-4 py-3 text-xs font-bold leading-6 ${
                approval?.status === 'APPROVED'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : approval?.status === 'REJECTED'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              {approval?.status === 'APPROVED' ? (
                <>تایید شد توسط {approval.decidedByName || 'مدیرعامل'}؛ مهر و امضا درج شده و می‌توانید پیش‌فاکتور را چاپ یا ارسال کنید.</>
              ) : approval?.status === 'REJECTED' ? (
                <>رد شد توسط {approval.decidedByName || 'مدیرعامل'}{approval.note ? `: ${approval.note}` : ''}. پس از اصلاح می‌توانید دوباره برای تایید بفرستید.</>
              ) : approval?.status === 'PENDING' ? (
                <>در انتظار تایید مدیرعامل{approval.requestedByName ? ` (ارسال‌کننده: ${approval.requestedByName})` : ''}. چاپ و ارسال پس از تایید ممکن می‌شود.</>
              ) : (
                <>این پیش‌فاکتور پیش از ارسال باید مدیرعامل تایید کند؛ پس از تایید، مهر و امضای مدیرعامل خودکار درج می‌شود.</>
              )}
            </div>
          )}
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3 space-y-2">
                <div className="flex gap-2">
                  <input className={field} placeholder="شرح کالا یا خدمات *" value={it.title} onChange={(e) => patchItem(i, { title: e.target.value })} />
                  <button
                    type="button"
                    disabled={items.length === 1}
                    onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl disabled:opacity-30 cursor-pointer"
                    title="حذف ردیف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className={label}>تعداد</label>
                    <input className={field} inputMode="numeric" value={it.qty ? toPersianDigits(it.qty) : ''} onChange={(e) => patchItem(i, { qty: parseNumber(e.target.value) })} />
                  </div>
                  <div>
                    <label className={label}>واحد</label>
                    <input className={field} placeholder="عدد، ماه، ..." value={it.unit || ''} onChange={(e) => patchItem(i, { unit: e.target.value })} />
                  </div>
                  <div>
                    <label className={label}>قیمت واحد ({unitName()})</label>
                    <input className={field} inputMode="numeric" value={it.unitPrice ? toman(it.unitPrice) : ''} onChange={(e) => patchItem(i, { unitPrice: fromDisplay(parseNumber(e.target.value)) })} />
                  </div>
                  <div>
                    <label className={label}>تخفیف ردیف ({unitName()})</label>
                    <input className={field} inputMode="numeric" value={it.discount ? toman(it.discount) : ''} onChange={(e) => patchItem(i, { discount: fromDisplay(parseNumber(e.target.value)) })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input className={field} dir="ltr" placeholder={official ? 'شناسه کالا / خدمت (لازم)' : 'شناسه / کد کالا (اختیاری)'} value={it.code || ''} onChange={(e) => patchItem(i, { code: e.target.value })} />
                  <input className={`${field} sm:col-span-2`} placeholder="توضیح بیشتر (اختیاری)" value={it.description || ''} onChange={(e) => patchItem(i, { description: e.target.value })} />
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setItems((p) => [...p, { title: '', qty: 1, unitPrice: 0 }])} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-violet-700 bg-violet-50 hover:bg-violet-100 cursor-pointer">
              <Plus className="w-4 h-4" />
              افزودن ردیف
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className={label}>تخفیف کل (٪)</label>
              <input className={field} inputMode="numeric" value={discountPercent ? toPersianDigits(discountPercent) : ''} onChange={(e) => setDiscountPercent(Math.min(100, parseNumber(e.target.value)))} placeholder="۰" />
            </div>
            <div>
              <label className={label}>مالیات (٪)</label>
              <input className={field} inputMode="numeric" value={taxPercent ? toPersianDigits(taxPercent) : ''} onChange={(e) => setTaxPercent(Math.min(100, parseNumber(e.target.value)))} placeholder="۰" />
            </div>
            <div>
              <label className={label}>تاریخ صدور</label>
              <JalaliDateField value={date} onChange={(v) => v && setDate(v)} />
            </div>
            <div>
              <label className={label}>اعتبار تا</label>
              <JalaliDateField value={valid} onChange={(v) => v && setValid(v)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>شمارهٔ پیش‌فاکتور</label>
              <input className={field} dir="ltr" value={number} onChange={(e) => setNumber(e.target.value)} />
              {numberTaken && <p className="text-[10px] font-bold text-rose-600 mt-1">این شماره برای پیش‌فاکتور دیگری استفاده شده است.</p>}
            </div>
            <div>
              <label className={label}>عنوان بالای برگه</label>
              <input className={field} value={f.title} onChange={(e) => setField('title', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className={label}>موضوع</label>
              <input className={field} value={f.subject} onChange={(e) => setField('subject', e.target.value)} />
            </div>
          </div>

          <details className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3">
            <summary className="cursor-pointer text-xs font-black text-[#3A241F]">مشخصات فروشنده</summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div><label className={label}>نام</label><input className={field} value={f.sellerName} onChange={(e) => setField('sellerName', e.target.value)} /></div>
              <div><label className={label}>تلفن</label><input className={field} value={f.sellerPhone} onChange={(e) => setField('sellerPhone', e.target.value)} /></div>
              <div><label className={label}>کد اقتصادی</label><input className={field} value={f.sellerEconomicCode} onChange={(e) => setField('sellerEconomicCode', e.target.value)} /></div>
              <div><label className={label}>شناسه ملی</label><input className={field} value={f.sellerNationalId} onChange={(e) => setField('sellerNationalId', e.target.value)} /></div>
              <div><label className={label}>شمارهٔ ثبت</label><input className={field} value={f.sellerRegistrationNumber} onChange={(e) => setField('sellerRegistrationNumber', e.target.value)} /></div>
              <div><label className={label}>کد پستی</label><input className={field} value={f.sellerPostalCode} onChange={(e) => setField('sellerPostalCode', e.target.value)} /></div>
              <div><label className={label}>نشانی</label><input className={field} value={f.sellerAddress} onChange={(e) => setField('sellerAddress', e.target.value)} /></div>
            </div>
          </details>

          <details className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3">
            <summary className="cursor-pointer text-xs font-black text-[#3A241F]">مشخصات خریدار</summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div><label className={label}>نام</label><input className={field} value={f.buyerName} onChange={(e) => setField('buyerName', e.target.value)} /></div>
              <div><label className={label}>شرکت</label><input className={field} value={f.buyerCompany} onChange={(e) => setField('buyerCompany', e.target.value)} /></div>
              <div><label className={label}>کد ملی / شناسه ملی</label><input className={field} value={f.buyerNationalId} onChange={(e) => setField('buyerNationalId', e.target.value)} /></div>
              <div><label className={label}>کد اقتصادی</label><input className={field} value={f.buyerEconomicCode} onChange={(e) => setField('buyerEconomicCode', e.target.value)} /></div>
              <div><label className={label}>کد پستی</label><input className={field} value={f.buyerPostalCode} onChange={(e) => setField('buyerPostalCode', e.target.value)} /></div>
              <div><label className={label}>تلفن</label><input className={field} value={f.buyerPhones} onChange={(e) => setField('buyerPhones', e.target.value)} /></div>
              <div><label className={label}>ایمیل</label><input className={field} dir="ltr" value={f.buyerEmail} onChange={(e) => setField('buyerEmail', e.target.value)} /></div>
              <div className="sm:col-span-2"><label className={label}>نشانی</label><input className={field} value={f.buyerAddress} onChange={(e) => setField('buyerAddress', e.target.value)} /></div>
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] px-4 py-3 text-xs font-black text-[#3A241F]">
            <span className="text-[#8C6F66]">در پیش‌فاکتور درج شود:</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" disabled={required && !released} checked={showStamp} onChange={(e) => setShowStamp(e.target.checked)} className="accent-violet-600 w-4 h-4" />
              مهر شرکت
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" disabled={required && !released} checked={showSignature} onChange={(e) => setShowSignature(e.target.checked)} className="accent-violet-600 w-4 h-4" />
              امضا
            </label>
          </div>

          <details className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3">
            <summary className="cursor-pointer text-xs font-black text-[#3A241F]">اطلاعات پرداخت و پاورقی</summary>
            <div className="space-y-3 mt-3">
              <div><label className={label}>شماره حساب / شبا</label><textarea className={`${field} min-h-[56px] leading-6`} value={f.bankInfo} onChange={(e) => setField('bankInfo', e.target.value)} /></div>
              <div><label className={label}>متن پاورقی</label><input className={field} value={f.footerText} onChange={(e) => setField('footerText', e.target.value)} /></div>
            </div>
          </details>

          <div>
            <label className={label}>شرایط و توضیحات (هر خط یک مورد)</label>
            <textarea className={`${field} min-h-[80px] leading-6`} value={terms} onChange={(e) => setTerms(e.target.value)} />
          </div>

          {msgr && (msgr.telegram || msgr.bale) && (
            <details className="rounded-2xl border border-sky-200 bg-sky-50/50 p-3">
              <summary className="cursor-pointer text-xs font-black text-sky-900">ارسال مستقیم به تلگرام / بله</summary>
              <div className="space-y-3 mt-3">
                {(['bale', 'telegram'] as const).filter((ch) => msgr[ch]).map((ch) => (
                  <div key={ch} className="rounded-xl bg-white border border-[#EBDBCE] p-3 space-y-2">
                    <div className="text-[11px] font-black text-[#3A241F]">{ch === 'bale' ? 'بله' : 'تلگرام'}</div>
                    <input
                      className={field}
                      dir="ltr"
                      inputMode="numeric"
                      value={chat[ch]}
                      onChange={(e) => setChat((p) => ({ ...p, [ch]: e.target.value }))}
                      placeholder="شناسهٔ گفتگوی مشتری (خودکار پر می‌شود وقتی مشتری ربات را با لینک شما باز کند)"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={sending !== null || !okItems.length || !chat[ch].trim() || !released} onClick={() => sendTo(ch)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-40 cursor-pointer">
                        <Send className="w-3.5 h-3.5" />
                        {sending === ch ? 'در حال ساخت و ارسال...' : 'ذخیره و ارسال PDF'}
                      </button>
                      <button type="button" onClick={() => copyLink(ch)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-[#3A241F] bg-white border border-[#EBDBCE] cursor-pointer">
                        <Link2 className="w-3.5 h-3.5" />
                        کپی لینک اتصال مشتری
                      </button>
                    </div>
                  </div>
                ))}
                <p className="text-[10px] text-[#8C6F66] leading-5">ربات فقط به کسی پیام می‌دهد که آن را استارت کرده باشد. لینک اتصال را برای مشتری بفرستید؛ وقتی او باز کند، شناسه خودکار ثبت می‌شود.</p>
              </div>
            </details>
          )}

          <div className="rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE] p-3 text-xs space-y-1">
            <div className="flex justify-between"><span>جمع</span><b>{toman(totals.subtotal)}</b></div>
            {totals.discount > 0 && <div className="flex justify-between"><span>تخفیف</span><b>−{toman(totals.discount)}</b></div>}
            {totals.tax > 0 && <div className="flex justify-between"><span>مالیات</span><b>{toman(totals.tax)}</b></div>}
            <div className="flex justify-between text-sm font-black text-violet-700 pt-1 border-t border-[#EBDBCE]"><span>قابل پرداخت ({unitName()})</span><span>{toman(totals.payable)}</span></div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#EBDBCE] flex-wrap">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">بعداً</button>
          <div className="flex gap-2">
            <button type="button" disabled={!okItems.length} onClick={() => save(false)} className="px-4 py-2 rounded-xl text-xs font-black text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 cursor-pointer">فقط ذخیره</button>
            {required && !released ? (
              isCeo ? (
                <>
                  <button type="button" disabled={!okItems.length} onClick={() => decide('REJECTED')} className="px-4 py-2 rounded-xl text-xs font-black text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-50 cursor-pointer">رد</button>
                  <button type="button" disabled={!okItems.length} onClick={() => decide('APPROVED')} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 cursor-pointer">تایید و درج مهر و امضا</button>
                </>
              ) : approval?.status === 'PENDING' ? (
                <span className="px-5 py-2 rounded-xl text-xs font-black text-amber-800 bg-amber-100 border border-amber-200">در انتظار تایید مدیرعامل</span>
              ) : (
                <button type="button" disabled={!okItems.length} onClick={() => decide('PENDING')} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer">
                  {approval?.status === 'REJECTED' ? 'ارسال دوباره برای تایید مدیرعامل' : 'ارسال برای تایید مدیرعامل'}
                </button>
              )
            ) : (
              <button type="button" disabled={!okItems.length} onClick={() => save(true)} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer">ذخیره و ساخت PDF</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
