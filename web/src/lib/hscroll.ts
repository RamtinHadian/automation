import type React from 'react';

/** Lets the mouse wheel scroll a sideways-scrolling toolbar (it only scrolls up and down by default). */
export const hwheel = (e: React.WheelEvent<HTMLElement>) => {
  const el = e.currentTarget;
  if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  // in a right-to-left page scrollLeft is 0 at the right end and becomes negative towards the left
  const rtl = getComputedStyle(el).direction === 'rtl';
  el.scrollLeft += rtl ? -e.deltaY : e.deltaY;
};
