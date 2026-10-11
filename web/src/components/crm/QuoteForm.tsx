import React, { useEffect, useMemo, useState } from 'react';
import { Search, Tag } from 'lucide-react';
import { api } from '../../lib/api';
import { fold } from '../../lib/customerSearch';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, fromDisplay, toDisplay, unitName } from '../../lib/money';
import { CrmActivity } from '../../types';
import { field, label } from './crmUi';
import { MoneyInput } from '../common/MoneyInput';

type Product = { id: string; code: string; title: string; unit: string; group?: string; total: number; prices?: { title: string; amount: number }[] };

const money = (toman: number) => formatMoney(toman);
const parse = (s: string) => Number(fold(s).replace(/[^0-9.]/g, '')) || 0;

/** A price given to a customer who needs no proforma: the product (from the warehouse, or typed), its details, the quantity and the price. */
export const QuoteForm: React.FC<{ onSave: (text: string, extra: Partial<CrmActivity>) => void }> = ({ onSave }) => {
  const [catalog, setCatalog] = useState<Product[] | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Product | null>(null);
  const [title, setTitle] = useState('');
  const [spec, setSpec] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [asked, setAsked] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.crmProducts().then((r) => setCatalog(r.products)).catch(() => setCatalog([]));
  }, []);

  const results = useMemo(() => {
    const needle = fold(q).trim();
    if (!catalog || !needle) return [];
    return catalog.filter((p) => needle.split(/\s+/).every((t) => fold(`${p.title} ${p.code} ${p.group || ''}`).includes(t))).slice(0, 8);
  }, [catalog, q]);

  const pick = (p: Product) => {
    setPicked(p);
    setTitle(p.title);
    setQ('');
    setOpen(false);
    if (p.prices?.length && !price) setPrice(String(toDisplay(p.prices[0].amount)));
  };

  const priceN = fromDisplay(parse(price)); // stored in Toman
  const save = () => {
    const name = title.trim();
    if (!name || priceN <= 0) return;
    const qn = parse(qty) || 1;
    const askedN = fromDisplay(parse(asked));
    const unit = picked?.unit || '';
    const text = `قیمت «${name}»${spec.trim() ? ` (${spec.trim()})` : ''} × ${toPersianDigits(qn)}${unit ? ' ' + unit : ''}: ${money(priceN)} ${unitName()}${askedN > 0 ? ` · قیمت مورد نظر مشتری: ${money(askedN)}` : ''}`;
    onSave(text, {
      itemName: name,
      qty: qn,
      price: priceN,
      ...(askedN > 0 ? { askedPrice: askedN } : {}),
      ...(spec.trim() ? { spec: spec.trim() } : {}),
      ...(picked ? { productId: picked.id, productCode: picked.code, unit } : {}),
    });
    setPicked(null);
    setTitle('');
    setSpec('');
    setQty('1');
    setPrice('');
    setAsked('');
  };

  return (
    <div className="space-y-2.5" data-quote-form>
      <div className="relative">
        <label className={label}>کالا (از انبار انتخاب کنید یا بنویسید)</label>
        {picked ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-900">
            <span className="truncate">{picked.title} <span className="font-bold text-emerald-700">· کد {toPersianDigits(picked.code)}</span></span>
            <span className="flex items-center gap-2 shrink-0 font-bold">
              <span className={picked.total > 0 ? 'text-emerald-700' : 'text-rose-700'}>{picked.total > 0 ? `موجودی ${toPersianDigits(picked.total)} ${picked.unit}` : 'ناموجود'}</span>
              <button type="button" onClick={() => { setPicked(null); setTitle(''); }} className="underline cursor-pointer">تغییر</button>
            </span>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="w-4 h-4 text-[#8C6F66] absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                className={`${field} pr-9`}
                value={open || q ? q : title}
                onFocus={() => setOpen(true)}
                onChange={(e) => {
                  setQ(e.target.value);
                  setTitle(e.target.value);
                  setOpen(true);
                }}
                placeholder={catalog && catalog.length ? 'جستجوی نام یا کد کالا در انبار…' : 'نام کالا'}
              />
            </div>
            {open && results.length > 0 && (
              <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-[#EBDBCE] bg-white shadow-xl">
                {results.map((p) => (
                  <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)} className="w-full text-right px-3 py-2 hover:bg-[#FAF5F1] border-b border-[#F3E8DF] last:border-0 cursor-pointer">
                    <div className="text-xs font-black text-[#3A241F]">{p.title}</div>
                    <div className="text-[10px] font-bold text-[#8C6F66] flex items-center gap-2 flex-wrap">
                      <span>کد {toPersianDigits(p.code)}</span>
                      <span className={p.total > 0 ? 'text-emerald-700' : 'text-rose-700'}>{p.total > 0 ? `موجودی ${toPersianDigits(p.total)} ${p.unit}` : 'ناموجود'}</span>
                      {(p.prices || []).slice(0, 3).map((x) => (
                        <span key={x.title}>{x.title}: {money(x.amount)}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div>
        <label className={label}>مشخصات (مدل، سایز، رنگ، توضیح فنی…)</label>
        <input className={field} value={spec} onChange={(e) => setSpec(e.target.value)} placeholder="مثلاً مدل ۲۰۲۴، سفید، گارانتی اصلی" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <div>
          <label className={label}>تعداد{picked?.unit ? ` (${picked.unit})` : ''}</label>
          <input className={field} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <div>
          <label className={label}>قیمتی که شرکت داد (هر واحد)</label>
          <MoneyInput className={field} value={price} onChange={setPrice} placeholder="مثلاً ۱۲۰۰۰۰" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className={label}>قیمت مورد نظر مشتری (اختیاری)</label>
          <MoneyInput className={field} value={asked} onChange={setAsked} />
        </div>
      </div>
      {picked?.prices && picked.prices.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-[#8C6F66]" />
          {picked.prices.map((x) => (
            <button key={x.title} type="button" onClick={() => setPrice(String(toDisplay(x.amount)))} className="px-2.5 py-1 rounded-full border border-amber-200 bg-amber-50 text-[11px] font-black text-amber-900 hover:bg-amber-100 cursor-pointer">
              {x.title}: {money(x.amount)}
            </button>
          ))}
        </div>
      )}
      {priceN > 0 && <div className="text-[11px] font-bold text-[#8C6F66]">جمع: {money(priceN * (parse(qty) || 1))} {unitName()}</div>}
      <button type="button" onClick={save} disabled={!title.trim() || priceN <= 0} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-black cursor-pointer">
        ثبت قیمت داده‌شده
      </button>
    </div>
  );
};
