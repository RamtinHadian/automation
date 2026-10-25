import React, { useRef, useState } from 'react';
import { Download, FileText, Image as ImageIcon, Paperclip, Plus, Trash2 } from 'lucide-react';
import { CustomerFile } from '../../types';
import { getToken } from '../../lib/api';
import { askConfirm } from '../../lib/confirmDialog';
import { useAppContext } from '../../context/AppContext';
import { formatTaskDate } from '../../lib/taskDates';
import { toPersianDigits } from '../../lib/jalali';

const MAX = 25 * 1024 * 1024;
const auth = () => ({ Authorization: `Bearer ${getToken() || ''}` });
const url = (base: string, cid: string, fid: string, name?: string) => `/api/${base}/files/${encodeURIComponent(cid)}/${encodeURIComponent(fid)}${name ? `?name=${encodeURIComponent(name)}` : ''}`;
const size = (n: number) => (n >= 1048576 ? `${toPersianDigits((n / 1048576).toFixed(1))} مگابایت` : `${toPersianDigits(Math.max(1, Math.round(n / 1024)))} کیلوبایت`);
const newId = () => 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** The files kept on a customer's page: contracts, payment slips, photos. The list is part of the customer's record; the bytes are on the server. */
export const CustomerFiles: React.FC<{ customerId: string; files: CustomerFile[]; me: string; isAdmin: boolean; onChange: (files: CustomerFile[]) => void; base?: 'crm' | 'tasks'; accept?: string; hint?: string; canAdd?: boolean }> = ({ customerId, files, me, isAdmin, onChange, base = 'crm', accept, hint, canAdd = true }) => {
  const { showToast, currentUser } = useAppContext();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    const added: CustomerFile[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX) {
        showToast(`«${f.name}» بزرگ‌تر از ۲۵ مگابایت است.`);
        continue;
      }
      const id = newId();
      try {
        const res = await fetch(url(base, customerId, id), { method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/octet-stream' }, body: f });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'ذخیرهٔ فایل انجام نشد.');
        added.push({ id, name: f.name, size: f.size, type: f.type, at: new Date().toISOString(), byId: me, byName: currentUser.fullName });
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'ذخیرهٔ فایل انجام نشد.');
      }
    }
    setBusy(false);
    if (input.current) input.current.value = '';
    if (added.length) {
      onChange([...files, ...added]);
      showToast(added.length === 1 ? 'فایل ذخیره شد.' : `${toPersianDigits(added.length)} فایل ذخیره شد.`);
    }
  };

  const download = async (f: CustomerFile) => {
    try {
      const res = await fetch(url(base, customerId, f.id, f.name), { headers: auth() });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'فایل پیدا نشد.');
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 10000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'فایل پیدا نشد.');
    }
  };

  const remove = async (f: CustomerFile) => {
    if (!(await askConfirm(`فایل «${f.name}» حذف شود؟`, { tone: 'danger', confirmText: 'حذف فایل' }))) return;
    await fetch(url(base, customerId, f.id), { method: 'DELETE', headers: auth() }).catch(() => {});
    onChange(files.filter((x) => x.id !== f.id));
  };

  return (
    <div className="rounded-2xl border border-[#EBDBCE] bg-white" data-customer-files>
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between gap-2 px-4 py-3 cursor-pointer">
        <span className="flex items-center gap-2 text-xs font-black text-[#3A241F]">
          <Paperclip className="w-4 h-4 text-violet-600" />
          فایل‌ها و پیوست‌ها ({toPersianDigits(files.length)})
        </span>
        <span className="text-[10px] font-bold text-[#8C6F66]">{open ? 'بستن' : 'باز کردن'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {files.length === 0 && <div className="text-[11px] text-[#8C6F66] text-center py-3">{hint || 'هنوز فایلی نگذاشته‌اید. قرارداد، رسید پرداخت یا عکس کالا را اینجا نگه دارید.'}</div>}
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl px-3 py-2">
              {f.type.startsWith('image/') ? <ImageIcon className="w-4 h-4 text-sky-600 shrink-0" /> : <FileText className="w-4 h-4 text-violet-600 shrink-0" />}
              <button type="button" onClick={() => download(f)} className="flex-1 min-w-0 text-right cursor-pointer">
                <div className="text-[11px] font-black text-[#3A241F] truncate">{f.name}</div>
                <div className="text-[10px] text-[#8C6F66] truncate">{size(f.size)} · {f.byName} · {formatTaskDate(f.at.slice(0, 10))}</div>
              </button>
              <button type="button" onClick={() => download(f)} title="دریافت" className="p-1.5 text-violet-700 cursor-pointer"><Download className="w-4 h-4" /></button>
              {(isAdmin || f.byId === me) && <button type="button" onClick={() => remove(f)} title="حذف" className="p-1.5 text-rose-600 cursor-pointer"><Trash2 className="w-4 h-4" /></button>}
            </div>
          ))}
          <input ref={input} type="file" multiple accept={accept} className="hidden" onChange={(e) => upload(e.target.files)} />
          {canAdd && <button type="button" disabled={busy} onClick={() => input.current?.click()} className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-violet-300 text-violet-700 text-xs font-black hover:bg-violet-50 disabled:opacity-50 cursor-pointer">
            <Plus className="w-4 h-4" />
            {busy ? 'در حال ذخیره…' : 'افزودن فایل (تا ۲۵ مگابایت)'}
          </button>}
        </div>
      )}
    </div>
  );
};
