import React, { useMemo, useState } from 'react';
import { Camera, Search, X } from 'lucide-react';
import { Customer, User, Warranty, WarrantySettings } from '../../types';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { todayIso } from '../../lib/taskDates';
import { daysBetween, remainingText, shrinkImage, STATE_LABEL, warrantyEnd, warrantyState, codeText } from '../../lib/warranty';
import { Modal, field, label } from '../crm/crmUi';
import { JalaliDateField } from '../tasks/TasksView';
import { dayText } from '../../lib/warranty';

const uid = (p: string) => p + '-' + Math.random().toString(36).substring(2, 10);
const MONTH_CHOICES = [3, 6, 12, 18, 24, 36, 48, 60];

/** Pick a customer by typing part of the name, company or phone number. */
export const CustomerPicker: React.FC<{ customers: Customer[]; value: string; onPick: (id: string) => void; disabled?: boolean }> = ({ customers, value, onPick, disabled }) => {
  const [q, setQ] = useState('');
  const chosen = customers.find((c) => c.id === value);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return customers.filter((c) => `${c.name} ${c.company || ''} ${(c.phones || []).join(' ')}`.toLowerCase().includes(t)).slice(0, 8);
  }, [q, customers]);
  if (chosen) {
    return (
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-teal-50 border border-teal-200 rounded-xl text-xs font-black text-teal-900">
        <span className="truncate">{chosen.name}{chosen.company && chosen.company !== chosen.name ? ` · ${chosen.company}` : ''}</span>
        {!disabled && <button type="button" onClick={() => onPick('')} className="shrink-0 text-teal-700 hover:underline cursor-pointer text-[11px]">تغییر</button>}
      </div>
    );
  }
  return (
    <div className="relative">
      <Search className="w-4 h-4 text-[#8C6F66] absolute right-3.5 top-1/2 -translate-y-1/2" />
      <input className={`${field} pr-10`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="نام، شرکت یا شمارهٔ تلفن مشتری را بنویسید…" autoComplete="off" />
      {hits.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-[#EBDBCE] rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-[#EBDBCE]/60">
          {hits.map((c) => (
            <button key={c.id} type="button" onClick={() => onPick(c.id)} className="w-full text-right px-3.5 py-2 hover:bg-[#FAF5F1] cursor-pointer">
              <div className="text-xs font-black text-[#3A241F]">{c.name}</div>
              <div className="text-[10px] text-[#8C6F66]">{[c.company, c.phones?.[0] ? toPersianDigits(c.phones[0]) : ''].filter(Boolean).join(' · ')}</div>
            </button>
          ))}
        </div>
      )}
      {q.trim() && hits.length === 0 && <div className="mt-1 text-[11px] font-bold text-[#8C6F66]">مشتری با این نام پیدا نشد؛ اول او را در بخش مشتریان ثبت کنید.</div>}
    </div>
  );
};

/** New warranty / edit of one. The end date is counted in Persian months and shown while the person types. */
export const WarrantyForm: React.FC<{
  initial?: Warranty | null;
  presetCustomerId?: string;
  customers: Customer[];
  settings: WarrantySettings;
  onClose: () => void;
  onSaved: (w: Warranty) => void;
  onError: (msg: string) => void;
}> = ({ initial, presetCustomerId, customers, settings, onClose, onSaved, onError }) => {
  const isNew = !initial;
  const [customerId, setCustomerId] = useState(initial?.customerId || presetCustomerId || '');
  const [productName, setProductName] = useState(initial?.productName || '');
  const [productCode, setProductCode] = useState(initial?.productCode || '');
  const [serial, setSerial] = useState(initial?.serial || '');
  const [invoice, setInvoice] = useState(initial?.invoiceNumber || '');
  const [saleDate, setSaleDate] = useState<string | undefined>(initial?.saleDate || todayIso());
  const [startDate, setStartDate] = useState<string | undefined>(initial && initial.startDate !== initial.saleDate ? initial.startDate : undefined);
  const [months, setMonths] = useState(String(initial?.months || settings.defaultMonths || 12));
  const [maxKm, setMaxKm] = useState(initial?.maxKm ? String(initial.maxKm) : '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [saving, setSaving] = useState(false);

  const m = Math.min(120, Math.max(1, parseInt(toEn(months), 10) || 0));
  const start = startDate || saleDate;
  const end = start && m ? warrantyEnd(start, m) : '';
  const valid = !!customerId && productName.trim() && saleDate && m >= 1;

  const save = async () => {
    if (!valid || saving || !saleDate || !start) return;
    setSaving(true);
    try {
      const saved = await api.warrantyPut(initial?.id || uid('wr'), {
        customerId, productName: productName.trim(), productCode: productCode.trim(), serial: serial.trim(), invoiceNumber: invoice.trim(),
        saleDate, startDate: start, months: m, endDate: end, maxKm: parseInt(toEn(maxKm), 10) || 0, notes: notes.trim(),
      });
      onSaved(saved);
    } catch (e) {
      onError(e instanceof Error ? e.message : 'ذخیره نشد.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isNew ? 'ثبت گارانتی جدید' : `ویرایش گارانتی ${codeText(initial!.warrantyNo)}`}
      onClose={onClose}
      onTop
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">انصراف</button>
          <button type="button" onClick={save} disabled={!valid || saving} className="px-5 py-2 min-h-[44px] sm:min-h-0 rounded-xl text-xs font-black text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 cursor-pointer">{saving ? 'در حال ذخیره…' : isNew ? 'ثبت گارانتی' : 'ذخیره'}</button>
        </>
      }
    >
      <div>
        <label className={label}>مشتری *</label>
        <CustomerPicker customers={customers} value={customerId} onPick={setCustomerId} disabled={!isNew} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="sm:col-span-2">
          <label className={label}>نام کالا *</label>
          <input className={field} value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="مثلاً میل لنگ سانز" />
        </div>
        <div>
          <label className={label}>کد کالا</label>
          <input className={field} dir="ltr" value={productCode} onChange={(e) => setProductCode(e.target.value)} placeholder="A-1024" />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>شمارهٔ سریال / بچ</label>
          <input className={field} dir="ltr" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="هر سریال فقط یک گارانتی می‌گیرد" />
        </div>
        <div>
          <label className={label}>شمارهٔ فاکتور فروش</label>
          <input className={field} dir="ltr" value={invoice} onChange={(e) => setInvoice(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={label}>تاریخ فروش *</label>
          <JalaliDateField value={saleDate} minYear={1395} maxYear={undefined} onChange={setSaleDate} />
        </div>
        <div>
          <label className={label}>شروع گارانتی (اگر با تاریخ فروش فرق دارد)</label>
          <JalaliDateField value={startDate} minYear={1395} onChange={setStartDate} />
        </div>
        <div>
          <label className={label}>مدت گارانتی (ماه) *</label>
          <div className="flex flex-wrap gap-1.5">
            {MONTH_CHOICES.map((n) => (
              <button key={n} type="button" onClick={() => setMonths(String(n))} className={`px-3 py-1.5 rounded-xl text-[11px] font-black cursor-pointer border ${m === n ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>{toPersianDigits(n)}</button>
            ))}
            <input className={`${field} !w-20 text-center`} inputMode="numeric" value={toPersianDigits(months)} onChange={(e) => setMonths(toEn(e.target.value))} aria-label="مدت گارانتی به ماه" />
          </div>
        </div>
        <div>
          <label className={label}>سقف کارکرد (کیلومتر؛ خالی = بدون سقف)</label>
          <input className={field} inputMode="numeric" value={maxKm ? toPersianDigits(maxKm) : ''} onChange={(e) => setMaxKm(toEn(e.target.value))} placeholder="مثلاً ۴۰٬۰۰۰" />
        </div>
      </div>
      {end && (
        <div className="rounded-xl bg-teal-50 border border-teal-200 px-3.5 py-2.5 text-[11px] font-black text-teal-900" data-warranty-end>
          پایان گارانتی: {dayText(end)} ({remainingText({ endDate: end, status: 'ACTIVE' } as Warranty)})
        </div>
      )}
      <div>
        <label className={label}>توضیحات</label>
        <textarea className={`${field} min-h-[64px] leading-6`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
};

export const toEn = (v: string) => v.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^0-9]/g, '');

/** A customer reports that a product failed. */
export const ClaimForm: React.FC<{
  warranties: Warranty[];
  presetWarrantyId?: string;
  staff: User[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}> = ({ warranties, presetWarrantyId, staff, onClose, onSaved, onError }) => {
  const [warrantyId, setWarrantyId] = useState(presetWarrantyId || '');
  const [q, setQ] = useState('');
  const [description, setDescription] = useState('');
  const [reportedAt, setReportedAt] = useState<string | undefined>(todayIso());
  const [model, setModel] = useState('');
  const [plate, setPlate] = useState('');
  const [km, setKm] = useState('');
  const [handlerId, setHandlerId] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const chosen = warranties.find((w) => w.id === warrantyId);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return warranties.filter((w) => w.status !== 'VOID' && `${w.warrantyNo} ${w.customerName} ${w.productName} ${w.productCode || ''} ${w.serial || ''} ${w.invoiceNumber || ''}`.toLowerCase().includes(t)).slice(0, 8);
  }, [q, warranties]);

  const kmNum = parseInt(toEn(km), 10) || 0;
  const date = reportedAt || todayIso();
  const warn = !chosen
    ? ''
    : date > chosen.endDate
      ? `زمان گارانتی این کالا ${toPersianDigits(daysBetween(chosen.endDate, date))} روز پیش تمام شده است. درخواست ثبت می‌شود ولی «خارج از گارانتی» علامت می‌خورد.`
      : chosen.maxKm && kmNum > chosen.maxKm
        ? `کارکرد (${toPersianDigits(kmNum)} کیلومتر) از سقف گارانتی (${toPersianDigits(chosen.maxKm)}) بیشتر است؛ «خارج از گارانتی» علامت می‌خورد.`
        : '';

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const next = [...photos];
    for (const f of Array.from(files)) {
      if (next.length >= 4) break;
      try {
        next.push(await shrinkImage(f));
      } catch {
        onError('این فایل عکس نبود.');
      }
    }
    setPhotos(next);
  };

  const save = async () => {
    if (!chosen || !description.trim() || saving) return;
    setSaving(true);
    try {
      await api.claimCreate({ warrantyId: chosen.id, description: description.trim(), reportedAt: date, vehicle: { model: model.trim(), plate: plate.trim(), km: kmNum }, handlerId: handlerId || undefined, photos });
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'ثبت نشد.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="ثبت درخواست گارانتی (خرابی کالا)"
      onClose={onClose}
      onTop
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">انصراف</button>
          <button type="button" onClick={save} disabled={!chosen || !description.trim() || saving} className="px-5 py-2 min-h-[44px] sm:min-h-0 rounded-xl text-xs font-black text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 cursor-pointer">{saving ? 'در حال ثبت…' : 'ثبت درخواست'}</button>
        </>
      }
    >
      <div>
        <label className={label}>کدام گارانتی؟ *</label>
        {chosen ? (
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-teal-50 border border-teal-200 rounded-xl text-xs font-bold text-teal-900">
            <span className="min-w-0">
              <b className="font-black">{chosen.productName}</b> · {chosen.customerName}
              <span className="block text-[10px] font-medium text-teal-700">{codeText(chosen.warrantyNo)}{chosen.serial ? ` · سریال ${toPersianDigits(chosen.serial)}` : ''} · {STATE_LABEL[warrantyState(chosen)].label} ({remainingText(chosen)})</span>
            </span>
            {!presetWarrantyId && <button type="button" onClick={() => setWarrantyId('')} className="shrink-0 text-teal-700 hover:underline cursor-pointer text-[11px]">تغییر</button>}
          </div>
        ) : (
          <div className="relative">
            <Search className="w-4 h-4 text-[#8C6F66] absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input className={`${field} pr-10`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="سریال، شمارهٔ گارانتی، نام کالا یا نام مشتری…" autoComplete="off" />
            {hits.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-[#EBDBCE] rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-[#EBDBCE]/60">
                {hits.map((w) => (
                  <button key={w.id} type="button" onClick={() => setWarrantyId(w.id)} className="w-full text-right px-3.5 py-2 hover:bg-[#FAF5F1] cursor-pointer">
                    <div className="text-xs font-black text-[#3A241F]">{w.productName} · {w.customerName}</div>
                    <div className="text-[10px] text-[#8C6F66]">{codeText(w.warrantyNo)}{w.serial ? ` · سریال ${toPersianDigits(w.serial)}` : ''} · {STATE_LABEL[warrantyState(w)].label}</div>
                  </button>
                ))}
              </div>
            )}
            {q.trim() && hits.length === 0 && <div className="mt-1 text-[11px] font-bold text-[#8C6F66]">گارانتی‌ای با این مشخصات پیدا نشد.</div>}
          </div>
        )}
      </div>
      {warn && <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[11px] font-bold text-amber-900 leading-6">{warn}</div>}
      <div>
        <label className={label}>شرح خرابی *</label>
        <textarea className={`${field} min-h-[88px] leading-6`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مشتری چه مشکلی را گزارش کرده؟ (صدا، لقی، نشتی، شکستگی…)" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2">
          <label className={label}>تاریخ گزارش</label>
          <JalaliDateField value={reportedAt} minYear={1395} onChange={setReportedAt} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>مسئول پیگیری</label>
          <select className={field} value={handlerId} onChange={(e) => setHandlerId(e.target.value)}>
            <option value="">(بعداً تعیین می‌شود)</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={label}>خودرو (مدل)</label>
          <input className={field} value={model} onChange={(e) => setModel(e.target.value)} placeholder="مثلاً پژو ۴۰۵" />
        </div>
        <div>
          <label className={label}>پلاک</label>
          <input className={field} value={plate} onChange={(e) => setPlate(e.target.value)} />
        </div>
        <div>
          <label className={label}>کارکرد (کیلومتر)</label>
          <input className={field} inputMode="numeric" value={km ? toPersianDigits(km) : ''} onChange={(e) => setKm(toEn(e.target.value))} />
        </div>
      </div>
      <div>
        <label className={label}>عکس کالا یا خرابی (حداکثر ۴ عکس)</label>
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-[#EBDBCE]">
              <img src={p} alt="" className="w-full h-full object-cover" />
              <button type="button" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer" aria-label="حذف عکس"><X className="w-3 h-3" /></button>
            </div>
          ))}
          {photos.length < 4 && (
            <label className="w-20 h-20 rounded-xl border-2 border-dashed border-[#EBDBCE] flex flex-col items-center justify-center gap-1 text-[10px] font-black text-[#8C6F66] cursor-pointer hover:bg-[#FAF5F1]">
              <Camera className="w-5 h-5" />
              افزودن
              <input type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
};
