import React, { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { LETTERHEADS, LETTERHEAD_DESIGNS, LETTERHEAD_PALETTES, LetterheadChoice, letterheadSvg } from '../../lib/letterheads';
import { toPersianDigits } from '../../lib/jalali';

/** The page that opens at the right when «سربرگ رسمی با آرم» is chosen: 100 ready letterheads and the address / phone of the footer. */
export const LetterheadPanel: React.FC<{
  value: LetterheadChoice | null;
  onChange: (v: LetterheadChoice | null) => void;
  defaults: { address: string; phone: string };
  onClose: () => void;
}> = ({ value, onChange, defaults, onClose }) => {
  const [design, setDesign] = useState(-1);
  const [palette, setPalette] = useState(-1);
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const n = Number(q.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
    return LETTERHEADS.filter((l) => (design < 0 || l.design === design) && (palette < 0 || l.palette === palette) && (!q.trim() || (Number.isFinite(n) && n === l.id) || l.name.includes(q.trim())));
  }, [design, palette, q]);

  const pick = (id: number) =>
    onChange({
      id,
      showAddress: value?.showAddress ?? !!defaults.address,
      showPhone: value?.showPhone ?? !!defaults.phone,
      address: value?.address ?? defaults.address,
      phone: value?.phone ?? defaults.phone,
      offsetX: value?.offsetX,
      offsetY: value?.offsetY,
    });
  const patch = (u: Partial<LetterheadChoice>) => value && onChange({ ...value, ...u });
  const field = 'w-full px-3 py-2 bg-white border border-[#EBDBCE] rounded-xl text-xs font-medium text-[#3A241F] focus:outline-none focus:ring-2 focus:ring-amber-300/40';

  return (
    <div className="h-full flex flex-col bg-white text-right" dir="rtl" data-letterhead-panel>
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#EBDBCE] bg-amber-50/60">
        <div>
          <div className="font-black text-sm text-[#3A241F]">قالب‌های سربرگ</div>
          <div className="text-[10px] font-bold text-[#8C6F66]">{toPersianDigits(LETTERHEADS.length)} قالب آماده · روی هر کدام بزنید تا روی نامه بنشیند</div>
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-xl text-[#8C6F66] hover:bg-white cursor-pointer" title="بستن"><X className="w-4 h-4" /></button>
      </div>

      {/* the address and the phone in the footer */}
      <div className="px-4 py-3 border-b border-[#EBDBCE] space-y-2.5 bg-[#FAF5F1]">
        <div className="text-[11px] font-black text-[#3A241F]">نشانی و تلفن در پایین نامه</div>
        <label className="flex items-center gap-2 text-[11px] font-bold text-[#3A241F] cursor-pointer">
          <input type="checkbox" disabled={!value} checked={!!value?.showAddress} onChange={(e) => patch({ showAddress: e.target.checked })} className="accent-amber-600" />
          نمایش نشانی
        </label>
        <input className={field} disabled={!value} value={value?.address ?? defaults.address} onChange={(e) => patch({ address: e.target.value })} placeholder="نشانی شرکت" />
        <label className="flex items-center gap-2 text-[11px] font-bold text-[#3A241F] cursor-pointer">
          <input type="checkbox" disabled={!value} checked={!!value?.showPhone} onChange={(e) => patch({ showPhone: e.target.checked })} className="accent-amber-600" />
          نمایش تلفن
        </label>
        <input className={field} disabled={!value} value={value?.phone ?? defaults.phone} onChange={(e) => patch({ phone: e.target.value })} placeholder="شمارهٔ تلفن" />
        <p className="text-[10px] text-[#8C6F66] leading-5">این خط روی نامه با ماوس یا انگشت جابه‌جا می‌شود، مثل بقیهٔ بخش‌های سربرگ. مقدار پیش‌فرض از اطلاعات شرکت در تنظیمات می‌آید.</p>
      </div>

      {/* filters */}
      <div className="px-4 py-3 border-b border-[#EBDBCE] space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#B8A39C] absolute right-3 top-2.5" />
          <input className={`${field} pr-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="شمارهٔ قالب یا نام (مثلاً ۴۲ یا موج)" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select className={field} value={design} onChange={(e) => setDesign(Number(e.target.value))}>
            <option value={-1}>همهٔ طرح‌ها</option>
            {LETTERHEAD_DESIGNS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <select className={field} value={palette} onChange={(e) => setPalette(Number(e.target.value))}>
            <option value={-1}>همهٔ رنگ‌ها</option>
            {LETTERHEAD_PALETTES.map((p, i) => <option key={p} value={i}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* the 100 templates */}
      <div className="flex-1 overflow-y-auto p-3">
        {list.length === 0 && <div className="text-center text-xs font-bold text-[#8C6F66] py-10">قالبی با این مشخصات پیدا نشد.</div>}
        <div className="grid grid-cols-3 gap-2.5">
          {list.map((l) => {
            const on = value?.id === l.id;
            return (
              <button key={l.id} type="button" onClick={() => pick(l.id)} title={l.name} className={`group text-center cursor-pointer rounded-xl p-1.5 border-2 transition-all ${on ? 'border-amber-500 bg-amber-50 shadow' : 'border-transparent hover:border-[#EBDBCE] hover:bg-[#FAF5F1]'}`}>
                <div className="relative bg-white border border-[#E1D6CC] rounded-md overflow-hidden shadow-sm" style={{ aspectRatio: '210 / 297' }}>
                  <div className="absolute inset-x-0 top-0" dangerouslySetInnerHTML={{ __html: letterheadSvg(l.id, 'top') }} />
                  <div className="absolute inset-x-0 bottom-0" dangerouslySetInnerHTML={{ __html: letterheadSvg(l.id, 'bottom') }} />
                  <div className="absolute inset-x-[14%] top-[26%] space-y-[5px]">
                    {[100, 86, 94, 70, 90, 78, 60].map((w, i) => <div key={i} className="h-[2.5px] rounded bg-[#E7DFD8] mr-auto" style={{ width: `${w}%` }} />)}
                  </div>
                  {on && <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center"><Check className="w-3 h-3" /></span>}
                </div>
                <div className="mt-1 text-[9.5px] font-black text-[#3A241F] leading-4 truncate">{toPersianDigits(l.id)} · {LETTERHEAD_DESIGNS[l.design]}</div>
                <div className="text-[9px] font-bold text-[#8C6F66] leading-4 truncate">{LETTERHEAD_PALETTES[l.palette]}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-2.5 border-t border-[#EBDBCE] flex items-center justify-between gap-2 bg-[#FAF5F1]">
        <span className="text-[11px] font-bold text-[#5A4640]">{value ? `قالب ${toPersianDigits(value.id)} انتخاب شد` : 'هنوز قالبی انتخاب نشده'}</span>
        {value && <button type="button" onClick={() => onChange(null)} className="text-[11px] font-black text-rose-600 hover:underline cursor-pointer">برداشتن سربرگ</button>}
      </div>
    </div>
  );
};
