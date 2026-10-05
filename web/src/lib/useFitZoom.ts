import { useCallback, useEffect, useState } from 'react';

/**
 * Phones: the letter paper keeps its real design width and is scaled down to fit the screen (like a page viewer),
 * so every element sits exactly where it does on a computer. The person can zoom in to work precisely.
 */
export function useFitZoom(designWidth: number, sidePad = 20, allowWide = false) {
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? document.documentElement.clientWidth : 1024));
  const [userZoom, setUserZoom] = useState(1);

  useEffect(() => {
    const on = () => setVw(document.documentElement.clientWidth);
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);

  const isPhone = vw < 640;
  const fit = isPhone ? Math.min(1, (vw - sidePad) / designWidth) : 1;
  // where asked (the letter editor), big screens use their room: the sheet is drawn larger and the designed positions scale with it
  // two side columns of 300 px (+ gaps) take their room on screens from 1100 px; the sheet fits what is left, never above 1.35
  const reserve = vw >= 1100 ? 664 : 0;
  const wide = allowWide ? Math.max(0.5, Math.min(1.35, (vw - reserve) / designWidth)) : 1;
  const zoom = isPhone ? Math.min(1.6, fit * userZoom) : allowWide ? Math.min(2.5, Math.max(0.4, +(wide * userZoom).toFixed(2))) : 1;

  const zoomIn = useCallback(() => setUserZoom((z) => Math.min(3, +(z + 0.25).toFixed(2))), []);
  const zoomOut = useCallback(() => setUserZoom((z) => Math.max(0.6, +(z - 0.25).toFixed(2))), []);
  const reset = useCallback(() => setUserZoom(1), []);

  return { vw, isPhone, zoom, zoomIn, zoomOut, reset };
}
