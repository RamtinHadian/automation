// Default size (px) of the CEO signature on official letters. The stamp is derived from it.
export const DEFAULT_SIGNATURE_HEIGHT = 100;
export const DEFAULT_SIGNATURE_HEIGHT_A5 = 75;
export const MIN_SIGNATURE_HEIGHT = 30;
export const MAX_SIGNATURE_HEIGHT = 380;

// Earlier versions stored these as automatic defaults, which made signatures far too large.
const LEGACY_DEFAULTS = new Set([200, 130]);

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
