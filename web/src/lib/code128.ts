/**
 * Code 128 (set B) barcode as an SVG string: every thermal / label printer and every shop scanner reads it. No library; the text is the invoice number.
 * Persian digits are turned into ordinary digits first; characters outside the printable ASCII range are dropped.
 */
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const STOP = 106;

export const latinDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** The bar widths (module counts, bar first) of the whole symbol. */
export function code128Widths(text: string): number[] {
  const chars = [...latinDigits(text)].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126);
  const values = chars.map((c) => c.charCodeAt(0) - 32);
  const sum = values.reduce((s, v, i) => s + v * (i + 1), START_B);
  const all = [START_B, ...values, sum % 103, STOP];
  return all.flatMap((v) => PATTERNS[v].split('').map(Number));
}

/** The barcode as an SVG that fills the width it is put in (quiet zone of 10 modules on both sides). */
export function code128Svg(text: string, heightPx = 36): string {
  const w = code128Widths(text);
  const total = w.reduce((s, x) => s + x, 0) + 20;
  let x = 10;
  let bars = '';
  w.forEach((n, i) => {
    if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${n}" height="1" />`;
    x += n;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} 1" preserveAspectRatio="none" style="display:block;width:100%;height:${heightPx}px" shape-rendering="crispEdges" fill="#000">${bars}</svg>`;
}
