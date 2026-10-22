import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { fold, matchesQuery } from '../../lib/customerSearch';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, unitName } from '../../lib/money';
import { Modal } from './crmUi';

export interface WarehouseProduct {
  id: string;
  code: string;
  title: string;
  unit: string;
  group?: string;
  /** 'service' for a service (it has no stock); empty or 'goods' for a product */
  kind?: string;
  total: number;
  prices?: { title: string; amount: number }[];
}

/** The warehouse list for the proforma: type a few letters of the name or code, tap a product, and it comes onto the invoice with its unit and price. */
export const WarehousePicker: React.FC<{
  products: WarehouseProduct[];
  /** The price shown for a product (the customer's last price when there is one, else the first price of the product). */
  priceFor: (p: WarehouseProduct) => number;
  onPick: (p: WarehouseProduct) => void;
  onClose: () => void;
}> = ({ products, priceFor, onPick, onClose }) => {
  const [q, setQ] = useState('');
  const lines = useMemo(() => new Map(products.map((p) => [p.id, fold([p.code, p.title, p.group || ''].join(' '))])), [products]);
  const shown = useMemo(() => products.filter((p) => matchesQuery(lines.get(p.id), q)).slice(0, 80), [products, lines, q]);
  return (
    <Modal
      title="انتخاب کالا از انبار"
      onClose={onClose}
      onTop="max"
      footer={
        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[#EBDBCE] text-xs font-black text-[#3A241F] cursor-pointer">
          بستن (ورود دستی)
        </button>
      }
    >
      <div className="relative">
        <Search className="w-4 h-4 text-[#8C6F66] absolute right-3 top-1/2 -translate-y-1/2" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="نام یا کد کالا را بنویسید…"
          className="w-full pr-9 pl-3 py-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-medium text-[#3A241F] outline-hidden focus:ring-2 focus:ring-violet-500/20"
          data-warehouse-search
        />
      </div>
      {products.length === 0 ? (
        <p className="text-xs text-[#8C6F66] leading-6">هنوز کالایی در انبار ثبت نشده است. «ردیف دستی» را بزنید و کالا را خودتان بنویسید.</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-[#8C6F66] leading-6">کالایی با این نام پیدا نشد. می‌توانید «بستن» را بزنید و آن را دستی وارد کنید.</p>
      ) : (
        <div className="space-y-1.5" data-warehouse-list>
          {shown.map((p) => {
            const price = priceFor(p);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p)}
                className="w-full text-right flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-[#EBDBCE] bg-white hover:bg-violet-50 hover:border-violet-300 cursor-pointer"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-black text-[#3A241F] truncate">{p.title}</span>
                  <span className="block text-[10px] font-bold text-[#8C6F66]" dir="ltr">{p.code}{p.group ? ` · ${p.group}` : ''}</span>
                </span>
                <span className="shrink-0 text-left">
                  <span className="block text-[11px] font-black text-violet-700">{price ? `${formatMoney(price)} ${unitName()}` : 'بدون قیمت'}</span>
                  {p.kind === 'service' ? (
                    <span className="block text-[10px] font-black text-sky-700">خدمات</span>
                  ) : (
                    <span className={`block text-[10px] font-bold ${p.total > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>موجودی: {toPersianDigits(p.total)} {p.unit}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
};
