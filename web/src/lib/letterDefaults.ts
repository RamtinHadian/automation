// Default size (px) of the CEO signature on official letters. The stamp is derived from it.
export const DEFAULT_SIGNATURE_HEIGHT = 100;
/** the stamp has its own size: it does not follow the signature (until the person sets it) */
export const defaultStampHeight = (isA5: boolean): number => (isA5 ? 95 : 105);
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
