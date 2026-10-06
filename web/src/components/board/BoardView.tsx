import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Megaphone, Pin, PinOff, Send, Trash2 } from 'lucide-react';
import { Announcement, api } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { formatTaskDate } from '../../lib/taskDates';

const field = 'w-full p-2.5 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none';
const clock = (iso: string) => toPersianDigits(new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }));

/** «تابلو اعلانات»: everybody reads the news; admins and the people they allowed publish it. */
export const BoardView: React.FC = () => {
  const { currentUser, showToast } = useAppContext();
  const [items, setItems] = useState<Announcement[]>([]);
  const [canPost, setCanPost] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [important, setImportant] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const isAdmin = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'DEPT_ADMIN';

  const load = useCallback(() => {
    api
      .announcements()
      .then((r) => { setItems(r.announcements); setCanPost(r.canPost); setLoadError(''); })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'خواندن تابلو ممکن نشد.'));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const publish = async () => {
    if (!title.trim() || !text.trim()) {
      showToast('عنوان و متن اعلان را بنویسید.');
      return;
    }
    setBusy(true);
    try {
      const r = await api.announcementCreate({ title: title.trim(), text: text.trim(), important, pinned });
      // shown at once (the list from the server is read again right after)
      setItems((cur) => [{ id: r.id, title: title.trim(), text: text.trim(), important, pinned, authorId: currentUser.id, authorName: currentUser.fullName, createdAt: new Date().toISOString() }, ...cur]);
      showToast('اعلان منتشر شد و برای همه اعلان رفت.');
      setTitle('');
      setText('');
      setImportant(false);
      setPinned(false);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'منتشر نشد.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (a: Announcement) => {
    if (!window.confirm(`اعلان «${a.title}» حذف شود؟`)) return;
    await api.announcementDelete(a.id).catch((e) => showToast(e instanceof Error ? e.message : 'حذف نشد.'));
    load();
  };
  const pin = async (a: Announcement) => {
    await api.announcementPin(a.id, !a.pinned).catch((e) => showToast(e instanceof Error ? e.message : 'انجام نشد.'));
    load();
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5" data-board-view>
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
          <Megaphone className="w-5 h-5" />
        </span>
        <div>
          <h2 className="font-black text-sm text-[#3A241F]">تابلو اعلانات</h2>
          <p className="text-[11px] text-[#8C6F66]">اخبار و اطلاعیه‌های سازمان؛ اعلان جدید برای همه پیام می‌شود.</p>
        </div>
      </div>

      {canPost && (
        <section className="rounded-3xl border border-amber-200 bg-gradient-to-b from-amber-50/70 to-white p-4 sm:p-5 space-y-3">
          <div className="text-xs font-black text-amber-900">اعلان تازه</div>
          <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان (مثلاً: تعطیلی روز پنجشنبه)" maxLength={120} />
          <textarea className={`${field} min-h-[96px] leading-7 font-medium`} value={text} onChange={(e) => setText(e.target.value)} placeholder="متن اعلان..." />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-[11px] font-black text-[#3A241F]">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} className="accent-rose-600 w-4 h-4" />
                مهم و فوری
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="accent-amber-600 w-4 h-4" />
                سنجاق در بالای تابلو
              </label>
            </div>
            <button type="button" disabled={busy} onClick={publish} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-black cursor-pointer shadow-sm">
              <Send className="w-4 h-4" />
              انتشار اعلان
            </button>
          </div>
        </section>
      )}

      {loadError && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">خواندن تابلو ممکن نشد: {loadError}</div>}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EBDBCE] p-12 text-center text-xs font-bold text-[#8C6F66]">هنوز اعلانی ثبت نشده است.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {items.map((a) => (
            <article key={a.id} className={`relative rounded-2xl border bg-white p-4 pr-5 space-y-2 overflow-hidden ${a.important ? 'border-rose-200' : 'border-[#EBDBCE]'}`}>
              <span className={`absolute right-0 top-0 bottom-0 w-1.5 ${a.important ? 'bg-rose-500' : a.pinned ? 'bg-amber-500' : 'bg-[#EBDBCE]'}`} />
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-black text-[13px] text-[#3A241F] leading-6 flex items-center gap-1.5 min-w-0">
                  {a.important && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
                  {a.pinned && !a.important && <Pin className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                  <span className="min-w-0 break-words">{a.title}</span>
                </h3>
                {(a.authorId === currentUser.id || isAdmin) && (
                  <span className="flex items-center gap-0.5 shrink-0">
                    <button type="button" onClick={() => pin(a)} title={a.pinned ? 'برداشتن سنجاق' : 'سنجاق'} className="p-1.5 rounded-lg text-amber-700 hover:bg-amber-50 cursor-pointer">
                      {a.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                    </button>
                    <button type="button" onClick={() => remove(a)} title="حذف" className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </span>
                )}
              </div>
              <p className="text-xs leading-7 text-[#503730] whitespace-pre-wrap break-words">{a.text}</p>
              <div className="text-[10px] font-bold text-[#8C6F66]">
                {a.authorName} · {formatTaskDate(a.createdAt.slice(0, 10))} · {clock(a.createdAt)}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
