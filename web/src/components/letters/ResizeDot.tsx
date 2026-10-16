import React, { useRef } from 'react';

/**
 * The orange corner dot of a part of the letter (logo, organisation text): drag it to make the part bigger or smaller,
 * like the signature. `onGrow` receives how many paper pixels the pointer moved since the drag began, positive = bigger.
 * The dot sits at the bottom-left corner of its parent, so dragging down and to the left enlarges.
 */
export const ResizeDot: React.FC<{ onStart: () => void; onGrow: (px: number) => void; scale?: number; locked?: boolean; title?: string }> = ({ onStart, onGrow, scale = 1, locked, title }) => {
  const start = useRef<{ x: number; y: number } | null>(null);
  if (locked) return null;
  return (
    <div
      role="slider"
      aria-label={title}
      title={title || 'برای تغییر اندازه بکشید'}
      style={{ touchAction: 'none' }}
      className="absolute -bottom-2 -left-2 w-4 h-4 rounded-full bg-amber-500 border-2 border-white shadow cursor-nesw-resize z-20"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY };
        onStart();
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s) return;
        onGrow(((s.x - e.clientX) + (e.clientY - s.y)) / 2 / scale);
      }}
      onPointerUp={() => { start.current = null; }}
      onPointerCancel={() => { start.current = null; }}
    />
  );
};
