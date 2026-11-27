import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney } from '../../lib/money';

type Result = Awaited<ReturnType<typeof api.whPricesFromSepidar>>;

/** «گرفتن قیمت‌ها از سپیدار»: first only a preview (how many products match, a few examples), then the real copy. */
export const SepidarPricesDialog: React.FC<{ onClose: () => void; onDone: () => void }> = ({ onClose, onDone }) => {
  const [mode, setMode] = useState<'add' | 'replace'>('add');
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const run = async (apply: boolean) => {
    setBusy(true);
    setErr('');
    try {
      const r = await api.whPricesFromSepidar({ apply, mode });
      setRes(r);
      if (apply) {
        setDone(true);
        onDone();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'انجام نشد.');
    } finally {
      setBusy(false);
    }
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return createPortal(
    <div className="fixed inset-0 z-[360] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={(e) => { stop(e); onClose(); }} data-sepidar-prices-dialog>
      <div dir="rtl" onMouseDown={stop} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg border border-[#EBDBCE] text-right max-h-[88vh] flex flex-col">
        <div className="px-5 py-3.5 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F]">گرفتن قیمت‌ها از سپیدار</h3>
          <p className="text-[11px] text-[#8C6F66] mt-1 leading-6">قیمت‌های فروشِ لیست قیمت سپیدار، به‌عنوان «قیمت‌های کالا» روی کالاهای انبار هورمند (با تطبیق «کد کالا») می‌نشینند. عنوان هر قیمت همان نوع فروش در سپیدار است.</p>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto text-xs">
          <div className="space-y-1.5">
            {([['add', 'افزودن به قیمت‌های موجود', 'قیمت‌هایی که خودتان نوشته‌اید می‌ماند؛ هم‌عنوان‌ها بروز می‌شوند.'], ['replace', 'جایگزینی کامل', 'قیمت‌های کالا دقیقاً همان قیمت‌های سپیدار می‌شود و قیمت‌های دستی پاک می‌شود.']] as const).map(([id, l, h]) => (
              <button key={id} type="button" onClick={() => { setMode(id); setRes(null); setDone(false); }} className={`w-full text-right rounded-xl border px-3 py-2.5 cursor-pointer ${mode === id ? 'bg-[#F6D9CD] border-[#C98B6A]' : 'bg-white border-[#EBDBCE] hover:bg-[#FAF5F1]'}`}>
                <span className="block font-black text-[#3A241F]">{l}</span>
                <span className="block text-[10.5px] font-bold text-[#8C6F66] leading-5">{h}</span>
              </button>
            ))}
          </div>
          {err && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 font-bold text-rose-800">{err}</div>}
          {res && (
            <div className="rounded-xl border border-[#EBDBCE] bg-[#FAF5F1] px-3 py-3 space-y-1.5" data-sepidar-prices-result>
              <div className="font-black text-[#3A241F]">{done ? 'انجام شد' : 'پیش‌نمایش (هنوز چیزی تغییر نکرده)'}</div>
              <div className="font-bold text-[#503730]">{toPersianDigits(res.matched)} کالا با کد یکسان پیدا شد{done ? `؛ ${toPersianDigits(res.updated)} کالا بروز شد` : ''}.</div>
              <div className="font-bold text-[#503730]">{toPersianDigits(res.added)} قیمت تازه اضافه می‌شود. تقسیم مبلغ سپیدار بر {toPersianDigits(res.divisor)} (ریال به تومان).</div>
              {res.notFound > 0 && <div className="font-bold text-amber-800">{toPersianDigits(res.notFound)} کد در لیست قیمت سپیدار هست ولی در انبار هورمند نیست{res.notFoundCodes.length ? `: ${res.notFoundCodes.slice(0, 8).map((c) => toPersianDigits(c)).join('، ')}…` : ''}</div>}
              <div className="space-y-1 pt-1">
                {res.examples.map((e) => (
                  <div key={e.code} className="rounded-lg bg-white border border-[#EBDBCE] px-2.5 py-1.5">
                    <div className="font-black text-[#3A241F]">{e.title} <span className="font-bold text-[#8C6F66]" dir="ltr">({toPersianDigits(e.code)})</span></div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(e.prices as { title: string; amount: number }[]).map((p) => <span key={p.title} className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900 font-black text-[10.5px]">{p.title}: {formatMoney(p.amount)}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#EBDBCE]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black border border-[#EBDBCE] cursor-pointer">{done ? 'بستن' : 'انصراف'}</button>
          <button type="button" disabled={busy} onClick={() => run(false)} className="px-4 py-2 rounded-xl text-xs font-black text-[#6E1B1B] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer disabled:opacity-50" data-sepidar-prices-preview>پیش‌نمایش</button>
          {res && !done && res.matched > 0 && <button type="button" disabled={busy} onClick={() => run(true)} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-[#6E1B1B] cursor-pointer disabled:opacity-50" data-sepidar-prices-apply>اعمال روی کالاها</button>}
        </div>
      </div>
    </div>,
    document.body
  );
};
