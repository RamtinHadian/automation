import React, { useRef, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import { NoteEntry, User } from '../../types';
import { formatTaskDate } from '../../lib/taskDates';
import { toPersianDigits } from '../../lib/jalali';

const box = 'w-full px-3.5 py-2.5 bg-white border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] outline-hidden focus:ring-2 focus:ring-[#6E1B1B]/20 resize-none leading-6';

const stamp = (iso: string) => `${formatTaskDate(iso.slice(0, 10))} · ${toPersianDigits(new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }))}`;

/** The entries of a record: the stored log, or (older records) its plain text cut into lines without a date or author. */
export const noteEntries = (log: NoteEntry[] | undefined, text: string | undefined): NoteEntry[] =>
  log && log.length ? log : (text || '').split('\n').filter((l) => l.trim()).map((t) => ({ text: t, at: '', byId: '', byName: '' }));

/** A paragraph is changed by the system administrator and by whoever wrote it (an old paragraph with no writer: by the record's owner). */
export const canEditNote = (user: User, e: NoteEntry, ownerId?: string): boolean =>
  user.role === 'SUPER_ADMIN' || (e.byId ? e.byId === user.id : !!ownerId && ownerId === user.id);

/** The lines of a record's notes with their time and writer, read-only (the customer's page). */
export const NoteLines: React.FC<{ log?: NoteEntry[]; text?: string }> = ({ log, text }) => (
  <div className="space-y-1.5" data-note-lines>
    {noteEntries(log, text).map((l, i) => (
      <div key={i} className="border-b border-amber-100 last:border-0 pb-1.5 last:pb-0" data-note-line>
        <div className="text-xs leading-6 text-[#3A241F] whitespace-pre-wrap break-words">{l.text}</div>
        {(l.at || l.byName) && (
          <div className="text-[10px] font-medium text-[#8C6F66]" data-note-meta>
            {[l.at ? stamp(l.at) : '', l.byName ? `نوشتهٔ ${l.byName}` : ''].filter(Boolean).join(' — ')}
            {l.editedAt ? ` · ویرایش: ${stamp(l.editedAt)}${l.editedByName ? ` (${l.editedByName})` : ''}` : ''}
          </div>
        )}
      </div>
    ))}
  </div>
);

/**
 * Notes written paragraph by paragraph: Enter locks what was typed into a line (like a line written on paper, with a pencil to edit it and a × to remove it)
 * and a new empty box opens under it. Every line carries the date, hour and minute it was written and who wrote it.
 * `onChange` gets the entries and the same text joined by new lines (so the plain text field stays valid everywhere else).
 */
export const ParagraphNotes: React.FC<{ log?: NoteEntry[]; text?: string; onChange: (log: NoteEntry[], text: string) => void; placeholder?: string; canEdit?: (e: NoteEntry) => boolean }> = ({ log, text, onChange, placeholder = 'بنویسید و اینتر بزنید…', canEdit }) => {
  const { currentUser } = useAppContext();
  const all = noteEntries(log, text);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);
  // what is being typed travels in the value too (so «ذخیره» never loses it) but is not one of the locked lines yet
  // (an old unfinished line that was saved with the record is a normal line when the form is opened again)
  const lines = all.filter((e) => !(e.draft && draft.trim() && e.text === draft.trim())).map((e) => ({ ...e, draft: undefined }));
  const emit = (ls: NoteEntry[], d: string) => {
    const t = d.trim();
    const next = t ? [...ls, { text: t, at: new Date().toISOString(), byId: currentUser.id, byName: currentUser.fullName, draft: true }] : ls;
    onChange(next, next.map((e) => e.text).join('\n'));
  };
  const mine = () => ({ at: new Date().toISOString(), byId: currentUser.id, byName: currentUser.fullName });
  const commit = () => {
    const t = draft.trim();
    if (!t) return;
    emit([...lines, { text: t, ...mine() }], '');
    setDraft('');
    setTimeout(() => area.current?.focus(), 0);
  };
  const saveEdit = () => {
    if (editing === null) return;
    const t = editText.trim();
    emit(t ? lines.map((l, i) => (i === editing ? { ...l, text: t, editedAt: mine().at, editedByName: currentUser.fullName } : l)) : lines.filter((_, i) => i !== editing), draft);
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
          <div key={i} className="border-b border-[#EBDBCE] pb-1.5" data-note-line>
            <div className="flex items-start gap-2">
              <span className="flex-1 text-xs leading-6 font-bold text-[#3A241F] whitespace-pre-wrap break-words">{l.text}</span>
              {(!canEdit || canEdit(l)) && (
                <>
                  <button type="button" onClick={() => { setEditing(i); setEditText(l.text); }} className="p-1.5 rounded-lg text-[#8C6F66] hover:bg-[#FAF5F1] cursor-pointer" aria-label="ویرایش"><Pencil className="w-3.5 h-3.5" /></button>
                  <button type="button" onClick={() => emit(lines.filter((_, k) => k !== i), draft)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer" aria-label="حذف"><X className="w-3.5 h-3.5" /></button>
                </>
              )}
            </div>
            {(l.at || l.byName) && (
              <div className="text-[10px] font-medium text-[#8C6F66]" data-note-meta>
                {[l.at ? stamp(l.at) : '', l.byName ? `ثبت‌کننده: ${l.byName}` : ''].filter(Boolean).join(' — ')}
                {l.editedAt ? ` · ویرایش: ${stamp(l.editedAt)}${l.editedByName ? ` (${l.editedByName})` : ''}` : ''}
              </div>
            )}
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
