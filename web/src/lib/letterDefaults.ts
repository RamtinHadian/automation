// Default size (px) of the CEO signature on official letters. The stamp is derived from it.
export const DEFAULT_SIGNATURE_HEIGHT = 100;
/** the stamp has its own size: it does not follow the signature (until the person sets it) */
/** Sheet width in design pixels / in centimetres, per paper: the stamp's real size (cm, set by the admin) becomes pixels on the sheet. */
const PX_PER_CM: Record<string, number> = { A4: 720 / 21, A5: 580 / 14.8, Letter: 700 / 21.59, Letterhead: 740 / 21 };
export const stampPxFromCm = (cm: number, pageSize?: string): number => Math.round(cm * (PX_PER_CM[pageSize || 'A4'] || PX_PER_CM.A4));
/**
 * Default stamp height in px: the size the admin set in centimetres (real size) when there is one, else the built-in default.
 * `settings.companyStampSizeCm`; the sheet is `pageSize` (A5 when only `isA5` is known).
 */
export const defaultStampHeight = (isA5: boolean, cm?: number | null, pageSize?: string): number =>
  cm && cm > 0 ? stampPxFromCm(cm, pageSize || (isA5 ? 'A5' : 'A4')) : isA5 ? 95 : 105;
/** The stamp size is fixed by the admin: letters cannot change it. */
export const stampSizeLocked = (s?: { companyStampSizeCm?: number; companyStampSizeLocked?: boolean } | null): boolean => !!(s && s.companyStampSizeLocked && s.companyStampSizeCm && s.companyStampSizeCm > 0);
export const DEFAULT_SIGNATURE_HEIGHT_A5 = 75;
export const MIN_SIGNATURE_HEIGHT = 20;
export const MAX_SIGNATURE_HEIGHT = 600;

// Values that earlier versions stored automatically (200/130 were the old oversized defaults, 100/75 the
// built-in defaults). They count as "not customised", so a changed default size also applies to those letters.
const LEGACY_DEFAULTS = new Set([200, 130, 100, 75]);

/** Default height for a new letter: the admin-configured size (settings) or the built-in default. */
export const defaultSignatureHeight = (isA5: boolean, custom?: number | null): number => {
  const base = custom && custom > 0 ? custom : DEFAULT_SIGNATURE_HEIGHT;
  return isA5 ? Math.round(base * 0.75) : base;
};

/** Returns the stored height, or the current default when unset or one of the old automatic defaults. */
export const resolveSignatureHeight = (
  stored: number | undefined | null,
  isA5: boolean,
  custom?: number | null
): number => (!stored || LEGACY_DEFAULTS.has(stored) ? defaultSignatureHeight(isA5, custom) : stored);

// The signature image and the stamp are absolutely positioned inside a fixed-width area, each at its own
// anchor (percent of the width, vertically centred). Resizing one therefore never moves or squeezes the other.
export const SIGNATURE_ANCHOR_LEFT = '62%';
export const STAMP_ANCHOR_LEFT = '30%';

/** Height reserved for the signature/stamp area so large images do not overlap the text below. */
export const signatureAreaHeight = (isA5: boolean, signatureHeight: number, stampHeight: number): number =>
  Math.max(isA5 ? 60 : 85, signatureHeight, stampHeight);

/**
 * The editor wraps the saved text in a div that already carries the side padding and the sideways shift (so «ویرایش» can read
 * them back). The preview and the printed page apply the same two values again from the letter's own fields, which doubled
 * the margins. This removes the two from the wrapper where it is only displayed, so the page looks like the editor.
 */
export const stripBakedBodyLayout = (html: string): string =>
  html.replace(/padding-left:\s*[\d.]+px;\s*padding-right:\s*[\d.]+px;\s*transform:\s*translateX\(\s*-?[\d.]+px\s*\);?/i, '');

/** Faint, slanted, repeated «این نامه هنوز امضا نشده است» over a whole unsigned letter: the letter stays readable, the draft status is clear. */
export const UNSIGNED_WATERMARK = (() => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="190">' +
    '<text x="150" y="100" text-anchor="middle" font-family="Vazirmatn, Tahoma, Arial, sans-serif" font-size="19" font-weight="700" fill="#b45309" fill-opacity="0.13" transform="rotate(-24 150 95)">این نامه هنوز امضا نشده است</text>' +
    '</svg>';
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
})();
