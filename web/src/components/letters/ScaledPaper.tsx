import React, { useEffect, useRef, useState } from 'react';

/**
 * On phones the letter paper is drawn at its real design width and scaled down with a transform, inside a box of the
 * scaled size. A transform behaves the same in every browser (Safari included), so nothing inside the paper reflows.
 */
export const ScaledPaper: React.FC<{ enabled: boolean; width: number; zoom: number; children: React.ReactNode }> = ({ enabled, width, zoom, children }) => {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = inner.current;
    if (!enabled || !el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);

  if (!enabled) return <>{children}</>;
  return (
    <div className="mx-auto" style={{ width: width * zoom, height: height * zoom }}>
      <div ref={inner} style={{ width, transform: `scale(${zoom})`, transformOrigin: 'top right' }}>
        {children}
      </div>
    </div>
  );
};
