/**
 * A cell that starts with = + - @ (or a tab / line break) is read by Excel as a formula, so a customer name like «=HYPERLINK(…)» typed by somebody could
 * run when a colleague opens the exported file. Such text gets a leading apostrophe so it stays plain text. Plain numbers (also negative ones and
 * phone numbers written with +98) are left alone.
 */
export const safeCell = (v: unknown): string => {
  const s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d٠-٩۰-۹][\d٠-٩۰-۹.,٫٬\s]*$/.test(s)) return "'" + s;
  return s;
};

/** Saves rows as a spreadsheet file (CSV with a byte-order mark, so Excel reads the Persian text correctly). */
export function downloadCsv(name: string, rows: (string | number | undefined | null)[][]) {
  const body = rows.map((r) => r.map((c) => `"${safeCell(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
