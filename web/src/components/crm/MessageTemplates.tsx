import React, { useMemo, useState } from 'react';
import { Copy, FileUp, Link2, MessageSquareText, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { Customer, CustomerMsgTemplate } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { askConfirm } from '../../lib/confirmDialog';
import { deleteMsgFile, msgFileUrl, uploadMsgFile } from '../../lib/serverFiles';
import { Modal, field, label } from './crmUi';
import { NETWORKS, SocialLogo, chatExtOn, chatExtSend, entryOf, openChat, setChatExt, setChatExtSend } from './SocialNetworks';

const newId = () => 'tm_' + Math.random().toString(36).slice(2, 10);
const newFileId = () => 'tplf_' + Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('');

/** The whole message that is sent: the text (with {name} = the customer's name), then the link, then the download address of the file. */
export const buildMessage = (t: CustomerMsgTemplate, customerName: string): string =>
  [t.text.replace(/\{name\}/g, customerName), t.link ? t.link : '', t.fileId ? `فایل: ${msgFileUrl(t.fileId, t.fileName || 'file')}` : ''].filter((x) => x && x.trim()).join('\n');

/** Where the ready-made messages are written (administrators): a title, the text, a link and a file. */
export const TemplatesManager: React.FC<{ templates: CustomerMsgTemplate[]; onChange: (list: CustomerMsgTemplate[]) => void; onClose: () => void }> = ({ templates, onChange, onClose }) => {
  const [edit, setEdit] = useState<CustomerMsgTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = () => {
    if (!edit) return;
    if (!edit.title.trim() || !edit.text.trim()) return setErr('عنوان و متن پیام را بنویسید.');
    const clean = { ...edit, title: edit.title.trim(), text: edit.text.trim(), link: edit.link?.trim() || undefined };
    onChange(templates.some((t) => t.id === clean.id) ? templates.map((t) => (t.id === clean.id ? clean : t)) : [...templates, clean]);
    setEdit(null);
    setErr('');
  };
  const pickFile = async (f: File | undefined) => {
    if (!f || !edit) return;
    setBusy(true);
    setErr('');
    try {
      const id = newFileId();
      await uploadMsgFile(id, f);
      if (edit.fileId) void deleteMsgFile(edit.fileId);
      setEdit({ ...edit, fileId: id, fileName: f.name });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'بارگذاری فایل انجام نشد.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (t: CustomerMsgTemplate) => {
    if (!(await askConfirm(`پیام آمادهٔ «${t.title}» حذف شود؟`))) return;
    if (t.fileId) void deleteMsgFile(t.fileId);
    onChange(templates.filter((x) => x.id !== t.id));
  };
  return (
    <Modal
      wide
      onTop="max"
      title="پیام‌های آماده برای مشتری"
      onClose={onClose}
      footer={
        <>
          <span className="text-[11px] font-bold text-[#8C6F66]">{toPersianDigits(templates.length)} پیام</span>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">بستن</button>
        </>
      }
    >
      <div className="space-y-3" data-msg-manager>
        {!edit && (
          <>
            {templates.length === 0 && <div className="text-center text-xs font-bold text-[#8C6F66] py-6">هنوز پیام آماده‌ای نساخته‌اید.</div>}
            {templates.map((t) => (
              <div key={t.id} className="rounded-2xl border border-[#EBDBCE] bg-white p-3 flex items-start gap-3" data-msg-row>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="text-xs font-black text-[#3A241F]">{t.title}</div>
                  <div className="text-[11px] font-bold text-[#6b5048] leading-6 line-clamp-2 whitespace-pre-wrap">{t.text}</div>
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-black">
                    {t.link && <span className="bg-sky-50 text-sky-700 rounded-full px-2 py-0.5 flex items-center gap-1" dir="ltr"><Link2 className="w-3 h-3" />{t.link.replace(/^https?:\/\//, '').slice(0, 30)}</span>}
                    {t.fileId && <span className="bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5 flex items-center gap-1"><FileUp className="w-3 h-3" />{t.fileName}</span>}
                  </div>
                </div>
                <button type="button" onClick={() => { setEdit(t); setErr(''); }} className="p-1.5 rounded-lg text-[#8C6F66] hover:bg-[#FAF5F1] cursor-pointer" aria-label="ویرایش"><Pencil className="w-4 h-4" /></button>
                <button type="button" onClick={() => void remove(t)} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer" aria-label="حذف"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <button type="button" onClick={() => { setEdit({ id: newId(), title: '', text: '' }); setErr(''); }} className="w-full flex items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-violet-300 text-violet-700 text-xs font-black py-3 hover:bg-violet-50 cursor-pointer" data-msg-add>
              <Plus className="w-4 h-4" />
              پیام آمادهٔ تازه
            </button>
          </>
        )}
        {edit && (
          <div className="space-y-3" data-msg-edit>
            <div>
              <label className={label}>عنوان (فقط برای خودتان)</label>
              <input className={field} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="مثلاً: معرفی شرکت و کاتالوگ" />
            </div>
            <div>
              <label className={label}>متن پیام (به‌جای «{'{name}'}» نام مشتری می‌آید)</label>
              <textarea className={`${field} min-h-[110px] leading-7`} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} placeholder="{name} گرامی، کاتالوگ محصولات ما را برایتان فرستادیم…" />
            </div>
            <div>
              <label className={label}>لینک (اختیاری)</label>
              <input className={field} dir="ltr" value={edit.link || ''} onChange={(e) => setEdit({ ...edit, link: e.target.value })} placeholder="https://" />
            </div>
            <div>
              <label className={label}>فایل (اختیاری): به‌صورت لینک دانلود در پیام می‌آید</label>
              {edit.fileId ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">
                  <span className="truncate">{edit.fileName}</span>
                  <button type="button" onClick={() => { void deleteMsgFile(edit.fileId!); setEdit({ ...edit, fileId: undefined, fileName: undefined }); }} className="p-1 text-rose-500 cursor-pointer" aria-label="برداشتن فایل"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#D9CCC4] text-[#503730] text-xs font-black py-3 cursor-pointer hover:bg-[#FAF5F1]">
                  <FileUp className="w-4 h-4" />
                  {busy ? 'در حال بارگذاری…' : 'انتخاب فایل'}
                  <input type="file" className="hidden" disabled={busy} onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} data-msg-file />
                </label>
              )}
              <p className="mt-1.5 text-[10px] font-bold text-[#8C6F66] leading-5">هر کسی که لینک فایل را داشته باشد می‌تواند آن را بدون ورود به سامانه دانلود کند؛ فایل محرمانه نگذارید.</p>
            </div>
            {err && <div className="text-[11px] font-black text-rose-700" data-msg-err>{err}</div>}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => { if (edit.fileId && !templates.some((t) => t.id === edit.id && t.fileId === edit.fileId)) void deleteMsgFile(edit.fileId); setEdit(null); setErr(''); }} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">انصراف</button>
              <button type="button" disabled={busy} onClick={save} className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-40 cursor-pointer" data-msg-save>ذخیرهٔ پیام</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

/** Pick a ready-made message and the customer's account to send it to: WhatsApp gets the text already written, the other networks get it copied to paste. */
export const SendMessageDialog: React.FC<{ customer: Customer; onClose: () => void }> = ({ customer, onClose }) => {
  const { settings, setSettings, currentUser, showToast } = useAppContext();
  const templates = settings.customerMsgTemplates || [];
  const [tplId, setTplId] = useState(templates[0]?.id || '');
  const [mgr, setMgr] = useState(false);
  const [note, setNote] = useState('');
  const [ext, setExt] = useState(chatExtOn());
  const [extSend, setExtSend] = useState(chatExtSend());
  const accounts = useMemo(
    () => NETWORKS.filter((n) => !n.web).flatMap((n) => entryOf(customer, n.id).accounts.map((a) => ({ id: n.id, name: n.name, account: a }))),
    [customer],
  );
  const tpl = templates.find((t) => t.id === tplId) || templates[0];
  const [text, setText] = useState(() => (tpl ? buildMessage(tpl, customer.name) : ''));
  const choose = (id: string) => {
    setTplId(id);
    const t = templates.find((x) => x.id === id);
    if (t) setText(buildMessage(t, customer.name));
    setNote('');
  };
  const isAdmin = currentUser.role === 'SUPER_ADMIN';
  return (
    <>
      <Modal
        wide
        onTop="max"
        title={`پیام آماده برای ${customer.name}`}
        onClose={onClose}
        footer={
          <>
            {isAdmin ? (
              <button type="button" onClick={() => setMgr(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-violet-700 bg-violet-50 border border-violet-200 cursor-pointer" data-msg-manage>
                <MessageSquareText className="w-4 h-4" />
                مدیریت پیام‌ها
              </button>
            ) : <span />}
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">بستن</button>
          </>
        }
      >
        <div className="space-y-4" data-msg-send>
          {templates.length === 0 ? (
            <div className="text-center text-xs font-bold text-[#8C6F66] py-6 space-y-2">
              <div>هنوز پیام آماده‌ای ساخته نشده است.</div>
              {isAdmin ? <button type="button" onClick={() => setMgr(true)} className="text-violet-700 underline cursor-pointer">همین حالا یکی بسازید</button> : <div>از مدیر کل بخواهید پیام‌های آماده را بنویسد.</div>}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => (
                  <button key={t.id} type="button" onClick={() => choose(t.id)} className={`px-3 py-1.5 rounded-xl text-xs font-black border cursor-pointer ${tpl?.id === t.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-[#503730] border-[#EBDBCE] hover:bg-[#FAF5F1]'}`} data-msg-pick>
                    {t.title}
                  </button>
                ))}
              </div>
              <div>
                <label className={label}>متن پیام (می‌توانید پیش از ارسال تغییرش دهید)</label>
                <textarea className={`${field} min-h-[140px] leading-7`} value={text} onChange={(e) => setText(e.target.value)} data-msg-text />
              </div>
              <div className="space-y-2">
                <div className="text-[11px] font-black text-[#3A241F]">ارسال در کدام شبکه؟</div>
                {accounts.length === 0 ? (
                  <div className="text-[11px] font-bold text-[#8C6F66]">برای این مشتری شبکه‌ای ثبت نشده است؛ از «تعاملات مجازی» شماره یا نام کاربری او را ثبت کنید.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {accounts.map((a) => (
                      <button key={a.id + a.account} type="button" onClick={() => setNote(openChat(a.id, a.name, a.account, text))} className="flex items-center gap-2 rounded-xl border border-[#EBDBCE] bg-white hover:bg-violet-50 px-3 py-2 cursor-pointer" data-msg-send-to={a.id}>
                        <SocialLogo id={a.id} size={20} />
                        <span className="text-xs font-black text-[#3A241F]">{a.name}</span>
                        <span className="text-[10px] font-bold text-[#8C6F66]" dir="ltr">{/^[0-9۰-۹+]+$/.test(a.account) ? toPersianDigits(a.account) : '@' + a.account}</span>
                        <Send className="w-3.5 h-3.5 text-violet-600" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { try { void navigator.clipboard?.writeText(text); showToast('متن پیام کپی شد.'); } catch { /* no clipboard */ } }} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-[#503730] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer" data-msg-copy>
                  <Copy className="w-4 h-4" />
                  فقط کپی متن
                </button>
              </div>
              {note && <div className="text-[11px] font-black text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-6" data-msg-note>{note}</div>}
              <p className="text-[10px] font-bold text-[#8C6F66] leading-5">واتس‌اپ پیام را آماده در کادر می‌گذارد و فقط «ارسال» را می‌زنید. تلگرام، ایتا، بله و روبیکا اجازه نمی‌دهند از بیرون متنی در گفتگو گذاشته شود؛ برای آن‌ها متن کپی می‌شود و با Ctrl+V می‌چسبانید. ارسال نهایی همیشه با خود شماست.</p>
            </>
          )}
          <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-3 space-y-2" data-ext-panel>
            <div className="text-[11px] font-black text-violet-900">افزونهٔ هورمند برای روبیکا، بله و ایتا (اختیاری)</div>
            <p className="text-[10px] font-bold text-[#6b5048] leading-5">با افزونه، هورمند در وب روبیکا، بله یا ایتا خودش مشتری را جست‌وجو می‌کند، گفتگو را باز می‌کند و پیام را می‌نویسد.</p>
            <label className="flex items-center gap-2 text-[11px] font-black text-[#3A241F] cursor-pointer"><input type="checkbox" className="w-4 h-4 accent-violet-600" checked={ext} onChange={(e) => { setExt(e.target.checked); setChatExt(e.target.checked); }} data-ext-on />افزونه روی این مرورگر نصب است</label>
            <label className={`flex items-center gap-2 text-[11px] font-black cursor-pointer ${ext ? 'text-[#3A241F]' : 'text-[#8C6F66] opacity-60'}`}><input type="checkbox" className="w-4 h-4 accent-violet-600" disabled={!ext} checked={extSend} onChange={(e) => { setExtSend(e.target.checked); setChatExtSend(e.target.checked); }} data-ext-send />پیام را خودش بفرستد (اگر خاموش باشد فقط می‌نویسد و ارسال با شماست)</label>
            <details className="text-[10px] font-bold text-[#503730] leading-6">
              <summary className="cursor-pointer text-violet-700 font-black">نصب افزونه (یک‌بار، حدود یک دقیقه)</summary>
              <ol className="list-decimal pr-5 space-y-0.5 mt-1">
                <li><a href="/hoormand-extension.zip" download className="text-violet-700 underline font-black" data-ext-download>فایل افزونه را دانلود کنید</a> و از حالت فشرده خارج کنید.</li>
                <li>در کروم آدرس <span dir="ltr" className="font-black">chrome://extensions</span> را باز کنید و «Developer mode» را روشن کنید.</li>
                <li>«Load unpacked» را بزنید و همان پوشه را انتخاب کنید.</li>
                <li>برگردید و تیک «افزونه نصب است» را بزنید. روبیکا، بله و ایتا وب را یک بار در همین مرورگر وارد شده نگه دارید.</li>
              </ol>
            </details>
          </div>
        </div>
      </Modal>
      {mgr && <TemplatesManager templates={templates} onChange={(list) => { setSettings({ ...settings, customerMsgTemplates: list }); showToast('پیام‌های آماده ذخیره شد.'); }} onClose={() => setMgr(false)} />}
    </>
  );
};
