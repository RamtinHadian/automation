import React, { useRef, useState } from 'react';
import { Move } from 'lucide-react';

// A phone (finger as the pointer): touching a box must still scroll the page, so a box is moved by its own round handle instead of by grabbing it anywhere
const isTouchOnly = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches;

interface MoveBoxProps {
  offset: { x: number; y: number };
  onChange: (offset: { x: number; y: number }) => void;
  /** When locked nothing can be moved by accident. */
  locked?: boolean;
  /** The paper is shown zoomed (phones): pointer movement is divided by this to get paper pixels. */
  scale?: number;
  className?: string;
  style?: React.CSSProperties;
  dir?: 'rtl' | 'ltr';
  /** How far the box may be moved from its own place, in px. */
  range?: number;
  children: React.ReactNode;
}

const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));

/**
 * A part of the letter that can be moved by grabbing it anywhere: a dashed frame shows when the pointer is over it.
 * Typing fields, selects and buttons inside it keep working (they never start a drag). Works with mouse, touch and pen.
 */
export const MoveBox: React.FC<MoveBoxProps> = ({ offset, onChange, locked, scale = 1, className = '', style, dir, range = 600, children }) => {
  const drag = useRef<{ sx: number; sy: number; ix: number; iy: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const live = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef(0);
  const [active, setActive] = useState(false);
  const touch = useRef(isTouchOnly()).current;

  const down = (e: React.PointerEvent) => {
    if (locked) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!(e.target as HTMLElement).closest('[data-move-handle]') && (e.target as HTMLElement).closest('input, textarea, select, button, option, a, [contenteditable="true"], [data-no-drag]')) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ix: offset.x, iy: offset.y };
    setActive(true);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // the whole editor is not drawn again for every movement of the mouse: only this box moves (smoothly, once per frame)
    const next = { x: clamp(d.ix + (e.clientX - d.sx) / scale, range), y: clamp(d.iy + (e.clientY - d.sy) / scale, range) };
    live.current = next;
    if (!frame.current) {
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const l = live.current;
        if (box.current && l) box.current.style.transform = `translate(${l.x}px, ${l.y}px)`;
      });
    }
  };
  const up = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    const l = live.current;
    live.current = null;
    drag.current = null;
    setActive(false);
    if (l) onChange(l);
  };

  const interactive = locked
    ? ''
    : touch
    ? `rounded-md ${active ? 'outline outline-2 outline-amber-500 bg-amber-50/40' : 'outline outline-1 outline-dashed outline-amber-400/70'}`
    : `cursor-grab active:cursor-grabbing hover:outline hover:outline-1 hover:outline-dashed hover:outline-amber-500 hover:bg-amber-50/30 rounded-md ${active ? 'outline outline-2 outline-amber-500 bg-amber-50/40' : ''}`;

  return (
    <div
      ref={box}
      dir={dir}
      onPointerDown={touch ? undefined : down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className={`${className} ${interactive}`}
      style={{ ...style, transform: `translate(${offset.x}px, ${offset.y}px)`, touchAction: locked || touch ? undefined : 'none', willChange: active ? 'transform' : undefined }}
    >
      {children}
      {touch && !locked && (
        <span
          data-move-handle
          data-no-print
          onPointerDown={down}
          className="print:hidden absolute z-30 flex items-center justify-center rounded-full bg-amber-500 text-white shadow-lg cursor-grab active:cursor-grabbing"
          style={{ width: 34 / scale, height: 34 / scale, top: -14 / scale, left: -14 / scale, touchAction: 'none' }}
          aria-label="جابه‌جا کردن این بخش"
        >
          <Move style={{ width: 18 / scale, height: 18 / scale }} />
        </span>
      )}
    </div>
  );
};
