import React from 'react';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import { toPersianDigits } from '../../lib/jalali';

/** Zoom buttons for the letter paper on phones. */
export const ZoomBar: React.FC<{ zoom: number; onIn: () => void; onOut: () => void; onFit: () => void }> = ({ zoom, onIn, onOut, onFit }) => (
  <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-[#FAF5F1] border-b border-[#EBDBCE] text-xs shrink-0" dir="rtl">
    <span className="text-[11px] font-black text-[#3A241F]">بزرگ‌نمایی نامه</span>
    <button type="button" onClick={onOut} className="w-8 h-8 rounded-xl bg-white border border-[#EBDBCE] flex items-center justify-center cursor-pointer active:scale-95" title="کوچک‌تر">
      <Minus className="w-4 h-4" />
    </button>
    <span className="min-w-[44px] text-center font-black text-[#6E1B1B]">{toPersianDigits(Math.round(zoom * 100))}٪</span>
    <button type="button" onClick={onIn} className="w-8 h-8 rounded-xl bg-white border border-[#EBDBCE] flex items-center justify-center cursor-pointer active:scale-95" title="بزرگ‌تر">
      <Plus className="w-4 h-4" />
    </button>
    <button type="button" onClick={onFit} className="flex items-center gap-1 px-2.5 h-8 rounded-xl bg-white border border-[#EBDBCE] text-[11px] font-black cursor-pointer active:scale-95" title="متناسب با عرض صفحه">
      <Maximize2 className="w-3.5 h-3.5" />
      تنظیم خودکار
    </button>
  </div>
);
