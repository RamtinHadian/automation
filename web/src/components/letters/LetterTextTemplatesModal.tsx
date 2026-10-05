import React, { useState } from 'react';
import { FileText, Pencil, Plus, Trash2, X } from 'lucide-react';
import { LetterTextTemplate } from '../../types';

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
/** Plain text → the letter body: a blank line starts a new paragraph, a single line break stays a line break. */
export const textToBody = (t: string) =>
  t
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
/** The letter body → plain text for editing. */
export const bodyToText = (h: string) =>
  h
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

const field = 'w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none';

/** Admins write the ready-made letter texts here; every user then picks one in the editor and it is put into the letter. */
export const LetterTextTemplatesModal: React.FC<{
  templates: LetterTextTemplate[];
  /** the text of the letter being written now, to start from */
  currentText: string;
  currentSubject: string;
  onChange: (list: LetterTextTemplate[]) => void;
  onClose: () => void;
}> = ({ templates, currentText, currentSubject, onChange, onClose }) => {
  const [editing, setEditing] = useState<string | null>(null); // id, or 'new'
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');

  const startNew = (fromCurrent: boolean) => {
    setEditing('new');
    setTitle('');
    setSubject(fromCurrent ? currentSubject : '');
    setText(fromCurrent ? currentText : '');
  };
  const startEdit = (t: LetterTextTemplate) => {
    setEditing(t.id);
    setTitle(t.title);
    setSubject(t.subject);
    setText(bodyToText(t.bodyHtml));
  };
  const save = () => {
    if (!title.trim() || !text.trim()) return;
    const item: LetterTextTemplate = { id: editing && editing !== 'new' ? editing : 'lt-' + Math.random().toString(36).slice(2, 9), title: title.trim(), subject: subject.trim(), bodyHtml: textToBody(text) };
    onChange(editing && editing !== 'new' ? templates.map((t) => (t.id === editing ? item : t)) : [...templates, item]);
    setEditing(null);
  };
  const remove = (t: LetterTextTemplate) => {
    if (window.confirm(`قالب «${t.title}» حذف شود؟`)) onChange(templates.filter((x) => x.id !== t.id));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={onClose} dir="rtl">
      <div onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-[#EBDBCE] text-right">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-600" />
            قالب‌های متنیِ آمادهٔ نامه
          </h3>
          <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          <p className="text-[#8C6F66] leading-6">
            متن نامه‌هایی را که زیاد تکرار می‌شود اینجا بنویسید. کاربر در ویرایشگر از «قالب آماده» یکی را انتخاب می‌کند و همین متن (با موضوعش) داخل نامه گذاشته می‌شود.
            برای جایگذاری خودکار می‌توانید از <b dir="ltr">[نام و سمت فرستنده]</b> و <b dir="ltr">[نام واحد]</b> استفاده کنید.
          </p>

          {editing ? (
            <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
              <div>
                <label className="block font-bold text-[#3A241F] mb-1.5">نام قالب (در فهرست دیده می‌شود) *</label>
                <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثلاً: درخواست مرخصی" autoFocus />
              </div>
              <div>
                <label className="block font-bold text-[#3A241F] mb-1.5">موضوع نامه</label>
                <input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="مثلاً: درخواست مرخصی استحقاقی" />
              </div>
              <div>
                <label className="block font-bold text-[#3A241F] mb-1.5">متن نامه * <span className="font-medium text-[#8C6F66]">(بین هر بند یک خط خالی بگذارید)</span></label>
                <textarea className={`${field} min-h-[220px] leading-7 font-medium`} dir="rtl" value={text} onChange={(e) => setText(e.target.value)} placeholder={'با سلام و احترام،\n\nبدین‌وسیله ...\n\nبا تشکر'} />
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl border border-[#EBDBCE] bg-white font-black text-[#3A241F] cursor-pointer">
                  انصراف
                </button>
                <button type="button" disabled={!title.trim() || !text.trim()} onClick={save} className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-black cursor-pointer">
                  ذخیرهٔ قالب
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => startNew(false)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black cursor-pointer">
                <Plus className="w-4 h-4" />
                قالب جدید
              </button>
              <button
                type="button"
                disabled={!currentText.trim()}
                onClick={() => startNew(true)}
                className="px-4 py-2 rounded-xl border border-amber-300 bg-white hover:bg-amber-50 disabled:opacity-40 font-black text-amber-800 cursor-pointer"
                title="متنی که الان در ویرایشگر نوشته‌اید را مبنا قرار می‌دهد"
              >
                از متن فعلی ویرایشگر
              </button>
            </div>
          )}

          <div className="space-y-2">
            {templates.length === 0 && <div className="rounded-xl border border-dashed border-[#EBDBCE] p-5 text-center font-bold text-[#8C6F66]">هنوز قالبی نساخته‌اید.</div>}
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-black text-[#3A241F] truncate">{t.title}</div>
                  <div className="text-[11px] text-[#8C6F66] truncate">{t.subject || bodyToText(t.bodyHtml).slice(0, 70)}</div>
                </div>
                <button type="button" onClick={() => startEdit(t)} className="p-2 rounded-xl text-violet-700 hover:bg-violet-50 cursor-pointer" title="ویرایش">
                  <Pencil className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => remove(t)} className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 cursor-pointer" title="حذف">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
