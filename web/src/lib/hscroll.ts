import type React from 'react';

/** Lets the mouse wheel scroll a sideways-scrolling toolbar (it only scrolls up and down by default). */
export const hwheel = (e: React.WheelEvent<HTMLElement>) => {
  const el = e.currentTarget;
  if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
};
