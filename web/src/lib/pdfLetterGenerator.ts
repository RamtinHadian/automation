import { FileTransfer, SystemSettings, User } from '../types';
import { letterMeta, letterMetaGridCss } from './letterMeta';
import { resolveSignatureHeight, signatureAreaHeight, defaultStampHeight, stampSizeLocked, stripBakedBodyLayout, UNSIGNED_WATERMARK, SIGNATURE_ANCHOR_LEFT, STAMP_ANCHOR_LEFT } from './letterDefaults';
import { formatCurrentJalaliDateTime, toPersianDigits } from './jalali';
import { DEFAULT_FONTS, getFontsCssForPrint } from './fonts';
import fontUrl from 'vazirmatn/fonts/webfonts/Vazirmatn[wght].woff2?url';
import { letterheadBackground, letterheadColor, letterheadFooterText, letterheadPad, letterheadSvg } from './letterheads';

export interface LetterPrintOverrides {
  pageSize?: string;
  customNumber?: string;
  customDate?: string;
  customAttachment?: string;
  customSubject?: string;
  customCompanyTitle?: string;
  customCompanySubtitle?: string;
  customHeaderTitle?: string;
  customBody?: string;
  customFooterNote?: string;
  /** names the letter is copied to («رونوشت»); printed at the bottom above the address line */
  copyTo?: string[];
  showFooterNote?: boolean;
  headerCenterOffsetX?: number;
  headerCenterOffsetY?: number;
  subjectOffsetX?: number;
  subjectOffsetY?: number;
  metaOffsetX?: number;
  footerNoteOffsetX?: number;
  metaOffsetY?: number;
  footerNoteOffsetY?: number;
  headerCenterFontFamily?: string;
  subjectFontFamily?: string;
  metaFontFamily?: string;
  letterFontFamily?: string;
  signerFontFamily?: string;
  signerFontSize?: number;
  customSignerName?: string;
  customSignerTitle?: string;
  bodyOffsetX?: number;
  bodyOffsetY?: number;
  orgOffsetX?: number;
  orgOffsetY?: number;
  bodyPaddingX?: number;
  signatureHeight?: number;
  signatureOffsetX?: number;
  signatureOffsetY?: number;
  stampHeight?: number;
  stampOffsetX?: number;
  stampOffsetY?: number;
  showSignatureImage?: boolean;
  showStampImage?: boolean;
  showLetterNumber?: boolean;
  showLetterDate?: boolean;
  showLetterAttachment?: boolean;
  showLogo?: boolean;
  showOrgName?: boolean;
  showSubject?: boolean;
  signatureImgOffsetX?: number;
  signatureImgOffsetY?: number;
}

/** The letterhead's decoration as a CSS background: it repeats on every printed page (inline SVG in a fixed box is dropped after page 1 by the browser). */
function lhBandHeight(svg: string, width: number): number {
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return vb ? Math.round((width * parseFloat(vb[2])) / parseFloat(vb[1])) : 80;
}
function lhBand(svg: string, width: number): string {
  const h = lhBandHeight(svg, width);
  const uri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
  return `height: ${h}px; background-image: url('${uri}'); background-repeat: no-repeat; background-size: 100% 100%;`;
}

export function generateOfficialLetterHtml(
  transfer: FileTransfer,
  settings: SystemSettings,
  currentUser?: User,
  overrides?: LetterPrintOverrides
): string {
  const isSigned = transfer.signatureStatus === 'SIGNED';
  const ceoName = transfer.signedBy || settings.ceoName || 'مدیریت محترم عامل';
  const ceoTitle = settings.ceoTitle || 'مدیرعامل';
  // Image URLs (esp. inline SVG data URLs) can contain quotes; escape them for use inside src="..."
  const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  // before the signer signs there is no signature and no stamp on the letter: only what the signer chose (when signing) appears
  const showSig = overrides?.showSignatureImage !== undefined ? overrides.showSignatureImage : isSigned && transfer.showSignatureImage !== false;
  const showStamp = overrides?.showStampImage !== undefined ? overrides.showStampImage : isSigned && transfer.showStampImage !== false;
  const showNo = (overrides?.showLetterNumber ?? transfer.showLetterNumber) !== false;
  const showDate = (overrides?.showLetterDate ?? transfer.showLetterDate) !== false;
  const showAtt = (overrides?.showLetterAttachment ?? transfer.showLetterAttachment) !== false;
  const showLogo = (overrides?.showLogo ?? transfer.showLogo) !== false;
  const showOrgName = (overrides?.showOrgName ?? transfer.showOrgName) !== false;
  const showSubject = (overrides?.showSubject ?? transfer.showSubject) !== false;
  // the printed page is a blob: document, so a relative picture address would not load there
  const absUrl = (u?: string) => (u && u.startsWith('/') && !u.startsWith('//') ? location.origin + u : u);
  const signatureImg = showSig ? absUrl(transfer.signatureImageUrl || settings.ceoSignatureUrl) : undefined;
  const stampImg = showStamp ? absUrl(transfer.companyStampImageUrl || settings.companyStampUrl) : undefined;

  const pageSize = (overrides?.pageSize || transfer.pageSize || 'A4').trim();
  const isA5 = pageSize.toUpperCase() === 'A5';
  const isLetter = pageSize.toUpperCase() === 'LETTER';

  const pageCssSize = isA5 ? 'A5 portrait' : isLetter ? 'letter portrait' : 'A4 portrait';
  const pageMargin = isA5 ? '6mm 8mm' : '10mm 14mm';
  const pagePrintHeight = isA5 ? '209mm' : isLetter ? '278.4mm' : '296mm';
  const containerMaxWidth = isA5 ? '580px' : isLetter ? '700px' : '720px';
  const containerMinHeight = isA5 ? '600px' : isLetter ? '720px' : '760px';
  const containerPadding = isA5 ? '28px' : isLetter ? '36px' : '40px'; // the same paddings as the sheet in the editor
  const designW = parseInt(containerMaxWidth, 10);
  const pageWmm = isA5 ? 148 : isLetter ? 215.9 : 210;

  const allFonts = [...DEFAULT_FONTS, ...(settings.customFonts || [])];
  const activeFontFamily = overrides?.letterFontFamily || transfer.letterFontFamily;
  const chosenFont = activeFontFamily
    ? (allFonts.find((f) => f.fontFamily === activeFontFamily || f.id === activeFontFamily) || { id: 'custom', name: 'Custom', fontFamily: activeFontFamily })
    : (allFonts.find((f) => f.id === settings.defaultLetterFontId) || DEFAULT_FONTS[0]);
  const customFontsCss = getFontsCssForPrint(settings.customFonts || []);

  const companyName = overrides?.customCompanyTitle !== undefined ? overrides.customCompanyTitle : (transfer.customHeaderCompanyTitle !== undefined ? transfer.customHeaderCompanyTitle : (settings.companyName || ''));
  const companySubtitle = overrides?.customCompanySubtitle !== undefined ? overrides.customCompanySubtitle : (transfer.customHeaderCompanySubtitle !== undefined ? transfer.customHeaderCompanySubtitle : (settings.companySubtitle || ''));
  const companyLogo = showLogo ? absUrl(settings.companyLogoUrl) : undefined;

  const rawLetterNo = overrides?.customNumber || transfer.customHeaderNumber || transfer.letterNumber || transfer.fileName.replace(/\.[^/.]+$/, '').replace(/^نامه_/, '');
  const letterNo = toPersianDigits(rawLetterNo);

  const rawLetterDate = overrides?.customDate || transfer.customHeaderDate || transfer.sentAt.split(' - ')[0] || formatCurrentJalaliDateTime().split(' - ')[0];
  const letterDate = toPersianDigits(rawLetterDate);

  const letterAttach = overrides?.customAttachment || transfer.customHeaderAttachment || 'دارد (الکترونیک)';
  const letterSubject = overrides?.customSubject || transfer.customHeaderSubject || transfer.fileName.replace(/\.[^/.]+$/, '').replace(/^نامه_/, '').replace(/_/g, ' ');
  const headerTitle = overrides?.customHeaderTitle !== undefined ? overrides.customHeaderTitle : (transfer.customHeaderCenterTitle !== undefined ? transfer.customHeaderCenterTitle : '');

  const letterBody = stripBakedBodyLayout(
    overrides?.customBody ||
    transfer.letterContentHtml ||
    transfer.note ||
    'متن نامه رسمی جهت استحضار، بررسی و صدور دستور مقتضی ارسال گردیده است.');

  const showFooter = overrides?.showFooterNote !== undefined
    ? overrides.showFooterNote
    : transfer.showFooterNote !== undefined
      ? transfer.showFooterNote
      : (settings.showFooterNote !== false && settings.letterNumbering?.showFooterNote !== false);

  const signatureHeight = overrides?.signatureHeight || resolveSignatureHeight(transfer.signatureHeight, isA5, settings.ceoSignatureHeight);
  const signatureOffsetX = overrides?.signatureOffsetX !== undefined ? overrides.signatureOffsetX : (transfer.signatureOffsetX || 0);
  const signatureOffsetY = overrides?.signatureOffsetY !== undefined ? overrides.signatureOffsetY : (transfer.signatureOffsetY || 0);

  const headerCenterOffsetX = overrides?.headerCenterOffsetX !== undefined ? overrides.headerCenterOffsetX : (transfer.headerCenterOffsetX || 0);
  const headerCenterOffsetY = overrides?.headerCenterOffsetY !== undefined ? overrides.headerCenterOffsetY : (transfer.headerCenterOffsetY || 0);
  const subjectOffsetX = overrides?.subjectOffsetX !== undefined ? overrides.subjectOffsetX : (transfer.subjectOffsetX || 0);
  const subjectOffsetY = overrides?.subjectOffsetY !== undefined ? overrides.subjectOffsetY : (transfer.subjectOffsetY || 0);

  const metaOffsetX = overrides?.metaOffsetX !== undefined ? overrides.metaOffsetX : (transfer.metaOffsetX || 0);
  const footerNoteOffsetX = overrides?.footerNoteOffsetX !== undefined ? overrides.footerNoteOffsetX : (transfer.footerNoteOffsetX || 0);
  const metaOffsetY = overrides?.metaOffsetY !== undefined ? overrides.metaOffsetY : (transfer.metaOffsetY || 0);
  const footerNoteOffsetY = overrides?.footerNoteOffsetY !== undefined ? overrides.footerNoteOffsetY : (transfer.footerNoteOffsetY || 0);

  const centerFont = overrides?.headerCenterFontFamily || transfer.headerCenterFontFamily || chosenFont.fontFamily;
  const subjectFont = overrides?.subjectFontFamily || transfer.subjectFontFamily || chosenFont.fontFamily;
  const metaFont = overrides?.metaFontFamily || transfer.metaFontFamily || chosenFont.fontFamily;
  const signerFont = overrides?.signerFontFamily || transfer.signerFontFamily || chosenFont.fontFamily;
  const signerSize = overrides?.signerFontSize || transfer.signerFontSize || 18;
  const finalCeoName = overrides?.customSignerName || transfer.customSignerName || ceoName;
  const finalCeoTitle = overrides?.customSignerTitle || transfer.customSignerTitle || ceoTitle;

  const bodyOffsetX = overrides?.bodyOffsetX !== undefined ? overrides.bodyOffsetX : (transfer.bodyOffsetX || 0);
  const bodyOffsetY = overrides?.bodyOffsetY !== undefined ? overrides.bodyOffsetY : (transfer.bodyOffsetY || 0);
  const orgOffsetX = overrides?.orgOffsetX !== undefined ? overrides.orgOffsetX : (transfer.orgOffsetX || 0);
  const orgOffsetY = overrides?.orgOffsetY !== undefined ? overrides.orgOffsetY : (transfer.orgOffsetY || 0);
  const bodyPaddingX = overrides?.bodyPaddingX !== undefined ? overrides.bodyPaddingX : (transfer.bodyPaddingX || 0);

  const finalSigHeight = isA5 ? Math.min(signatureHeight, 300) : signatureHeight;
  const stampDefault = defaultStampHeight(isA5, settings.companyStampSizeCm, pageSize);
  const stampHeight = stampSizeLocked(settings) ? stampDefault : overrides?.stampHeight || transfer.stampHeight || stampDefault;
  // the logo and the organisation text can be resized by the person (stored with the letter); older letters keep the fixed sizes
  const logoOffsetX = transfer.logoOffsetX || 0;
  const logoOffsetY = transfer.logoOffsetY || 0;
  const orgTextOffsetX = transfer.orgTextOffsetX || 0;
  const orgTextOffsetY = transfer.orgTextOffsetY || 0;
  const logoSize = transfer.logoSize && transfer.logoSize > 0 ? transfer.logoSize : 0;
  const orgScale = transfer.orgTextScale && transfer.orgTextScale > 0 ? transfer.orgTextScale : 1;
  const stampOffsetX = overrides?.stampOffsetX !== undefined ? overrides.stampOffsetX : (transfer.stampOffsetX || 0);
  const stampOffsetY = overrides?.stampOffsetY !== undefined ? overrides.stampOffsetY : (transfer.stampOffsetY || 0);
  const sigImgOffsetX = overrides?.signatureImgOffsetX !== undefined ? overrides.signatureImgOffsetX : (transfer.signatureImgOffsetX || 0);
  const sigImgOffsetY = overrides?.signatureImgOffsetY !== undefined ? overrides.signatureImgOffsetY : (transfer.signatureImgOffsetY || 0);

  const areaHeight = signatureAreaHeight(isA5, finalSigHeight, stampHeight);

  const signedDateTime = toPersianDigits(transfer.signedAt || formatCurrentJalaliDateTime());
  // the ready-made letterhead: a decoration at the top and the bottom of the sheet and the address / phone line in the footer
  const lh = transfer.letterhead;
  const lhFooter = lh ? letterheadFooterText(lh) : '';
  const copies = (overrides?.copyTo || transfer.copyTo || []).filter(Boolean);
  const lhPadTop = lh && !lh.image ? `${letterheadPad(lh.id, parseInt(containerMaxWidth, 10))}px` : containerPadding;
  const lhPadBottom = lh && !lh.image ? `${letterheadPad(lh.id, parseInt(containerMaxWidth, 10)) - 2}px` : containerPadding;
  // the sheet is laid out in the editor's width; a printed page is that sheet enlarged, so its height in sheet pixels is fixed by the page's proportions
  const padTopPx = lh && !lh.image ? letterheadPad(lh.id, designW) : parseInt(containerPadding, 10);
  const padBottomPx = lh && !lh.image ? letterheadPad(lh.id, designW) - 2 : parseInt(containerPadding, 10);
  const pageHdesign = Math.round((designW * (isA5 ? 209 : isLetter ? 278.4 : 296)) / pageWmm);
  // what stands at the foot of every page: the people the letter is copied to, the address line and the note
  const footH = (lh && lhFooter ? 54 : 0) + (showFooter ? 26 : 0) + 6;
  // The lines at the foot stand in the foot of every page, so a position given in the editor (dragged far, or on a longer sheet) must not carry them off
  // the page: out there they would widen the document (the browser then shrinks the whole page to fit) or fall onto the next page. Kept in the foot's own area.
  const clampPx = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : 0));
  const padXpx = parseInt(containerPadding, 10) || 40;
  const noteX = clampPx(footerNoteOffsetX, -(designW - 2 * padXpx - 40), 0);
  const noteY = clampPx(footerNoteOffsetY, -footH, 14);
  const addrX = clampPx(lh?.offsetX || 0, -padXpx, padXpx);
  const addrY = clampPx(lh?.offsetY || 0, -footH, 14);

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${letterSubject} - سند رسمی اداری (${isA5 ? 'A5' : isLetter ? 'Letter' : 'A4'})</title>
  <style>
    /* The letter opens in its own page: it must carry its fonts itself. Vazirmatn comes from this very server (the office network
       often cannot reach Google Fonts or jsdelivr, and then the letter printed in another font than the one in the editor).
       Fonts the person installed on the computer (B Nazanin, B Titr, B Yekan, IranNastaliq) are used when present, else Vazirmatn. */
    @font-face { font-family: 'Vazirmatn'; src: url('${location.origin}${fontUrl}') format('woff2'); font-weight: 100 900; }
    @font-face { font-family: 'B Nazanin'; src: local('B Nazanin'), local('BNazanin'), url('${location.origin}${fontUrl}') format('woff2'); font-weight: 100 900; }
    @font-face { font-family: 'B Titr'; src: local('B Titr'), local('BTitr'), local('B Titr Bold'), url('${location.origin}${fontUrl}') format('woff2'); font-weight: 100 900; }
    @font-face { font-family: 'B Yekan'; src: local('B Yekan'), local('BYekan'), url('${location.origin}${fontUrl}') format('woff2'); font-weight: 100 900; }
    @font-face {
      font-family: 'IranNastaliq';
      src: local('IranNastaliq'), local('Iran Nastaliq'), local('Iran-Nastaliq');
    }
    ${customFontsCss}
    @page {
      size: ${pageCssSize};
      margin: 0 !important;
    }
    @media print {
      html, body {
        width: 100% !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print {
        display: none !important;
      }
      /* The sheet keeps the width it has in the editor and is enlarged to the page width, so every distance matches the editor.
         A long letter runs on to the next page(s): the letterhead, the address line and the watermark are repeated on every page. */
      .letter-container {
        zoom: ${pageWmm * 96 / 25.4 / designW};
        width: ${designW}px !important;
        max-width: ${designW}px !important;
        margin: 0 !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        overflow-x: clip;
      }
      .wm, .lh-img { position: fixed !important; }
      .wm, .lh-img { left: 0 !important; right: 0 !important; }
      .wm, .lh-img { top: 0 !important; bottom: 0 !important; }
    }
    * {
      box-sizing: border-box;
    }
    body {
      font-family: '${chosenFont.fontFamily}', 'Vazirmatn', 'B Nazanin', Tahoma, 'Segoe UI', sans-serif;
      direction: rtl;
      margin: 0;
      padding: 24px;
      color: #1a1a1a;
      background: #f0ede9;
      line-height: 1.8;
    }
    .wm, .lh-img { position: absolute; left: 0; right: 0; pointer-events: none; }
    /* the letterhead's top and foot bands sit in the head / foot cells of the sheet's table: in the flow, so the browser repeats them on every page */
    .lh-band { margin: 0 -${containerPadding}; }
    .wm, .lh-img { top: 0; bottom: 0; }
    .wm { z-index: 5; background-repeat: repeat; }
    .lh-img { z-index: 0; background-size: 100% 100%; background-repeat: no-repeat; background-position: center; }
    .letter-container {
      position: relative;
      width: ${designW}px;
      max-width: 100%;
      margin: 0 auto;
      background: #ffffff;
      padding: 0 ${containerPadding};
      border-radius: 6px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      box-sizing: border-box;
    }
    /* the sheet is a table so that its head and foot spacers are repeated on every printed page */
    .pg { width: 100%; border-collapse: collapse; height: ${pageHdesign}px; position: relative; z-index: 1; }
    .pg > thead, .pg > tfoot { display: table-header-group; }
    .pg > tfoot { display: table-footer-group; }
    .pg-cell { vertical-align: top; padding: 0; height: 1px; }
    /* the copy-to list ends the letter: at the foot of the last page (the row takes what is left of the page) */
    .pg-copies { vertical-align: bottom; padding: 0; }
    .fx-foot { position: static; padding: 0 0 0 0; z-index: 2; }
    .header {
      border-bottom: none;
      padding-bottom: ${isA5 ? '5px' : '8px'};
      margin-bottom: ${isA5 ? '8px' : '12px'};
      position: relative;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      min-height: ${isA5 ? '44px' : '54px'};
    }
    .org-box {
      display: flex;
      align-items: center;
      gap: ${isA5 ? '8px' : '10px'};
      max-width: 50%;
    }
    .org-logo {
      height: ${isA5 ? '38px' : '48px'};
      max-width: ${isA5 ? '65px' : '80px'};
      object-fit: contain;
      border-radius: 6px;
    }
    .org-logo-placeholder {
      width: ${isA5 ? '34px' : '40px'};
      height: ${isA5 ? '34px' : '40px'};
      border-radius: 8px;
      background: #6E1B1B;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: ${isA5 ? '13px' : '15px'};
    }
    .org-title {
      font-size: ${isA5 ? '13px' : '15px'};
      font-weight: 900;
      color: #6E1B1B;
      margin: 0 0 2px 0;
    }
    .org-sub {
      font-size: ${isA5 ? '9.5px' : '10.5px'};
      color: #71554C;
      font-weight: bold;
    }
    .meta-box {
      flex: none;
    }
    .meta-box,
    .meta-box div,
    .meta-box span,
    .meta-box b {
      font-family: '${metaFont}', 'B Nazanin', 'Vazirmatn', Tahoma, sans-serif !important;
      font-size: ${letterMeta(isA5).fontSize}px;
      line-height: ${letterMeta(isA5).lineHeight};
    }
    .meta-box .mv { color: #3A241F; font-weight: bold; text-align: right; padding: 0 2px; overflow-wrap: anywhere; }
    .meta-box .ml { color: #8C6F66; font-weight: bold; text-align: right; }
    .letter-title {
      position: absolute;
      left: 50%;
      top: 8px;
      transform: translate(calc(-50% + ${headerCenterOffsetX}px), ${lh ? Math.max(headerCenterOffsetY, 0) : headerCenterOffsetY}px);
    }
    .letter-title,
    .letter-title span {
      font-family: '${centerFont}', 'IranNastaliq', 'B Titr', 'Vazirmatn', Tahoma, sans-serif !important;
      font-size: ${isA5 ? '11.5px' : '13px'};
      font-weight: 900;
      color: #6E1B1B;
      text-align: center;
      white-space: nowrap;
    }
    .subject-line,
    .subject-line * {
      font-family: '${subjectFont}', 'B Titr', 'Vazirmatn', Tahoma, sans-serif !important;
      font-size: ${isA5 ? '11px' : '12.5px'};
      font-weight: bold;
      margin-bottom: ${isA5 ? '8px' : '12px'};
      padding-bottom: ${isA5 ? '2px' : '4px'};
      border-bottom: none;
      transform: translate(${subjectOffsetX}px, ${subjectOffsetY}px);
    }
    .content-body {
      font-size: ${isA5 ? '11px' : '12.5px'};
      line-height: ${isA5 ? '1.8' : '2.0'};
      color: #222;
      text-align: justify;
      margin-bottom: ${isA5 ? '12px' : '18px'};
    }
    .content-body p {
      margin-top: 0;
      margin-bottom: ${isA5 ? '6px' : '8px'};
    }
    .content-body p:last-child {
      margin-bottom: 0;
    }
    .signature-section {
      margin-top: ${isA5 ? '16px' : '32px'};
      margin-bottom: ${isA5 ? '16px' : '24px'};
      padding-top: ${isA5 ? '4px' : '8px'};
      min-height: ${isA5 ? '90px' : '140px'};
      display: flex;
      justify-content: flex-end;
      align-items: flex-end;
      position: relative;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .ceo-signature-block {
      text-align: center;
      width: max-content;
      min-width: ${isA5 ? '170px' : '220px'};
      max-width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .ceo-name {
      font-family: '${signerFont}', 'B Titr', 'Vazirmatn', Tahoma, sans-serif !important;
      font-size: ${signerSize}px;
      font-weight: 900;
      color: #1a1a1a;
      line-height: ${isA5 ? '1.5' : '1.6'};
    }
    .ceo-title {
      font-family: '${signerFont}', 'B Nazanin', 'Vazirmatn', Tahoma, sans-serif !important;
      font-size: ${Math.max(14, signerSize - 2)}px;
      color: #555;
      margin-top: 2px;
      line-height: ${isA5 ? '1.5' : '1.6'};
    }
    .stamp-container {
      margin-top: 4px;
      height: ${areaHeight}px;
      width: 100%;
      position: relative;
    }
    .signature-img {
      position: absolute;
      top: 50%;
      left: ${SIGNATURE_ANCHOR_LEFT};
      flex-shrink: 0;
      max-width: none;
      object-fit: contain;
      mix-blend-mode: multiply;
      transition: transform 0.1s ease;
    }
    .stamp-img {
      position: absolute;
      top: 50%;
      left: ${STAMP_ANCHOR_LEFT};
      flex-shrink: 0;
      max-width: none;
      object-fit: contain;
      mix-blend-mode: multiply;
      transition: transform 0.1s ease;
    }
    .footer {
      padding-top: 8px;
      margin-top: auto;
      font-size: ${isA5 ? 9 : 10}px;
      color: #8C6F66;
      display: flex;
      justify-content: space-between;
      align-items: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .print-bar {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #3A241F;
      color: white;
      padding: 10px 24px;
      border-radius: 30px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      gap: 15px;
      font-size: 12px;
      font-family: Tahoma, sans-serif;
      z-index: 9999;
    }
    .print-btn {
      background: #D34A32;
      color: white;
      border: none;
      padding: 8px 18px;
      border-radius: 20px;
      font-weight: bold;
      cursor: pointer;
      font-family: inherit;
    }
    .print-btn:hover {
      background: #b53822;
    }
  </style>
</head>
<body>
  <div class="print-bar no-print">
    <span>سند رسمی آماده چاپ و دریافت نسخه PDF</span>
    <button class="print-btn" onclick="window.print()">دریافت PDF / چاپ مستقیم</button>
  </div>

  <div class="letter-container">
    ${!isSigned ? `<div class="wm" style="background-image: ${UNSIGNED_WATERMARK.replace(/"/g, "'")};"></div>` : ''}
    ${lh && lh.image ? `<div class="lh-img" style="background-image: url(${lh.image});"></div>` : ''}
    <table class="pg" cellspacing="0" cellpadding="0">
      <thead><tr><td style="height: ${padTopPx}px; padding: 0; vertical-align: top;">${lh && !lh.image ? `<div class="lh-band" style="${lhBand(letterheadSvg(lh.id, 'top'), designW)}"></div>` : ''}</td></tr></thead>
      <tfoot><tr><td style="height: ${padBottomPx + footH}px; padding: 0; vertical-align: bottom;"><div class="fx-foot">

    ${lh && lhFooter ? `<div style="padding-top: 12px; text-align: center; font-size: 10.5px; font-weight: 700; line-height: 1.8; color: ${letterheadColor(lh.id)}; transform: translate(${addrX}px, ${addrY}px);">${toPersianDigits(lhFooter)}</div>` : ''}

    ${showFooter ? `
    <div class="footer"${(lh && lhFooter) || copies.length ? ' style="margin-top: 0;"' : ''}>
      <div style="transform: translate(${noteX}px, ${noteY}px);">${overrides?.customFooterNote || transfer.customFooterNote || settings.letterNumbering?.defaultFooterNote || settings.defaultFooterNote || 'سامانه مکاتبات و اسناد رسمی اداری'}</div>
    </div>
    ` : ''}
    </div>${lh && !lh.image ? `<div class="lh-band" style="${lhBand(letterheadSvg(lh.id, 'bottom'), designW)}"></div>` : `<div style="height: ${padBottomPx}px;"></div>`}</td></tr></tfoot>
      <tbody><tr><td class="pg-cell">
    <div class="header">
      <div class="org-box" style="transform: translate(${orgOffsetX}px, ${orgOffsetY}px);${orgScale > 1.2 ? ' max-width: 60%;' : ''}">
        ${companyLogo ? `<img src="${attr(companyLogo)}" class="org-logo" alt="لوگو" style="transform: translate(${logoOffsetX}px, ${logoOffsetY}px);${logoSize ? ` width: ${logoSize}px; height: ${logoSize}px; max-width: none; flex-shrink: 0; object-fit: contain;` : ''}" />` : ''}
        ${showOrgName ? `<div style="transform: translate(${orgTextOffsetX}px, ${orgTextOffsetY}px); min-width: 90px;">
          ${companyName ? `<h1 class="org-title"${orgScale !== 1 ? ` style="font-size: ${((isA5 ? 13 : 15) * orgScale).toFixed(1)}px;"` : ''}>${companyName}</h1>` : ''}
          ${companySubtitle ? `<div class="org-sub"${orgScale !== 1 ? ` style="font-size: ${((isA5 ? 9.5 : 10.5) * orgScale).toFixed(1)}px;"` : ''}>${companySubtitle}</div>` : ''}
        </div>` : ''}
      </div>
      <div class="letter-title">
        ${headerTitle ? `<span>${headerTitle}</span>` : ''}
      </div>
      <div class="meta-box" style="transform: translate(${metaOffsetX}px, ${metaOffsetY}px); font-family: '${metaFont}', inherit; text-align: right; line-height: 1.45;">
        <div style="${letterMetaGridCss(isA5)}">
          <span class="ml">${showNo ? 'شماره:' : ''}</span><span class="mv">${letterNo}</span>
          <span class="ml">${showDate ? 'تاریخ:' : ''}</span><span class="mv">${letterDate}</span>
          <span class="ml">${showAtt ? 'پیوست:' : ''}</span><span class="mv">${letterAttach}</span>
        </div>
      </div>
    </div>

    ${showSubject ? `<div class="subject-line">
      <span style="color: #6E1B1B;">موضوع:</span> ${letterSubject}
    </div>` : ''}

    <div class="content-body" style="padding-left: ${bodyPaddingX}px; padding-right: ${bodyPaddingX}px; transform: translate(${bodyOffsetX}px, ${bodyOffsetY}px);">
      ${letterBody}
    </div>

    <!-- Signature Section: BORDERLESS & CLEAN -->
    <div class="signature-section">
      <div class="ceo-signature-block">
        <div style="transform: translate(${signatureOffsetX}px, ${signatureOffsetY}px); text-align: center;">
          <div class="ceo-name">${finalCeoName}</div>
          <div class="ceo-title">${finalCeoTitle}</div>
        </div>
        
        <div class="stamp-container">
          ${signatureImg ? `<img src="${attr(signatureImg)}" alt="امضای مدیرعامل" class="signature-img" style="height: ${finalSigHeight}px; transform: translate(-50%, -50%) translate(${sigImgOffsetX}px, ${sigImgOffsetY}px);" />` : ''}
          ${stampImg ? `<img src="${attr(stampImg)}" alt="مهر شرکت" class="stamp-img" style="height: ${stampHeight}px; opacity: 0.9; transform: translate(-50%, -50%) translate(${stampOffsetX}px, ${stampOffsetY}px);" />` : ''}
        </div>
      </div>
    </div>

      </td></tr>
      ${copies.length ? `<tr><td class="pg-copies"><div style="padding-top: 12px; font-size: 11.5px; font-weight: 700; line-height: 1.9; color: #3A241F;"><div style="color: #6E1B1B;">رونوشت:</div>${copies.map((c) => `<div>${c.replace(/</g, '&lt;')}</div>`).join('')}</div></td></tr>` : ''}
      </tbody>
    </table>
  </div>
<script>
// The sheet is paged by the browser (the .pg table repeats its head and foot on every page). Its height is made a whole number of
// pages, so that the foot band and the foot lines of the LAST page sit at the bottom of that page and not right under the text.
(function () {
  var PAGE = ${pageHdesign};
  function fit() {
    var t = document.querySelector('.pg');
    if (!t) return;
    t.style.height = 'auto';
    var head = t.tHead ? t.tHead.offsetHeight : 0;
    var foot = t.tFoot ? t.tFoot.offsetHeight : 0;
    var room = PAGE - head - foot; // what one printed page holds of the letter
    var body = t.offsetHeight - head - foot;
    var pages = Math.max(1, Math.ceil((body - 3) / room));
    // the head and foot are drawn again on every further page, so the table needs that much less height than whole pages
    t.style.height = (head + foot + pages * room - 4) + 'px';
  }
  window.__fitPrint = fit;
  window.addEventListener('load', function () { fit(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit); setTimeout(fit, 300); });
  window.addEventListener('beforeprint', fit);
  if (window.matchMedia) { var mq = window.matchMedia('print'); if (mq.addEventListener) mq.addEventListener('change', function (e) { if (e.matches) fit(); }); }
})();
</script>
</body>
</html>`;
}

export function openAndDownloadPdfLetter(
  transfer: FileTransfer,
  settings: SystemSettings,
  currentUser?: User,
  overrides?: LetterPrintOverrides
) {
  const html = generateOfficialLetterHtml(transfer, settings, currentUser, overrides);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const printWindow = window.open(url, '_blank');
  if (printWindow) {
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 400);
    };
  }
}
