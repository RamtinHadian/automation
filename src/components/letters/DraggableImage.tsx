import React, { useRef } from 'react';

interface DraggableImageProps {
  src: string;
  alt: string;
  /** Rendered height in px. */
  height: number;
  offset: { x: number; y: number };
  /** When false the image is a plain, non-interactive picture. */
  editable: boolean;
  onOffsetChange: (offset: { x: number; y: number }) => void;
  onHeightChange: (height: number) => void;
  minHeight?: number;
  maxHeight?: number;
  opacityClass?: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A signature/stamp image that can be moved by dragging it and resized by dragging the corner handle.
 * Uses pointer events, so it works with mouse, touch and pen.
 */
export const DraggableImage: React.FC<DraggableImageProps> = ({
  src,
  alt,
  height,
  offset,
  editable,
  onOffsetChange,
  onHeightChange,
  minHeight = 20,
  maxHeight = 600,
  opacityClass = '',
}) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    initX: number;
    initY: number;
    initH: number;
    aspect: number;
  } | null>(null);

  const begin = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (!editable) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const rect = imgRef.current?.getBoundingClientRect();
    drag.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      initX: offset.x,
      initY: offset.y,
      initH: height,
      aspect: rect && rect.height ? rect.width / rect.height : 1,
    };
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.mode === 'move') {
      onOffsetChange({ x: clamp(d.initX + dx, -400, 400), y: clamp(d.initY + dy, -300, 300) });
    } else {
      // Corner handle: grow by whichever axis was dragged further (width change converted to height).
      const grow = Math.abs(dx / d.aspect) > Math.abs(dy) ? dx / d.aspect : dy;
      onHeightChange(clamp(Math.round(d.initH + grow), minHeight, maxHeight));
    }
  };

  const end = () => {
    drag.current = null;
  };

  return (
    <div
      className={`group/img relative inline-block shrink-0 select-none mix-blend-multiply ${opacityClass}`}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        touchAction: editable ? 'none' : undefined,
        cursor: editable ? 'grab' : 'default',
      }}
      onPointerDown={begin('move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onMouseDown={(e) => editable && e.stopPropagation()}
      title={editable ? 'برای جابه‌جایی بکشید؛ برای تغییر اندازه، گوشهٔ نارنجی را بکشید' : undefined}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        style={{ height: `${height}px` }}
        className={`object-contain block max-w-none ${editable ? '' : 'pointer-events-none'}`}
      />
      {editable && (
        <>
          <div className="absolute inset-0 rounded-sm outline outline-2 outline-dashed outline-amber-500 opacity-0 group-hover/img:opacity-100 pointer-events-none" />
          <div
            onPointerDown={begin('resize')}
            style={{ touchAction: 'none' }}
            className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-amber-500 border-2 border-white shadow cursor-nwse-resize"
            title="برای تغییر اندازه بکشید"
          />
        </>
      )}
    </div>
  );
};
