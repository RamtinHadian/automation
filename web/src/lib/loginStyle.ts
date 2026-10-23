import { useEffect, useState } from 'react';

/** Three built-in sign-in pictures (soft landscapes drawn as SVG, so they are light and sharp). */
const hills = (sky1: string, sky2: string, sun: string, far: string, mid: string, near: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">` +
      `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient>` +
      `<radialGradient id="g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${sun}" stop-opacity=".95"/><stop offset="1" stop-color="${sun}" stop-opacity="0"/></radialGradient></defs>` +
      `<rect width="1600" height="1000" fill="url(#s)"/><circle cx="1180" cy="330" r="260" fill="url(#g)"/><circle cx="1180" cy="330" r="52" fill="${sun}"/>` +
      `<path d="M0 560 C260 470 460 520 700 470 S1180 430 1600 520 V1000 H0Z" fill="${far}" opacity=".85"/>` +
      `<path d="M0 650 C300 560 520 640 800 600 S1260 560 1600 640 V1000 H0Z" fill="${mid}"/>` +
      `<path d="M0 780 C250 700 560 800 860 750 S1320 700 1600 790 V1000 H0Z" fill="${near}"/></svg>`,
  );

// 50 built-in pictures: 20 soft landscapes and 30 Islamic (eslimi / girih) patterns, all drawn as SVG (light, sharp at any size).
const LAND: [string, string, string, string, string, string][] = [
  ['#f6d58e', '#9fc4a1', '#fff3c4', '#7da37a', '#5b8a4e', '#3f6f3a'], ['#2a2f5c', '#e58c6b', '#ffd9a0', '#3d3f78', '#2e2a5c', '#1d1a3d'],
  ['#9ad0e8', '#e9f4ee', '#ffffff', '#86b3b6', '#5f9a93', '#3d7d78'], ['#ffb88c', '#de6262', '#fff1c1', '#a8506a', '#7a3d63', '#4b2a55'],
  ['#c9e9d6', '#f2f7e8', '#fffbe0', '#95c8a5', '#6bab88', '#488a6e'], ['#1b2a49', '#5c7aa8', '#e8f0ff', '#2f4a78', '#243a63', '#16264a'],
  ['#fde2c8', '#f0a6a0', '#fff6dc', '#c97b84', '#a35d7a', '#7a4468'], ['#b6e3f0', '#6ba5c8', '#ffffff', '#4e86ad', '#376a94', '#254d75'],
  ['#e8d9b5', '#c8a96a', '#fff7d6', '#a98650', '#876a3c', '#614b2a'], ['#d4c1f2', '#8f7fcf', '#fff4ff', '#6e61b0', '#52478f', '#3a306e'],
  ['#ffd6a5', '#e8a05f', '#fffbe8', '#c47a3a', '#9c5b2a', '#6e3f1d'], ['#bde0c4', '#5aa17f', '#f3fff0', '#3f8466', '#2c6a50', '#1c4f3b'],
  ['#f3c4d4', '#c97fa0', '#fff0f6', '#a35a82', '#7d4066', '#582b4b'], ['#cfe3ef', '#8fb2c9', '#fffef5', '#6d92ad', '#4f7592', '#365776'],
  ['#ffe8a3', '#f0b55a', '#fffbe5', '#d68c3d', '#b06a2a', '#80481c'], ['#262b45', '#7d5a8c', '#ffd9c0', '#4f3d6c', '#3a2c55', '#241b3b'],
  ['#c5ecd9', '#6cc3a3', '#ffffff', '#46a587', '#2f8770', '#1c6a58'], ['#f5d0c5', '#e48f7a', '#fff4e0', '#bf6a5c', '#964e49', '#6c3638'],
  ['#d9e6a8', '#9bbf5f', '#fffde0', '#789f44', '#5a8032', '#3f6021'], ['#a5c8ff', '#6f8fe0', '#ffffff', '#5470c0', '#3d57a0', '#2a4080'],
];
const PAT: [string, string, string, number][] = [
  ['#0f3d3e', '#c9a227', '#f4e4b0', 160], ['#1a2a5e', '#d9b44a', '#e8e1ff', 180], ['#5c1a1a', '#e8c872', '#ffe9c4', 150], ['#14452f', '#e0b84c', '#e6f5d8', 170],
  ['#2b1b4f', '#e3a8d8', '#f0e3ff', 160], ['#0b3954', '#8fd6e8', '#e3f6fb', 150], ['#3d1f12', '#d9a066', '#fbe7cf', 180], ['#1f3b2e', '#a8d8b0', '#eaf7ec', 140],
  ['#4a1942', '#e8b4c8', '#ffeaf3', 160], ['#102a43', '#f0c674', '#fff3d6', 170], ['#33261d', '#c8b08a', '#f5ecdc', 150], ['#0e3b43', '#f4d27a', '#fff5d9', 180],
  ['#3a0f2e', '#d99ac0', '#ffe6f4', 140], ['#17324d', '#7fb7d8', '#e6f3fb', 160], ['#2e3a1a', '#d4c06a', '#f6f1d2', 170], ['#40201a', '#e0a97c', '#fdebd9', 150],
  ['#0a2a2a', '#5fd1c2', '#e0fbf6', 160], ['#251a3d', '#b9a2f0', '#efe8ff', 180], ['#4b2a0f', '#f0c26a', '#fff0cf', 140], ['#1c2f4a', '#e8c078', '#fff1d9', 170],
  ['#142e25', '#e6c87a', '#f7f0d6', 160], ['#3a1020', '#f0a8b8', '#ffe8ee', 150], ['#0f2f3d', '#9fe0d0', '#e8fbf6', 180], ['#2a2a40', '#d8c08a', '#f6efdc', 160],
  ['#4a2412', '#f2b878', '#ffeed8', 140], ['#0d3347', '#f2d58a', '#fff6de', 170], ['#321a3a', '#e6a6d6', '#fdeaf8', 150], ['#1a3a30', '#c8e0a0', '#f2f9e4', 160],
  ['#3b1c1c', '#e8b878', '#ffeed6', 180], ['#10304a', '#a8d0f0', '#eaf4fd', 150],
];
const landscape = (k: number) => hills(...LAND[k % LAND.length]);
const eslimi = (k: number) => {
  const [bg, gold, soft, t] = PAT[k % PAT.length];
  const h = t / 2;
  const star = (r: number, w: number, o: number) =>
    `<g transform="translate(${h} ${h})" fill="none" stroke="${gold}" stroke-width="${w}" opacity="${o}"><rect x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}"/><rect x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}" transform="rotate(45)"/></g>`;
  // one tile: an eight-pointed star, four spiral vines with leaves, and small buds at the corners
  const vine = (rot: number) =>
    `<g transform="translate(${h} ${h}) rotate(${rot})"><path d="M0 ${-h * 0.18} C ${h * 0.5} ${-h * 0.2} ${h * 0.55} ${-h * 0.7} ${h * 0.15} ${-h * 0.78} C ${-h * 0.15} ${-h * 0.82} ${-h * 0.2} ${-h * 0.5} ${h * 0.05} ${-h * 0.5}" fill="none" stroke="${gold}" stroke-width="2.2" stroke-linecap="round"/>` +
    `<ellipse cx="${h * 0.38}" cy="${-h * 0.32}" rx="${h * 0.14}" ry="${h * 0.06}" transform="rotate(-35 ${h * 0.38} ${-h * 0.32})" fill="${soft}" opacity=".85"/>` +
    `<ellipse cx="${h * 0.3}" cy="${-h * 0.66}" rx="${h * 0.12}" ry="${h * 0.05}" transform="rotate(40 ${h * 0.3} ${-h * 0.66})" fill="${gold}" opacity=".9"/>` +
    `<circle cx="${h * 0.05}" cy="${-h * 0.5}" r="${h * 0.045}" fill="${soft}"/></g>`;
  const tile =
    star(h * 0.34, 1.6, 0.95) + star(h * 0.2, 1.2, 0.8) +
    `<circle cx="${h}" cy="${h}" r="${h * 0.07}" fill="${soft}"/>` +
    [0, 90, 180, 270].map(vine).join('') +
    [[0, 0], [t, 0], [0, t], [t, t]].map(([x, y]) => `<g transform="translate(${x} ${y})"><circle r="${h * 0.16}" fill="none" stroke="${gold}" stroke-width="1.6" opacity=".9"/><circle r="${h * 0.06}" fill="${soft}"/></g>`).join('');
  const rot = (k % 3) * 15;
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">` +
        `<defs><radialGradient id="b" cx=".5" cy=".5" r=".75"><stop offset="0" stop-color="${bg}" stop-opacity=".78"/><stop offset="1" stop-color="${bg}"/></radialGradient>` +
        `<pattern id="p" width="${t}" height="${t}" patternUnits="userSpaceOnUse" patternTransform="rotate(${rot})">${tile}</pattern></defs>` +
        `<rect width="1600" height="1000" fill="${bg}"/><rect width="1600" height="1000" fill="url(#p)" opacity=".55"/><rect width="1600" height="1000" fill="url(#b)"/>` +
        `<g transform="translate(800 500)" fill="none" stroke="${gold}" opacity=".55"><circle r="430" stroke-width="2"/><circle r="446" stroke-width="1"/><rect x="-300" y="-300" width="600" height="600" stroke-width="1.5" transform="rotate(22.5)"/><rect x="-300" y="-300" width="600" height="600" stroke-width="1.5" transform="rotate(67.5)"/></g></svg>`,
    )
  );
};

/** The 50 built-in pictures: ids «builtin:0» … «builtin:49». */
export const BUILTIN_COUNT = 50;
export const builtinImage = (n: number) => (n < LAND.length ? landscape(n) : eslimi(n - LAND.length));
export const DEFAULT_LOGIN_IMAGES = Array.from({ length: BUILTIN_COUNT }, (_, n) => builtinImage(n));
/** A saved entry is either «builtin:N» or an uploaded picture (a data URL). */
export const resolveLoginImage = (e: string) => (e.startsWith('builtin:') ? builtinImage(parseInt(e.slice(8), 10) || 0) : e);

let cache: string[] | null = null;
let picked = -1;
export type LoginDesign = 'glass' | 'simple' | 'elegant' | 'dark';
let designCache: LoginDesign | null = null;

/** The design of the sign-in pages that the admin chose (read once, before anyone has signed in). */
export const useLoginDesign = (): LoginDesign => {
  const [design, setDesign] = useState<LoginDesign>(designCache || 'glass');
  useEffect(() => {
    if (designCache) return;
    let alive = true;
    fetch('/api/login/style', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        designCache = ['simple', 'elegant', 'dark'].includes(j?.design) ? j.design : 'glass';
        if (alive) setDesign(designCache as LoginDesign);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return design;
};


/** The picture behind the sign-in page: one of the admin's pictures, else a built-in one; the same one for the whole visit. */
export const useLoginImage = (): string => {
  const [list, setList] = useState<string[]>(cache || []);
  useEffect(() => {
    if (cache) return;
    let alive = true;
    fetch('/api/login/style', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        cache = Array.isArray(j?.images) ? j.images : [];
        if (alive) setList(cache || []);
      })
      .catch(() => {
        cache = [];
      });
    return () => {
      alive = false;
    };
  }, []);
  const pool = list.length ? list.map(resolveLoginImage) : DEFAULT_LOGIN_IMAGES;
  if (picked < 0 || picked >= pool.length) picked = Math.floor(Math.random() * pool.length);
  return pool[picked % pool.length];
};

/** The admin changed the pictures: forget what was fetched. */
export const forgetLoginImages = () => {
  designCache = null;
  cache = null;
  picked = -1;
};

/** Shrinks a picture to a size that is enough for a screen background (JPEG, long side 1600 px). */
export function readLoginImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error('فقط فایل تصویر را می‌توان بارگذاری کرد.'));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('خواندن فایل ممکن نشد.'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('این تصویر باز نشد.'));
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        const ctx = c.getContext('2d');
        if (!ctx) return reject(new Error('پردازش تصویر ممکن نشد.'));
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}
