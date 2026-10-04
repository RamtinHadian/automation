import fontUrl from 'vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2?url';
import { usesOfficialForm } from './proformaOfficial';
import { buildProformaHtml, ProformaRenderInput } from './proformaPdf';

// A4 at 96 dpi; the official tax form is landscape
const PORTRAIT = { w: 794, h: 1123 };
const LANDSCAPE = { w: 1123, h: 794 };
const SCALE = 2;

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('خواندن فونت ممکن نشد.'));
    r.readAsDataURL(blob);
  });

/** How tall the invoice really is (many items make it longer than one page). */
async function measure(html: string, PAGE_W: number, PAGE_H: number): Promise<number> {
  const frame = document.createElement('iframe');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W}px;height:${PAGE_H}px;border:0;visibility:hidden`;
  document.body.appendChild(frame);
  try {
    await new Promise<void>((resolve) => {
      frame.onload = () => resolve();
      frame.srcdoc = html;
    });
    const d = frame.contentDocument!;
    await d.fonts.ready;
    const page = d.querySelector('.page') as HTMLElement | null;
    return Math.max(PAGE_H, Math.ceil(page?.scrollHeight || PAGE_H));
  } finally {
    frame.remove();
  }
}

/** Draws the invoice (with its real fonts, stamp and signature) onto one tall canvas by letting the browser render it inside an SVG. */
async function drawInvoice(input: ProformaRenderInput, PAGE_W: number, PAGE_H: number): Promise<HTMLCanvasElement> {
  const html = buildProformaHtml(input, 'preview');
  const height = await measure(html, PAGE_W, PAGE_H);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let css = doc.querySelector('style')?.textContent || '';

  // The font travels inside the picture (an SVG used as an image may not load anything from outside).
  const fontBlob = await (await fetch(fontUrl)).blob();
  const font = await toDataUrl(fontBlob);
  css = css.replace(/url\((['"]?)[^)]*woff2\1\)/g, `url(${font})`);
  css = css.replace(/html,\s*body\s*\{/g, '.pf-root {').replace(/(^|\n)\s*body\s*\{/g, '\n.pf-root {').replace(/:root\s*\{/g, '.pf-root {');

  // An SVG used as an image cannot load anything from outside: every picture (logo, stamp, signature) must travel inside it as data.
  const pics = Array.from(doc.querySelectorAll('.page img'));
  await Promise.all(
    pics.map(async (el) => {
      const src = el.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) return;
      try {
        const res = await fetch(new URL(src, location.href).href);
        if (!res.ok) throw new Error(String(res.status));
        el.setAttribute('src', await toDataUrl(await res.blob()));
      } catch {
        el.remove(); // a picture that cannot be read is left out instead of breaking the whole file
      }
    })
  );

  const page = new XMLSerializer().serializeToString(doc.querySelector('.page')!);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${height}">` +
    `<foreignObject x="0" y="0" width="${PAGE_W}" height="${height}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" class="pf-root" style="width:${PAGE_W}px;height:${height}px;background:#fff">` +
    `<style><![CDATA[${css}]]></style>${page}</div></foreignObject></svg>`;

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('ساخت تصویر پیش‌فاکتور ممکن نشد.'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W * SCALE;
  canvas.height = height * SCALE;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const jpegBytes = (c: HTMLCanvasElement) =>
  new Promise<Uint8Array>((resolve, reject) =>
    c.toBlob(
      async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('ساخت فایل ممکن نشد.'))),
      'image/jpeg',
      0.92
    )
  );

/** A minimal PDF: every A4 page is one JPEG picture of the invoice. */
function pdfFromJpegs(pages: { data: Uint8Array; w: number; h: number }[], landscape: boolean): Blob {
  const MW = landscape ? '841.89' : '595.28';
  const MH = landscape ? '595.28' : '841.89';
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === 'string' ? enc.encode(b) : b;
    parts.push(u);
    length += u.length;
  };
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    if (typeof body === 'string') push(body);
    else body();
    push('\nendobj\n');
  };
  push('%PDF-1.4\n');
  const pageIds = pages.map((_, i) => 3 + i * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach((p, i) => {
    const pid = 3 + i * 3;
    const cid = pid + 1;
    const iid = pid + 2;
    obj(pid, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${MW} ${MH}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>`);
    const content = `q ${MW} 0 0 ${MH} 0 0 cm /Im0 Do Q`;
    obj(cid, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    obj(iid, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.data.length} >>\nstream\n`);
      push(p.data);
      push('\nendstream');
    });
  });
  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts as BlobPart[], { type: 'application/pdf' });
}

/** Builds the proforma as a PDF file in the browser (no server-side browser needed). */
export async function renderProformaPdf(input: ProformaRenderInput): Promise<Blob> {
  const landscape = usesOfficialForm(input);
  const { w: PAGE_W, h: PAGE_H } = landscape ? LANDSCAPE : PORTRAIT;
  const canvas = await drawInvoice(input, PAGE_W, PAGE_H);
  const pageHpx = PAGE_H * SCALE;
  const n = Math.max(1, Math.ceil(canvas.height / pageHpx - 0.02));
  const pages: { data: Uint8Array; w: number; h: number }[] = [];
  for (let i = 0; i < n; i++) {
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = pageHpx;
    const g = slice.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, slice.width, slice.height);
    g.drawImage(canvas, 0, i * pageHpx, canvas.width, pageHpx, 0, 0, slice.width, pageHpx);
    pages.push({ data: await jpegBytes(slice), w: slice.width, h: slice.height });
  }
  return pdfFromJpegs(pages, landscape);
}
