import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Upload, X, Download } from 'lucide-react';
import { Customer, CustomerStatus } from '../../types';
import { downloadCsv } from '../../lib/csv';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { useSepidarConnected } from '../../lib/sepidarCustomerFields';
import { importFields, ImportField, guessMapping, importDate, importGender, importKind, isCompleteMobile, normPhone, normText, readTable, sampleCsv, standardize, downloadStandardSheet } from '../../lib/customerImport';

/** Sepidar writes an address as «شهر, نشانی»: the city is the first part (the whole text is kept as it is). */
const cityOfAddress = (a: string) => {
  const parts = String(a || '').split(/[,،]/);
  return parts.length > 1 ? parts[0].trim() : '';
};

const uid = () => 'cu-' + Math.random().toString(36).substring(2, 10);
const sel = 'w-full px-3 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs outline-hidden';

/** Bulk-add customers from an Excel / CSV file exported from the accounting program. */
export const CustomerImportModal: React.FC<{
  existing: Customer[];
  ownerId: string;
  ownerName: string;
  onClose: () => void;
  /** the new customers, and the new address (as in the file / Sepidar) of customers that were already in the system */
  onImport: (customers: Customer[], addressUpdates?: { id: string; address: string; city?: string }[]) => void;
}> = ({ existing, ownerId, ownerName, onClose, onImport }) => {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [map, setMap] = useState<Record<ImportField, number>>(() => Object.fromEntries(importFields(false).map((f) => [f.id, -1])) as Record<ImportField, number>);
  const connected = useSepidarConnected();
  // where Hoormand is connected to Sepidar, the Sepidar-only customer fields can be filled from the sheet too
  const fields = useMemo(() => importFields(connected), [connected]);
  const [sources, setSources] = useState<{ name: string; count: number; unknown: string[] }[]>([]);
  const [status, setStatus] = useState<CustomerStatus>('ACTIVE');
  const [skipDup, setSkipDup] = useState(true);
  const [syncAddr, setSyncAddr] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  // One or several files: every one is brought to Hoormand's standard columns and the rows are put together in one list
  // (the first file whose columns are not recognised is kept as it is, to be mapped by hand).
  const pick = async (files: File[]) => {
    if (!files.length) return;
    setError('');
    try {
      let merged: string[][] | null = rows && sources.length ? rows : null;
      const src = merged ? [...sources] : [];
      for (const f of files) {
        const r = await readTable(f);
        if (r.length === 0) throw new Error('empty');
        const std = standardize(r, fields);
        if (std) {
          merged = merged ? [...merged, ...std.rows.slice(1)] : std.rows;
          src.push({ name: f.name, count: std.rows.length - 1, unknown: std.unknown });
        } else if (!merged) {
          setRows(r);
          setFileName(f.name);
          setMap(guessMapping(r[0], fields));
          setHasHeader(true);
          setSources([]);
          return;
        } else {
          setError(`ستون «نام» در فایل «${f.name}» پیدا نشد؛ این فایل به لیست اضافه نشد.`);
        }
      }
      if (merged) {
        setRows(merged);
        setFileName(src.map((x) => x.name).join(' + '));
        setMap(guessMapping(merged[0], fields));
        setHasHeader(true);
        setSources(src);
      }
    } catch {
      setError('فایل خوانده نشد. یک فایل اکسل (xlsx یا xls) یا CSV معتبر انتخاب کنید.');
    }
  };

  const cols = rows ? Math.max(...rows.slice(0, 50).map((r) => r.length)) : 0;
  const headers = rows ? Array.from({ length: cols }, (_, i) => (hasHeader ? rows[0][i] || '' : '') || `ستون ${toPersianDigits(i + 1)}`) : [];
  const data = rows ? (hasHeader ? rows.slice(1) : rows) : [];

  // which numbers and codes of the file already belong to a customer in Hoormand (the server looks at all customers, also the colleagues' ones)
  const [serverDup, setServerDup] = useState<{ phones: Record<string, { name: string; visible: boolean }>; codes: Record<string, { name: string; visible: boolean }> }>({ phones: {}, codes: {} });
  useEffect(() => {
    if (!rows) return;
    const ph = new Set<string>();
    const cd = new Set<string>();
    for (const r of data) {
      for (const f of ['mobile', 'mobile2', 'phone', 'phone2'] as ImportField[]) {
        const p = normPhone(map[f] >= 0 ? r[map[f]] : '');
        if (p) ph.add(p);
      }
      for (const f of ['nationalCode', 'nationalId'] as ImportField[]) {
        const v = map[f] >= 0 ? normText(r[map[f]]) : '';
        if (v) cd.add(v);
      }
    }
    if (ph.size + cd.size === 0) return;
    let live = true;
    const t = setTimeout(() => {
      api.customerDupCheck([...ph].slice(0, 20000), [...cd].slice(0, 20000)).then((r) => live && setServerDup(r)).catch(() => undefined);
    }, 400);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, map, hasHeader]);

  // Turn rows into customers; count what is skipped and why.
  const result = useMemo(() => {
    const known = new Set(existing.flatMap((c) => c.phones.map(normPhone)).filter(Boolean));
    const knownIds = new Set(existing.flatMap((c) => [c.nationalCode, c.nationalId]).map((x) => normText(x)).filter(Boolean));
    const seen = new Set<string>();
    const seenAt = new Map<string, number>(); // number or code → the row of the file that had it first
    const dupList: { row: number; name: string; phones: string[]; matched: string }[] = [];
    const ok: Customer[] = [];
    // customers already in the system whose address in the file is different (Sepidar is the source of the address): only the address is changed
    const addrUpdates = new Map<string, { id: string; name: string; old: string; next: string; city?: string }>();
    let noName = 0;
    let dup = 0;
    let noMobile = 0;
    // every row that is left out, with the number of the row in the file and the reason, so nothing disappears without a word
    const issues: { row: number; what: string; reason: string }[] = [];
    const get = (r: string[], f: ImportField) => (map[f] >= 0 ? normText(r[map[f]]) : '');
    const opt = (v: string) => (v ? v : undefined);
    const sepidarInfo = (r: string[]) => {
      const out: Record<string, string> = {};
      for (const f of fields) {
        const id = String(f.id);
        if (!id.startsWith('sp_')) continue;
        const v = get(r, f.id);
        if (v) out[id.slice(3)] = v;
      }
      return Object.keys(out).length ? out : undefined;
    };
    // the same person can stand in the file more than once (Sepidar keeps several records for one number): the fullest address of that number is the one used
    const bestAddr = new Map<string, string>();
    for (const row of data) {
      const a = get(row, 'address');
      if (!a) continue;
      for (const f of ['mobile', 'mobile2', 'phone', 'phone2'] as ImportField[]) {
        const p = normPhone(map[f] >= 0 ? row[map[f]] : '');
        if (p && a.length > (bestAddr.get(p)?.length || 0)) bestAddr.set(p, a);
      }
    }
    const addrOf = (row: string[], nums: string[]) => nums.reduce((best, p) => ((bestAddr.get(p)?.length || 0) > best.length ? (bestAddr.get(p) as string) : best), get(row, 'address'));
    for (const [ri, r] of data.entries()) {
      const rowNo = ri + (hasHeader ? 2 : 1);
      const rowText = r.map((x) => normText(x)).filter(Boolean).slice(0, 3).join(' | ');
      // the name: a full name, or the first name and the family name from two columns
      const first = get(r, 'firstName');
      const family = get(r, 'lastName');
      const main = get(r, 'name');
      // «نام کامل» already holds the family name: it is not added a second time
      const name = [main, main.includes(family) ? '' : family].filter(Boolean).join(' ') || [first, family].filter(Boolean).join(' ') || get(r, 'company');
      if (!name) {
        noName++;
        issues.push({ row: rowNo, what: rowText, reason: 'نام ندارد' });
        continue;
      }
      const phones = [...new Set(['mobile', 'mobile2', 'phone', 'phone2'].map((f) => normPhone(map[f as ImportField] >= 0 ? r[map[f as ImportField]] : '')).filter(Boolean))];
      if (!phones.some((p) => isCompleteMobile(p))) {
        noMobile++;
        issues.push({ row: rowNo, what: name, reason: phones.length ? `موبایل کامل ندارد (شماره‌های فایل: ${phones.join('، ')})؛ موبایل باید ۱۱ رقم و مثل ۰۹۱۲۳۴۵۶۷۸۹ باشد` : 'شمارهٔ موبایل ندارد' });
        continue;
      }
      const ids = [get(r, 'nationalCode'), get(r, 'nationalId')].filter(Boolean);
      const srvHit = phones.map((p) => serverDup.phones[p]).find(Boolean) || ids.map((x) => serverDup.codes[x]).find(Boolean);
      if (skipDup && ((phones.length && phones.some((p) => known.has(p) || seen.has(p))) || ids.some((x) => knownIds.has(x) || seen.has(x)) || srvHit)) {
        dup++;
        // who it matches: a customer already in the system (named when this person may see them), or an earlier row of the same file
        const mine = existing.find((c) => c.phones.some((p) => phones.includes(normPhone(p))) || [c.nationalCode, c.nationalId].some((x) => x && ids.includes(normText(x))));
        const earlier = [...phones, ...ids].map((k) => seenAt.get(k)).find((x) => x !== undefined);
        const matched = mine ? `${mine.name} (در هورمند)` : srvHit ? (srvHit.visible && srvHit.name ? `${srvHit.name} (در هورمند)` : 'مشتری همکار (در هورمند)') : earlier !== undefined ? `ردیف ${toPersianDigits(earlier)} همین فایل` : '';
        dupList.push({ row: rowNo, name, phones, matched });
        const srcAddr = addrOf(r, phones);
        if (syncAddr && mine && srcAddr && normText(mine.address || '') !== srcAddr && !addrUpdates.has(mine.id)) addrUpdates.set(mine.id, { id: mine.id, name: mine.name, old: mine.address || '', next: srcAddr, city: mine.city ? undefined : cityOfAddress(srcAddr) });
        issues.push({ row: rowNo, what: `${name} · ${phones.map((p) => toPersianDigits(p)).join('، ')}`, reason: `تکراری و ارسال نشد؛ مشتری موجود دست‌نخورده ماند${matched ? ` (${matched})` : ''}` });
        continue;
      }
      phones.forEach((p) => { seen.add(p); seenAt.set(p, rowNo); });
      ids.forEach((x) => { seen.add(x); seenAt.set(x, rowNo); });
      const now = new Date().toISOString();
      const kind = importKind(get(r, 'kind')) || (get(r, 'nationalId') || get(r, 'economicCode') ? 'COMPANY' : undefined);
      const repMobile = normPhone(map.repMobile >= 0 ? r[map.repMobile] : '');
      ok.push({
        id: uid(),
        name,
        company: get(r, 'company') && get(r, 'name') ? get(r, 'company') : '',
        kind,
        firstName: opt(first || (main && family ? main : '')),
        lastName: opt(family),
        fatherName: opt(get(r, 'fatherName')),
        nationalCode: opt(get(r, 'nationalCode')),
        idNumber: opt(get(r, 'idNumber')),
        birthDate: importDate(get(r, 'birthDate')),
        gender: importGender(get(r, 'gender')),
        companyType: opt(get(r, 'companyType')),
        nationalId: opt(get(r, 'nationalId')),
        economicCode: opt(get(r, 'economicCode')),
        registrationNumber: opt(get(r, 'registrationNumber')),
        registrationDate: importDate(get(r, 'registrationDate')),
        repName: opt(get(r, 'repName')),
        repPosition: opt(get(r, 'repPosition')),
        repMobile: opt(repMobile),
        shopType: opt(get(r, 'shopType')),
        licenseNumber: opt(get(r, 'licenseNumber')),
        province: opt(get(r, 'province')),
        city: opt(get(r, 'city') || cityOfAddress(addrOf(r, phones))),
        postalCode: opt(get(r, 'postalCode')),
        website: opt(get(r, 'website')),
        faxNumber: opt(normPhone(map.faxNumber >= 0 ? r[map.faxNumber] : '')),
        interest: opt(get(r, 'interest')),
        sepidarInfo: sepidarInfo(r),
        phones,
        email: get(r, 'email'),
        address: addrOf(r, phones),
        status,
        source: get(r, 'source') || 'ورود از اکسل',
        tags: get(r, 'tags') ? [...new Set(get(r, 'tags').split(/[,،;؛]/).map((t) => t.trim()).filter(Boolean))] : [],
        ownerId,
        ownerName,
        notes: get(r, 'notes'),
        createdAt: now,
        updatedAt: now,
      });
    }
    return { ok, noName, dup, noMobile, issues, dupList, addrUpdates: [...addrUpdates.values()] };
  }, [data, map, existing, status, skipDup, syncAddr, ownerId, ownerName, fields, serverDup]);

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
            multiple
            className="hidden"
            onChange={(e) => {
              pick(Array.from(e.target.files || []));
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
                <span className="flex flex-wrap items-center gap-3">
                  <button type="button" onClick={() => input.current?.click()} className="text-violet-700 font-black cursor-pointer" data-import-add>
                    {sources.length ? 'افزودن فایل دیگر به همین لیست' : 'انتخاب فایل دیگر'}
                  </button>
                  {sources.length > 0 && (
                    <button type="button" onClick={() => { setRows(null); setSources([]); setFileName(''); }} className="text-[#8C6F66] font-black cursor-pointer">
                      شروع از نو
                    </button>
                  )}
                  {sources.length > 0 && rows && (
                    <button type="button" onClick={() => void downloadStandardSheet(rows)} className="text-emerald-700 font-black cursor-pointer" data-import-standard>
                      دانلود فایل استاندارد هورمند (اکسل)
                    </button>
                  )}
                </span>
              </div>
              {sources.length > 0 && rows && (
                <div className="rounded-2xl border border-[#EBDBCE] bg-[#FAF5F1] px-3 py-2 text-[11px] font-bold text-[#5A4640] space-y-1" data-import-sources>
                  <div className="font-black text-[#3A241F]">لیست یکپارچه با ستون‌های استاندارد هورمند: {toPersianDigits(Math.max(0, rows.length - 1))} ردیف از {toPersianDigits(sources.length)} فایل</div>
                  {sources.map((x) => (
                    <div key={x.name}>
                      <span dir="ltr">{x.name}</span> · {toPersianDigits(x.count)} ردیف
                      {x.unknown.length > 0 && <span className="text-amber-700"> · ستون‌هایی که فیلدی در هورمند ندارند و وارد نمی‌شوند: {x.unknown.join('، ')}</span>}
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center gap-2 text-xs font-bold text-[#3A241F] cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(e) => {
                    setHasHeader(e.target.checked);
                    setMap(guessMapping(e.target.checked ? rows[0] : [], fields));
                  }}
                />
                ردیف اول عنوان ستون‌هاست
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fields.filter((f) => !String(f.id).startsWith('sp_')).map((f) => (
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
                {connected && (
                  <details className="sm:col-span-2 rounded-2xl border border-rose-200 bg-rose-50/40 px-3 py-2" data-import-sepidar>
                    <summary className="text-[11px] font-black text-rose-800 cursor-pointer">اطلاعات سپیدار (سقف اعتبار، نرخ تخفیف، گروه‌ها، لیست سیاه، …)؛ ستون‌های خروجی سپیدار خودکار شناخته می‌شوند</summary>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                      {fields.filter((f) => String(f.id).startsWith('sp_')).map((f) => (
                        <div key={f.id}>
                          <label className="block text-[11px] font-black text-[#3A241F] mb-1.5">{f.label.replace('سپیدار · ', '')}</label>
                          <select className={sel} value={map[f.id] ?? -1} onChange={(e) => setMap((m) => ({ ...m, [f.id]: Number(e.target.value) }))}>
                            <option value={-1}>— ندارد —</option>
                            {headers.map((h, i) => (
                              <option key={i} value={i}>{h}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
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
                مشتریانی که شمارهٔ تلفن یا کد ملی‌شان قبلاً در سامانه هست، اضافه نشوند
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-[#3A241F] cursor-pointer" data-import-sync-address>
                <input type="checkbox" checked={syncAddr} onChange={(e) => setSyncAddr(e.target.checked)} />
                نشانی مشتریانی که از قبل در سامانه هستند هم عیناً طبق فایل (سپیدار) به‌روز شود؛ فقط نشانی عوض می‌شود، بقیهٔ اطلاعات و سابقه دست‌نخورده می‌ماند
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
                {result.noMobile > 0 && <span className="text-rose-600"> · {toPersianDigits(result.noMobile)} ردیف بدون موبایل کامل ردشد (موبایل برای ثبت هر مشتری لازم است)</span>}
              </div>
              {result.addrUpdates.length > 0 && (
                <details className="rounded-2xl border border-violet-300 bg-violet-50/60 px-3 py-2" data-import-addr-updates open>
                  <summary className="cursor-pointer text-[11px] font-black text-violet-900">نشانی این مشتریان موجود طبق فایل عوض می‌شود ({toPersianDigits(result.addrUpdates.length)})</summary>
                  <div className="mt-2 max-h-48 overflow-y-auto divide-y divide-violet-100 text-[11px]">
                    {result.addrUpdates.slice(0, 200).map((u) => (
                      <div key={u.id} className="py-1.5">
                        <span className="font-black text-[#3A241F]">{u.name}</span>
                        <span className="block text-[#8C6F66]">قبلی: {u.old ? toPersianDigits(u.old) : 'نشانی نداشت'}</span>
                        <span className="block text-violet-900 font-bold">طبق فایل: {toPersianDigits(u.next)}</span>
                      </div>
                    ))}
                    {result.addrUpdates.length > 200 && <div className="py-1.5 font-bold text-[#8C6F66]">و {toPersianDigits(result.addrUpdates.length - 200)} مشتری دیگر.</div>}
                  </div>
                </details>
              )}
              {result.dupList.length > 0 && (
                <details className="rounded-2xl border border-amber-300 bg-amber-50/60 px-3 py-2" data-import-dups open>
                  <summary className="cursor-pointer text-[11px] font-black text-amber-900">مشتریان تکراری؛ به هورمند فرستاده نمی‌شوند ({toPersianDigits(result.dupList.length)})</summary>
                  <p className="mt-1 text-[10.5px] font-bold text-amber-900/80 leading-5">این افراد از قبل در هورمند (یا در همین فایل) هستند. هیچ‌چیز از آن‌ها وارد، عوض یا پاک نمی‌شود؛ تماس‌ها، یادداشت‌ها و فرصت‌های مشتریِ موجود همان‌طور که هست می‌ماند. فهرستشان فقط برای گزارش اینجاست.</p>
                  <div className="mt-2 max-h-48 overflow-y-auto divide-y divide-amber-100 text-[11px]">
                    {result.dupList.slice(0, 300).map((d, k) => (
                      <div key={k} className="py-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span className="shrink-0 font-black text-amber-800">ردیف {toPersianDigits(d.row)}</span>
                        <span className="font-black text-[#3A241F]">{d.name}</span>
                        <span dir="ltr" className="font-bold text-[#503730]">{d.phones.map((p) => toPersianDigits(p)).join(' ، ')}</span>
                        {d.matched && <span className="text-[#6b5048]">← {d.matched}</span>}
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => downloadCsv('مشتریان-تکراری.csv', [['ردیف', 'نام', 'شماره‌ها', 'همان مشتری در هورمند'], ...result.dupList.map((d) => [d.row, d.name, d.phones.join(' - '), d.matched])])} className="mt-2 flex items-center gap-1 text-[11px] font-black text-amber-900 cursor-pointer" data-import-dups-download>
                    <Download className="w-3.5 h-3.5" />
                    دانلود فهرست تکراری‌ها (نام و شماره)
                  </button>
                </details>
              )}
              {result.issues.length > 0 && (
                <details className="rounded-2xl border border-rose-200 bg-rose-50/50 px-3 py-2" data-import-issues open>
                  <summary className="cursor-pointer text-[11px] font-black text-rose-800">ردیف‌های ردشده و دلیل هر کدام ({toPersianDigits(result.issues.length)})</summary>
                  <div className="mt-2 max-h-48 overflow-y-auto divide-y divide-rose-100 text-[11px]">
                    {result.issues.slice(0, 300).map((i, k) => (
                      <div key={k} className="py-1.5 flex gap-2">
                        <span className="shrink-0 font-black text-rose-700">ردیف {toPersianDigits(i.row)}</span>
                        <span className="shrink-0 font-bold text-[#3A241F] max-w-[40%] truncate">{i.what}</span>
                        <span className="text-[#6b5048]">{i.reason}</span>
                      </div>
                    ))}
                    {result.issues.length > 300 && <div className="py-1.5 font-bold text-[#8C6F66]">و {toPersianDigits(result.issues.length - 300)} ردیف دیگر؛ فهرست کامل را دانلود کنید.</div>}
                  </div>
                  <button type="button" onClick={() => downloadCsv('ردیف‌های-ردشده.csv', [['ردیف', 'مشخصات', 'دلیل'], ...result.issues.map((i) => [i.row, i.what, i.reason])])} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black border border-rose-300 bg-white text-rose-800 cursor-pointer">
                    <Download className="w-3.5 h-3.5" />
                    دانلود فهرست خطاها
                  </button>
                </details>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EBDBCE]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">
            انصراف
          </button>
          <button
            type="button"
            disabled={!rows || (result.ok.length === 0 && result.addrUpdates.length === 0)}
            onClick={() => {
              onImport(result.ok, result.addrUpdates.map((u) => ({ id: u.id, address: u.next, city: u.city })));
              onClose();
            }}
            className="px-5 py-2 rounded-xl text-xs font-black text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
          >
            {rows ? `افزودن ${toPersianDigits(result.ok.length)} مشتری${result.addrUpdates.length ? ` و به‌روزکردن نشانی ${toPersianDigits(result.addrUpdates.length)} مشتری` : ''}` : 'افزودن'}
          </button>
        </div>
      </div>
    </div>
  );
};
