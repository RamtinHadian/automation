import React, { useRef, useState } from 'react';

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
  const [active, setActive] = useState(false);

  const down = (e: React.PointerEvent) => {
    if (locked) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('input, textarea, select, button, option, a, [contenteditable="true"], [data-no-drag]')) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ix: offset.x, iy: offset.y };
    setActive(true);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    onChange({ x: clamp(d.ix + (e.clientX - d.sx) / scale, range), y: clamp(d.iy + (e.clientY - d.sy) / scale, range) });
  };
  const up = () => {
    drag.current = null;
    setActive(false);
  };

  const interactive = locked
    ? ''
    : `cursor-grab active:cursor-grabbing hover:outline hover:outline-1 hover:outline-dashed hover:outline-amber-500 hover:bg-amber-50/30 rounded-md ${active ? 'outline outline-2 outline-amber-500 bg-amber-50/40' : ''}`;

  return (
    <div
      dir={dir}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className={`${className} ${interactive}`}
      style={{ ...style, transform: `translate(${offset.x}px, ${offset.y}px)`, touchAction: locked ? undefined : 'none' }}
    >
      {children}
    </div>
  );
};
