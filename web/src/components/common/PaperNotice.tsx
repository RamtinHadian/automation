import React, { useEffect, useRef } from 'react';
import { Check, X } from 'lucide-react';

/**
 * The answer of a public page (saved / not saved), shown in the middle of the screen as a small frosted card with a thin icon: calm and minimal,
 * not a red or green bar at the bottom. A success goes away by itself; a failure stays until it is touched.
 */
export const PaperNotice: React.FC<{ kind: 'ok' | 'err'; text: string; onClose: () => void; sub?: string }> = ({ kind, text, onClose, sub }) => {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (kind !== 'ok') return;
    const t = setTimeout(() => close.current(), 2000);
    return () => clearTimeout(t);
  }, [kind, text]);
  const ok = kind === 'ok';
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-6 bg-white/25 backdrop-blur-[3px] paper-fade" onClick={onClose} role={ok ? 'status' : 'alert'} data-paper-notice>
      <div className="paper-pop w-full max-w-[320px] rounded-[30px] bg-white/90 border border-white shadow-[0_26px_70px_rgba(25,45,35,0.28)] px-7 py-7 text-center" onClick={(e) => e.stopPropagation()}>
        <div className={`mx-auto w-12 h-12 rounded-full border-2 flex items-center justify-center ${ok ? 'border-[#3e574b] text-[#3e574b]' : 'border-[#b0564f] text-[#b0564f]'}`}>
          {ok ? <Check className="w-6 h-6" strokeWidth={2.4} /> : <X className="w-6 h-6" strokeWidth={2.4} />}
        </div>
        <p className="mt-4 text-[15px] font-black text-[#1f2a24] leading-7">{text}</p>
        {sub && <p className="mt-1 text-[12px] font-bold text-[#6b7a72] leading-6">{sub}</p>}
        {!ok && <button type="button" onClick={onClose} className="mt-5 px-8 min-h-[42px] rounded-full border border-[#b9c4be] bg-white text-[13px] font-black text-[#3e574b] touch-manipulation">باشه</button>}
      </div>
    </div>
  );
};
