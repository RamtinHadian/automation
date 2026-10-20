import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, X } from 'lucide-react';
import { api } from './api';
import { toPersianDigits } from './jalali';
import type { User } from '../types';

/**
 * Starting a call rings the person's own phone first. When they have several extensions, a small window asks which one to ring:
 *
 *   const r = await placeCall(currentUser, '09121234567');   // 'cancelled' when they close the window
 */
interface Pending {
  exts: string[];
  to: string;
  resolve: (ext: string | null) => void;
}

let open: ((p: Pending) => void) | null = null;

export const extensionsOf = (u: Pick<User, 'extension' | 'extensions'>): string[] => {
  const seen = new Set<string>();
  return [u.extension || '', ...(u.extensions || [])].map((x) => x.trim()).filter((x) => x && !seen.has(x) && !!seen.add(x));
};

/** Resolves to the extension chosen (the only one without asking), or null when the person cancels. */
export const askCallFrom = (exts: string[], to: string): Promise<string | null> => {
  if (exts.length <= 1 || !open) return Promise.resolve(exts[0] || '');
  return new Promise((resolve) => open!({ exts, to, resolve }));
};

/** Asks which extension to ring when there are several, then places the call. Throws like api.voipCall; returns false when cancelled. */
export const placeCall = async (user: Pick<User, 'extension' | 'extensions'>, to: string): Promise<boolean> => {
  const exts = extensionsOf(user);
  const from = await askCallFrom(exts, to);
  if (from === null) return false;
  await api.voipCall(to, exts.length > 1 ? from : undefined);
  return true;
};

export const CallFromHost: React.FC = () => {
  const [queue, setQueue] = useState<Pending[]>([]);
  useEffect(() => {
    open = (p) => setQueue((q) => [...q, p]);
    return () => {
      open = null;
    };
  }, []);
  const cur = queue[0];
  const done = (ext: string | null) => {
    cur?.resolve(ext);
    setQueue((q) => q.slice(1));
  };
  useEffect(() => {
    if (!cur) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(null);
      }
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur]);
  if (!cur) return null;
  return createPortal(
    <div dir="rtl" className="fixed inset-0 z-[2147483200] flex items-center justify-center p-4 bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && done(null)} data-call-from>
      <div role="dialog" aria-modal="true" className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-[#EBDBCE] overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-5 py-4 bg-gradient-to-l from-emerald-500 to-teal-600 text-white">
          <div className="flex items-center gap-2 font-black text-sm">
            <Phone className="w-4 h-4" />
            با کدام داخلی تماس بگیرم؟
          </div>
          <button type="button" onClick={() => done(null)} aria-label="بستن" className="p-1 rounded-lg hover:bg-white/20 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs font-bold text-[#503730] leading-6">
            برای تماس با <span dir="ltr" className="font-black">{toPersianDigits(cur.to)}</span> اول تلفن یکی از داخلی‌های شما زنگ می‌خورد؛ گوشی را که بردارید تماس وصل می‌شود.
          </p>
          <div className="grid gap-2">
            {cur.exts.map((e, i) => (
              <button
                key={e}
                type="button"
                data-call-from-ext={e}
                onClick={() => done(e)}
                className="flex items-center justify-between gap-2 px-4 py-3 rounded-2xl border border-[#EBDBCE] bg-[#FAF5F1] hover:bg-emerald-50 hover:border-emerald-300 text-right cursor-pointer"
              >
                <span className="font-black text-[#3A241F]">داخلی {toPersianDigits(e)}</span>
                <span className="text-[10px] font-bold text-[#8C6F66]">{i === 0 ? 'داخلی اصلی' : 'داخلی دیگر'}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
