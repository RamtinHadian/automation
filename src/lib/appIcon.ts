/**
 * Builds a square PNG (data URL) from the company logo, used as the home-screen / app icon and the favicon.
 * The logo is centred on white with a safe margin so phones can round or mask the corners freely.
 */
export function makeAppIcon(logoUrl: string, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas unavailable'));
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size);
      const box = size * 0.7;
      const scale = Math.min(box / img.width, box / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('logo could not be loaded'));
    img.src = logoUrl;
  });
}

export async function makeAppIcons(logoUrl: string) {
  const [appIcon192, appIcon512] = await Promise.all([makeAppIcon(logoUrl, 192), makeAppIcon(logoUrl, 512)]);
  return { appIcon192, appIcon512 };
}
