/**
 * How many pages an uploaded attachment has: a PDF is read for its page objects (the page tree's «/Count» when they are packed away), a picture or a
 * scan is one page. Anything else (Word, Excel…) cannot be counted here and answers null.
 */
export async function countPages(file: File): Promise<number | null> {
  if (file.type.startsWith('image/') && !/tiff?$/i.test(file.type)) return 1;
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return null;
  try {
    const text = new TextDecoder('latin1').decode(new Uint8Array(await file.arrayBuffer()));
    const pages = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
    let count = 0;
    for (const m of text.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)|\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/g)) count = Math.max(count, Number(m[1] || m[2]));
    const n = Math.max(pages, count);
    return n > 0 ? n : null;
  } catch {
    return null;
  }
}
