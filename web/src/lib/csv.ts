/** Saves rows as a spreadsheet file (CSV with a byte-order mark, so Excel reads the Persian text correctly). */
export function downloadCsv(name: string, rows: (string | number | undefined | null)[][]) {
  const body = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
