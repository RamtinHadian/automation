import { FileTransfer, SystemSettings, User } from '../types';
import { generateOfficialLetterHtml, LetterPrintOverrides } from './pdfLetterGenerator';

/**
 * A signed letter as real files: a PDF and a JPG picture, made on this device from the same sheet that is printed (letterhead, signature and stamp included),
 * so they can be saved or shared from a phone with one tap. The picture libraries are loaded only when somebody asks for a file.
 */

/** What one picture may hold at most (the phones' browsers refuse bigger canvases): the pages are drawn as sharp as this allows, up to 5 times their size. */
const MAX_PIXELS = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 13_000_000 : 22_000_000;

const MM: Record<string, [number, number]> = { A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4], Letterhead: [210, 297] };

const baseName = (t: FileTransfer) => {
  const n = (t.letterNumber ? `نامه-${t.letterNumber}` : t.fileName.replace(/\.[^/.]+$/, '')).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_');
  return n.slice(0, 80) || 'نامه';
};

/** Waits until every picture of the sheet (the logo, the signature, the stamp) has loaded. */
async function settleImages(doc: Document) {
  const imgs = Array.from(doc.images);
  await Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise<void>((r) => { i.onload = () => r(); i.onerror = () => r(); }))));
  await Promise.all(imgs.map((i) => (i.decode ? i.decode().catch(() => undefined) : Promise.resolve())));
}

/** A picture made smaller step by step (half, half, …): a big scan shrunk in one go loses its thin lines and looks soft; this keeps them sharp. */
function shrinkSharp(src: HTMLImageElement, tw: number, th: number): HTMLCanvasElement {
  let cur = document.createElement('canvas');
  cur.width = src.naturalWidth;
  cur.height = src.naturalHeight;
  cur.getContext('2d')!.drawImage(src, 0, 0);
  while (cur.width / 2 >= tw && cur.height / 2 >= th) {
    const nx = document.createElement('canvas');
    nx.width = Math.max(1, Math.round(cur.width / 2));
    nx.height = Math.max(1, Math.round(cur.height / 2));
    const g = nx.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, nx.width, nx.height);
    cur = nx;
  }
  if (cur.width !== tw || cur.height !== th) {
    const nx = document.createElement('canvas');
    nx.width = Math.max(1, tw);
    nx.height = Math.max(1, th);
    const g = nx.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, nx.width, nx.height);
    cur = nx;
  }
  return cur;
}

/** A small picture made bigger gently (at most twice per step, with the smoothest filter the browser has): the plain one-step enlargement of a small logo shows square blocks. */
function growSmooth(src: HTMLImageElement, tw: number, th: number): HTMLCanvasElement {
  let cur = document.createElement('canvas');
  cur.width = src.naturalWidth;
  cur.height = src.naturalHeight;
  cur.getContext('2d')!.drawImage(src, 0, 0);
  while (cur.width < tw || cur.height < th) {
    const nx = document.createElement('canvas');
    nx.width = Math.min(tw, Math.max(cur.width + 1, Math.round(cur.width * 1.6)));
    nx.height = Math.min(th, Math.max(cur.height + 1, Math.round(cur.height * 1.6)));
    const g = nx.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, nx.width, nx.height);
    cur = nx;
  }
  return cur;
}

/**
 * Prepares the pictures of the sheet (logo, signature, stamp) before they are drawn:
 *  - a big scan is shrunk step by step to the size it will really have in the file (about 5 times its size on the page), so thin lines stay sharp;
 *  - the signature and the stamp are laid on the letter with «mix-blend-mode: multiply» (their white lets the text under them show). The picture maker does not know that mode,
 *    so the white box of the picture would hide the name of the signer under it: the white is made transparent (the colour it had over white stays the same).
 */
async function prepareImages(doc: Document) {
  const win = doc.defaultView;
  if (!win) return;
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    try {
      const nw = img.naturalWidth, nh = img.naturalHeight;
      if (!nw || !nh) continue;
      const multiply = win.getComputedStyle(img).mixBlendMode === 'multiply';
      const vector = /^data:image\/svg|\.svg(\?|$)/i.test(img.currentSrc);
      if (vector && !multiply) continue;
      const r = img.getBoundingClientRect();
      // the size the picture really has on the page (it is fitted inside its box), times 5, never bigger than the picture itself
      const fit = Math.min(r.width / nw, r.height / nh) || 1;
      const want = fit * 5; // how much bigger than itself the picture will be drawn in the file
      const k = Math.min(1, want);
      const tw = Math.max(1, Math.round(nw * k)), th = Math.max(1, Math.round(nh * k));
      // a picture smaller than it will be drawn is enlarged gently by us (at most 4 times, and not past what the file needs); a bigger one is shrunk in steps
      const grow = want > 1.15 ? Math.min(want, 4) : 1;
      const c = k < 0.999 ? shrinkSharp(img, tw, th) : grow > 1.15 ? growSmooth(img, Math.round(nw * grow), Math.round(nh * grow)) : (() => { const x = document.createElement('canvas'); x.width = nw; x.height = nh; x.getContext('2d')!.drawImage(img, 0, 0); return x; })();
      if (!multiply && c.width === nw && c.height === nh) continue; // nothing changed
      if (multiply) {
        const g = c.getContext('2d')!;
        const data = g.getImageData(0, 0, c.width, c.height);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          const a0 = px[i + 3] / 255;
          if (a0 === 0) continue;
          const rr = px[i] * a0 + 255 * (1 - a0), gr = px[i + 1] * a0 + 255 * (1 - a0), bb = px[i + 2] * a0 + 255 * (1 - a0);
          const alpha = 1 - Math.min(rr, gr, bb) / 255;
          if (alpha < 0.004) { px[i + 3] = 0; continue; }
          px[i] = Math.max(0, Math.min(255, (rr - 255 * (1 - alpha)) / alpha));
          px[i + 1] = Math.max(0, Math.min(255, (gr - 255 * (1 - alpha)) / alpha));
          px[i + 2] = Math.max(0, Math.min(255, (bb - 255 * (1 - alpha)) / alpha));
          px[i + 3] = Math.round(alpha * 255);
        }
        g.putImageData(data, 0, 0);
        img.style.mixBlendMode = 'normal';
      }
      img.src = c.toDataURL('image/png');
      try { await img.decode(); } catch { /* it loads anyway */ }
    } catch {
      /* a picture from another site cannot be read: it stays as it was */
    }
  }
}

/**
 * The picture maker (html2canvas) does not keep the proportions of a picture that is drawn with «object-fit: contain» in a box of another shape: a wide logo gets
 * squeezed into the box (or drawn far too big). Each such picture is replaced by a box of the same measured size that shows it as a background, which the maker draws correctly.
 */
function flattenFittedImages(doc: Document) {
  const win = doc.defaultView;
  if (!win) return;
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const cs = win.getComputedStyle(img);
    if (cs.objectFit === 'fill' || !img.currentSrc) continue;
    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const box = doc.createElement('div');
    box.className = img.className;
    box.setAttribute('style', img.getAttribute('style') || '');
    box.style.width = r.width / (win.visualViewport?.scale || 1) + 'px';
    box.style.height = r.height / (win.visualViewport?.scale || 1) + 'px';
    box.style.maxWidth = 'none';
    box.style.minWidth = '0';
    box.style.flexShrink = '0';
    box.style.display = cs.display === 'inline' ? 'inline-block' : cs.display;
    box.style.backgroundImage = `url("${img.currentSrc}")`;
    box.style.backgroundSize = cs.objectFit === 'cover' ? 'cover' : 'contain';
    box.style.backgroundRepeat = 'no-repeat';
    box.style.backgroundPosition = cs.objectPosition || 'center';
    img.replaceWith(box);
  }
}

/** Safari (iPhone, iPad and the Mac one) draws pictures inside the browser's own page-to-image drawing empty: there the older way is used from the start. */
const isWebKitOnly = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
  return ios || (/Safari/.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|Android/.test(ua));
};

/** How the file is drawn: «auto» (the browser's own drawing where it is known to work), «native» (always the browser's own drawing, exactly like the print) or «canvas» (the compatible way). A person can switch it in the download window. */
export type ExportMode = 'auto' | 'native' | 'canvas';
export const getExportMode = (): ExportMode => {
  try {
    const v = localStorage.getItem('letter_export_mode');
    return v === 'native' || v === 'canvas' ? v : 'auto';
  } catch { return 'auto'; }
};
export const setExportMode = (m: ExportMode) => { try { localStorage.setItem('letter_export_mode', m); } catch { /* storage unavailable */ } };

const fontCache = new Map<string, string>();

/** The @font-face rules of the sheet with every font file inlined as data: the browser's own drawing of the page cannot load files from the web. */
async function inlineFontCss(doc: Document): Promise<string> {
  const out: string[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules)) {
      if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
      let css = rule.cssText;
      for (const m of Array.from(css.matchAll(/url\(\s*(?:'([^']+)'|"([^"]+)"|([^)'"\s]+))\s*\)/g))) {
        const url = m[1] || m[2] || m[3];
        if (url.startsWith('data:')) continue;
        let data = fontCache.get(url);
        if (!data) {
          try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const blob = await res.blob();
            data = await new Promise<string>((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => no(fr.error); fr.readAsDataURL(blob); });
            fontCache.set(url, data);
          } catch { continue; }
        }
        css = css.split(m[0]).join(`url("${data}")`);
      }
      out.push(css);
    }
  }
  return out.join(String.fromCharCode(10));
}

const looksEmpty = (c: HTMLCanvasElement) => {
  try {
    const g = c.getContext('2d')!;
    const w = Math.min(c.width, 60), h = Math.min(c.height, 60);
    const d = g.getImageData(0, 0, c.width, c.height);
    const step = Math.max(4, Math.floor(d.data.length / 4 / 4000)) * 4;
    for (let i = 0; i < d.data.length; i += step) if (d.data[i] < 250 || d.data[i + 1] < 250 || d.data[i + 2] < 250) return false;
    void w; void h;
    return true;
  } catch { return false; }
};

/**
 * The best way: the browser draws the page itself (the same engine that prints it), so the logo, the blend of the signature and the stamp, the fonts and every thin line are exactly
 * as in the print. Returns nothing when this browser cannot do it (then the older way below is used).
 */
async function drawNative(pages: HTMLElement[], doc: Document): Promise<HTMLCanvasElement[] | null> {
  try {
    const { toCanvas } = await import('html-to-image');
    const fontEmbedCSS = await inlineFontCss(doc);
    const out: HTMLCanvasElement[] = [];
    for (const el of pages) {
      const r = el.getBoundingClientRect();
      const pixelRatio = Math.max(2, Math.min(5, Math.sqrt(MAX_PIXELS / Math.max(1, r.width * r.height))));
      const opts = { pixelRatio, backgroundColor: '#ffffff', fontEmbedCSS, cacheBust: false, width: Math.round(r.width), height: Math.round(r.height), style: { margin: '0', boxShadow: 'none' } };
      // Safari draws the pictures inside this kind of drawing only from the second or third try on: two warm-up passes first
      if (isWebKitOnly()) { await toCanvas(el, { ...opts, pixelRatio: 1 }); await toCanvas(el, { ...opts, pixelRatio: 1 }); }
      let c = await toCanvas(el, opts);
      // some browsers (Safari) draw this kind of picture empty on the first try
      if (looksEmpty(c)) c = await toCanvas(el, opts);
      if (looksEmpty(c)) return null;
      out.push(c);
    }
    return out;
  } catch {
    return null;
  }
}

/** The pages of the letter drawn as canvases (one per printed page), from a hidden copy of the printable sheet. */
async function renderPages(t: FileTransfer, settings: SystemSettings, user: User | undefined, overrides?: LetterPrintOverrides): Promise<HTMLCanvasElement[]> {
  const html = generateOfficialLetterHtml(t, settings, user, overrides);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;left:-12000px;top:0;width:980px;height:1400px;border:0;opacity:0;pointer-events:none';
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve) => {
      frame.onload = () => resolve();
      frame.srcdoc = html;
    });
    const doc = frame.contentDocument!;
    // the sheet pages itself a moment after loading (the page-by-page view): wait for the pages and the fonts
    for (let i = 0; i < 40 && doc.querySelectorAll('.pg-page').length === 0; i++) await new Promise((r) => setTimeout(r, 150));
    try { await (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready; } catch { /* fonts API not available */ }
    await new Promise((r) => setTimeout(r, 250));
    doc.querySelectorAll('.print-bar').forEach((e) => ((e as HTMLElement).style.display = 'none'));
    await settleImages(doc);
    let pages = Array.from(doc.querySelectorAll<HTMLElement>('.pg-page'));
    if (pages.length === 0) pages = Array.from(doc.querySelectorAll<HTMLElement>('.letter-container'));
    if (pages.length === 0) throw new Error('صفحهٔ نامه ساخته نشد.');
    const mode = getExportMode();
    const native = mode === 'canvas' || (mode === 'auto' && isWebKitOnly()) ? null : await drawNative(pages, doc);
    (window as unknown as { __exportMode?: string }).__exportMode = native ? 'native' : 'canvas';
    if (native) return native;
    // the older way (a picture maker that does not know every style of the sheet): the pictures are prepared first
    await prepareImages(doc);
    flattenFittedImages(doc);
    // the name and the title of the signer are always drawn ABOVE the signature and the stamp pictures: the white box around a scanned picture must never hide them
    doc.querySelectorAll<HTMLElement>('.ceo-signature-block > div').forEach((el) => {
      if (el.querySelector('.ceo-name, .ceo-title')) { el.style.position = 'relative'; el.style.zIndex = '30'; }
    });
    const { default: html2canvas } = await import('html2canvas');
    const out: HTMLCanvasElement[] = [];
    for (const el of pages) {
      el.style.boxShadow = 'none';
      const r = el.getBoundingClientRect();
      const scale = Math.max(2, Math.min(5, Math.sqrt(MAX_PIXELS / Math.max(1, r.width * r.height))));
      // The ready-made letterheads draw their top and bottom bands as an SVG background; the picture maker squeezes and crops that. The bands are taken out of the page here and drawn
      // by the browser itself underneath the page afterwards (the logo and the text stay on top of them, as on the print).
      const bands: { x: number; y: number; w: number; h: number; url: string }[] = [];
      for (const band of Array.from(el.querySelectorAll<HTMLElement>('.lh-band'))) {
        const m = /url\(["']?(.*?)["']?\)/.exec(getComputedStyle(band).backgroundImage || '');
        const b = band.getBoundingClientRect();
        if (m && m[1] && b.width > 0 && b.height > 0) {
          bands.push({ x: b.left - r.left, y: b.top - r.top, w: b.width, h: b.height, url: m[1] });
          band.style.backgroundImage = 'none';
        }
      }
      // a white page or white block would hide the bands that are drawn underneath afterwards
      if (bands.length > 0) {
        [el, ...Array.from(el.querySelectorAll<HTMLElement>('*'))].forEach((n) => {
          const bg = getComputedStyle(n).backgroundColor;
          if (bg === 'rgb(255, 255, 255)' || bg === '#ffffff') n.style.backgroundColor = 'transparent';
        });
      }
      const top = await html2canvas(el, { scale, backgroundColor: null, useCORS: true, logging: false, windowWidth: 980 });
      if (bands.length === 0) {
        const flat = document.createElement('canvas');
        flat.width = top.width;
        flat.height = top.height;
        const fg = flat.getContext('2d')!;
        fg.fillStyle = '#ffffff';
        fg.fillRect(0, 0, flat.width, flat.height);
        fg.drawImage(top, 0, 0);
        out.push(flat);
        continue;
      }
      const page = document.createElement('canvas');
      page.width = top.width;
      page.height = top.height;
      const g = page.getContext('2d')!;
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, page.width, page.height);
      const k = top.width / Math.max(1, r.width);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      for (const b of bands) {
        try {
          const img = new Image();
          img.src = b.url;
          await img.decode();
          g.drawImage(img, b.x * k, b.y * k, b.w * k, b.h * k);
        } catch { /* a band that cannot be drawn is left out */ }
      }
      g.drawImage(top, 0, 0);
      out.push(page);
    }
    return out;
  } finally {
    frame.remove();
  }
}

const canvasBlob = (c: HTMLCanvasElement, q = 0.95) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('تصویر ساخته نشد.'))), 'image/jpeg', q));

/** The letter as one JPG picture (all pages one under another). */
export async function letterAsJpg(t: FileTransfer, settings: SystemSettings, user?: User, overrides?: LetterPrintOverrides): Promise<{ blob: Blob; name: string }> {
  const pages = await renderPages(t, settings, user, overrides);
  let canvas = pages[0];
  if (pages.length > 1) {
    const gap = 24;
    const fullW = Math.max(...pages.map((p) => p.width));
    const fullH = pages.reduce((s, p) => s + p.height, 0) + gap * (pages.length - 1);
    const k = Math.min(1, Math.sqrt(16_000_000 / (fullW * fullH)));
    canvas = document.createElement('canvas');
    canvas.width = Math.round(fullW * k);
    canvas.height = Math.round(fullH * k);
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    let y = 0;
    for (const p of pages) { g.drawImage(p, 0, y * k, p.width * k, p.height * k); y += p.height + gap; }
  }
  return { blob: await canvasBlob(canvas), name: baseName(t) + '.jpg' };
}

/** The letter as a PDF file, one picture per page on the paper size of the letter. */
export async function letterAsPdf(t: FileTransfer, settings: SystemSettings, user?: User, overrides?: LetterPrintOverrides): Promise<{ blob: Blob; name: string }> {
  const pages = await renderPages(t, settings, user, overrides);
  const [w, h] = MM[t.pageSize || 'A4'] || MM.A4;
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: [w, h], orientation: 'portrait', compress: true });
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage([w, h], 'portrait');
    pdf.addImage(pages[i].toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, w, h, undefined, 'FAST');
  }
  return { blob: pdf.output('blob'), name: baseName(t) + '.pdf' };
}

/** Saves a file: on a phone the share sheet (save to Files / Photos, send in a messenger) when it is there, otherwise the browser's normal download. */
export async function saveFile(blob: Blob, name: string, preferShare = true): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], name, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean; share?: (d: unknown) => Promise<void> };
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  if (preferShare && touch && nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared'; // the person closed the sheet
      /* otherwise fall through to a plain download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
  return 'downloaded';
}
