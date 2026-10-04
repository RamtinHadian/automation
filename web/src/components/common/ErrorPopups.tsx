import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { installGlobalErrorHandlers, subscribeErrors } from '../../lib/errorBus';

interface Item { id: number; msg: string }
let seq = 0;

/** Red error pop-ups at the top of the screen, above every window and dialog; they stay until closed (or 12 s). */
export const ErrorPopups: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    installGlobalErrorHandlers();
    return subscribeErrors((msg) => {
      const id = ++seq;
      setItems((p) => [...p.filter((x) => x.msg !== msg), { id, msg }].slice(-4));
      setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), 12000);
    });
  }, []);
  if (!items.length) return null;
  return (
    <div className="fixed top-3 inset-x-0 z-[9999] flex flex-col items-center gap-2 px-3 pointer-events-none" dir="rtl" role="alert" data-error-popups>
      {items.map((i) => (
        <div key={i.id} className="pointer-events-auto w-full max-w-lg flex items-start gap-3 bg-red-600 text-white rounded-2xl shadow-2xl border-2 border-red-300 px-4 py-3 text-sm font-black leading-7">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-1" />
          <span className="flex-1 break-words">{i.msg}</span>
          <button type="button" aria-label="بستن" onClick={() => setItems((p) => p.filter((x) => x.id !== i.id))} className="p-1 rounded-lg hover:bg-red-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
