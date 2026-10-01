import React, { useMemo, useState } from 'react';
import { FileText, Plus, Trash2, X } from 'lucide-react';
import { toPersianDigits } from '../../lib/jalali';
import { addDaysIso, DEFAULT_PROFORMA_TERMS, nextProformaNumber, openProformaPdf, proformaTotals } from '../../lib/proformaPdf';
import { normalizeTemplate } from '../../lib/proformaTemplates';
import { todayIso } from '../../lib/taskDates';
import { Customer, Deal, ProformaFields, ProformaItem, SystemSettings } from '../../types';
import { JalaliDateField } from '../tasks/TasksView';

const toman = (n: number) => new Intl.NumberFormat('fa-IR').format(Math.round(n || 0));
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
    deal.items && deal.items.length ? deal.items : [{ title: deal.title, qty: 1, unitPrice: deal.amount || 0 }]
  );
  const [discountPercent, setDiscountPercent] = useState(deal.discountPercent || 0);
  const [taxPercent, setTaxPercent] = useState(deal.taxPercent ?? settings.proformaTaxPercent ?? 10);
  const [date, setDate] = useState(deal.proformaAt || todayIso());
  const [valid, setValid] = useState(deal.validUntil || addDaysIso(deal.proformaAt || todayIso(), settings.proformaValidDays || 7));
  const [terms, setTerms] = useState(deal.terms ?? settings.proformaTerms ?? DEFAULT_PROFORMA_TERMS);

  // Every text on the invoice can be changed here; what is typed is kept with this proforma.
  const tpl = useMemo(() => normalizeTemplate(settings.proformaTemplate), [settings.proformaTemplate]);
  const [number, setNumber] = useState(deal.proformaNumber || nextProformaNumber(allDeals, tpl));
  const [f, setF] = useState<Required<ProformaFields>>(() => {
    const o = deal.proformaFields || {};
    return {
      title: o.title ?? tpl.title,
      subject: o.subject ?? deal.title,
      sellerName: o.sellerName ?? (settings.proformaCompanyName !== undefined ? settings.proformaCompanyName : settings.companyName || ''),
      sellerAddress: o.sellerAddress ?? settings.companyAddress ?? '',
      sellerPhone: o.sellerPhone ?? settings.companyPhone ?? '',
      sellerEconomicCode: o.sellerEconomicCode ?? settings.companyEconomicCode ?? '',
      buyerName: o.buyerName ?? (customer?.name || deal.customerName),
      buyerCompany: o.buyerCompany ?? customer?.company ?? '',
      buyerPhones: o.buyerPhones ?? (customer?.phones || []).join('، '),
      buyerAddress: o.buyerAddress ?? customer?.address ?? '',
      buyerEmail: o.buyerEmail ?? customer?.email ?? '',
      bankInfo: o.bankInfo ?? settings.proformaBankInfo ?? '',
      footerText: o.footerText ?? tpl.footerText,
    };
  });
  const setField = (k: keyof ProformaFields, v: string) => setF((p) => ({ ...p, [k]: v }));
  const numberTaken = !!number.trim() && allDeals.some((d) => d.id !== deal.id && d.proformaNumber === number.trim());

  const totals = useMemo(() => proformaTotals(items, discountPercent, taxPercent), [items, discountPercent, taxPercent]);
  const patchItem = (i: number, u: Partial<ProformaItem>) => setItems((p) => p.map((x, idx) => (idx === i ? { ...x, ...u } : x)));
  const okItems = items.filter((i) => i.title.trim() && i.qty > 0);

  const build = (): Deal => ({
    ...deal,
    items: okItems.map((i) => ({ ...i, title: i.title.trim() })),
    discountPercent,
    taxPercent,
    proformaAt: date,
    validUntil: valid,
    terms,
    proformaNumber: number.trim() || nextProformaNumber(allDeals, tpl),
    proformaFields: f,
    amount: totals.payable,
  });

  const save = (pdf: boolean) => {
    if (!okItems.length) return;
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
                    <label className={label}>قیمت واحد (تومان)</label>
                    <input className={field} inputMode="numeric" value={it.unitPrice ? toman(it.unitPrice) : ''} onChange={(e) => patchItem(i, { unitPrice: parseNumber(e.target.value) })} />
                  </div>
                  <div>
                    <label className={label}>تخفیف ردیف (تومان)</label>
                    <input className={field} inputMode="numeric" value={it.discount ? toman(it.discount) : ''} onChange={(e) => patchItem(i, { discount: parseNumber(e.target.value) })} />
                  </div>
                </div>
                <input className={field} placeholder="توضیح بیشتر (اختیاری)" value={it.description || ''} onChange={(e) => patchItem(i, { description: e.target.value })} />
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
              <div><label className={label}>نشانی</label><input className={field} value={f.sellerAddress} onChange={(e) => setField('sellerAddress', e.target.value)} /></div>
            </div>
          </details>

          <details className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3">
            <summary className="cursor-pointer text-xs font-black text-[#3A241F]">مشخصات خریدار</summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div><label className={label}>نام</label><input className={field} value={f.buyerName} onChange={(e) => setField('buyerName', e.target.value)} /></div>
              <div><label className={label}>شرکت</label><input className={field} value={f.buyerCompany} onChange={(e) => setField('buyerCompany', e.target.value)} /></div>
              <div><label className={label}>تلفن</label><input className={field} value={f.buyerPhones} onChange={(e) => setField('buyerPhones', e.target.value)} /></div>
              <div><label className={label}>ایمیل</label><input className={field} dir="ltr" value={f.buyerEmail} onChange={(e) => setField('buyerEmail', e.target.value)} /></div>
              <div className="sm:col-span-2"><label className={label}>نشانی</label><input className={field} value={f.buyerAddress} onChange={(e) => setField('buyerAddress', e.target.value)} /></div>
            </div>
          </details>

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

          <div className="rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE] p-3 text-xs space-y-1">
            <div className="flex justify-between"><span>جمع</span><b>{toman(totals.subtotal)}</b></div>
            {totals.discount > 0 && <div className="flex justify-between"><span>تخفیف</span><b>−{toman(totals.discount)}</b></div>}
            {totals.tax > 0 && <div className="flex justify-between"><span>مالیات</span><b>{toman(totals.tax)}</b></div>}
            <div className="flex justify-between text-sm font-black text-violet-700 pt-1 border-t border-[#EBDBCE]"><span>قابل پرداخت (تومان)</span><span>{toman(totals.payable)}</span></div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-[#EBDBCE] flex-wrap">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">بعداً</button>
          <div className="flex gap-2">
            <button type="button" disabled={!okItems.length} onClick={() => save(false)} className="px-4 py-2 rounded-xl text-xs font-black text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 cursor-pointer">فقط ذخیره</button>
            <button type="button" disabled={!okItems.length} onClick={() => save(true)} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer">ذخیره و ساخت PDF</button>
          </div>
        </div>
      </div>
    </div>
  );
};
