import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, HelpCircle, Trash2 } from 'lucide-react';

/**
 * The «آیا اطمینان دارید؟» window. Every deletion (and every action that cannot be undone) goes through askConfirm():
 *
 *   if (!(await askConfirm('وظیفهٔ «X» حذف شود؟'))) return;
 *
 * It resolves to true when the person confirms and false when they cancel (button, Esc or a click outside).
 */
export interface ConfirmOptions {
  /** red (delete), amber (careful) or blue (ordinary question) */
  tone?: 'danger' | 'warning' | 'info';
  title?: string;
  confirmText?: string;
  cancelText?: string;
}

interface Pending {
  message: string;
  opts: ConfirmOptions;
  resolve: (ok: boolean) => void;
}

let open: ((p: Pending) => void) | null = null;

export function askConfirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  if (!open) return Promise.resolve(window.confirm(message)); // the window is not mounted yet: the browser's own question
  return new Promise((resolve) => open!({ message, opts, resolve }));
}

const TONE = {
  danger: { icon: Trash2, ring: 'bg-rose-100 text-rose-600', head: 'from-rose-500 to-red-600', btn: 'bg-gradient-to-l from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 shadow-rose-600/30', title: 'آیا از حذف اطمینان دارید؟', yes: 'بله، حذف شود' },
  warning: { icon: AlertTriangle, ring: 'bg-amber-100 text-amber-600', head: 'from-amber-400 to-orange-500', btn: 'bg-gradient-to-l from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-amber-600/30', title: 'آیا اطمینان دارید؟', yes: 'بله، انجام شود' },
  info: { icon: HelpCircle, ring: 'bg-sky-100 text-sky-600', head: 'from-sky-400 to-indigo-500', btn: 'bg-gradient-to-l from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 shadow-sky-600/30', title: 'آیا اطمینان دارید؟', yes: 'بله، انجام شود' },
} as const;

/** Mounted once, near the top of the application. */
export const ConfirmHost: React.FC = () => {
  const [queue, setQueue] = useState<Pending[]>([]);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    open = (p) => setQueue((q) => [...q, p]);
    return () => {
      open = null;
    };
  }, []);

  const cur = queue[0];
  const done = useCallback(
    (ok: boolean) => {
      setQueue((q) => {
        q[0]?.resolve(ok);
        return q.slice(1);
      });
    },
    [],
  );

  useEffect(() => {
    if (!cur) return;
    cancelRef.current?.focus(); // the safe answer is the one under the cursor of the keyboard
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        done(false);
      }
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [cur, done]);

  if (!cur) return null;
  const tone = TONE[cur.opts.tone || 'danger'];
  const Icon = tone.icon;
  return createPortal(
    <div
      dir="rtl"
      className="fixed inset-0 z-[2147483200] flex items-center justify-center p-4 bg-[#14061F]/60 backdrop-blur-sm"
      onMouseDown={() => done(false)}
      data-confirm-dialog
    >
      <style>{`@keyframes cfIn{from{opacity:0;transform:translateY(14px) scale(.94)}to{opacity:1;transform:none}}`}</style>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={cur.opts.title || tone.title}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-[1.75rem] bg-white shadow-[0_30px_80px_rgba(0,0,0,.45)] overflow-hidden text-center animate-[cfIn_.22s_ease-out]"
      >
        <div className={`h-1.5 bg-gradient-to-l ${tone.head}`} />
        <div className="px-6 pt-6 pb-5">
          <span className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${tone.ring}`}>
            <Icon className="w-8 h-8" />
          </span>
          <h3 className="mt-4 text-base font-black text-[#3A241F]">{cur.opts.title || tone.title}</h3>
          <p className="mt-2 text-[13px] leading-7 font-semibold text-[#6B5650] whitespace-pre-wrap break-words">{cur.message}</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5 px-5 pb-5">
          <button ref={cancelRef} type="button" onClick={() => done(false)} className="py-3 rounded-2xl border border-[#EBDBCE] bg-[#FAF5F1] text-sm font-black text-[#3A241F] hover:bg-[#F3E8DF] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#8C6F66]/40">
            {cur.opts.cancelText || 'انصراف'}
          </button>
          <button type="button" onClick={() => done(true)} className={`py-3 rounded-2xl text-sm font-black text-white shadow-lg cursor-pointer active:scale-[.98] focus:outline-none focus:ring-2 focus:ring-offset-2 ${tone.btn}`} data-confirm-yes>
            {cur.opts.confirmText || tone.yes}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
