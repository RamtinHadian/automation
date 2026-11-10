import { FileTransfer, SystemSettings, User } from '../types';
import { generateOfficialLetterHtml, LetterPrintOverrides } from './pdfLetterGenerator';

/**
 * A signed letter as real files: a PDF and a JPG picture, made on this device from the same sheet that is printed (letterhead, signature and stamp included),
 * so they can be saved or shared from a phone with one tap. The picture libraries are loaded only when somebody asks for a file.
 */

const MM: Record<string, [number, number]> = { A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4], Letterhead: [210, 297] };

const baseName = (t: FileTransfer) => {
  const n = (t.letterNumber ? `نامه-${t.letterNumber}` : t.fileName.replace(/\.[^/.]+$/, '')).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_');
  return n.slice(0, 80) || 'نامه';
};

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
    let pages = Array.from(doc.querySelectorAll<HTMLElement>('.pg-page'));
    if (pages.length === 0) pages = Array.from(doc.querySelectorAll<HTMLElement>('.letter-container'));
    if (pages.length === 0) throw new Error('صفحهٔ نامه ساخته نشد.');
    const { default: html2canvas } = await import('html2canvas');
    const out: HTMLCanvasElement[] = [];
    for (const el of pages) {
      el.style.boxShadow = 'none';
      out.push(await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: 980 }));
    }
    return out;
  } finally {
    frame.remove();
  }
}

const canvasBlob = (c: HTMLCanvasElement, q = 0.92) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('تصویر ساخته نشد.'))), 'image/jpeg', q));

/** The letter as one JPG picture (all pages one under another). */
export async function letterAsJpg(t: FileTransfer, settings: SystemSettings, user?: User, overrides?: LetterPrintOverrides): Promise<{ blob: Blob; name: string }> {
  const pages = await renderPages(t, settings, user, overrides);
  let canvas = pages[0];
  if (pages.length > 1) {
    const gap = 24;
    canvas = document.createElement('canvas');
    canvas.width = Math.max(...pages.map((p) => p.width));
    canvas.height = pages.reduce((s, p) => s + p.height, 0) + gap * (pages.length - 1);
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    let y = 0;
    for (const p of pages) { g.drawImage(p, 0, y); y += p.height + gap; }
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
    pdf.addImage(pages[i].toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, w, h, undefined, 'FAST');
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
