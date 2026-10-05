import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Customer, Deal } from '../../types';
import { itemTotal } from '../../lib/proformaPdf';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, unitName } from '../../lib/money';
import { Modal } from './crmUi';

type Status = 'bought' | 'quoted' | 'lost';
const STATUSES: { id: Status; label: string; short: string; color: string; Icon: typeof CheckCircle2 }[] = [
  { id: 'bought', label: 'خریداری‌شده (فروش موفق)', short: 'خریده', color: '#059669', Icon: CheckCircle2 },
  { id: 'quoted', label: 'فقط قیمت گرفته (در جریان)', short: 'قیمت گرفته', color: '#D97706', Icon: Clock },
  { id: 'lost', label: 'ناموفق (از دست رفته)', short: 'نخریده', color: '#E11D48', Icon: XCircle },
];
const statusOf = (d: Deal): Status => (d.stage === 'WON' ? 'bought' : d.stage === 'LOST' ? 'lost' : 'quoted');

interface Row {
  name: string;
  qty: Record<Status, number>;
  amount: Record<Status, number>;
  unit: string;
}
const zero = (): Record<Status, number> => ({ bought: 0, quoted: 0, lost: 0 });

/** «گزارش مشتری»: which goods this customer bought, only asked a price for, or did not buy; built from the proformas issued for them. */
export const CustomerReportModal: React.FC<{ customer: Customer; deals: Deal[]; onClose: () => void }> = ({ customer, deals, onClose }) => {
  const [metric, setMetric] = useState<'qty' | 'amount'>('qty');

  const withProforma = useMemo(() => deals.filter((d) => d.proformaNumber && d.items && d.items.length > 0), [deals]);
  const { rows, totals, counts } = useMemo(() => {
    const map = new Map<string, Row>();
    const totals = { qty: zero(), amount: zero() };
    const counts = zero();
    for (const d of withProforma) {
      const st = statusOf(d);
      counts[st] += 1;
      for (const i of d.items || []) {
        const name = (i.title || '').trim();
        if (!name) continue;
        const r = map.get(name) || { name, qty: zero(), amount: zero(), unit: i.unit || '' };
        r.qty[st] += i.qty || 0;
        r.amount[st] += itemTotal(i);
        if (!r.unit && i.unit) r.unit = i.unit;
        map.set(name, r);
        totals.qty[st] += i.qty || 0;
        totals.amount[st] += itemTotal(i);
      }
    }
    const rows = [...map.values()].sort((a, b) => sum(b[metric]) - sum(a[metric]));
    return { rows, totals, counts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withProforma, metric]);

  const fmt = (n: number) => (metric === 'qty' ? toPersianDigits(n) : `${formatMoney(n)} ${unitName()}`);
  const max = Math.max(1, ...rows.map((r) => sum(r[metric])));

  return (
    <Modal
      wide
      onTop
      title={`گزارش مشتری: ${customer.name}`}
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">
          بستن
        </button>
      }
    >
      {withProforma.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EBDBCE] p-8 text-center text-xs font-bold text-[#8C6F66] leading-7">
          برای این مشتری هنوز پیش‌فاکتوری صادر نشده است؛ بعد از صدور پیش‌فاکتور، کالاهای خریداری‌شده و قیمت‌گرفته اینجا نمودار می‌شود.
        </div>
      ) : (
        <>
          {/* the three numbers that matter */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {STATUSES.map((s) => (
              <div key={s.id} className="rounded-2xl border border-[#EBDBCE] bg-white p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] font-black text-[#3A241F]">
                  <s.Icon className="w-4 h-4" style={{ color: s.color }} />
                  {s.label}
                </div>
                <div className="mt-1.5 text-lg font-black text-[#3A241F]">
                  {formatMoney(totals.amount[s.id])} <span className="text-[11px] font-bold text-[#8C6F66]">{unitName()}</span>
                </div>
                <div className="text-[11px] font-bold text-[#8C6F66]">
                  {toPersianDigits(counts[s.id])} پیش‌فاکتور · {toPersianDigits(totals.qty[s.id])} عدد کالا
                </div>
              </div>
            ))}
          </div>

          {/* the chart */}
          <div className="rounded-2xl border border-[#EBDBCE] bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-black text-xs text-[#3A241F]">هر کالا چقدر خریده شده، چقدر فقط قیمت گرفته شده و چقدر ناموفق بوده</h4>
              <div className="flex bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl p-0.5">
                {([['qty', 'تعداد'], ['amount', 'مبلغ']] as const).map(([id, t]) => (
                  <button key={id} type="button" onClick={() => setMetric(id)} className={`px-3 py-1 rounded-lg text-[11px] font-black cursor-pointer ${metric === id ? 'bg-white text-violet-700 shadow-2xs' : 'text-[#8C6F66]'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {STATUSES.map((s) => (
                <span key={s.id} className="flex items-center gap-1.5 text-[11px] font-bold text-[#503730]">
                  <span className="w-3 h-3 rounded-sm" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>

            <div className="space-y-3" role="img" aria-label="نمودار میله‌ای کالاها بر اساس وضعیت خرید">
              {rows.map((r) => {
                const total = sum(r[metric]);
                return (
                  <div key={r.name}>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-xs font-black text-[#3A241F] truncate">{r.name}</span>
                      <span className="text-[11px] font-bold text-[#8C6F66] shrink-0">
                        مجموع {fmt(total)}
                        {metric === 'qty' && r.unit ? ` ${r.unit}` : ''}
                      </span>
                    </div>
                    <div className="flex h-6 gap-0.5" style={{ width: `${Math.max(8, (total / max) * 100)}%` }} dir="rtl">
                      {STATUSES.map((s) => {
                        const v = r[metric][s.id];
                        if (!v) return null;
                        return (
                          <div
                            key={s.id}
                            className="h-full flex items-center justify-center text-[10px] font-black text-white first:rounded-r-md last:rounded-l-md min-w-[22px] overflow-hidden"
                            style={{ background: s.color, flex: v }}
                            title={`${r.name} — ${s.short}: ${fmt(v)}`}
                          >
                            {metric === 'qty' ? toPersianDigits(v) : ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* the same numbers as a table */}
          <div className="rounded-2xl border border-[#EBDBCE] bg-white overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-[#FAF5F1] text-[#3A241F]">
                  <th className="text-right font-black px-3 py-2">کالا / خدمت</th>
                  {STATUSES.map((s) => (
                    <th key={s.id} className="font-black px-3 py-2 whitespace-nowrap">{s.short}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} className="border-t border-[#EBDBCE]/70">
                    <td className="px-3 py-2 font-bold text-[#3A241F]">{r.name}</td>
                    {STATUSES.map((s) => (
                      <td key={s.id} className="px-3 py-2 text-center font-bold text-[#503730] whitespace-nowrap">
                        {r.qty[s.id] ? (
                          <>
                            {toPersianDigits(r.qty[s.id])}
                            {r.unit ? ` ${r.unit}` : ''}
                            <div className="text-[10px] text-[#8C6F66]">{formatMoney(r.amount[s.id])}</div>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-[#8C6F66] leading-5">
            این گزارش از روی پیش‌فاکتورهای صادرشده برای این مشتری ساخته می‌شود: فرصتِ «فروش موفق» = خریده، «از دست رفته» = ناموفق، و بقیهٔ مراحل = فقط قیمت گرفته. مبلغ‌ها بعد از تخفیف ردیف و بدون مالیات است.
          </p>
        </>
      )}
    </Modal>
  );
};

const sum = (r: Record<Status, number>) => r.bought + r.quoted + r.lost;
