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

export const DEFAULT_LOGIN_IMAGES = [
  hills('#f6d58e', '#9fc4a1', '#fff3c4', '#7da37a', '#5b8a4e', '#3f6f3a'),
  hills('#2a2f5c', '#e58c6b', '#ffd9a0', '#3d3f78', '#2e2a5c', '#1d1a3d'),
  hills('#9ad0e8', '#e9f4ee', '#ffffff', '#86b3b6', '#5f9a93', '#3d7d78'),
];

let cache: string[] | null = null;
let picked = -1;

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
  const pool = list.length ? list : DEFAULT_LOGIN_IMAGES;
  if (picked < 0 || picked >= pool.length) picked = Math.floor(Math.random() * pool.length);
  return pool[picked % pool.length];
};

/** The admin changed the pictures: forget what was fetched. */
export const forgetLoginImages = () => {
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
