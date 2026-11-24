import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Trash2, Upload, Workflow } from 'lucide-react';
import { api } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { formatDateTime } from '../../lib/taskDates';
import { askConfirm } from '../../lib/confirmDialog';
import { WfPackageRow } from '../../lib/workflow';
import { WorkflowSteps } from '../workflow/WorkflowSteps';
import { WorkflowBuilder } from './WorkflowBuilder';
import { CONTACT_PHONE } from '../common/CompanyFooter';

/**
 * «گردشکارها» in the console. A customer's own workflow is a file we write and sign for them: the administrator uploads it here, switches it on or off,
 * and can remove it. The contents cannot be changed by anyone but us (the signature would break and the upload is refused). A workflow that is on
 * appears next to the built-in ones in «امور اداری ← گردشکارها»; switching it off or removing it brings the system back exactly to how it was.
 */
export const WorkflowAdminCard: React.FC = () => {
  const { showToast } = useAppContext();
  const [rows, setRows] = useState<WfPackageRow[]>([]);
  const [open, setOpen] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [building, setBuilding] = useState<{ initial?: WfPackageRow['package'] } | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const load = useCallback(() => { api.wfPackages().then(setRows).catch(() => setRows([])); }, []);
  useEffect(load, [load]);
  const key = (r: WfPackageRow) => `${r.id}@${r.version}`;

  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.wfUpload(await file.text());
      showToast(`«${r.name}» بارگذاری شد (${toPersianDigits(r.steps)} مرحله). برای استفاده آن را روشن کنید.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'بارگذاری نشد.');
    } finally {
      setBusy(false);
      if (pick.current) pick.current.value = '';
    }
  };
  const toggle = async (r: WfPackageRow) => {
    try { await api.wfEnable(r.id, r.version, !r.enabled); load(); } catch (e) { showToast(e instanceof Error ? e.message : 'انجام نشد.'); }
  };
  const remove = async (r: WfPackageRow) => {
    if (!(await askConfirm(`گردشکار «${r.name}» (نسخهٔ ${toPersianDigits(r.version)}) از سامانه برداشته شود؟ همه‌چیز مثل پیش از آن می‌شود.`, { tone: 'danger', title: 'برداشتن گردشکار', confirmText: 'بله، برداشته شود' }))) return;
    try { await api.wfRemove(r.id, r.version); load(); } catch (e) { setError(e instanceof Error ? e.message : 'حذف نشد.'); }
  };

  if (building) return <WorkflowBuilder initial={building.initial} onClose={() => setBuilding(null)} onSaved={() => { setBuilding(null); load(); }} />;

  return (
    <div className="space-y-4" data-workflow-admin>
      <div className="rounded-2xl border border-[#EBDBCE] bg-white p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-black text-[#3A241F]"><Workflow className="w-4 h-4 text-[#D34A32]" />گردشکارهای اختصاصی شرکت</div>
        <p className="text-[11.5px] font-bold leading-7 text-[#7D6159]">
          اگر شرکت شما مسیر کار خاصی دارد (مثلاً تأیید خرید با شرط مبلغ)، می‌توانید خودتان همین‌جا آن را بسازید، یا ما آن را برایتان می‌سازیم و یک فایل امضاشده می‌دهیم که اینجا بارگذاری و روشنش می‌کنید؛ گردشکار شما کنار گردشکارهای آمادهٔ سامانه (مرخصی، نامه، پیش‌فاکتور…) قرار می‌گیرد و آن‌ها را عوض نمی‌کند.
          فایل امضاشدهٔ ما را نمی‌شود دستکاری کرد (امضا می‌شکند)، ولی گردشکاری که خودتان می‌سازید را هر وقت خواستید ویرایش می‌کنید. هر وقت خواستید خاموش یا برداشته‌اش کنید تا همه‌چیز دقیقاً به حالت قبل برگردد.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <input ref={pick} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} data-wf-file />
          <button type="button" onClick={() => setBuilding({})} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#D34A32] text-white text-xs font-black cursor-pointer" data-wf-build>ساخت گردشکار تازه</button>
          <button type="button" disabled={busy} onClick={() => pick.current?.click()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#6E1B1B] text-white text-xs font-black cursor-pointer disabled:opacity-60" data-wf-upload>
            <Upload className="w-4 h-4" />{busy ? 'در حال بررسی…' : 'بارگذاری فایل گردشکار'}
          </button>
          <span className="text-[11px] font-bold text-[#8C6F66]">سفارش گردشکار تخصصی: تماس با ما <b dir="ltr" className="text-[#6E1B1B]">{toPersianDigits(CONTACT_PHONE)}</b></span>
        </div>
        {error && <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-[11.5px] font-bold text-rose-800 leading-6" data-wf-error>{error}</div>}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#EBDBCE] p-8 text-center text-xs font-bold text-[#8C6F66]">هنوز گردشکار اختصاصی بارگذاری نشده است.</div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={key(r)} className="rounded-2xl border border-[#EBDBCE] bg-white" data-wf-row>
              <div className="flex items-center gap-3 px-4 py-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[13px] font-black text-[#3A241F]">{r.name} <span className="text-[10.5px] font-bold text-[#8C6F66]">· نسخهٔ {toPersianDigits(r.version)}</span></div>
                  <div className="text-[10.5px] font-bold text-[#8C6F66]">{toPersianDigits(r.package.steps.length)} مرحله · بارگذاری {formatDateTime(r.uploadedAt)}{r.uploadedBy ? ` · ${r.uploadedBy}` : ''}{r.running ? ` · ${toPersianDigits(r.running)} درخواست در جریان` : ''}</div>
                </div>
                {r.source === 'local'
                  ? <span className="text-[10px] font-black rounded-full px-2 py-0.5 border bg-amber-50 text-amber-800 border-amber-200" title="با ساز داخل هورمند ساخته شده است">ساختهٔ مدیر سامانه</span>
                  : <span className="text-[10px] font-black rounded-full px-2 py-0.5 border bg-emerald-50 text-emerald-800 border-emerald-200" title="فایل با امضای ما بارگذاری شده است">امضای معتبر هورمند</span>}
                {r.source === 'local' && <button type="button" onClick={() => setBuilding({ initial: r.package })} className="text-[11px] font-black text-[#6E1B1B] cursor-pointer" data-wf-edit>ویرایش</button>}
                <button type="button" role="switch" aria-checked={r.enabled} onClick={() => void toggle(r)} className={`relative w-12 h-7 rounded-full transition cursor-pointer ${r.enabled ? 'bg-emerald-600' : 'bg-slate-300'}`} data-wf-switch title={r.enabled ? 'روشن' : 'خاموش'}>
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${r.enabled ? 'right-1' : 'right-6'}`} />
                </button>
                <span className="text-[10.5px] font-black w-12 text-[#503730]">{r.enabled ? 'روشن' : 'خاموش'}</span>
                <button type="button" onClick={() => setOpen(open === key(r) ? '' : key(r))} className="flex items-center gap-1 text-[11px] font-black text-[#6E1B1B] cursor-pointer">مراحل{open === key(r) ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button>
                <button type="button" onClick={() => void remove(r)} className="p-2 rounded-xl text-rose-700 hover:bg-rose-50 cursor-pointer" title="برداشتن" data-wf-remove><Trash2 className="w-4 h-4" /></button>
              </div>
              {open === key(r) && (
                <div className="px-4 pb-4 border-t border-[#EBDBCE]/70 pt-3 space-y-3">
                  {r.package.description && <p className="text-[11.5px] font-bold leading-7 text-[#503730]">{r.package.description}</p>}
                  <WorkflowSteps pkg={r.package} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
