import React from 'react';
import { Hash } from 'lucide-react';
import { LetterNumberingSettings } from '../../types';
import { defaultInternalNumbering, formatLetterNumber, normalizePattern, NUMBER_PATTERNS } from '../../lib/letterNumbering';
import { toPersianDigits } from '../../lib/jalali';

const box = 'w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-amber-600 focus:outline-none';
const digitsEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** «شماره‌گذاری مکاتبات داخلی»: the prefix, counter, step, year, month and ordering of the numbers of internal letters (kept apart from the official letters' counter). */
export const InternalNumberingCard: React.FC<{ value?: LetterNumberingSettings; onChange: (v: LetterNumberingSettings) => void }> = ({ value, onChange }) => {
  const cur: LetterNumberingSettings = { ...defaultInternalNumbering(), ...(value || {}) };
  const set = (u: Partial<LetterNumberingSettings>) => onChange({ ...cur, ...u });
  const sample = formatLetterNumber(cur);
  const options = (() => {
    const seen = new Set<string>();
    const out: { id: string; label: string }[] = [];
    for (const pt of NUMBER_PATTERNS) {
      const ex = formatLetterNumber({ ...cur, formatPattern: pt.id });
      if (seen.has(ex) && pt.id !== normalizePattern(cur.formatPattern)) continue;
      seen.add(ex);
      out.push({ id: pt.id, label: `${pt.parts} (مثال: ${ex})` });
    }
    return out;
  })();

  return (
    <div className="bg-white p-6 sm:p-7 rounded-3xl border border-[#EBDBCE] shadow-sm space-y-5" data-internal-numbering>
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-[#EBDBCE] pb-3.5">
        <div className="flex items-center gap-2.5 text-[#3A241F]">
          <div className="w-9 h-9 rounded-2xl bg-[#6E1B1B] text-white flex items-center justify-center shadow-xs">
            <Hash className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-black text-sm text-[#3A241F]">شماره‌گذاری مکاتبات داخلی</h2>
            <p className="text-[11px] text-[#8C6F66]">شمارهٔ نامه‌هایی که کارمندان بین خودشان می‌نویسند؛ شمارندهٔ آن جدا از نامه‌های رسمی است و با هر نامه خودکار جلو می‌رود.</p>
          </div>
        </div>
        <div className="bg-[#FAF5F1] px-3.5 py-1.5 rounded-xl border border-[#EBDBCE] text-right" dir="rtl">
          <span className="text-[10px] text-[#8C6F66] block">نمونه شمارهٔ بعدی:</span>
          <span className="font-bold text-xs text-[#6E1B1B]">{toPersianDigits(sample)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
        <div>
          <label className="block font-bold text-[#3A241F] mb-1.5">پیشوند شماره:</label>
          <input type="text" dir="rtl" value={cur.prefix ? toPersianDigits(cur.prefix) : ''} onChange={(e) => set({ prefix: toPersianDigits(e.target.value) })} placeholder="خالی = بدون پیشوند (مثال: د)" className={box} />
        </div>
        <div>
          <label className="block font-bold text-[#3A241F] mb-1.5">شمارهٔ بعدی / شروع:</label>
          <input type="text" inputMode="numeric" dir="rtl" value={toPersianDigits(cur.nextNumber || 1)} onChange={(e) => { const n = parseInt(digitsEn(e.target.value).replace(/[^0-9]/g, ''), 10); set({ nextNumber: Number.isFinite(n) && n > 0 ? Math.min(n, 999999999) : 1 }); }} className={box} />
        </div>
        <div>
          <label className="block font-bold text-[#3A241F] mb-1.5">گام افزایش:</label>
          <select value={cur.incrementStep || 1} onChange={(e) => set({ incrementStep: parseInt(e.target.value) || 1 })} className={box}>
            <option value={1}>+۱ (یکی یکی)</option>
            <option value={2}>+۲</option>
            <option value={5}>+۵</option>
            <option value={10}>+۱۰</option>
          </select>
        </div>
        <div>
          <label className="block font-bold text-[#3A241F] mb-1.5">سال:</label>
          <input type="text" dir="rtl" value={toPersianDigits(cur.year || '')} onChange={(e) => set({ year: toPersianDigits(e.target.value) })} placeholder="۱۴۰۵" className={box} />
          <label className="mt-2 flex items-start gap-2 font-bold text-[#3A241F] cursor-pointer">
            <input type="checkbox" className="mt-0.5 w-5 h-5 shrink-0 accent-[#6E1B1B] cursor-pointer" checked={!!cur.includeMonth} onChange={(e) => set({ includeMonth: e.target.checked })} />
            <span>شمارهٔ ماه شمسی هم بیاید</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-2 border-t border-[#EBDBCE]/60">
        <div>
          <label className="block font-bold text-[#3A241F] mb-1.5">الگوی ساختار شماره:</label>
          <select value={normalizePattern(cur.formatPattern)} onChange={(e) => set({ formatPattern: e.target.value })} className={box}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-bold text-[#3A241F] mb-1.5">علامت بین اجزای شماره:</label>
          <div className="grid grid-cols-2 gap-2">
            {([['/', 'اسلش ( / )'], ['-', 'خط تیره ( - )']] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => set({ separator: v })} className={`p-2.5 rounded-xl border text-xs font-black cursor-pointer ${(cur.separator || '/') === v ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-[#FAF5F1] text-[#3A241F] border-[#EBDBCE]'}`}>{label}</button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[10.5px] font-medium text-[#8C6F66] leading-5">بعد از تغییر، با دکمهٔ «ذخیره» پایین صفحه ثبت می‌شود. شمارهٔ نامه‌های قبلی تغییر نمی‌کند.</p>
    </div>
  );
};
