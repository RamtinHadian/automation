import { FileTransfer, SystemSettings, User } from '../types';
import { resolveSignatureHeight, signatureAreaHeight, SIGNATURE_ANCHOR_LEFT, STAMP_ANCHOR_LEFT } from './letterDefaults';
import { formatCurrentJalaliDateTime, toPersianDigits } from './jalali';
import { DEFAULT_FONTS, getFontsCssForPrint } from './fonts';

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
  showFooterNote?: boolean;
  headerCenterOffsetX?: number;
  headerCenterOffsetY?: number;
  subjectOffsetX?: number;
  subjectOffsetY?: number;
  metaOffsetX?: number;
  metaOffsetY?: number;
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
  signatureImgOffsetX?: number;
  signatureImgOffsetY?: number;
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
  const showSig = (overrides?.showSignatureImage ?? transfer.showSignatureImage) !== false;
  const showStamp = (overrides?.showStampImage ?? transfer.showStampImage) !== false;
  const showNo = (overrides?.showLetterNumber ?? transfer.showLetterNumber) !== false;
  const showDate = (overrides?.showLetterDate ?? transfer.showLetterDate) !== false;
  const showAtt = (overrides?.showLetterAttachment ?? transfer.showLetterAttachment) !== false;
  const showLogo = (overrides?.showLogo ?? transfer.showLogo) !== false;
  const showOrgName = (overrides?.showOrgName ?? transfer.showOrgName) !== false;
  const signatureImg = showSig ? transfer.signatureImageUrl || settings.ceoSignatureUrl : undefined;
  const stampImg = showStamp ? transfer.companyStampImageUrl || settings.companyStampUrl : undefined;

  const pageSize = (overrides?.pageSize || transfer.pageSize || 'A4').trim();
  const isA5 = pageSize.toUpperCase() === 'A5';
  const isLetter = pageSize.toUpperCase() === 'LETTER';

  const pageCssSize = isA5 ? 'A5 portrait' : isLetter ? 'letter portrait' : 'A4 portrait';
  const pageMargin = isA5 ? '6mm 8mm' : '10mm 14mm';
  const containerMaxWidth = isA5 ? '580px' : isLetter ? '700px' : '720px';
  const containerMinHeight = isA5 ? '600px' : isLetter ? '720px' : '760px';
  const containerPadding = isA5 ? '32px' : isLetter ? '40px' : '48px';

  const allFonts = [...DEFAULT_FONTS, ...(settings.customFonts || [])];
  const activeFontFamily = overrides?.letterFontFamily || transfer.letterFontFamily;
  const chosenFont = activeFontFamily
    ? (allFonts.find((f) => f.fontFamily === activeFontFamily || f.id === activeFontFamily) || { id: 'custom', name: 'Custom', fontFamily: activeFontFamily })
    : (allFonts.find((f) => f.id === settings.defaultLetterFontId) || DEFAULT_FONTS[0]);
  const customFontsCss = getFontsCssForPrint(settings.customFonts || []);

  const companyName = overrides?.customCompanyTitle !== undefined ? overrides.customCompanyTitle : (transfer.customHeaderCompanyTitle !== undefined ? transfer.customHeaderCompanyTitle : (settings.companyName || ''));
  const companySubtitle = overrides?.customCompanySubtitle !== undefined ? overrides.customCompanySubtitle : (transfer.customHeaderCompanySubtitle !== undefined ? transfer.customHeaderCompanySubtitle : (settings.companySubtitle || ''));
  const companyLogo = showLogo ? settings.companyLogoUrl : undefined;

  const rawLetterNo = overrides?.customNumber || transfer.customHeaderNumber || transfer.letterNumber || transfer.fileName.replace(/\.[^/.]+$/, '').replace(/^نامه_/, '');
  const letterNo = toPersianDigits(rawLetterNo);

  const rawLetterDate = overrides?.customDate || transfer.customHeaderDate || transfer.sentAt.split(' - ')[0] || formatCurrentJalaliDateTime().split(' - ')[0];
  const letterDate = toPersianDigits(rawLetterDate);

  const letterAttach = overrides?.customAttachment || transfer.customHeaderAttachment || 'دارد (الکترونیک)';
  const letterSubject = overrides?.customSubject || transfer.customHeaderSubject || transfer.fileName.replace(/\.[^/.]+$/, '').replace(/^نامه_/, '').replace(/_/g, ' ');
  const headerTitle = overrides?.customHeaderTitle !== undefined ? overrides.customHeaderTitle : (transfer.customHeaderCenterTitle !== undefined ? transfer.customHeaderCenterTitle : '');

  const letterBody =
    overrides?.customBody ||
    transfer.letterContentHtml ||
    transfer.note ||
    'متن نامه رسمی جهت استحضار، بررسی و صدور دستور مقتضی ارسال گردیده است.';

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
  const metaOffsetY = overrides?.metaOffsetY !== undefined ? overrides.metaOffsetY : (transfer.metaOffsetY || 0);

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
  const stampHeight = overrides?.stampHeight || transfer.stampHeight || (isA5 ? Math.min(Math.round(finalSigHeight * 0.95), 100) : Math.round(finalSigHeight * 1.05));
  const stampOffsetX = overrides?.stampOffsetX !== undefined ? overrides.stampOffsetX : (transfer.stampOffsetX || 0);
  const stampOffsetY = overrides?.stampOffsetY !== undefined ? overrides.stampOffsetY : (transfer.stampOffsetY || 0);
  const sigImgOffsetX = overrides?.signatureImgOffsetX !== undefined ? overrides.signatureImgOffsetX : (transfer.signatureImgOffsetX || 0);
  const sigImgOffsetY = overrides?.signatureImgOffsetY !== undefined ? overrides.signatureImgOffsetY : (transfer.signatureImgOffsetY || 0);

  const areaHeight = signatureAreaHeight(isA5, finalSigHeight, stampHeight);

  const signedDateTime = toPersianDigits(transfer.signedAt || formatCurrentJalaliDateTime());

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>${letterSubject} - سند رسمی اداری (${isA5 ? 'A5' : isLetter ? 'Letter' : 'A4'})</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&family=Sahel:wght@400;700&family=Shabnam:wght@400;700&display=swap" rel="stylesheet">
  <style>
    @font-face {
      font-family: 'B Nazanin';
      src: local('B Nazanin'), local('BNazanin'), url('https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/fonts/webfonts/Vazirmatn-Regular.woff2') format('woff2');
    }
    @font-face {
      font-family: 'B Titr';
      src: local('B Titr'), local('BTitr'), local('B Titr Bold'), url('https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/fonts/webfonts/Vazirmatn-Bold.woff2') format('woff2');
    }
    @font-face {
      font-family: 'B Yekan';
      src: local('B Yekan'), local('BYekan'), url('https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/fonts/webfonts/Vazirmatn-Medium.woff2') format('woff2');
    }
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
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print {
        display: none !important;
      }
      .letter-container {
        width: 100% !important;
        max-width: 100% !important;
        height: 100% !important;
        min-height: 100vh !important;
        padding: ${containerPadding} !important;
        margin: 0 !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        overflow: hidden !important;
      }
      .page-footer-wrapper {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
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
    .letter-container {
      max-width: ${containerMaxWidth};
      margin: 0 auto;
      min-height: ${containerMinHeight};
      background: #ffffff;
      padding: ${containerPadding};
      border-radius: 6px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-sizing: border-box;
    }
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
      max-width: 38%;
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
      max-width: 38%;
    }
    .meta-box,
    .meta-box table,
    .meta-box td,
    .meta-box span,
    .meta-box b {
      font-family: '${metaFont}', 'B Nazanin', 'Vazirmatn', Tahoma, sans-serif !important;
      font-size: ${isA5 ? '9.5px' : '10.5px'};
      line-height: ${isA5 ? '1.5' : '1.6'};
    }
    .letter-title,
    .letter-title span {
      position: absolute;
      left: 50%;
      top: 0;
      transform: translate(calc(-50% + ${headerCenterOffsetX}px), ${headerCenterOffsetY}px);
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
      font-size: 9.5px;
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
    <div class="header">
      <div class="org-box" style="transform: translate(${orgOffsetX}px, ${orgOffsetY}px);">
        ${companyLogo ? `<img src="${attr(companyLogo)}" class="org-logo" alt="لوگو" />` : ''}
        ${showOrgName ? `<div>
          ${companyName ? `<h1 class="org-title">${companyName}</h1>` : ''}
          ${companySubtitle ? `<div class="org-sub">${companySubtitle}</div>` : ''}
        </div>` : ''}
      </div>
      <div class="letter-title">
        ${headerTitle ? `<span>${headerTitle}</span>` : ''}
      </div>
      <div class="meta-box" style="transform: translate(${metaOffsetX}px, ${metaOffsetY}px); font-family: '${metaFont}', inherit; text-align: right; line-height: 1.8;">
        <table style="border-collapse: collapse; border: none; font-size: inherit; font-family: inherit; margin: 0; padding: 0;">
          <tr>
            <td style="padding: 1px 4px 1px 0; color: #8C6F66; font-weight: bold; text-align: right;">${showNo ? 'شماره:' : ''}</td>
            <td style="padding: 1px 0; color: #3A241F; font-weight: bold; text-align: right;">${letterNo}</td>
          </tr>
          <tr>
            <td style="padding: 1px 4px 1px 0; color: #8C6F66; font-weight: bold; text-align: right;">${showDate ? 'تاریخ:' : ''}</td>
            <td style="padding: 1px 0; color: #3A241F; font-weight: bold; text-align: right;">${letterDate}</td>
          </tr>
          <tr>
            <td style="padding: 1px 4px 1px 0; color: #8C6F66; font-weight: bold; text-align: right;">${showAtt ? 'پیوست:' : ''}</td>
            <td style="padding: 1px 0; color: #3A241F; font-weight: bold; text-align: right;">${letterAttach}</td>
          </tr>
        </table>
      </div>
    </div>

    <div class="subject-line">
      <span style="color: #6E1B1B;">موضوع:</span> ${letterSubject}
    </div>

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
          ${!isSigned ? `
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #d97706; color: white; padding: 5px 14px; border-radius: 10px; font-weight: 900; font-size: 11px; white-space: nowrap; box-shadow: 0 4px 10px rgba(0,0,0,0.15); border: 1.5px solid #fef3c7;">
              ⚠️ این نامه هنوز امضا نشده است
            </div>
          ` : ''}
        </div>
      </div>
    </div>

    ${showFooter ? `
    <div class="footer">
      <div>${overrides?.customFooterNote || transfer.customFooterNote || settings.letterNumbering?.defaultFooterNote || settings.defaultFooterNote || 'سامانه مکاتبات و اسناد رسمی اداری'}</div>
    </div>
    ` : ''}
  </div>
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
