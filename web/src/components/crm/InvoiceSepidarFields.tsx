import React, { useEffect, useState } from 'react';
import { api, WhWarehouse } from '../../lib/api';
import { useSepidarConnected } from '../../lib/sepidarCustomerFields';
import { JalaliDateField } from '../tasks/TasksView';

export interface InvoiceExtra {
  settlement: 'CREDIT' | 'CASH';
  dueDate: string;
  stockCode: string;
}
export const emptyInvoiceExtra: InvoiceExtra = { settlement: 'CREDIT', dueDate: '', stockCode: '' };

const sel = 'w-full px-3 py-2 rounded-xl border border-[#EBDBCE] bg-white text-xs font-bold text-[#3A241F] focus:outline-none focus:border-[#C98B6A]';
const lbl = 'block text-[11px] font-black text-[#503730] mb-1';

/**
 * What Sepidar asks on a sales invoice besides the lines: how it is settled (نسیه / نقدی), the day it must be settled and the warehouse the goods leave.
 * Drawn only when Sepidar is connected; the choices travel with the issuing and are kept in the invoice.
 */
export const InvoiceSepidarFields: React.FC<{ value: InvoiceExtra; onChange: (v: InvoiceExtra) => void }> = ({ value, onChange }) => {
  const connected = useSepidarConnected();
  const [wh, setWh] = useState<WhWarehouse[]>([]);
  useEffect(() => {
    if (!connected) return;
    api.warehouse().then((r) => setWh((r.warehouses || []).filter((w) => w.active !== false && w.code))).catch(() => setWh([]));
  }, [connected]);
  if (!connected) return null;
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 space-y-2" data-sepidar-invoice-fields>
      <div className="text-[11px] font-black text-sky-900">مشخصات فاکتور در سپیدار</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className={lbl}>نوع تسویه</label>
          <select className={sel} value={value.settlement} onChange={(e) => onChange({ ...value, settlement: e.target.value === 'CASH' ? 'CASH' : 'CREDIT' })}>
            <option value="CREDIT">نسیه</option>
            <option value="CASH">نقدی</option>
          </select>
        </div>
        <div>
          <label className={lbl}>تاریخ تسویه</label>
          <JalaliDateField value={value.dueDate || undefined} onChange={(iso) => onChange({ ...value, dueDate: iso || '' })} />
        </div>
        <div>
          <label className={lbl}>انبار خروج کالا</label>
          <select className={sel} value={value.stockCode} onChange={(e) => onChange({ ...value, stockCode: e.target.value })} data-invoice-stock>
            <option value="">هر کالا از انباری که بیشترین موجودی را دارد</option>
            {wh.map((w) => <option key={w.id} value={w.code}>{w.title}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
};
