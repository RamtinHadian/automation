import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Calculator as CalcIcon, History, X } from 'lucide-react';

// A pocket calculator in the style of a phone's: dark body, round keys, orange operators. It opens from the button next to the phone button,
// floats above every page, can be dragged by its top part (mouse, finger or pen) and remembers where it was left.

const store = {
  open: false,
  subs: new Set<() => void>(),
  set(v: boolean) {
    this.open = v;
    this.subs.forEach((f) => f());
  },
};
const useOpen = () =>
  useSyncExternalStore(
    (cb) => {
      store.subs.add(cb);
      return () => store.subs.delete(cb);
    },
    () => store.open,
  );

const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (s: string) => s.replace(/\d/g, (d) => FA[Number(d)]);

/** 1234567.5 -> ۱٬۲۳۴٬۵۶۷٫۵ (the number as typed: keeps a trailing point and zeros). */
const show = (raw: string) => {
  if (raw === 'خطا') return raw;
  const neg = raw.startsWith('-');
  const [i, d] = raw.replace('-', '').split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return fa((neg ? '-' : '') + grouped) + (d !== undefined ? '٫' + fa(d) : '');
};

const fmt = (n: number) => {
  if (!isFinite(n)) return 'خطا';
  let s = String(+n.toPrecision(12));
  if (/e/i.test(s)) s = n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 8 });
  return s;
};

type Tok = number | '+' | '-' | '×' | '÷';
const calc = (toks: Tok[]): number => {
  // × and ÷ first, then + and −
  const a: Tok[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === '×' || t === '÷') {
      const l = a.pop() as number;
      const r = toks[++i] as number;
      a.push(t === '×' ? l * r : l / r);
    } else a.push(t);
  }
  let v = a[0] as number;
  for (let i = 1; i < a.length; i += 2) v = a[i] === '+' ? v + (a[i + 1] as number) : v - (a[i + 1] as number);
  return v;
};

const KEY = 'hm_calc_pos_v1';
const W = 300;

export const CalculatorHost: React.FC = () => {
  const open = useOpen();
  const [toks, setToks] = useState<Tok[]>([]);
  const [cur, setCur] = useState('0');
  const [fresh, setFresh] = useState(false); // the next digit starts a new number (after = or an operator)
  const [history, setHistory] = useState<string[]>([]);
  const [showHist, setShowHist] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (p && typeof p.x === 'number' && typeof p.y === 'number') return p;
    } catch {
      /* no saved place */
    }
    return { x: Math.max(8, (typeof window !== 'undefined' ? window.innerWidth : 800) - W - 24), y: 96 };
  });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const clamp = useCallback((x: number, y: number) => {
    const h = box.current?.offsetHeight || 460;
    return { x: Math.min(Math.max(4, x), Math.max(4, window.innerWidth - W - 4)), y: Math.min(Math.max(4, y), Math.max(4, window.innerHeight - Math.min(h, 120))) };
  }, []);
  useEffect(() => {
    if (!open) return;
    const on = () => setPos((p) => clamp(p.x, p.y));
    on();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [open, clamp]);

  const digit = (d: string) => {
    if (cur === 'خطا') return;
    if (fresh) {
      setCur(d === '.' ? '0.' : d);
      setFresh(false);
      return;
    }
    if (d === '.') return !cur.includes('.') && setCur(cur + '.');
    if (cur.replace(/[-.]/g, '').length >= 14) return;
    setCur(cur === '0' ? d : cur === '-0' ? '-' + d : cur + d);
  };
  const op = (o: '+' | '-' | '×' | '÷') => {
    if (cur === 'خطا') return;
    if (fresh && toks.length && typeof toks[toks.length - 1] === 'string') {
      setToks([...toks.slice(0, -1), o]);
      return;
    }
    setToks([...toks, parseFloat(cur), o]);
    setFresh(true);
  };
  const equals = () => {
    if (cur === 'خطا' || !toks.length || (fresh && typeof toks[toks.length - 1] === 'string' && toks.length < 2)) return;
    const all = fresh && typeof toks[toks.length - 1] === 'string' ? toks.slice(0, -1) : [...toks, parseFloat(cur)];
    const r = calc(all as Tok[]);
    const line = fa(all.map((t) => (typeof t === 'number' ? fmt(t) : t)).join(' ')) + ' = ' + show(fmt(r));
    setHistory((h) => [line, ...h].slice(0, 20));
    setToks([]);
    setCur(fmt(r));
    setFresh(true);
  };
  const clear = () => {
    setToks([]);
    setCur('0');
    setFresh(false);
  };
  const sign = () => cur !== 'خطا' && cur !== '0' && setCur(cur.startsWith('-') ? cur.slice(1) : '-' + cur);
  const percent = () => cur !== 'خطا' && (setCur(fmt(parseFloat(cur) / 100)), setFresh(true));
  const back = () => !fresh && cur !== 'خطا' && setCur(cur.length <= 1 || (cur.length === 2 && cur.startsWith('-')) ? '0' : cur.slice(0, -1));

  // the keyboard works while the calculator is open and no field is being typed in
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = e.key.replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)));
      if (/^[0-9]$/.test(k)) digit(k);
      else if (k === '.') digit('.');
      else if (k === '+' || k === '-') op(k);
      else if (k === '*') op('×');
      else if (k === '/') op('÷');
      else if (k === 'Enter' || k === '=') equals();
      else if (k === 'Backspace') back();
      else if (k === 'Escape') store.set(false);
      else if (k === '%') percent();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  if (!open) return null;

  const expr = fa(toks.map((t) => (typeof t === 'number' ? fmt(t) : t)).join(' ') + (fresh || !toks.length ? '' : ' ' + cur));
  const startDrag = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (drag.current) setPos(clamp(e.clientX - drag.current.dx, e.clientY - drag.current.dy));
  };
  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(pos));
    } catch {
      /* the place is not remembered */
    }
  };

  const key = (label: React.ReactNode, onClick: () => void, kind: 'num' | 'fn' | 'op' = 'num', wide = false, active = false, aria?: string) => (
    <button
      type="button"
      aria-label={aria}
      onClick={onClick}
      className={`${wide ? 'col-span-2 justify-start pr-6' : ''} h-[58px] rounded-full flex items-center justify-center text-[22px] font-medium select-none active:brightness-125 active:scale-95 transition-all cursor-pointer ${
        kind === 'op'
          ? active ? 'bg-white text-orange-500' : 'bg-orange-500 text-white'
          : kind === 'fn' ? 'bg-neutral-400 text-black' : 'bg-neutral-700 text-white'
      }`}
    >
      {label}
    </button>
  );
  const lastOp = fresh && toks.length ? toks[toks.length - 1] : null;

  return (
    <div
      ref={box}
      dir="ltr"
      style={{ left: pos.x, top: pos.y, width: W, touchAction: 'none' }}
      className="fixed z-[400] rounded-[34px] bg-black text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)] border border-white/10 p-3 pb-4 font-sans"
      role="dialog"
      aria-label="ماشین‌حساب"
    >
      <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className="flex items-center justify-between px-1 pb-1 cursor-grab active:cursor-grabbing">
        <button type="button" onClick={() => setShowHist((v) => !v)} aria-label="تاریخچه" className="w-9 h-9 rounded-full bg-neutral-700 hover:bg-neutral-600 flex items-center justify-center cursor-pointer">
          <History className="w-4 h-4" />
        </button>
        <span className="w-10 h-1.5 rounded-full bg-white/25" aria-hidden />
        <button type="button" onClick={() => store.set(false)} aria-label="بستن" className="w-9 h-9 rounded-full bg-neutral-700 hover:bg-rose-600 flex items-center justify-center cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      {showHist ? (
        <div className="h-[110px] overflow-y-auto px-2 text-right text-xs text-white/70 space-y-1.5" dir="rtl">
          {history.length === 0 && <div className="text-white/40 pt-8 text-center">هنوز محاسبه‌ای نشده است.</div>}
          {history.map((h, i) => (
            <button key={i} type="button" onClick={() => { setCur(h.split(' = ')[1].replace(/٬/g, '').replace(/٫/g, '.').replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))); setFresh(true); setShowHist(false); }} className="block w-full text-right hover:text-white cursor-pointer">
              {h}
            </button>
          ))}
        </div>
      ) : (
        <div className="h-[110px] px-3 flex flex-col justify-end items-end overflow-hidden" dir="ltr">
          <div className="text-[15px] text-white/55 h-6 truncate max-w-full" dir="ltr">{expr}</div>
          <div className="font-light leading-none truncate max-w-full" style={{ fontSize: cur.length > 11 ? 34 : cur.length > 8 ? 44 : 56 }} dir="ltr" data-calc-display>
            {show(cur)}
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2.5 mt-2">
        {key(cur === '0' && !toks.length ? 'C' : 'C', clear, 'fn', false, false, 'پاک‌کردن')}
        {key('±', sign, 'fn', false, false, 'تغییر علامت')}
        {key('٪', percent, 'fn', false, false, 'درصد')}
        {key('÷', () => op('÷'), 'op', false, lastOp === '÷')}
        {['7', '8', '9'].map((d) => <React.Fragment key={d}>{key(fa(d), () => digit(d))}</React.Fragment>)}
        {key('×', () => op('×'), 'op', false, lastOp === '×')}
        {['4', '5', '6'].map((d) => <React.Fragment key={d}>{key(fa(d), () => digit(d))}</React.Fragment>)}
        {key('−', () => op('-'), 'op', false, lastOp === '-')}
        {['1', '2', '3'].map((d) => <React.Fragment key={d}>{key(fa(d), () => digit(d))}</React.Fragment>)}
        {key('+', () => op('+'), 'op', false, lastOp === '+')}
        {key(fa('0'), () => digit('0'), 'num', true)}
        {key('٫', () => digit('.'))}
        {key('=', equals, 'op')}
      </div>
    </div>
  );
};

/** The round button that opens and closes the calculator (it sits beside the phone button in the page headers). */
export const CalculatorButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const open = useOpen();
  return (
    <button
      type="button"
      onClick={() => store.set(!open)}
      title="ماشین‌حساب"
      aria-label="ماشین‌حساب"
      aria-pressed={open}
      className={`${className} ${open ? 'ring-2 ring-orange-400' : ''}`}
    >
      <CalcIcon className="w-4 h-4" />
    </button>
  );
};
