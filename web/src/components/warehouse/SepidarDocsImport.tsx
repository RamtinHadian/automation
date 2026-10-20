import React, { useState } from 'react';
import { api } from '../../lib/api';
import { readTable } from '../../lib/customerImport';
import { formatTaskDate, jalaliToGregorian } from '../../lib/taskDates';
import { toPersianDigits } from '../../lib/jalali';
import { useAppContext } from '../../context/AppContext';
import { Modal } from '../crm/crmUi';

const fmt = (n: number) => toPersianDigits(n.toLocaleString('en-US'));

const digits = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const fold = (s: string) => digits(s).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌\s]+/g, '').toLowerCase();

// the columns of Sepidar's list (folded: no spaces, Persian letters) and the field each one fills
const COLS: Record<string, string[]> = {
  number: ['شماره'],
  date: ['تاریخ'],
  warehouse: ['عنوانانبار', 'انبار'],
  warehouseCode: ['کدانبار'],
  issuer: ['صادرکننده'],
  receiver: ['عنوانتحویلگیرنده', 'تحویلگیرنده'],
  receiverCode: ['کدتحویلگیرنده'],
  description: ['توضیحات'],
};

/** Imports the list «فهرست خروج انبار» / «فهرست برگشت از خروج انبار» that Sepidar exports to Excel (its web service has no address for these documents). */
export const SepidarDocsImport: React.FC<{ onClose: () => void; onDone: () => void }> = ({ onClose, onDone }) => {
  const { showToast } = useAppContext();
  const [type, setType] = useState<'issue' | 'issueReturn'>('issue');
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const pick = async (f?: File | null) => {
    if (!f) return;
    setName(f.name);
    const table = await readTable(f);
    // the header row is the first one that has both «تاریخ» and «شماره»
    const hi = table.findIndex((r) => r.some((x) => fold(x) === 'تاریخ') && r.some((x) => fold(x) === 'شماره'));
    if (hi < 0) {
      setRows([]);
      showToast('ستون‌های «شماره» و «تاریخ» در فایل پیدا نشد. فهرست را از خود سپیدار به اکسل بفرستید.');
      return;
    }
    const head = table[hi].map(fold);
    const col: Record<string, number> = {};
    for (const [k, names] of Object.entries(COLS)) {
      const i = names.map((n) => head.indexOf(n)).find((x) => x !== undefined && x >= 0);
      if (i !== undefined) col[k] = i;
    }
    const out: Record<string, string>[] = [];
    for (const r of table.slice(hi + 1)) {
      const m = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/.exec(digits(r[col.date] || '').trim());
      if (!m) continue;
      const [gy, gm, gd] = +m[1] > 1700 ? [+m[1], +m[2], +m[3]] : jalaliToGregorian(+m[1], +m[2], +m[3]);
      const row: Record<string, string> = { date: `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}` };
      for (const k of Object.keys(COLS)) if (k !== 'date') row[k] = digits(col[k] !== undefined ? r[col[k]] || '' : '').trim();
      out.push(row);
    }
    setRows(out);
    if (out.length === 0) showToast('ردیفی با تاریخ درست در فایل نبود.');
  };

  const send = async () => {
    setBusy(true);
    try {
      let added = 0;
      let updated = 0;
      for (let i = 0; i < rows.length; i += 1000) {
        const r = await api.whSepidarDocsImport(type, rows.slice(i, i + 1000));
        added += r.added;
        updated += r.updated;
      }
      showToast(`${fmt(added)} سند تازه آمد و ${fmt(updated)} سند بروز شد.`);
      onDone();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'ورود انجام نشد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="ورود خروج انبار از اکسل سپیدار"
      onClose={onClose}
      onTop
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-[#EBDBCE] text-xs font-black cursor-pointer">انصراف</button>
          <button type="button" disabled={busy || rows.length === 0} onClick={send} className="px-5 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-black cursor-pointer disabled:opacity-50" data-sepidar-docs-send>
            {busy ? 'در حال ورود…' : `ورود ${fmt(rows.length)} سند`}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-xs leading-6 text-[#503730]">
        <p>
          در سپیدار، «فهرست خروج انبار» (یا «فهرست برگشت از خروج انبار») را باز کنید، با دکمهٔ اکسل پایین پنجره فهرست را ذخیره کنید و همان فایل را اینجا انتخاب کنید. هر بار که فهرست تازه گرفتید دوباره وارد کنید؛ سندی که قبلاً آمده دوبار ثبت نمی‌شود.
        </p>
        <div className="flex gap-2">
          {([['issue', 'خروج انبار'], ['issueReturn', 'برگشت از خروج انبار']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setType(k)} className={`px-3 py-2 rounded-xl border text-[11px] font-black cursor-pointer ${type === k ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-[#EBDBCE]'}`}>
              {l}
            </button>
          ))}
        </div>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => pick(e.target.files?.[0])} className="block w-full text-xs" data-sepidar-docs-file />
        {name && (
          <div className="font-bold">
            {name}: {fmt(rows.length)} سند خوانده شد{rows[0] ? ` (نمونه: شمارهٔ ${toPersianDigits(rows[0].number)}، ${formatTaskDate(rows[0].date)}، ${rows[0].warehouse || '—'})` : ''}.
          </div>
        )}
        <p className="text-[10px] text-[#8C6F66]">در این فهرست فقط سرِ سند (شماره، تاریخ، انبار، تحویل‌گیرنده، توضیحات) هست؛ اقلام هر سند در خود سپیدار می‌ماند.</p>
      </div>
    </Modal>
  );
};
