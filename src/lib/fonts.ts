import { CustomFont } from '../types';

export const DEFAULT_FONTS: CustomFont[] = [
  {
    id: 'vazirmatn',
    name: 'وزیرمتن (پیش‌فرض استاندارد)',
    fontFamily: 'Vazirmatn',
    isDefault: true,
  },
  {
    id: 'b-nazanin',
    name: 'بی‌نازنین (رسمی و مکاتبات اداری)',
    fontFamily: 'B Nazanin',
    isDefault: true,
  },
  {
    id: 'b-titr',
    name: 'بی‌تیتر (عناوین و سربرگ)',
    fontFamily: 'B Titr',
    isDefault: true,
  },
  {
    id: 'b-yekan',
    name: 'بی‌یکان (هندسی و مدرن)',
    fontFamily: 'B Yekan',
    isDefault: true,
  },
  {
    id: 'iran-nastaliq',
    name: 'ایران نستعلیق (سنتی و خوشنویسی)',
    fontFamily: 'IranNastaliq',
    isDefault: true,
  },
  {
    id: 'sahel',
    name: 'ساحل (مدرن و خوانا)',
    fontFamily: 'Sahel',
    isDefault: true,
  },
  {
    id: 'shabnam',
    name: 'شبنم (شفاف و روان)',
    fontFamily: 'Shabnam',
    isDefault: true,
  },
  {
    id: 'tahoma',
    name: 'تاهوُما (Tahoma استاندارد)',
    fontFamily: 'Tahoma',
    isDefault: true,
  },
];

/**
 * Dynamically injects @font-face CSS rules into the document head for custom uploaded fonts.
 */
export function injectCustomFontsCss(fonts: CustomFont[]) {
  if (typeof document === 'undefined') return;

  let styleEl = document.getElementById('custom-app-fonts') as HTMLStyleElement;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'custom-app-fonts';
    document.head.appendChild(styleEl);
  }

  let cssRules = '';
  for (const font of fonts) {
    if (font.dataUrl && font.fontFamily) {
      const formatStr = font.format ? `format('${font.format}')` : "format('truetype')";
      cssRules += `
        @font-face {
          font-family: '${font.fontFamily}';
          src: url('${font.dataUrl}') ${formatStr};
          font-weight: normal;
          font-style: normal;
          font-display: swap;
        }
      `;
    }
  }

  styleEl.textContent = cssRules;
}

/**
 * Generates the CSS font-face declarations string for PDF and print previews
 */
export function getFontsCssForPrint(fonts: CustomFont[] = []): string {
  let css = '';
  for (const font of fonts) {
    if (font.dataUrl && font.fontFamily) {
      const formatStr = font.format ? `format('${font.format}')` : "format('truetype')";
      css += `
        @font-face {
          font-family: '${font.fontFamily}';
          src: url('${font.dataUrl}') ${formatStr};
          font-weight: normal;
          font-style: normal;
        }
      `;
    }
  }
  return css;
}
