import React from 'react';
import { PenLine, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { DEFAULT_PARAPH_TEMPLATES } from '../../lib/paraph';

/** «قالب‌های پاراف»: the ready-made paraphs a person can pick when referring an internal letter (a paraph is compulsory on every referral). */
export const ParaphTemplatesCard: React.FC<{ value?: string[]; onChange: (v: string[] | undefined) => void }> = ({ value, onChange }) => {
  const list = value && value.length ? value : DEFAULT_PARAPH_TEMPLATES;
  const custom = !!(value && value.length);
  const set = (l: string[]) => onChange(l);
  return (
    <div className="bg-white p-6 sm:p-7 rounded-3xl border border-[#EBDBCE] shadow-sm space-y-4" data-paraph-templates>
      <div className="flex items-center gap-2.5 text-[#3A241F]">
        <div className="w-9 h-9 rounded-2xl bg-violet-600 text-white flex items-center justify-center shadow-xs"><PenLine className="w-5 h-5" /></div>
        <div className="flex-1">
          <h2 className="font-black text-sm">قالب‌های پاراف مکاتبات داخلی</h2>
          <p className="text-[11px] text-[#8C6F66]">هنگام ارجاع نامه، پاراف واجب است؛ فرد می‌تواند با قلم بنویسد یا یکی از این قالب‌ها را بزند. اینجا قالب‌ها را اضافه، ویرایش یا حذف کنید.</p>
        </div>
      </div>
      <div className="space-y-2">
        {list.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className="flex-1 px-3 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-violet-500 focus:outline-none"
              value={t}
              maxLength={200}
              onChange={(e) => set(list.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button type="button" aria-label="حذف قالب" onClick={() => set(list.filter((_, j) => j !== i))} className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => set([...list, ''])} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black cursor-pointer"><Plus className="w-3.5 h-3.5" />قالب تازه</button>
        {custom && <button type="button" onClick={() => onChange(undefined)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#EBDBCE] text-xs font-black text-[#3A241F] cursor-pointer"><RotateCcw className="w-3.5 h-3.5" />برگرداندن به قالب‌های پیش‌فرض</button>}
        <span className="text-[10.5px] font-medium text-[#8C6F66]">بعد از تغییر، با دکمهٔ «ذخیره» پایین صفحه ثبت می‌شود. قالب‌های خالی نادیده گرفته می‌شوند.</span>
      </div>
    </div>
  );
};
