import { useEffect, useState } from 'react';
import { RATIO } from './PageGuides';

/**
 * Where the printed pages of a letter end, in the pixels of the sheet the writer sees.
 *
 * The letter is laid out exactly as it is printed (the print HTML in a hidden frame), the places where a page ends are found there
 * (every printed page keeps the same top and foot spacers free), and each place is carried over to the sheet on the screen by way of the
 * paragraphs of the letter's body, which are the same in both. Returns null while it is not measured (the caller then shows an estimate).
 */
export function usePrintBreaks(opts: {
  enabled: boolean;
  sheet: React.RefObject<HTMLElement | null>;
  getBody: () => HTMLElement | null;
  makeHtml: () => string;
  paper: keyof typeof RATIO;
  deps: React.DependencyList;
}): number[] | null {
  const [ys, setYs] = useState<number[] | null>(null);
  useEffect(() => {
    if (!opts.enabled) {
      setYs(null);
      return;
    }
    let alive = true;
    let frame: HTMLIFrameElement | null = null;
    const timer = window.setTimeout(async () => {
      try {
        const html = opts.makeHtml();
        frame = document.createElement('iframe');
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:2400px;border:0;visibility:hidden;pointer-events:none';
        document.body.appendChild(frame);
        await new Promise<void>((resolve) => {
          frame!.onload = () => resolve();
          frame!.srcdoc = html;
        });
        const doc = frame.contentDocument;
        if (!doc || !alive) return;
        try {
          await doc.fonts?.ready;
        } catch {
          /* fonts not ready: measured with what there is */
        }
        await new Promise((r) => setTimeout(r, 200));
        const cell = doc.querySelector('.pg-cell') as HTMLElement | null;
        const printBody = doc.querySelector('.content-body') as HTMLElement | null;
        const container = doc.querySelector('.letter-container') as HTMLElement | null;
        const head = doc.querySelector('.pg > thead td') as HTMLElement | null;
        const foot = doc.querySelector('.pg > tfoot td') as HTMLElement | null;
        const sheet = opts.sheet.current;
        const body = opts.getBody();
        if (!cell || !printBody || !container || !head || !foot || !sheet || !body || !alive) {
          setYs(null);
          return;
        }
        const pageH = container.offsetWidth * (RATIO[opts.paper] ?? RATIO.A4);
        const room = pageH - head.offsetHeight - foot.offsetHeight; // the part of the letter one printed page holds
        const cellTop = cell.getBoundingClientRect().top;
        const cellH = cell.getBoundingClientRect().height;
        if (room < 200) {
          setYs(null);
          return;
        }
        // the paragraphs of the body, in the print and on the screen
        const pr = printBody.getBoundingClientRect();
        const pBlocks = Array.from(printBody.children).map((c) => c.getBoundingClientRect());
        const vr = body.getBoundingClientRect();
        const vBlocks = Array.from(body.children).map((c) => c.getBoundingClientRect());
        const sr = sheet.getBoundingClientRect();
        const scale = sr.width / (sheet.offsetWidth || 1) || 1; // the sheet on the screen may be zoomed
        const sameBlocks = pBlocks.length === vBlocks.length && pBlocks.length > 0;
        const out: number[] = [];
        for (let k = 1; k * room < cellH - 2 && k <= 30; k++) {
          const c = cellTop + k * room; // the break in the print (absolute px of the print frame)
          let y: number; // the break on the screen (absolute px)
          if (c < pr.top) {
            y = sr.top + (c - cellTop) * scale + head.offsetHeight * scale; // above the body: the header block
          } else if (c >= pr.bottom) {
            y = vr.bottom + (c - pr.bottom) * scale; // below the body: the signature part keeps its size
          } else if (sameBlocks) {
            const i = pBlocks.findIndex((b) => c >= b.top && c < b.bottom);
            if (i >= 0) y = vBlocks[i].top + ((c - pBlocks[i].top) / Math.max(1, pBlocks[i].height)) * vBlocks[i].height;
            else {
              const next = pBlocks.findIndex((b) => b.top >= c); // between two paragraphs: before the next one
              y = next >= 0 ? vBlocks[next].top : vr.bottom;
            }
          } else {
            y = vr.top + ((c - pr.top) / Math.max(1, pr.height)) * vr.height; // the body as one block
          }
          out.push(Math.round((y - sr.top) / scale));
        }
        if (alive) setYs(out);
      } catch {
        if (alive) setYs(null);
      } finally {
        frame?.remove();
      }
    }, 600);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      frame?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.enabled, opts.paper, ...opts.deps]);
  return ys;
}
