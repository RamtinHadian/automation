import React, { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Upload, X, Download } from 'lucide-react';
import { Customer, CustomerStatus } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { IMPORT_FIELDS, ImportField, guessMapping, normPhone, normText, readTable, sampleCsv } from '../../lib/customerImport';

const uid = () => 'cu-' + Math.random().toString(36).substring(2, 10);
const sel = 'w-full px-3 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs outline-hidden';

/** Bulk-add customers from an Excel / CSV file exported from the accounting program. */
export const CustomerImportModal: React.FC<{
  existing: Customer[];
  ownerId: string;
  ownerName: string;
  onClose: () => void;
  onImport: (customers: Customer[]) => void;
}> = ({ existing, ownerId, ownerName, onClose, onImport }) => {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [map, setMap] = useState<Record<ImportField, number>>({ name: -1, company: -1, mobile: -1, phone: -1, email: -1, address: -1, notes: -1 });
  const [status, setStatus] = useState<CustomerStatus>('ACTIVE');
  const [skipDup, setSkipDup] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    try {
      const r = await readTable(f);
      if (r.length === 0) throw new Error('empty');
      setRows(r);
      setFileName(f.name);
      setMap(guessMapping(r[0]));
      setHasHeader(true);
    } catch {
      setRows(null);
      setError('فایل خوانده نشد. یک فایل اکسل (xlsx یا xls) یا CSV معتبر انتخاب کنید.');
    }
  };

  const cols = rows ? Math.max(...rows.slice(0, 50).map((r) => r.length)) : 0;
  const headers = rows ? Array.from({ length: cols }, (_, i) => (hasHeader ? rows[0][i] || '' : '') || `ستون ${toPersianDigits(i + 1)}`) : [];
  const data = rows ? (hasHeader ? rows.slice(1) : rows) : [];

  // Turn rows into customers; count what is skipped and why.
  const result = useMemo(() => {
    const known = new Set(existing.flatMap((c) => c.phones.map(normPhone)).filter(Boolean));
    const seen = new Set<string>();
    const ok: Customer[] = [];
    let noName = 0;
    let dup = 0;
    const get = (r: string[], f: ImportField) => (map[f] >= 0 ? normText(r[map[f]]) : '');
    for (const r of data) {
      const name = get(r, 'name') || get(r, 'company');
      if (!name) {
        noName++;
        continue;
      }
      const phones = [...new Set([normPhone(map.mobile >= 0 ? r[map.mobile] : ''), normPhone(map.phone >= 0 ? r[map.phone] : '')].filter(Boolean))];
      if (skipDup && phones.length && phones.some((p) => known.has(p) || seen.has(p))) {
        dup++;
        continue;
      }
      phones.forEach((p) => seen.add(p));
      const now = new Date().toISOString();
      ok.push({
        id: uid(),
        name,
        company: get(r, 'company') && get(r, 'name') ? get(r, 'company') : '',
        phones,
        email: get(r, 'email'),
        address: get(r, 'address'),
        status,
        source: 'ورود از اکسل',
        tags: [],
        ownerId,
        ownerName,
        notes: get(r, 'notes'),
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok, noName, dup };
  }, [data, map, existing, status, skipDup, ownerId, ownerName]);

  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(sampleCsv());
    a.download = 'نمونه-مشتریان.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={onClose}>
      <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col border border-[#EBDBCE] text-right">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE]">
          <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            ورود دسته‌ای مشتریان از اکسل
          </h3>
          <button type="button" onClick={onClose} className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <input
            ref={input}
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          {!rows ? (
            <>
              <p className="text-xs text-[#8C6F66] leading-6">
                لیست مشتریان را از برنامهٔ حسابداری با گزینهٔ «خروجی اکسل» بگیرید و اینجا انتخاب کنید. ستون‌ها خودکار شناخته می‌شوند و پیش از ثبت می‌توانید آن‌ها را اصلاح کنید.
              </p>
              <button
                type="button"
                onClick={() => input.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 py-10 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/40 text-violet-700 text-xs font-black cursor-pointer hover:bg-violet-50"
              >
                <Upload className="w-6 h-6" />
                انتخاب فایل اکسل یا CSV
              </button>
              {error && <div className="text-xs font-bold text-rose-600">{error}</div>}
              <button type="button" onClick={download} className="flex items-center gap-1.5 text-[11px] font-black text-violet-700 cursor-pointer">
                <Download className="w-3.5 h-3.5" />
                دریافت فایل نمونه
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-black text-[#3A241F] truncate" dir="ltr">
                  {fileName}
                </span>
                <button type="button" onClick={() => input.current?.click()} className="text-violet-700 font-black cursor-pointer">
                  انتخاب فایل دیگر
                </button>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-[#3A241F] cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => {
                    setHasHeader(e.target.checked);
                    setMap(guessMapping(e.target.checked ? rows[0] : []));
                  }}
                />
                ردیف اول عنوان ستون‌هاست
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {IMPORT_FIELDS.map((f) => (
                  <div key={f.id}>
                    <label className="block text-[11px] font-black text-[#3A241F] mb-1.5">{f.label}</label>
                    <select className={sel} value={map[f.id]} onChange={(e) => setMap((m) => ({ ...m, [f.id]: Number(e.target.value) }))}>
                      <option value={-1}>— ندارد —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <div>
                  <label className="block text-[11px] font-black text-[#3A241F] mb-1.5">وضعیت مشتریان واردشده</label>
                  <select className={sel} value={status} onChange={(e) => setStatus(e.target.value as CustomerStatus)}>
                    <option value="ACTIVE">مشتری فعال</option>
                    <option value="LEAD">مشتری بالقوه</option>
                    <option value="INACTIVE">غیرفعال</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-[#3A241F] cursor-pointer">
                <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
                مشتریانی که شمارهٔ تلفنشان قبلاً در سامانه هست، اضافه نشوند
              </label>
              <div className="rounded-2xl border border-[#EBDBCE] overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-[#FAF5F1] text-[#8C6F66]">
                    <tr>
                      {['نام', 'شرکت', 'موبایل', 'تلفن'].map((t) => (
                        <th key={t} className="px-3 py-2 font-black text-right">
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.ok.slice(0, 6).map((c) => (
                      <tr key={c.id} className="border-t border-[#EBDBCE]/60">
                        <td className="px-3 py-1.5 font-bold text-[#3A241F]">{c.name}</td>
                        <td className="px-3 py-1.5">{c.company}</td>
                        <td className="px-3 py-1.5" dir="ltr">
                          {toPersianDigits(c.phones[0] || '')}
                        </td>
                        <td className="px-3 py-1.5" dir="ltr">
                          {toPersianDigits(c.phones[1] || '')}
                        </td>
                      </tr>
                    ))}
                    {result.ok.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-gray-400 font-bold">
                          مشتری معتبری پیدا نشد؛ ستون «نام» را انتخاب کنید.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="text-xs font-bold text-[#3A241F] leading-6">
                {toPersianDigits(result.ok.length)} مشتری آمادهٔ افزودن است
                {result.dup > 0 && <span className="text-amber-700"> · {toPersianDigits(result.dup)} تکراری ردشد</span>}
                {result.noName > 0 && <span className="text-rose-600"> · {toPersianDigits(result.noName)} ردیف بدون نام ردشد</span>}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EBDBCE]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">
            انصراف
          </button>
          <button
            type="button"
            disabled={!rows || result.ok.length === 0}
            onClick={() => {
              onImport(result.ok);
              onClose();
            }}
            className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
          >
            {rows ? `افزودن ${toPersianDigits(result.ok.length)} مشتری` : 'افزودن'}
          </button>
        </div>
      </div>
    </div>
  );
};
