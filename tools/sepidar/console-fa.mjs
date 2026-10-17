// The Windows console (cmd) does not join Persian letters or write them right to left, so every Persian sentence shows up broken and reversed.
// This file fixes that for everything the program prints: it joins the letters (presentation forms) and puts the words in visual order.
// Switch it off with:  set HM_NOFA=1

// letter -> [isolated, final, initial, medial]; letters that do not join to the next one have only the first two
const F = {
  'ا': [0xfe8d, 0xfe8e], 'آ': [0xfe81, 0xfe82], 'ب': [0xfe8f, 0xfe90, 0xfe91, 0xfe92], 'پ': [0xfb56, 0xfb57, 0xfb58, 0xfb59],
  'ت': [0xfe95, 0xfe96, 0xfe97, 0xfe98], 'ث': [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c], 'ج': [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0], 'چ': [0xfb7a, 0xfb7b, 0xfb7c, 0xfb7d],
  'ح': [0xfea1, 0xfea2, 0xfea3, 0xfea4], 'خ': [0xfea5, 0xfea6, 0xfea7, 0xfea8], 'د': [0xfea9, 0xfeaa], 'ذ': [0xfeab, 0xfeac], 'ر': [0xfead, 0xfeae],
  'ز': [0xfeaf, 0xfeb0], 'ژ': [0xfb8a, 0xfb8b], 'س': [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4], 'ش': [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8],
  'ص': [0xfeb9, 0xfeba, 0xfebb, 0xfebc], 'ض': [0xfebd, 0xfebe, 0xfebf, 0xfec0], 'ط': [0xfec1, 0xfec2, 0xfec3, 0xfec4], 'ظ': [0xfec5, 0xfec6, 0xfec7, 0xfec8],
  'ع': [0xfec9, 0xfeca, 0xfecb, 0xfecc], 'غ': [0xfecd, 0xfece, 0xfecf, 0xfed0], 'ف': [0xfed1, 0xfed2, 0xfed3, 0xfed4], 'ق': [0xfed5, 0xfed6, 0xfed7, 0xfed8],
  'ک': [0xfb8e, 0xfb8f, 0xfb90, 0xfb91], 'گ': [0xfb92, 0xfb93, 0xfb94, 0xfb95], 'ل': [0xfedd, 0xfede, 0xfedf, 0xfee0], 'م': [0xfee1, 0xfee2, 0xfee3, 0xfee4],
  'ن': [0xfee5, 0xfee6, 0xfee7, 0xfee8], 'ه': [0xfee9, 0xfeea, 0xfeeb, 0xfeec], 'و': [0xfeed, 0xfeee], 'ی': [0xfbfc, 0xfbfd, 0xfbfe, 0xfbff],
  'ئ': [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c], 'ء': [0xfe80],
};
const ALIAS = { 'ي': 'ی', 'ى': 'ی', 'ك': 'ک', 'ة': 'ه', 'أ': 'ا', 'إ': 'ا', 'ؤ': 'و' };
const PDIGIT = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '«': '»', '»': '«', '<': '>', '>': '<' };
const norm = (c) => ALIAS[c] || c;
const isLetter = (c) => !!F[norm(c)];
const joinsNext = (c) => !!F[norm(c)] && F[norm(c)].length === 4; // can connect to the letter after it
const mark = (c) => /[ً-ٰٟ]/.test(c); // vowel marks: ignored

function shape(text) {
  const src = [...text].filter((c) => !mark(c));
  const out = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '‌') {
      out.push('');
      continue;
    }
    if (!isLetter(c)) {
      out.push(PDIGIT[c] || c);
      continue;
    }
    // look at the neighbours, skipping nothing: a half-space or any other character cuts the joining
    const prev = src[i - 1];
    const next = src[i + 1];
    const joinPrev = prev !== undefined && isLetter(prev) && joinsNext(prev);
    const joinNext = next !== undefined && isLetter(next) && joinsNext(c);
    const nc = norm(c);
    // lam + alef is written as one joined shape
    if (nc === 'ل' && next !== undefined && ['ا', 'آ'].includes(norm(next))) {
      const alefMadda = norm(next) === 'آ';
      const lig = alefMadda ? (joinPrev ? 0xfef6 : 0xfef5) : joinPrev ? 0xfefc : 0xfefb;
      out.push(String.fromCodePoint(lig));
      i++;
      continue;
    }
    const f = F[nc];
    let k = 0;
    if (f.length === 4) k = joinPrev && joinNext ? 3 : joinNext ? 2 : joinPrev ? 1 : 0;
    else k = joinPrev ? 1 : 0;
    out.push(String.fromCodePoint(f[Math.min(k, f.length - 1)]));
  }
  return out;
}

const isRtlShape = (ch) => {
  const cp = ch.codePointAt(0);
  return (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfeff) || (cp >= 0x0600 && cp <= 0x06ff);
};

/** One line: joined letters, then the runs put in visual (left-to-right) order. */
export function visual(line) {
  if (!/[؀-ۿ]/.test(line)) return line;
  const chars = shape(line).filter((c) => c !== '');
  const type = chars.map((c) => (isRtlShape(c) ? 'R' : /[A-Za-z0-9]/.test(c) ? 'L' : 'N'));
  // neutrals (spaces, punctuation) go with the letters around them; at the edges the base direction (right to left) wins
  for (let i = 0; i < chars.length; i++) {
    if (type[i] !== 'N') continue;
    let a = i - 1;
    while (a >= 0 && type[a] === 'N') a--;
    let b = i + 1;
    while (b < chars.length && type[b] === 'N') b++;
    const left = a >= 0 ? type[a] : 'R';
    const right = b < chars.length ? type[b] : 'R';
    type[i] = left === right ? left : 'R';
  }
  const runs = [];
  for (let i = 0; i < chars.length; i++) {
    if (runs.length && runs[runs.length - 1].t === type[i]) runs[runs.length - 1].c.push(chars[i]);
    else runs.push({ t: type[i], c: [chars[i]] });
  }
  return runs
    .reverse()
    .map((r) => (r.t === 'R' ? r.c.reverse().map((c) => MIRROR[c] || c).join('') : r.c.join('')))
    .join('');
}

const ESC = /(\x1b\[[0-9;?]*[A-Za-z])/;
const fix = (s) =>
  String(s)
    .split('\n')
    .map((ln) =>
      ln
        .split(ESC)
        .map((part, i) => (i % 2 ? part : visual(part)))
        .join(''),
    )
    .join('\n');

if (process.platform === 'win32' && process.stdout.isTTY && !process.env.HM_NOFA) {
  for (const stream of [process.stdout, process.stderr]) {
    const raw = stream.write.bind(stream);
    stream.write = (chunk, ...rest) => (typeof chunk === 'string' ? raw(fix(chunk), ...rest) : raw(chunk, ...rest));
  }
}
