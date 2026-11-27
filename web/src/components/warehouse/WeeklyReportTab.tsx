import React, { useEffect, useState } from 'react';
import { Download, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { canSub } from '../../lib/permissions';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, unitName } from '../../lib/money';
import { formatTaskDate } from '../../lib/taskDates';
import { csvDownload } from './WarehouseView';

type Row = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' ? v : '');
const n = (v: unknown) => (typeof v === 'number' ? v : 0);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const fmt = (v: number) => toPersianDigits(Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 2 }));

const FLAG_CLS: Record<string, string> = {
  'کمبود': 'bg-rose-50 text-rose-800 border-rose-200',
  'تقاضا بیشتر از موجودی': 'bg-rose-50 text-rose-800 border-rose-200',
  'قیمت می‌گیرند، نمی‌خرند': 'bg-sky-50 text-sky-800 border-sky-300',
  'افت فروش': 'bg-amber-50 text-amber-900 border-amber-300',
  'رشد فروش': 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

/** «گزارش هفتگی کالاها»: for management decisions: per product, this week against the week before: priced, sold, customers, stock and the signs (shortage, demand above stock, priced but not sold). */
export const WeeklyReportTab: React.FC<{ onCard: (code: string) => void }> = ({ onCard }) => {
  const { currentUser, showToast } = useAppContext();
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ rows: Row[]; from: string; to: string; money: boolean; crm: boolean } | null>(null);
  const [ai, setAi] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [only, setOnly] = useState(false);
  useEffect(() => {
    let live = true;
    setData(null);
    setAi(null);
    api.warehouseWeekly(offset).then((r) => live && setData(r)).catch(() => live && setData({ rows: [], from: '', to: '', money: false, crm: false }));
    return () => { live = false; };
  }, [offset]);
  const runAi = async () => {
    setBusy(true);
    try {
      setAi((await api.warehouseWeeklyAi(offset)).analysis);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'تحلیل انجام نشد.');
    } finally {
      setBusy(false);
    }
  };
  if (!data) return <div className="p-6 text-center text-xs font-bold text-[#8C6F66]">در حال ساختن گزارش هفتگی…</div>;
  const rows = data.rows.filter((r) => !only || list(r.flags).length > 0);
  const sum = (k: string) => data.rows.reduce((t, r) => t + n(r[k]), 0);
  const AiList = ({ title, items, render }: { title: string; items: unknown[]; render: (x: Record<string, unknown>) => React.ReactNode }) =>
    items.length === 0 ? null : (
      <div>
        <div className="text-[11px] font-black text-violet-900">{title}</div>
        <ul className="list-disc pr-5 text-[11px] font-bold text-[#3A241F] space-y-0.5">{items.map((x, i) => <li key={i}>{render((x && typeof x === 'object' ? x : { text: String(x) }) as Record<string, unknown>)}</li>)}</ul>
      </div>
    );
  const delta = (a: number, b: number) => (a === b ? '' : a > b ? `▲ ${fmt(a - b)}` : `▼ ${fmt(b - a)}`);
  return (
    <div className="space-y-3" data-weekly-report>
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs font-black text-[#3A241F]">هفتهٔ {formatTaskDate(data.from)} تا {formatTaskDate(data.to)}</div>
        <button type="button" onClick={() => setOffset(offset + 7)} className="px-3 py-1.5 rounded-xl border border-[#EBDBCE] bg-white text-[11px] font-black cursor-pointer">هفتهٔ قبل</button>
        <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 7))} className="px-3 py-1.5 rounded-xl border border-[#EBDBCE] bg-white text-[11px] font-black cursor-pointer disabled:opacity-40">هفتهٔ بعد</button>
        <label className="flex items-center gap-1.5 text-[11px] font-bold cursor-pointer"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} className="w-4 h-4" /> فقط کالاهای نیازمند توجه</label>
        <button type="button" onClick={() => csvDownload('گزارش-هفتگی-کالاها.csv', [['کد', 'کالا', 'قیمت‌داده (تعداد)', 'مشتری قیمت‌گیر', 'فروش (تعداد)', 'مشتری خریدار', 'فروش هفتهٔ قبل', 'موجودی', 'حداقل', ...(data.money ? ['درآمد'] : []), 'نشانه‌ها'], ...rows.map((r) => [s(r.code), s(r.title), n(r.pricedQty), n(r.pricedCustomers), n(r.soldQty), n(r.soldCustomers), n(r.soldPrev), n(r.stock), n(r.minQty), ...(data.money ? [n(r.revenue)] : []), list(r.flags).join(' | ')])])} className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#EBDBCE] bg-white text-[11px] font-black cursor-pointer mr-auto"><Download className="w-3.5 h-3.5" />خروجی اکسل</button>
      </div>
      {!data.crm && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-900">شما به بخش مشتریان دسترسی ندارید؛ قیمت‌داده و فروش نشان داده نمی‌شود، فقط کمبودها.</div>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {[['کالاهای فعال این هفته', fmt(data.rows.length)], ['تعداد قیمت‌داده‌شده', fmt(sum('pricedQty'))], ['تعداد فروخته‌شده', fmt(sum('soldQty'))], ...(data.money ? [['درآمد فاکتورها', `${formatMoney(sum('revenue'))} ${unitName()}`]] : [['نیازمند توجه', fmt(data.rows.filter((r) => list(r.flags).length).length)]])].map(([t, v]) => (
          <div key={t} className="rounded-xl border border-[#EBDBCE] bg-white px-3 py-2"><div className="text-[10px] font-bold text-[#8C6F66]">{t}</div><div className="text-sm font-black text-[#3A241F]">{v}</div></div>
        ))}
      </div>

      {canSub(currentUser, 'ai.product') && data.rows.length > 0 && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 space-y-2" data-weekly-ai>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-black text-violet-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4" />تحلیل هوش مصنوعی این هفته (برای تصمیم مدیریتی)</span>
            <button type="button" disabled={busy} onClick={() => void runAi()} className="px-3 py-1.5 rounded-xl bg-violet-700 text-white text-[11px] font-black cursor-pointer disabled:opacity-60" data-weekly-ai-run>{busy ? 'در حال تحلیل…' : ai ? 'تحلیل دوباره' : 'تحلیل کن'}</button>
          </div>
          {ai && (
            <div className="space-y-2 text-[11.5px] font-bold text-[#3A241F] leading-6">
              <div className="font-black text-sm text-violet-900">{s(ai.headline)}</div>
              {s(ai.summary) && <p>{s(ai.summary)}</p>}
              <AiList title="تصمیم‌های پیشنهادی" items={list(ai.decisions)} render={(x) => <><b>{s(x.title)}</b>{s(x.why) ? ': ' + s(x.why) : ''}</>} />
              <AiList title="نیاز به تأمین یا سفارش" items={list(ai.reorder)} render={(x) => <><b>{s(x.product)}</b>{s(x.why) ? ': ' + s(x.why) : ''}</>} />
              <AiList title="کند یا قیمت‌گرفته‌شده بدون خرید" items={list(ai.slow)} render={(x) => <><b>{s(x.product)}</b>{s(x.why) ? ': ' + s(x.why) : ''}</>} />
              <AiList title="خطرها" items={list(ai.risks)} render={(x) => <>{s(x.text)}</>} />
            </div>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-[#EBDBCE] p-8 text-center text-xs font-bold text-[#8C6F66]">در این هفته کالایی برای نشان‌دادن نیست.</div>
      ) : (
        <div className="border border-[#EBDBCE] rounded-xl overflow-x-auto bg-white">
          <table className="w-full text-[11px] font-bold text-[#3A241F] min-w-[760px]">
            <thead className="bg-[#FAF5F1] text-[#8C6F66]">
              <tr>
                <th className="p-2 text-right">کالا</th>
                <th className="p-2 text-right">قیمت داده‌شده</th>
                <th className="p-2 text-right">فروخته‌شده</th>
                <th className="p-2 text-right">موجودی</th>
                {data.money && <th className="p-2 text-right">درآمد</th>}
                <th className="p-2 text-right">نشانه‌ها</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={s(r.code)} className="border-t border-[#F3E8DF] align-top">
                  <td className="p-2"><button type="button" onClick={() => onCard(s(r.code))} className="font-black underline cursor-pointer text-right">{s(r.title)}</button><div className="text-[10px] text-[#8C6F66]">{toPersianDigits(s(r.code))}</div></td>
                  <td className="p-2">{fmt(n(r.pricedQty))} {s(r.unit)} · {fmt(n(r.pricedCustomers))} نفر<div className="text-[10px] text-[#8C6F66]">{delta(n(r.pricedQty), n(r.pricedPrev))} نسبت به هفتهٔ قبل</div></td>
                  <td className="p-2">{fmt(n(r.soldQty))} {s(r.unit)} · {fmt(n(r.soldCustomers))} نفر<div className="text-[10px] text-[#8C6F66]">{delta(n(r.soldQty), n(r.soldPrev))} نسبت به هفتهٔ قبل</div></td>
                  <td className={`p-2 ${n(r.minQty) > 0 && n(r.stock) < n(r.minQty) ? 'text-rose-700' : ''}`}>{fmt(n(r.stock))}{n(r.minQty) > 0 ? <span className="text-[10px] text-[#8C6F66]"> (حداقل {fmt(n(r.minQty))})</span> : null}</td>
                  {data.money && <td className="p-2">{n(r.revenue) > 0 ? `${formatMoney(n(r.revenue))}` : '—'}</td>}
                  <td className="p-2"><div className="flex flex-wrap gap-1">{list(r.flags).map((f) => <span key={String(f)} className={`text-[9.5px] font-black rounded-full px-1.5 py-px border ${FLAG_CLS[String(f)] || 'bg-slate-50 text-slate-700 border-slate-200'}`}>{String(f)}</span>)}{n(r.pricedNotSoldCustomers) > 0 && <span className="text-[9.5px] font-black rounded-full px-1.5 py-px border bg-sky-50 text-sky-800 border-sky-300">{fmt(n(r.pricedNotSoldCustomers))} نفر قیمت گرفته، نخریده</span>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="text-[10px] font-bold text-[#8C6F66]">هفته = ۷ روز تا امروز و مقایسه با ۷ روز پیش از آن. فقط فرصت‌هایی که شما اجازهٔ دیدنشان را دارید شمرده می‌شود.</div>
    </div>
  );
};
