import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlignCenter, AlignLeft, AlignRight, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, Columns3, Combine, Grid3x3, Rows3, Split, Table2, Trash2, Palette, Rows4, SquareDashed, Heading, Undo2, Redo2, ALargeSmall, Highlighter, Baseline } from 'lucide-react';

/* ---------------------------------------------------------------------------------------------------------------------------------------
   The editing of tables and numbers inside a letter body (a contentEditable box):
     - every digit typed or pasted becomes a Persian digit at once;
     - the border of a column or a row can be dragged with the mouse (or a finger);
     - while the cursor is in a table a small tool bar floats above it: rows, columns, merge, colours, borders, alignment.
   It works on the DOM of the editor and then tells the owner with an «input» event, so each editor keeps saving its text as before.
   --------------------------------------------------------------------------------------------------------------------------------------- */

const FA = '۰۱۲۳۴۵۶۷۸۹';
const toFa = (s: string) => s.replace(/[0-9]/g, (d) => FA[+d]).replace(/[٠-٩]/g, (d) => FA['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
const HAS_LATIN_DIGIT = /[0-9٠-٩]/;

/** Persian digits in every text of the box, keeping the cursor where it was. */
export function persianizeDigits(root: HTMLElement) {
  const sel = window.getSelection();
  const keep = sel && sel.rangeCount > 0 ? { a: sel.anchorNode, ao: sel.anchorOffset, f: sel.focusNode, fo: sel.focusOffset } : null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null = walker.nextNode();
  let changed = false;
  while (n) {
    const v = n.nodeValue || '';
    if (HAS_LATIN_DIGIT.test(v)) {
      n.nodeValue = toFa(v);
      changed = true;
    }
    n = walker.nextNode();
  }
  if (changed && keep && keep.a && root.contains(keep.a)) {
    try {
      sel!.setBaseAndExtent(keep.a, Math.min(keep.ao, (keep.a.nodeValue || '').length || keep.ao), keep.f || keep.a, Math.min(keep.fo, (keep.f?.nodeValue || '').length || keep.fo));
    } catch {
      /* the cursor stays where the browser put it */
    }
  }
}

const tell = (editor: HTMLElement) => editor.dispatchEvent(new Event('input', { bubbles: true }));
const cellOf = (n: Node | null, editor: HTMLElement): HTMLTableCellElement | null => {
  const el = n && (n.nodeType === 1 ? (n as HTMLElement) : n.parentElement);
  const c = el?.closest('td,th') as HTMLTableCellElement | null;
  return c && editor.contains(c) ? c : null;
};
const isRtl = (t: HTMLElement) => getComputedStyle(t).direction === 'rtl';

/** A <colgroup> with a percentage width for every column, made from what the table looks like now. */
function ensureColgroup(table: HTMLTableElement): HTMLTableColElement[] {
  const first = table.rows[0];
  const count = first ? Array.from(first.cells).reduce((s, c) => s + (c.colSpan || 1), 0) : 0;
  let cg = table.querySelector(':scope > colgroup') as HTMLTableColElement | null;
  if (!cg || cg.children.length !== count) {
    cg?.remove();
    cg = document.createElement('colgroup') as HTMLTableColElement;
    const tw = table.getBoundingClientRect().width || 1;
    let col = 0;
    const widths: number[] = Array(count).fill(100 / Math.max(1, count));
    if (first) {
      for (const c of Array.from(first.cells)) {
        const span = c.colSpan || 1;
        const w = (c.getBoundingClientRect().width / tw) * 100;
        for (let i = 0; i < span; i++) widths[col + i] = w / span;
        col += span;
      }
    }
    for (const w of widths) {
      const el = document.createElement('col');
      el.style.width = `${w.toFixed(2)}%`;
      cg.appendChild(el);
    }
    table.insertBefore(cg, table.firstChild);
  }
  table.style.tableLayout = 'fixed';
  table.style.width = table.style.width || '100%';
  return Array.from(cg.children) as HTMLTableColElement[];
}

const normalize = (cols: HTMLTableColElement[]) => {
  const total = cols.reduce((s, c) => s + parseFloat(c.style.width || '0'), 0) || 1;
  cols.forEach((c) => (c.style.width = `${((parseFloat(c.style.width || '0') / total) * 100).toFixed(2)}%`));
};

/** The numbers and the tables of one editor box. `enabled` lets an editor that appears later (an editing mode) switch the hook on. */
export interface BodyEditing {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** make the selected text bigger (+) or smaller (-) by `delta` pixels */
  stepFont: (delta: number) => void;
  setColor: (kind: 'fore' | 'hilite', color: string) => void;
}

const caretOffset = (ed: HTMLElement): number | null => {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !ed.contains(sel.anchorNode)) return null;
  const r = document.createRange();
  r.selectNodeContents(ed);
  r.setEnd(sel.anchorNode as Node, sel.anchorOffset);
  return r.toString().length;
};
const setCaretOffset = (ed: HTMLElement, n: number) => {
  const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
  let left = n;
  let node = w.nextNode();
  while (node) {
    const len = (node.nodeValue || '').length;
    if (left <= len) {
      const r = document.createRange();
      r.setStart(node, left);
      r.collapse(true);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
      return;
    }
    left -= len;
    node = w.nextNode();
  }
};

/** The numbers and the tables of one editor box, plus its own undo / redo (the tables are changed by code, which the browser's undo does not know). `enabled` lets an editor that appears later switch the hook on. */
export function useLetterBodyEditing(ref: React.RefObject<HTMLElement | null>, enabled = true, deps: unknown[] = []): BodyEditing {
  const hist = useRef<{ stack: string[]; i: number; timer: ReturnType<typeof setTimeout> | null; applying: boolean }>({ stack: [], i: -1, timer: null, applying: false });
  const [, setVer] = useState(0);
  const bump = () => setVer((v) => v + 1);

  const snapshot = useCallback(() => {
    const ed = ref.current;
    const h = hist.current;
    if (!ed) return;
    const html = ed.innerHTML;
    if (h.stack[h.i] === html) return;
    h.stack = h.stack.slice(0, h.i + 1);
    h.stack.push(html);
    if (h.stack.length > 120) h.stack.shift();
    h.i = h.stack.length - 1;
    bump();
  }, [ref]);
  const flush = useCallback(() => {
    const h = hist.current;
    if (h.timer) {
      clearTimeout(h.timer);
      h.timer = null;
    }
    snapshot();
  }, [snapshot]);
  const apply = useCallback(
    (html: string, caret: number | null) => {
      const ed = ref.current;
      if (!ed) return;
      const h = hist.current;
      h.applying = true;
      ed.innerHTML = html;
      ed.focus();
      if (caret !== null) setCaretOffset(ed, caret);
      tell(ed);
      h.applying = false;
      bump();
    },
    [ref]
  );
  const undo = useCallback(() => {
    flush();
    const h = hist.current;
    const ed = ref.current;
    if (h.i > 0 && ed) {
      const c = caretOffset(ed);
      h.i -= 1;
      apply(h.stack[h.i], c);
    }
  }, [flush, apply, ref]);
  const redo = useCallback(() => {
    flush();
    const h = hist.current;
    const ed = ref.current;
    if (h.i < h.stack.length - 1 && ed) {
      const c = caretOffset(ed);
      h.i += 1;
      apply(h.stack[h.i], c);
    }
  }, [flush, apply, ref]);

  const stepFont = useCallback(
    (delta: number) => {
      const ed = ref.current;
      const sel = window.getSelection();
      if (!ed || !sel || sel.rangeCount === 0 || sel.isCollapsed || !ed.contains(sel.anchorNode)) return;
      // the size of the first letter of the selection (not of the box that holds it)
      const range0 = sel.getRangeAt(0);
      let first: Node | null = range0.startContainer.nodeType === 3 ? range0.startContainer : range0.startContainer.childNodes[range0.startOffset] || range0.startContainer;
      while (first && first.nodeType !== 3 && first.firstChild) first = first.firstChild;
      const startEl = (first && first.nodeType === 3 ? first.parentElement : (first as HTMLElement)) as HTMLElement;
      const cur = parseFloat(getComputedStyle(startEl || ed).fontSize) || 13;
      const size = Math.max(8, Math.min(60, Math.round(cur + delta)));
      document.execCommand('styleWithCSS', false, 'false');
      document.execCommand('fontSize', false, '7');
      const made: HTMLElement[] = [];
      ed.querySelectorAll('font[size="7"]').forEach((f) => {
        const span = document.createElement('span');
        span.style.fontSize = `${size}px`;
        while (f.firstChild) span.appendChild(f.firstChild);
        f.replaceWith(span);
        made.push(span);
      });
      if (made.length) {
        // keep the same text selected (anchored inside the new spans, so the next step reads the new size)
        const textIn = (el: HTMLElement, last: boolean) => {
          const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let n = w.nextNode();
          let keep: Node | null = null;
          while (n) {
            keep = n;
            if (!last) break;
            n = w.nextNode();
          }
          return keep;
        };
        const a = textIn(made[0], false);
        const z = textIn(made[made.length - 1], true);
        if (a && z) {
          const r = document.createRange();
          r.setStart(a, 0);
          r.setEnd(z, (z.nodeValue || '').length);
          sel.removeAllRanges();
          sel.addRange(r);
        }
      }
      tell(ed);
    },
    [ref]
  );
  const setColor = useCallback(
    (kind: 'fore' | 'hilite', color: string) => {
      const ed = ref.current;
      if (!ed) return;
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand(kind === 'fore' ? 'foreColor' : 'hiliteColor', false, color);
      tell(ed);
    },
    [ref]
  );

  useEffect(() => {
    const ed = ref.current;
    if (!ed || !enabled) return;
    const h = hist.current;
    h.stack = [ed.innerHTML];
    h.i = 0;
    const onHistory = () => {
      if (h.applying) return;
      if (h.timer) clearTimeout(h.timer);
      h.timer = setTimeout(() => {
        h.timer = null;
        snapshot();
      }, 350);
    };
    const onHistoryKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    ed.addEventListener('input', onHistory);
    ed.addEventListener('keydown', onHistoryKey);

    // ---- digits: after every change of the text (typing, a phone keyboard, paste, drop) ----
    const onInput = (e: Event) => {
      const t = (e as InputEvent).inputType || '';
      const sel = window.getSelection();
      if (/^insertFrom|^insertReplacement|^deleteBy|^historyU|^historyR/.test(t) || !sel || !sel.anchorNode) {
        if (HAS_LATIN_DIGIT.test(ed.textContent || '')) persianizeDigits(ed);
        return;
      }
      const node = sel.anchorNode;
      if (node.nodeType === 3 && HAS_LATIN_DIGIT.test(node.nodeValue || '')) {
        const off = sel.anchorOffset;
        node.nodeValue = toFa(node.nodeValue || '');
        try {
          sel.collapse(node, off);
        } catch {
          /* ignore */
        }
      }
    };

    // ---- tables: drag the border of a column or a row ----
    type Drag =
      | { kind: 'col'; table: HTMLTableElement; cols: HTMLTableColElement[]; a: number; b: number; startX: number; widthA: number; widthB: number; tw: number; rtl: boolean }
      | { kind: 'row'; row: HTMLTableRowElement; startY: number; startH: number; scale: number };
    let drag: Drag | null = null;

    const edgeAt = (e: PointerEvent) => {
      const cell = cellOf(e.target as Node, ed);
      if (!cell) return null;
      const table = cell.closest('table') as HTMLTableElement;
      const r = cell.getBoundingClientRect();
      const tr = table.getBoundingClientRect();
      const slop = e.pointerType === 'touch' ? 12 : 5;
      const rtl = isRtl(table);
      const row = cell.parentElement as HTMLTableRowElement;
      const idx = Array.from(row.cells).indexOf(cell);
      // between this cell and the next one on its left / right
      if (e.clientX - r.left <= slop && r.left - tr.left > 3) return { kind: 'col' as const, table, idxA: rtl ? idx + (cell.colSpan - 1) + 1 : idx - 1, leftOfCell: true, cell };
      if (r.right - e.clientX <= slop && tr.right - r.right > 3) return { kind: 'col' as const, table, idxA: rtl ? idx - 1 : idx + (cell.colSpan - 1), leftOfCell: false, cell };
      if (r.bottom - e.clientY <= slop) return { kind: 'row' as const, row, cell };
      return null;
    };

    const onMove = (e: PointerEvent) => {
      if (!drag) {
        const edge = edgeAt(e);
        ed.style.cursor = edge ? (edge.kind === 'col' ? 'col-resize' : 'row-resize') : '';
        return;
      }
      e.preventDefault();
      if (drag.kind === 'col') {
        const d = drag;
        const dxPct = ((e.clientX - d.startX) / d.tw) * 100;
        // in a right-to-left table the column with the lower index lies on the right: moving the border to the left widens it
        const delta = d.rtl ? -dxPct : dxPct;
        const min = 4;
        const total = d.widthA + d.widthB;
        const wa = Math.min(total - min, Math.max(min, d.widthA + delta));
        d.cols[d.a].style.width = `${wa.toFixed(2)}%`;
        d.cols[d.b].style.width = `${(total - wa).toFixed(2)}%`;
      } else {
        const d = drag;
        d.row.style.height = `${Math.max(18, d.startH + (e.clientY - d.startY) / d.scale).toFixed(0)}px`;
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!drag) return;
      drag = null;
      try {
        ed.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      ed.style.cursor = '';
      tell(ed);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const edge = edgeAt(e);
      if (!edge) return;
      e.preventDefault();
      e.stopPropagation();
      ed.setPointerCapture?.(e.pointerId);
      if (edge.kind === 'col') {
        const cols = ensureColgroup(edge.table);
        const a = Math.min(edge.idxA, edge.idxA + 1);
        const rtl = isRtl(edge.table);
        // the two columns of this border (by their order in the markup)
        const left = edge.leftOfCell ? (rtl ? edge.idxA - 1 : edge.idxA) : edge.idxA;
        const A = Math.max(0, Math.min(cols.length - 2, rtl ? (edge.leftOfCell ? left : left) : left));
        void a;
        const aIdx = Math.max(0, Math.min(cols.length - 2, rtl ? (edge.leftOfCell ? A : A) : A));
        drag = {
          kind: 'col',
          table: edge.table,
          cols,
          a: aIdx,
          b: aIdx + 1,
          startX: e.clientX,
          widthA: parseFloat(cols[aIdx].style.width),
          widthB: parseFloat(cols[aIdx + 1].style.width),
          tw: edge.table.getBoundingClientRect().width || 1,
          rtl,
        };
      } else {
        const rect = edge.row.getBoundingClientRect();
        drag = { kind: 'row', row: edge.row, startY: e.clientY, startH: rect.height / (ed.getBoundingClientRect().width / (ed.offsetWidth || 1) || 1), scale: ed.getBoundingClientRect().width / (ed.offsetWidth || 1) || 1 };
      }
    };

    // ---- Tab / Shift+Tab walks through the cells; Tab in the last cell adds a row ----
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const sel = window.getSelection();
      const cell = sel && sel.anchorNode ? cellOf(sel.anchorNode, ed) : null;
      if (!cell) return;
      e.preventDefault();
      const table = cell.closest('table') as HTMLTableElement;
      const cells = Array.from(table.querySelectorAll('td,th')) as HTMLTableCellElement[];
      let i = cells.indexOf(cell) + (e.shiftKey ? -1 : 1);
      if (i >= cells.length) {
        addRow(cell, true);
        const fresh = Array.from(table.querySelectorAll('td,th')) as HTMLTableCellElement[];
        i = fresh.indexOf(cell) + 1;
        placeCaret(fresh[i]);
        return;
      }
      if (i >= 0) placeCaret(cells[i]);
    };

    ed.addEventListener('input', onInput);
    ed.addEventListener('pointermove', onMove);
    ed.addEventListener('pointerdown', onDown, true);
    ed.addEventListener('pointerup', onUp);
    ed.addEventListener('pointercancel', onUp);
    ed.addEventListener('keydown', onKey);
    // a text that already holds Latin digits when the editor opens
    if (HAS_LATIN_DIGIT.test(ed.textContent || '')) persianizeDigits(ed);
    return () => {
      ed.removeEventListener('input', onHistory);
      ed.removeEventListener('keydown', onHistoryKey);
      if (h.timer) clearTimeout(h.timer);
      ed.removeEventListener('input', onInput);
      ed.removeEventListener('pointermove', onMove);
      ed.removeEventListener('pointerdown', onDown, true);
      ed.removeEventListener('pointerup', onUp);
      ed.removeEventListener('pointercancel', onUp);
      ed.removeEventListener('keydown', onKey);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, enabled, ...deps]);

  const hh = hist.current;
  return { undo, redo, canUndo: hh.i > 0, canRedo: hh.i < hh.stack.length - 1, stepFont, setColor };
}

function placeCaret(cell: HTMLElement | undefined) {
  if (!cell) return;
  const r = document.createRange();
  r.selectNodeContents(cell);
  r.collapse(true);
  const s = window.getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}

/* ----------------------------------------------- the operations ----------------------------------------------- */

const newCell = (like: HTMLTableCellElement | undefined, tag: 'td' | 'th' = 'td') => {
  const c = document.createElement(tag);
  if (like) {
    const st = like.getAttribute('style');
    if (st) c.setAttribute('style', st);
  } else c.setAttribute('style', 'border: 1px solid #EBDBCE; padding: 6px 10px; min-width: 40px;');
  c.innerHTML = '&nbsp;';
  return c;
};

function addRow(cell: HTMLTableCellElement, below: boolean) {
  const row = cell.parentElement as HTMLTableRowElement;
  const nr = document.createElement('tr');
  Array.from(row.cells).forEach((c) => {
    const n = newCell(c, 'td');
    n.style.backgroundColor = '';
    n.style.fontWeight = '';
    n.colSpan = c.colSpan;
    nr.appendChild(n);
  });
  const section = row.parentElement as HTMLElement;
  if (section.tagName === 'THEAD' && below) {
    const table = row.closest('table') as HTMLTableElement;
    let body = table.tBodies[0];
    if (!body) body = table.appendChild(document.createElement('tbody'));
    body.insertBefore(nr, body.firstChild);
  } else section.insertBefore(nr, below ? row.nextSibling : row);
}

/** side 'right' | 'left' is what the person sees; the markup order depends on the direction of the table. */
function addColumn(cell: HTMLTableCellElement, side: 'right' | 'left') {
  const table = cell.closest('table') as HTMLTableElement;
  const rtl = isRtl(table);
  const idx = cell.cellIndex;
  const after = rtl ? side === 'left' : side === 'right';
  const cg = table.querySelector(':scope > colgroup');
  Array.from(table.rows).forEach((row) => {
    const ref = row.cells[Math.min(idx, row.cells.length - 1)];
    const n = newCell(ref, ref?.tagName === 'TH' ? 'th' : 'td');
    if (ref?.tagName !== 'TH') n.style.backgroundColor = ref ? ref.style.backgroundColor : '';
    const pos = after ? idx + 1 : idx;
    if (pos >= row.cells.length) row.appendChild(n);
    else row.insertBefore(n, row.cells[pos]);
  });
  if (cg) {
    const cols = Array.from(cg.children) as HTMLTableColElement[];
    const col = document.createElement('col');
    col.style.width = `${(100 / (cols.length + 1)).toFixed(2)}%`;
    const pos = after ? idx + 1 : idx;
    cg.insertBefore(col, cols[pos] || null);
    normalize(Array.from(cg.children) as HTMLTableColElement[]);
  }
}

function deleteRow(cell: HTMLTableCellElement) {
  const row = cell.parentElement as HTMLTableRowElement;
  const table = row.closest('table') as HTMLTableElement;
  if (table.rows.length <= 1) table.remove();
  else row.remove();
}

function deleteColumn(cell: HTMLTableCellElement) {
  const table = cell.closest('table') as HTMLTableElement;
  const idx = cell.cellIndex;
  if ((table.rows[0]?.cells.length || 0) <= 1) {
    table.remove();
    return;
  }
  Array.from(table.rows).forEach((r) => r.cells[idx]?.remove());
  const cg = table.querySelector(':scope > colgroup');
  if (cg && cg.children[idx]) {
    cg.children[idx].remove();
    normalize(Array.from(cg.children) as HTMLTableColElement[]);
  }
}

function mergeWithNext(cell: HTMLTableCellElement) {
  const next = cell.nextElementSibling as HTMLTableCellElement | null;
  if (!next) return;
  const txt = (next.textContent || '').replace(/ /g, ' ').trim();
  if (txt) cell.innerHTML = (cell.innerHTML.replace(/&nbsp;$/, '') + ' ' + next.innerHTML).trim();
  cell.colSpan = (cell.colSpan || 1) + (next.colSpan || 1);
  next.remove();
}

function splitCell(cell: HTMLTableCellElement) {
  const span = cell.colSpan || 1;
  if (span < 2) return;
  cell.colSpan = 1;
  for (let i = 1; i < span; i++) cell.after(newCell(cell, cell.tagName === 'TH' ? 'th' : 'td'));
}

function equalColumns(table: HTMLTableElement) {
  table.querySelector(':scope > colgroup')?.remove();
  const cols = ensureColgroup(table);
  cols.forEach((c) => (c.style.width = `${(100 / cols.length).toFixed(2)}%`));
}

function setBorders(table: HTMLTableElement, mode: 'all' | 'rows' | 'none', width = 1) {
  const color = '#8C6F66';
  table.style.borderCollapse = 'collapse';
  table.querySelectorAll<HTMLElement>('td,th').forEach((c) => {
    c.style.border = '';
    c.style.borderTop = c.style.borderBottom = c.style.borderLeft = c.style.borderRight = '';
    if (mode === 'all') c.style.border = `${width}px solid ${color}`;
    else if (mode === 'rows') {
      c.style.borderTop = `${width}px solid ${color}`;
      c.style.borderBottom = `${width}px solid ${color}`;
      c.style.borderLeft = '0';
      c.style.borderRight = '0';
    } else c.style.border = '0';
  });
}

function toggleHeaderRow(cell: HTMLTableCellElement) {
  const row = cell.parentElement as HTMLTableRowElement;
  const on = !(row.cells[0]?.style.fontWeight === '700' || row.cells[0]?.style.fontWeight === 'bold');
  Array.from(row.cells).forEach((c) => {
    c.style.fontWeight = on ? '700' : '';
    c.style.backgroundColor = on ? '#FAF5F1' : '';
  });
}

const PALETTE = ['', '#FAF5F1', '#FEF3C7', '#DCFCE7', '#DBEAFE', '#FCE7F3', '#E5E7EB', '#FECACA'];

/** The floating tool bar of the table the cursor is in. */
export const TableTools: React.FC<{ editorRef: React.RefObject<HTMLElement | null>; enabled?: boolean }> = ({ editorRef, enabled = true }) => {
  const [cell, setCell] = useState<HTMLTableCellElement | null>(null);
  const [tick, setTick] = useState(0);
  const [colors, setColors] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const on = () => {
      const ed = editorRef.current;
      const sel = window.getSelection();
      if (!ed || !sel || !sel.anchorNode) return setCell(null);
      const c = cellOf(sel.anchorNode, ed);
      setCell((prev) => (prev === c ? prev : c));
      if (!c) setColors(false);
    };
    document.addEventListener('selectionchange', on);
    return () => document.removeEventListener('selectionchange', on);
  }, [editorRef, enabled]);

  const place = useCallback(() => {
    if (!cell || !cell.isConnected) return setPos(null);
    const table = cell.closest('table');
    if (!table) return setPos(null);
    const r = table.getBoundingClientRect();
    const w = bar.current?.offsetWidth || 360;
    const x = Math.min(window.innerWidth - w / 2 - 6, Math.max(w / 2 + 6, r.left + r.width / 2));
    const above = r.top - 8;
    setPos({ x, y: above > 56 ? above : Math.min(window.innerHeight - 60, r.bottom + 8), });
  }, [cell]);
  useLayoutEffect(() => {
    place();
  }, [place, tick]);
  useEffect(() => {
    if (!cell) return;
    const f = () => setTick((t) => t + 1);
    window.addEventListener('scroll', f, true);
    window.addEventListener('resize', f);
    const ed = editorRef.current;
    ed?.addEventListener('input', f);
    return () => {
      window.removeEventListener('scroll', f, true);
      window.removeEventListener('resize', f);
      ed?.removeEventListener('input', f);
    };
  }, [cell, editorRef]);

  if (!enabled || !cell || !cell.isConnected || !pos) return null;
  const table = cell.closest('table') as HTMLTableElement;
  const ed = editorRef.current as HTMLElement;
  const run = (fn: () => void) => () => {
    fn();
    tell(ed);
    setTick((t) => t + 1);
    const still = cell.isConnected ? cell : null;
    if (!still) setCell(null);
  };
  const Btn: React.FC<{ title: string; on: () => void; children: React.ReactNode; danger?: boolean }> = ({ title, on, children, danger }) => (
    <button type="button" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={on} className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center cursor-pointer ${danger ? 'text-rose-600 hover:bg-rose-50' : 'text-[#3A241F] hover:bg-[#FAF5F1]'}`}>
      {children}
    </button>
  );
  const Sep = () => <span className="w-px h-5 bg-[#EBDBCE] mx-0.5 shrink-0" />;
  return createPortal(
    <div
      ref={bar}
      dir="rtl"
      onMouseDown={(e) => e.preventDefault()}
      style={{ position: 'fixed', left: pos.x, top: pos.y, transform: `translate(-50%, ${pos.y < (cell.closest('table')?.getBoundingClientRect().top ?? 0) ? '-100%' : '0'})` }}
      className="z-[400] max-w-[96vw] flex items-center gap-0.5 p-1 bg-white border border-[#EBDBCE] rounded-2xl shadow-xl overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-table-tools
    >
      <span className="flex items-center gap-1 px-2 text-[11px] font-black text-[#6E1B1B] shrink-0"><Table2 className="w-4 h-4" />جدول</span>
      <Sep />
      <Btn title="افزودن سطر بالا" on={run(() => addRow(cell, false))}><ArrowUpToLine className="w-4 h-4" /></Btn>
      <Btn title="افزودن سطر پایین" on={run(() => addRow(cell, true))}><ArrowDownToLine className="w-4 h-4" /></Btn>
      <Btn title="افزودن ستون سمت راست" on={run(() => addColumn(cell, 'right'))}><ArrowRightToLine className="w-4 h-4" /></Btn>
      <Btn title="افزودن ستون سمت چپ" on={run(() => addColumn(cell, 'left'))}><ArrowLeftToLine className="w-4 h-4" /></Btn>
      <Sep />
      <Btn title="ادغام با خانهٔ کناری" on={run(() => mergeWithNext(cell))}><Combine className="w-4 h-4" /></Btn>
      <Btn title="جدا کردن خانهٔ ادغام‌شده" on={run(() => splitCell(cell))}><Split className="w-4 h-4" /></Btn>
      <Btn title="سطر عنوان (پررنگ و رنگی)" on={run(() => toggleHeaderRow(cell))}><Heading className="w-4 h-4" /></Btn>
      <Btn title="عرض مساوی برای ستون‌ها" on={run(() => equalColumns(table))}><Columns3 className="w-4 h-4" /></Btn>
      <Sep />
      <Btn title="راست‌چین خانه" on={run(() => (cell.style.textAlign = 'right'))}><AlignRight className="w-4 h-4" /></Btn>
      <Btn title="وسط‌چین خانه" on={run(() => (cell.style.textAlign = 'center'))}><AlignCenter className="w-4 h-4" /></Btn>
      <Btn title="چپ‌چین خانه" on={run(() => (cell.style.textAlign = 'left'))}><AlignLeft className="w-4 h-4" /></Btn>
      <Sep />
      <div className="relative shrink-0">
        <Btn title="رنگ پس‌زمینهٔ خانه" on={() => setColors((v) => !v)}><Palette className="w-4 h-4" /></Btn>
        {colors && (
          <div className="absolute top-full mt-1 right-0 z-10 bg-white border border-[#EBDBCE] rounded-xl shadow-xl p-2 grid grid-cols-4 gap-1.5" data-table-colors>
            {PALETTE.map((c) => (
              <button
                key={c || 'none'}
                type="button"
                title={c || 'بدون رنگ'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={run(() => {
                  cell.style.backgroundColor = c;
                  setColors(false);
                })}
                className="w-7 h-7 rounded-lg border border-[#EBDBCE] cursor-pointer"
                style={{ background: c || 'repeating-linear-gradient(45deg,#fff,#fff 4px,#f3e8df 4px,#f3e8df 8px)' }}
              />
            ))}
          </div>
        )}
      </div>
      <Btn title="کادر کامل جدول" on={run(() => setBorders(table, 'all'))}><Grid3x3 className="w-4 h-4" /></Btn>
      <Btn title="فقط خط‌های افقی" on={run(() => setBorders(table, 'rows'))}><Rows4 className="w-4 h-4" /></Btn>
      <Btn title="بدون کادر" on={run(() => setBorders(table, 'none'))}><SquareDashed className="w-4 h-4" /></Btn>
      <Btn title="کادر ضخیم‌تر" on={run(() => setBorders(table, 'all', 2))}><Rows3 className="w-4 h-4" /></Btn>
      <Sep />
      <Btn title="حذف سطر" on={run(() => deleteRow(cell))} danger><span className="text-[10px] font-black">سطر</span></Btn>
      <Btn title="حذف ستون" on={run(() => deleteColumn(cell))} danger><span className="text-[10px] font-black">ستون</span></Btn>
      <Btn title="حذف کل جدول" on={run(() => table.remove())} danger><Trash2 className="w-4 h-4" /></Btn>
    </div>,
    document.body
  );
};


/* ------------------------------------------- the toolbar part: undo, redo, size, colours ------------------------------------------- */

const TEXT_COLORS = ['#1A1A1A', '#3A241F', '#6E1B1B', '#DC2626', '#EA580C', '#D97706', '#15803D', '#0F766E', '#1D4ED8', '#4338CA', '#7E22CE', '#6B7280'];
const COLOR_NAMES: Record<string, string> = {
  '#1A1A1A': 'مشکی', '#3A241F': 'قهوه‌ای تیره', '#6E1B1B': 'زرشکی', '#DC2626': 'قرمز', '#EA580C': 'نارنجی', '#D97706': 'کهربایی',
  '#15803D': 'سبز', '#0F766E': 'سبزآبی', '#1D4ED8': 'آبی', '#4338CA': 'نیلی', '#7E22CE': 'بنفش', '#6B7280': 'خاکستری',
  '#FEF08A': 'زرد', '#BBF7D0': 'سبز روشن', '#BFDBFE': 'آبی روشن', '#FBCFE8': 'صورتی', '#FED7AA': 'نارنجی روشن', '#E5E7EB': 'خاکستری روشن',
};
const MARK_COLORS = ['#FEF08A', '#BBF7D0', '#BFDBFE', '#FBCFE8', '#FED7AA', '#E5E7EB'];

const PaletteButton: React.FC<{ title: string; icon: React.ReactNode; colors: string[]; reset: string; resetLabel: string; onPick: (c: string) => void }> = ({ title, icon, colors, reset, resetLabel, onPick }) => {
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!at) return;
    const close = (e: Event) => {
      if (!(e.target as HTMLElement).closest?.('[data-color-palette]') && e.target !== btn.current && !btn.current?.contains(e.target as Node)) setAt(null);
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', () => setAt(null), true);
    return () => document.removeEventListener('mousedown', close);
  }, [at]);
  return (
    <>
      <button
        ref={btn}
        type="button"
        title={title}
        aria-label={title}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const r = btn.current!.getBoundingClientRect();
          setAt(at ? null : { x: Math.min(window.innerWidth - 150, Math.max(150, r.left + r.width / 2)), y: r.bottom + 6 });
        }}
        className="p-1.5 hover:bg-[#FAF5F1] rounded-lg text-[#3A241F] cursor-pointer"
      >
        {icon}
      </button>
      {at &&
        createPortal(
          <div
            data-color-palette
            dir="rtl"
            onMouseDown={(e) => e.preventDefault()}
            style={{ position: 'fixed', left: at.x, top: at.y, transform: 'translateX(-50%)' }}
            className="z-[400] w-[220px] bg-white border border-[#EBDBCE] rounded-2xl shadow-xl p-3 space-y-2"
          >
            <div className="text-[11px] font-black text-[#3A241F]">{title}</div>
            <div className="grid grid-cols-6 gap-1.5">
              {colors.map((c) => (
                <button key={c} type="button" title={COLOR_NAMES[c] || 'رنگ'} data-color={c} onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(c); setAt(null); }} className="w-7 h-7 rounded-lg border border-black/10 cursor-pointer hover:scale-110 transition-transform" style={{ background: c }} />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] font-bold text-[#503730] cursor-pointer">
                رنگ دلخواه
                <input type="color" defaultValue="#1d4ed8" onChange={(e) => onPick(e.target.value)} className="w-6 h-6 p-0 border-0 rounded cursor-pointer" />
              </label>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(reset); setAt(null); }} className="mr-auto text-[11px] font-black text-[#6E1B1B] hover:underline cursor-pointer">{resetLabel}</button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

/** Undo and redo, bigger and smaller letters for the selected text, and the colour and marker palettes. Put it inside the tool bar of a letter editor. */
export const RichExtras: React.FC<{ editing: BodyEditing; className?: string }> = ({ editing, className = '' }) => {
  const Btn: React.FC<{ title: string; on: () => void; disabled?: boolean; children: React.ReactNode }> = ({ title, on, disabled, children }) => (
    <button type="button" title={title} aria-label={title} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={on} className="p-1.5 hover:bg-[#FAF5F1] rounded-lg text-[#3A241F] cursor-pointer disabled:opacity-35 disabled:cursor-default">
      {children}
    </button>
  );
  return (
    <div className={`flex items-center gap-0.5 bg-white p-1 rounded-xl border border-[#EBDBCE] ${className}`} data-rich-extras>
      <Btn title="واگرد (Ctrl+Z)" on={editing.undo} disabled={!editing.canUndo}><Undo2 className="w-3.5 h-3.5" /></Btn>
      <Btn title="بازگرداندن (Ctrl+Y)" on={editing.redo} disabled={!editing.canRedo}><Redo2 className="w-3.5 h-3.5" /></Btn>
      <span className="w-px h-4 bg-[#EBDBCE] mx-0.5" />
      <Btn title="بزرگ‌تر کردن متن انتخاب‌شده" on={() => editing.stepFont(2)}><ALargeSmall className="w-4 h-4" /><span className="sr-only">بزرگ‌تر</span></Btn>
      <Btn title="کوچک‌تر کردن متن انتخاب‌شده" on={() => editing.stepFont(-2)}><ALargeSmall className="w-3 h-3" /><span className="sr-only">کوچک‌تر</span></Btn>
      <span className="w-px h-4 bg-[#EBDBCE] mx-0.5" />
      <PaletteButton title="رنگ متن" icon={<Baseline className="w-4 h-4" />} colors={TEXT_COLORS} reset="#1A1A1A" resetLabel="رنگ اصلی" onPick={(c) => editing.setColor('fore', c)} />
      <PaletteButton title="رنگ نشانه‌گذاری (هایلایت)" icon={<Highlighter className="w-4 h-4" />} colors={MARK_COLORS} reset="transparent" resetLabel="بدون رنگ" onPick={(c) => editing.setColor('hilite', c)} />
    </div>
  );
};
