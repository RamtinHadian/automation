// Default size (px) of the CEO signature on official letters. The stamp is derived from it.
export const DEFAULT_SIGNATURE_HEIGHT = 100;
export const DEFAULT_SIGNATURE_HEIGHT_A5 = 75;

// Earlier versions stored these as automatic defaults, which made signatures far too large.
const LEGACY_DEFAULTS = new Set([200, 130]);

export const defaultSignatureHeight = (isA5: boolean) =>
  isA5 ? DEFAULT_SIGNATURE_HEIGHT_A5 : DEFAULT_SIGNATURE_HEIGHT;

/** Returns the stored height, or the current default when unset or one of the old automatic defaults. */
export const resolveSignatureHeight = (stored: number | undefined | null, isA5: boolean): number =>
  !stored || LEGACY_DEFAULTS.has(stored) ? defaultSignatureHeight(isA5) : stored;
