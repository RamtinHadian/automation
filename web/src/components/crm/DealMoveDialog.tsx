import React, { useState } from 'react';
import { Link2, X } from 'lucide-react';
import { Deal } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { formatMoney, unitName } from '../../lib/money';

/**
 * Moving an opportunity that is linked to others of the same customer: before anything moves, the person is told that these all are the opportunities of that customer
 * and chooses which of them go. Nothing is ticked but the one that was dragged. For «پیشنهاد ارسال شد», the ticked ones can be merged into ONE opportunity with one proforma.
 */
export const DealMoveDialog: React.FC<{
  customerName: string;
  dragged: Deal;
  members: Deal[];
  target: { id: string; label: string };
  stageLabel: (stage: string) => string;
  onConfirm: (ids: string[], merge: boolean) => void;
  onClose: () => void;
}> = ({ customerName, dragged, members, target, stageLabel, onConfirm, onClose }) => {
  const [sel, setSel] = useState<Record<string, boolean>>({ [dragged.id]: true });
  const [merge, setMerge] = useState(true);
  const picked = members.filter((m) => sel[m.id] && m.stage !== target.id);
  const toProposal = target.id === 'PROPOSAL';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={onClose} data-deal-move>
      <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col border border-[#EBDBCE] text-right">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2"><Link2 className="w-4 h-4 text-violet-700" />انتقال به «{target.label}»</h3>
          <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer" aria-label="بستن"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3 overflow-y-auto">
          <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-[12px] font-black text-violet-900 leading-6" data-deal-move-note>
            اینها همگی فرصت‌های «{customerName}» هستند ({toPersianDigits(members.length)} فرصت پیوسته).
            <span className="block text-[11px] font-bold text-violet-800">هر کدام را که می‌خواهید به «{target.label}» ببرید تیک بزنید؛ تیک‌نخورده‌ها همان‌جا که هستند می‌مانند.</span>
          </div>
          <div className="space-y-1.5">
            {members.map((m) => {
              const here = m.stage === target.id;
              return (
                <label key={m.id} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ${here ? 'opacity-50 cursor-not-allowed bg-[#FAF5F1] border-[#EBDBCE]' : sel[m.id] ? 'cursor-pointer bg-white border-violet-400' : 'cursor-pointer bg-white/60 border-[#EBDBCE]'}`} data-deal-move-row>
                  <input type="checkbox" disabled={here} className="w-4 h-4 accent-violet-600" checked={!!sel[m.id] && !here} onChange={(e) => setSel((s) => ({ ...s, [m.id]: e.target.checked }))} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] font-black text-[#3A241F] truncate">{m.title}</span>
                    <span className="block text-[10.5px] font-bold text-[#8C6F66]">الان: {stageLabel(m.stage)}{here ? ' (همین‌جاست)' : ''}</span>
                  </span>
                  <span className="shrink-0 text-[11px] font-black text-violet-900">{m.amount ? `${toPersianDigits(formatMoney(m.amount))} ${unitName()}` : ''}</span>
                </label>
              );
            })}
          </div>
          {toProposal && picked.length > 1 && (
            <label className="flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 cursor-pointer" data-deal-merge>
              <input type="checkbox" className="mt-1 w-4 h-4 accent-emerald-600" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
              <span className="text-[11.5px] font-black text-emerald-900 leading-6">
                {toPersianDigits(picked.length)} فرصت تیک‌خورده در یک پیش‌فاکتور بیایند
                <span className="block text-[10.5px] font-bold text-emerald-800">پیش‌فاکتور روی فرصتی که کشیدید ساخته می‌شود و همهٔ کالاها، تعدادها و جمع کل را دارد. هیچ فرصتی پاک نمی‌شود؛ بقیه در همین ستون می‌مانند و مبلغشان فقط یک بار حساب می‌شود.</span>
              </span>
            </label>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EBDBCE]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">انصراف</button>
          <button type="button" disabled={picked.length === 0} onClick={() => onConfirm(picked.map((m) => m.id), toProposal && picked.length > 1 && merge)} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer" data-deal-move-go>
            {picked.length > 1 && toProposal && merge ? `ببر و یک پیش‌فاکتور بساز (${toPersianDigits(picked.length)} فرصت)` : `ببر (${toPersianDigits(picked.length)} فرصت)`}
          </button>
        </div>
      </div>
    </div>
  );
};
