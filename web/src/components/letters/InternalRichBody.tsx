import React, { useRef, useState } from 'react';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Italic, List, ListOrdered, Table2, Underline } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { RichExtras, TableTools, useLetterBodyEditing } from './tableEditor';
import { INTERNAL_TEMPLATES, blankTable, InternalTemplate } from '../../lib/internalTemplates';

const SIZES = ['11px', '12px', '13px', '14px', '16px', '18px', '22px'];

const btn = 'p-1.5 rounded-lg text-[#3A241F] hover:bg-[#FAF5F1] cursor-pointer';
const sel = 'px-2 py-1.5 rounded-lg border border-[#EBDBCE] bg-white text-[11px] font-bold text-[#3A241F] focus:outline-none';

/**
 * The body box of an internal letter with only the editing tools of the letter editor: ready-made texts, font and size, bold / italic / underline,
 * alignment, lists, tables (with their own floating tools), colours and undo. Fonts and the layout of the letter's sheet are not here.
 */
export const InternalRichBody: React.FC<{
  editorRef: React.RefObject<HTMLDivElement | null>;
  initialHtml: string;
  fontFamily: string;
  onFont: (f: string) => void;
  fontSize: string;
  onSize: (s: string) => void;
  onTemplate: (t: InternalTemplate) => void;
}> = ({ editorRef, initialHtml, fontFamily, onFont, fontSize, onSize, onTemplate }) => {
  const { fonts } = useAppContext();
  const editing = useLetterBodyEditing(editorRef);
  const saved = useRef<Range | null>(null);
  const [rows, setRows] = useState('3');
  const [cols, setCols] = useState('3');
  const [tableOpen, setTableOpen] = useState(false);

  const keepSel = () => {
    const s = window.getSelection();
    if (s && s.rangeCount && editorRef.current?.contains(s.anchorNode)) saved.current = s.getRangeAt(0).cloneRange();
  };
  const restoreSel = () => {
    editorRef.current?.focus();
    const s = window.getSelection();
    if (s && saved.current) {
      s.removeAllRanges();
      s.addRange(saved.current);
    }
  };
  const exec = (cmd: string, val?: string) => {
    restoreSel();
    document.execCommand(cmd, false, val);
    keepSel();
  };
  const font = (f: string) => {
    onFont(f);
    restoreSel();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('fontName', false, f);
    document.execCommand('styleWithCSS', false, 'false');
    keepSel();
  };
  const insertTable = () => {
    const r = Math.max(1, Math.min(30, parseInt(rows, 10) || 3));
    const c = Math.max(1, Math.min(12, parseInt(cols, 10) || 3));
    restoreSel();
    if (!document.execCommand('insertHTML', false, blankTable(r, c))) editorRef.current?.insertAdjacentHTML('beforeend', blankTable(r, c));
    setTableOpen(false);
  };
  const noFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="rounded-2xl border border-[#EBDBCE] overflow-hidden bg-white" data-ic-rich>
      <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#FDFAF7] border-b border-[#EBDBCE]" onMouseDown={(e) => { if ((e.target as HTMLElement).tagName !== 'SELECT' && (e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault(); }}>
        <select className={sel} value="" onChange={(e) => { const t = INTERNAL_TEMPLATES.find((x) => x.id === e.target.value); if (t) onTemplate(t); }} aria-label="قالب آماده">
          <option value="">قالب آماده…</option>
          {INTERNAL_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
        <select className={sel} value={fontFamily} onMouseDown={keepSel} onChange={(e) => font(e.target.value)} aria-label="فونت">
          {fonts.map((f) => (
            <option key={f.id} value={f.fontFamily}>{f.name}</option>
          ))}
        </select>
        <select className={sel} value={fontSize} onChange={(e) => onSize(e.target.value)} aria-label="اندازهٔ متن">
          {SIZES.map((s) => (
            <option key={s} value={s}>{parseInt(s, 10)}</option>
          ))}
        </select>
        <span className="w-px h-5 bg-[#EBDBCE]" />
        <button type="button" className={btn} title="ضخیم" onMouseDown={noFocus} onClick={() => exec('bold')}><Bold className="w-4 h-4" /></button>
        <button type="button" className={btn} title="کج" onMouseDown={noFocus} onClick={() => exec('italic')}><Italic className="w-4 h-4" /></button>
        <button type="button" className={btn} title="زیرخط" onMouseDown={noFocus} onClick={() => exec('underline')}><Underline className="w-4 h-4" /></button>
        <span className="w-px h-5 bg-[#EBDBCE]" />
        <button type="button" className={btn} title="راست‌چین" onMouseDown={noFocus} onClick={() => exec('justifyRight')}><AlignRight className="w-4 h-4" /></button>
        <button type="button" className={btn} title="وسط‌چین" onMouseDown={noFocus} onClick={() => exec('justifyCenter')}><AlignCenter className="w-4 h-4" /></button>
        <button type="button" className={btn} title="چپ‌چین" onMouseDown={noFocus} onClick={() => exec('justifyLeft')}><AlignLeft className="w-4 h-4" /></button>
        <button type="button" className={btn} title="جاستیفای" onMouseDown={noFocus} onClick={() => exec('justifyFull')}><AlignJustify className="w-4 h-4" /></button>
        <span className="w-px h-5 bg-[#EBDBCE]" />
        <button type="button" className={btn} title="فهرست نقطه‌ای" onMouseDown={noFocus} onClick={() => exec('insertUnorderedList')}><List className="w-4 h-4" /></button>
        <button type="button" className={btn} title="فهرست شماره‌دار" onMouseDown={noFocus} onClick={() => exec('insertOrderedList')}><ListOrdered className="w-4 h-4" /></button>
        <button type="button" className={`${btn} ${tableOpen ? 'bg-[#F6D9CD]' : ''}`} title="درج جدول" onMouseDown={(e) => { keepSel(); e.preventDefault(); }} onClick={() => setTableOpen((v) => !v)}><Table2 className="w-4 h-4" /></button>
        <RichExtras editing={editing} />
      </div>
      {tableOpen && (
        <div className="flex items-center gap-2 px-2.5 py-2 bg-amber-50/60 border-b border-[#EBDBCE] text-[11px] font-bold text-[#3A241F]">
          <span>جدول</span>
          <input className="w-12 px-2 py-1 rounded-lg border border-[#EBDBCE] text-center" inputMode="numeric" value={rows} onChange={(e) => setRows(e.target.value.replace(/\D/g, ''))} aria-label="تعداد ردیف" />
          <span>ردیف در</span>
          <input className="w-12 px-2 py-1 rounded-lg border border-[#EBDBCE] text-center" inputMode="numeric" value={cols} onChange={(e) => setCols(e.target.value.replace(/\D/g, ''))} aria-label="تعداد ستون" />
          <span>ستون</span>
          <button type="button" onClick={insertTable} className="px-3 py-1 rounded-lg bg-[#6E1B1B] text-white font-black cursor-pointer">درج</button>
        </div>
      )}
      <div
        ref={editorRef as React.RefObject<HTMLDivElement>}
        contentEditable
        suppressContentEditableWarning
        dir="rtl"
        onKeyUp={keepSel}
        onMouseUp={keepSel}
        onBlur={keepSel}
        className="min-h-[240px] max-h-[48dvh] overflow-y-auto p-3.5 text-[#1f2937] focus:outline-none"
        style={{ fontFamily: `'${fontFamily}', 'Vazirmatn', Tahoma, sans-serif`, fontSize, lineHeight: 2.1, textAlign: 'justify' }}
        dangerouslySetInnerHTML={{ __html: initialHtml }}
        data-ic-body
      />
      <TableTools editorRef={editorRef} />
    </div>
  );
};
