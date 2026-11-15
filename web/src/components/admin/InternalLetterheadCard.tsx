import React, { useState } from 'react';
import { ImageIcon, Trash2 } from 'lucide-react';
import { LetterheadChoice, letterheadSvg } from '../../lib/letterheads';
import { LetterheadPanel } from '../letters/LetterheadPanel';

/** «سربرگ مکاتبات داخلی»: the letterhead printed on internal letters (the same ready-made designs and own uploads as the official letters), or none. */
export const InternalLetterheadCard: React.FC<{ value?: LetterheadChoice | null; onChange: (v: LetterheadChoice | null) => void; defaults: { address: string; phone: string; website: string } }> = ({ value, onChange, defaults }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white p-6 sm:p-7 rounded-3xl border border-[#EBDBCE] shadow-sm space-y-4" data-internal-letterhead>
      <div className="flex items-center gap-2.5 text-[#3A241F]">
        <div className="w-9 h-9 rounded-2xl bg-[#6E1B1B] text-white flex items-center justify-center shadow-xs"><ImageIcon className="w-5 h-5" /></div>
        <div>
          <h2 className="font-black text-sm">سربرگ مکاتبات داخلی</h2>
          <p className="text-[11px] text-[#8C6F66]">سربرگی که روی نامه‌های داخلی چاپ و در PDF می‌آید. اگر چیزی انتخاب نشود نامه‌ها بدون سربرگ‌اند؛ هر کس هنگام دیدن نامه هم می‌تواند آن را خاموش کند.</p>
        </div>
      </div>
      <div className="rounded-2xl border border-dashed border-[#C98B6A] bg-[#FDFAF7] p-3 min-h-[64px] flex items-center justify-center overflow-hidden">
        {value ? (
          value.image ? <img src={value.image} alt="سربرگ" className="max-h-28 object-contain" /> : <div className="w-full" dangerouslySetInnerHTML={{ __html: letterheadSvg(value.id, 'top') }} />
        ) : (
          <span className="text-[11px] font-bold text-[#8C6F66]">سربرگی انتخاب نشده (نامه‌های داخلی بدون سربرگ)</span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => setOpen(true)} className="px-4 py-2 rounded-xl bg-[#6E1B1B] hover:bg-[#D34A32] text-white text-xs font-black cursor-pointer">{value ? 'تغییر سربرگ' : 'تعریف سربرگ'}</button>
        {value && <button type="button" onClick={() => onChange(null)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 text-rose-700 text-xs font-black cursor-pointer"><Trash2 className="w-3.5 h-3.5" />بدون سربرگ</button>}
        <span className="text-[10.5px] font-medium text-[#8C6F66]">بعد از انتخاب، با دکمهٔ «ذخیره» پایین صفحه ثبت می‌شود.</span>
      </div>
      {open && <LetterheadPanel value={value || null} onChange={onChange} defaults={defaults} onClose={() => setOpen(false)} />}
    </div>
  );
};
