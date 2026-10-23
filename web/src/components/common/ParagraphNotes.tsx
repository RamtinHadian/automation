import React, { useRef, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';

const box = 'w-full px-3.5 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] outline-hidden focus:ring-2 focus:ring-[#6E1B1B]/20 resize-none leading-6';

/**
 * Notes written paragraph by paragraph: Enter locks what was typed into a line (like a line written on paper, with a pencil to edit it and a × to remove it)
 * and a new empty box opens under it. The value is the paragraphs joined by a new line, so the field stays a plain text everywhere else.
 */
export const ParagraphNotes: React.FC<{ value: string; onChange: (v: string) => void; placeholder?: string }> = ({ value, onChange, placeholder = 'بنویسید و اینتر بزنید…' }) => {
  const all = (value || '').split('\n').filter((l) => l.trim() !== '');
  const [draft, setDraft] = useState('');
  // what is being typed travels in the value too (so «ذخیره» never loses it) but is not one of the locked lines yet
  const lines = draft.trim() && all[all.length - 1] === draft.trim() ? all.slice(0, -1) : all;
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  const emit = (ls: string[], d: string) => onChange([...ls, d.trim()].filter(Boolean).join('\n'));
  const commit = () => {
    const t = draft.trim();
    if (!t) return;
    emit([...lines, t], '');
    setDraft('');
    setTimeout(() => area.current?.focus(), 0);
  };
  const saveEdit = () => {
    if (editing === null) return;
    const t = editText.trim();
    emit(t ? lines.map((l, i) => (i === editing ? t : l)) : lines.filter((_, i) => i !== editing), draft);
    setEditing(null);
  };
  return (
    <div className="space-y-1.5" data-paragraph-notes>
      {lines.map((l, i) =>
        editing === i ? (
          <div key={i} className="flex items-start gap-1.5">
            <textarea
              autoFocus
              rows={Math.max(1, Math.ceil(editText.length / 60))}
              className={box}
              value={editText}
              onChange={(e) => setEditText(e.target.value.replace(/\n/g, ' '))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                if (e.key === 'Escape') { e.stopPropagation(); setEditing(null); }
              }}
            />
            <button type="button" onClick={saveEdit} className="p-2 rounded-lg text-emerald-700 hover:bg-emerald-50 cursor-pointer" aria-label="ذخیرهٔ ویرایش"><Check className="w-4 h-4" /></button>
          </div>
        ) : (
          <div key={i} className="group flex items-start gap-2 border-b border-[#EBDBCE] pb-1.5" data-note-line>
            <span className="flex-1 text-xs leading-6 font-bold text-[#3A241F] whitespace-pre-wrap break-words">{l}</span>
            <button type="button" onClick={() => { setEditing(i); setEditText(l); }} className="p-1.5 rounded-lg text-[#8C6F66] hover:bg-[#FAF5F1] cursor-pointer" aria-label="ویرایش"><Pencil className="w-3.5 h-3.5" /></button>
            <button type="button" onClick={() => emit(lines.filter((_, k) => k !== i), draft)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer" aria-label="حذف"><X className="w-3.5 h-3.5" /></button>
          </div>
        )
      )}
      <textarea
        ref={area}
        rows={1}
        className={box}
        value={draft}
        placeholder={lines.length ? 'پاراگراف بعدی…' : placeholder}
        onChange={(e) => {
          const v = e.target.value.replace(/\n/g, ' ');
          setDraft(v);
          emit(lines, v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit();
          }
        }}
        data-note-draft
      />
    </div>
  );
};
