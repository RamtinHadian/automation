import React, { useMemo, useRef, useState } from 'react';
import { Boxes, Sparkles } from 'lucide-react';
import { WhProduct } from '../../lib/api';
import { fold, searchLine } from '../../lib/searchAll';
import { toPersianDigits } from '../../lib/jalali';

/**
 * The title of an opportunity, matched against the warehouse while the person types: what is in the warehouse is offered (name, code, group, stock) and a pick writes
 * the warehouse's own name and code; what is not there stays exactly as typed and is marked «جدید» (a new item, not in the warehouse).
 */
export const ProductTitleInput: React.FC<{
  value: string;
  products: WhProduct[];
  onChange: (text: string) => void;
  onPick: (p: WhProduct) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  fid?: string;
  extraAttrs?: Record<string, string | boolean>;
}> = ({ value, products, onChange, onPick, onKeyDown, className, placeholder, autoFocus, fid, extraAttrs }) => {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const text = value.trim();
  const hits = useMemo(() => {
    if (!text || products.length === 0) return [];
    // any number or letters typed are looked for ANYWHERE inside the product (its title first, then its code and every other field): «12» finds «لوله ۱۲ اینچ», «وله» finds «لوله»
    const toks = fold(text).split(/\s+/).filter(Boolean);
    const scored: { p: WhProduct; score: number }[] = [];
    for (const p of products) {
      const title = fold(p.title);
      const all = searchLine(p);
      if (!toks.every((t) => all.includes(t))) continue;
      scored.push({ p, score: toks.every((t) => title.includes(t)) ? (title.startsWith(toks[0]) ? 0 : 1) : 2 });
    }
    return scored.sort((x, y) => x.score - y.score).slice(0, 12).map((x) => x.p);
  }, [products, text]);
  const exact = products.find((p) => p.title.trim() === text);
  React.useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Element)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const pick = (p: WhProduct) => {
    onPick(p);
    setOpen(false);
  };
  return (
    <div className="relative" ref={box}>
      <input
        className={`${className || ''} ${text && products.length > 0 ? 'pl-24' : ''}`}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        data-fid={fid}
        {...(extraAttrs || {})}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (open && hits.length > 0) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, hits.length - 1)); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); return; }
            if (e.key === 'Enter' && !exact) { e.preventDefault(); pick(hits[hi] || hits[0]); return; }
            if (e.key === 'Escape') { setOpen(false); return; }
          }
          onKeyDown?.(e);
        }}
      />
      {text && products.length > 0 && (
        <span
          className={`absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black pointer-events-none ${exact ? 'bg-emerald-100 text-emerald-800' : 'bg-violet-100 text-violet-800'}`}
          data-product-badge={exact ? 'warehouse' : 'new'}
        >
          {exact ? <><Boxes className="w-3 h-3" />از انبار</> : <><Sparkles className="w-3 h-3" />جدید</>}
        </span>
      )}
      {open && hits.length > 0 && (
        <div className="absolute right-0 left-0 top-full mt-1 z-40 rounded-2xl border border-[#EBDBCE] bg-white shadow-2xl p-1.5 max-h-72 overflow-y-auto" data-product-suggestions>
          <div className="px-2 pb-1 text-[10px] font-black text-[#8C6F66]">از انبار (با انتخاب، نام و کد کالا از انبار پر می‌شود)</div>
          {hits.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              className={`w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-right cursor-pointer ${i === hi ? 'bg-amber-100' : 'hover:bg-amber-50'}`}
              data-product-hit={p.code}
            >
              <span className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0"><Boxes className="w-4 h-4" /></span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-[12px] font-black text-[#3A241F]">{p.title}</span>
                <span className="block truncate text-[10px] font-bold text-[#8C6F66]" dir="rtl">{[p.code && `کد ${toPersianDigits(p.code)}`, p.group].filter(Boolean).join(' · ')}</span>
              </span>
              {p.kind !== 'service' && <span className="rounded-full bg-[#FAF5F1] border border-[#EBDBCE] px-2 py-0.5 text-[10px] font-black text-[#8C6F66] shrink-0">موجودی {toPersianDigits(p.total)}</span>}
            </button>
          ))}
          {!exact && text && <div className="px-2 pt-1 text-[10px] font-bold text-violet-700">اگر کالای تازه‌ای است، همان‌طور که نوشتید بماند؛ «جدید» علامت می‌خورد.</div>}
        </div>
      )}
    </div>
  );
};
