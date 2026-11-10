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

/**
 * The signature and the stamp are laid on the letter with «mix-blend-mode: multiply» (their white background lets the text under them show). The picture maker does not know
 * that mode, so the white box of the picture would hide the name of the signer under it. Each such picture is turned into a picture whose white is transparent (the colour it
 * had over white stays the same), so it can be drawn normally.
 */
function unmultiplyImages(doc: Document) {
  const win = doc.defaultView;
  if (!win) return;
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    if (win.getComputedStyle(img).mixBlendMode !== 'multiply') continue;
    try {
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) continue;
      const k = Math.min(1, 1800 / Math.max(w, h));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k));
      c.height = Math.max(1, Math.round(h * k));
      const g = c.getContext('2d');
      if (!g) continue;
      g.drawImage(img, 0, 0, c.width, c.height);
      const data = g.getImageData(0, 0, c.width, c.height);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const a0 = px[i + 3] / 255;
        if (a0 === 0) continue;
        const r = px[i] * a0 + 255 * (1 - a0), gr = px[i + 1] * a0 + 255 * (1 - a0), b = px[i + 2] * a0 + 255 * (1 - a0);
        const alpha = 1 - Math.min(r, gr, b) / 255;
        if (alpha < 0.004) { px[i + 3] = 0; continue; }
        px[i] = Math.max(0, Math.min(255, (r - 255 * (1 - alpha)) / alpha));
        px[i + 1] = Math.max(0, Math.min(255, (gr - 255 * (1 - alpha)) / alpha));
        px[i + 2] = Math.max(0, Math.min(255, (b - 255 * (1 - alpha)) / alpha));
        px[i + 3] = Math.round(alpha * 255);
      }
      g.putImageData(data, 0, 0);
      img.src = c.toDataURL('image/png');
      img.style.mixBlendMode = 'normal';
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
    unmultiplyImages(doc);
    flattenFittedImages(doc);
    // the name and the title of the signer are always drawn ABOVE the signature and the stamp pictures: the white box around a scanned picture must never hide them
    doc.querySelectorAll<HTMLElement>('.ceo-signature-block > div').forEach((el) => {
      if (el.querySelector('.ceo-name, .ceo-title')) { el.style.position = 'relative'; el.style.zIndex = '30'; }
    });
    let pages = Array.from(doc.querySelectorAll<HTMLElement>('.pg-page'));
    if (pages.length === 0) pages = Array.from(doc.querySelectorAll<HTMLElement>('.letter-container'));
    if (pages.length === 0) throw new Error('صفحهٔ نامه ساخته نشد.');
    const { default: html2canvas } = await import('html2canvas');
    const out: HTMLCanvasElement[] = [];
    for (const el of pages) {
      el.style.boxShadow = 'none';
      const r = el.getBoundingClientRect();
      const scale = Math.max(2, Math.min(5, Math.sqrt(MAX_PIXELS / Math.max(1, r.width * r.height))));
      out.push(await html2canvas(el, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: 980 }));
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
