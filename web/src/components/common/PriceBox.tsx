import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MoneyInput } from './MoneyInput';
import { formatMoney, fromDisplay, toDisplay } from '../../lib/money';

/**
 * The unit-price box of an invoice / proforma row. The prices of the chosen product (retail, wholesale…) live INSIDE the box:
 * the SPACE key picks them one after the other (the last one goes back to the first), a click on the little tab at the end of the box opens the list,
 * and the tab always says which price is in the box. Typing a number by hand still works. Enter moves on to the next field (see lib/enterNext).
 * `value` is the number as shown (rials or tomans, whichever the unit is) and `onChange` gives it back as digits, like MoneyInput;
 * `prices` and `onPick` speak in the stored unit (toman).
 */
export const PriceBox: React.FC<{
  value: string;
  onChange: (digits: string) => void;
  prices: { title: string; amount: number }[];
  onPick: (amountToman: number) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, prices, onPick, placeholder, className }) => {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = fromDisplay(Number(value) || 0);
  const at = prices.findIndex((p) => Math.round(p.amount) === Math.round(current));
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  return (
    <div ref={box} className="relative" data-price-box onKeyDown={(e) => {
      if (e.key === ' ' && prices.length) {
        e.preventDefault(); // a number has no space: the key picks the next price
        onPick(prices[(at + 1) % prices.length].amount);
      } else if (e.key === 'Escape' && open) {
        e.stopPropagation();
        setOpen(false);
      }
    }}>
      <MoneyInput value={value} onChange={onChange} placeholder={placeholder} unit={false} className={`${className || ''} ${prices.length ? 'pr-28' : ''}`} />
      {prices.length > 0 && (
        <button type="button" tabIndex={-1} onClick={() => setOpen((o) => !o)} className={`absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 max-w-[7.2rem] rounded-lg border px-2 py-1 text-[10px] font-black cursor-pointer ${at >= 0 ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white border-[#EBDBCE] text-[#8C6F66]'}`} title="فاصله (Space): قیمت بعدی" data-price-tab>
          <span className="truncate">{at >= 0 ? prices[at].title : `${prices.length} قیمت`}</span>
          <ChevronDown className="w-3 h-3 shrink-0" />
        </button>
      )}
      {open && (
        <div className="absolute z-40 right-0 top-full mt-1 min-w-[12rem] rounded-xl border border-[#EBDBCE] bg-white shadow-xl overflow-hidden" data-price-list>
          {prices.map((p, i) => (
            <button key={p.title + i} type="button" tabIndex={-1} onClick={() => { onPick(p.amount); setOpen(false); }} className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-[11px] font-black cursor-pointer hover:bg-amber-50 ${i === at ? 'bg-amber-100 text-amber-900' : 'text-[#3A241F]'}`}>
              <span>{p.title}</span>
              <span dir="ltr">{formatMoney(p.amount)}</span>
            </button>
          ))}
          <div className="px-3 py-1.5 text-[9.5px] font-bold text-[#8C6F66] border-t border-[#F0E6DC]">با کلید فاصله (Space) هم می‌شود یکی‌یکی انتخاب کرد.</div>
        </div>
      )}
    </div>
  );
};

export { toDisplay };
