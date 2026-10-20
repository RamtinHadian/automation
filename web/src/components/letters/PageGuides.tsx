import React, { useEffect, useState } from 'react';
import { toPersianDigits } from '../../lib/jalali';

/**
 * Dashed guide lines on a letter sheet that show where a page ends, so that the writer sees which words go to the second page
 * before printing. It is drawn inside the (position: relative) sheet; `targetRef` is that sheet.
 *
 * It follows how the letter is printed (lib/pdfLetterGenerator): a page is as tall as the sheet is wide times the proportions of the
 * paper, and every printed page keeps the top spacer (`padTop`) and the foot spacer (`padBottom + footH`: the letterhead's bottom, the
 * address line, the note) free. So a page holds `page - padTop - padBottom - footH` of the letter, and the k-th break is at padTop + k * that.
 */
export const RATIO = { A4: 296 / 210, A5: 209 / 148, Letter: 278.4 / 215.9 } as const;

export interface PageSpacers {
  padTop: number;
  padBottom: number;
  footH: number;
}

export const PageGuides: React.FC<{ targetRef: React.RefObject<HTMLElement | null>; paper?: keyof typeof RATIO; spacers?: PageSpacers; /** the measured places (px from the top of the sheet); when given, they are used instead of the estimate */ ys?: number[] | null }> = ({ targetRef, paper = 'A4', spacers = { padTop: 40, padBottom: 40, footH: 6 }, ys }) => {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;
    const read = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [targetRef]);

  if (ys) return <Lines ys={ys} />;
  const pageH = size.w * (RATIO[paper] ?? RATIO.A4);
  const room = pageH - spacers.padTop - spacers.padBottom - spacers.footH; // what one printed page holds of the letter
  if (!pageH || room < 200) return null;
  const firstBreak = spacers.padTop + room;
  if (size.h <= firstBreak + spacers.padBottom + spacers.footH - 4) return null; // the letter fits on one page: nothing to show
  const breaks = Math.min(20, Math.floor((size.h - spacers.padTop - spacers.padBottom - spacers.footH - 4) / room));
  const page = room;
  return <Lines ys={Array.from({ length: breaks }, (_, i) => Math.round(spacers.padTop + page * (i + 1)))} />;
};

const Lines: React.FC<{ ys: number[] }> = ({ ys }) => {
  if (ys.length === 0) return null;
  return (
    <div dir="rtl" className="absolute inset-0 pointer-events-none z-30 print:hidden" aria-hidden data-page-guides>
      {ys.map((y, i) => {
        const n = i + 1;
        return (
          <div key={n} className="absolute inset-x-0" style={{ top: y }} data-page-break>
            <div className="border-t-2 border-dashed border-sky-500/80" />
            <div className="absolute -top-3 left-3 flex items-center gap-1.5 rounded-full bg-sky-600 text-white text-[10px] font-black px-2.5 py-0.5 shadow">
              <span>پایان صفحه {toPersianDigits(n)}</span>
              <span className="opacity-80">· ادامهٔ نامه در صفحهٔ {toPersianDigits(n + 1)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
