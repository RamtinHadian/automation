import type { CSSProperties } from 'react';

/**
 * The block of «شماره / تاریخ / پیوست» at the top of a letter. The editor, the preview before signing and the printed / PDF page all draw it from
 * THESE numbers, so it has the same size, the same column widths and the same alignment in the three places (the position the person gave it while
 * designing is then also the position on paper). Sizes are in the page's own pixels.
 */
export const letterMeta = (isA5: boolean) => ({
  /** text size */
  fontSize: isA5 ? 9.5 : 11,
  /** the column of values (fixed, so the text starts at the same place whatever its length is) */
  valueWidth: isA5 ? 84 : 112,
  columnGap: 8,
  rowGap: 4,
  lineHeight: 1.5,
});

/** The style of the grid that holds the labels and the values. */
export const letterMetaGridStyle = (isA5: boolean): CSSProperties => {
  const m = letterMeta(isA5);
  return {
    display: 'grid',
    gridTemplateColumns: `auto ${m.valueWidth}px`,
    columnGap: m.columnGap,
    rowGap: m.rowGap,
    alignItems: 'center',
    textAlign: 'right',
    fontSize: m.fontSize,
    lineHeight: m.lineHeight,
  };
};

/** The same grid as a CSS text (for the printed page, which is plain HTML). */
export const letterMetaGridCss = (isA5: boolean): string => {
  const m = letterMeta(isA5);
  return `display: grid; grid-template-columns: auto ${m.valueWidth}px; column-gap: ${m.columnGap}px; row-gap: ${m.rowGap}px; align-items: center; text-align: right; font-size: ${m.fontSize}px; line-height: ${m.lineHeight};`;
};
