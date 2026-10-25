import React, { useMemo, useState } from 'react';
import { BookUser, Check, Copy, Download, PhoneCall, Printer, Search, Smartphone, Phone, Star } from 'lucide-react';
import { Customer } from '../../types';
import { fold } from '../../lib/customerSearch';
import { downloadCsv } from '../../lib/csv';
import { toPersianDigits } from '../../lib/jalali';
import { isMobileNumber } from '../../lib/customerImport';
import { Modal, field } from './crmUi';
import { searchLine } from '../../lib/searchAll';
import { CONTACT_TYPES, contactTypeOf } from '../../lib/contactTypes';
import { QuickCustomerDialog } from '../common/CustomerSelect';
import { useAppContext } from '../../context/AppContext';

type Row = { key: string; customer: Customer; number: string; kind: 'mobile' | 'landline' | 'fax'; main: boolean; line: string };

const KIND: Record<Row['kind'], { label: string; icon: React.ElementType; cls: string }> = {
  mobile: { label: 'موبایل', icon: Smartphone, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  landline: { label: 'ثابت', icon: Phone, cls: 'text-sky-700 bg-sky-50 border-sky-200' },
  fax: { label: 'فکس', icon: Printer, cls: 'text-violet-700 bg-violet-50 border-violet-200' },
};

/** The phone book: every number of every customer on one searchable list. */
export const PhoneBook: React.FC<{ newPhone?: string | null; onNewDone?: () => void; customers: Customer[]; canCall: boolean; onCall: (number: string, name: string) => void; onOpenCustomer: (id: string) => void; onClose: () => void }> = ({ newPhone, onNewDone, customers, canCall, onCall, onOpenCustomer, onClose }) => {
  const [q, setQ] = useState('');
  const { setCustomers } = useAppContext();
  const [kind, setKind] = useState<'all' | Row['kind']>('all');
  const [typeF, setTypeF] = useState<string>('all');
  const [adding, setAdding] = useState<string | null>(newPhone ?? null);
  const [copied, setCopied] = useState('');

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const c of customers) {
      (c.phones || []).forEach((p, i) => {
        const k: Row['kind'] = c.faxNumber === p ? 'fax' : isMobileNumber(p) ? 'mobile' : 'landline';
        const digits = p.replace(/\D/g, '');
        const line = fold(CONTACT_TYPES.find((t) => t.id === contactTypeOf(c))?.label || '') + ' ' + searchLine(c) + ' ' + fold(`${c.name} ${c.company || ''} ${c.firstName || ''} ${c.lastName || ''} ${p} ${digits.replace(/^0+/, '')} ${c.city || ''} ${c.province || ''} ${c.email || ''} ${(c.tags || []).join(' ')} ${c.address || ''} ${c.repName || ''} ${c.notes || ''}`);
        out.push({ key: c.id + '|' + p, customer: c, number: p, kind: k, main: i === 0, line });
      });
    }
    return out.sort((a, b) => a.customer.name.localeCompare(b.customer.name, 'fa') || Number(b.main) - Number(a.main));
  }, [customers]);

  const shown = useMemo(() => {
    const toks = fold(q).trim().split(/\s+/).filter(Boolean);
    return rows.filter((r) => (kind === 'all' || r.kind === kind) && (typeF === 'all' || contactTypeOf(r.customer) === typeF) && toks.every((t) => r.line.includes(t)));
  }, [rows, q, kind, typeF]);

  const counts = { all: rows.length, mobile: rows.filter((r) => r.kind === 'mobile').length, landline: rows.filter((r) => r.kind === 'landline').length, fax: rows.filter((r) => r.kind === 'fax').length };
  const copy = (n: string) => {
    void navigator.clipboard?.writeText(n).catch(() => undefined);
    setCopied(n);
    window.setTimeout(() => setCopied(''), 1500);
  };

  let lastLetter = '';
  return (
    <Modal
      wide
      onTop
      title="دفتر تلفن مشتریان"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={() => downloadCsv('دفتر-تلفن.csv', [['نام', 'شرکت', 'شماره', 'نوع', 'اصلی', 'شهر'], ...shown.map((r) => [r.customer.name, r.customer.company || '', r.number, KIND[r.kind].label, r.main ? 'بله' : '', r.customer.city || ''])])} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-200 cursor-pointer">
            <Download className="w-4 h-4" />
            خروجی اکسل ({toPersianDigits(shown.length)})
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">بستن</button>
        </>
      }
    >
      <div className="relative">
        <Search className="w-4 h-4 text-[#8C6F66] absolute right-3.5 top-1/2 -translate-y-1/2" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} className={`${field} pr-10`} placeholder="جستجو با نام، شرکت، بخشی از شماره، شهر، برچسب، نشانی…" />
      </div>
      <div className="flex flex-wrap items-center gap-1.5" data-contact-filter>
        <button type="button" onClick={() => setAdding('')} className="px-3 py-1.5 rounded-xl text-[11px] font-black border border-[#6E1B1B] bg-[#6E1B1B] text-white cursor-pointer" data-phonebook-add>+ افزودن به دفتر تلفن</button>
        {[{ id: 'all', label: 'همه', cls: '' }, ...CONTACT_TYPES].map((t) => (
          <button key={t.id} type="button" onClick={() => setTypeF(t.id)} className={`px-3 py-1.5 rounded-xl text-[11px] font-black border cursor-pointer ${typeF === t.id ? 'bg-[#3A241F] text-white border-[#3A241F]' : 'bg-white border-[#EBDBCE] text-[#3A241F]'}`}>{t.label} ({toPersianDigits(t.id === 'all' ? rows.length : rows.filter((r) => contactTypeOf(r.customer) === t.id).length)})</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'mobile', 'landline', 'fax'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`px-3 py-1.5 rounded-xl text-[11px] font-black border cursor-pointer ${kind === k ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>
            {k === 'all' ? 'همه' : KIND[k].label} ({toPersianDigits(counts[k])})
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="h-[52vh] flex flex-col items-center justify-center text-center text-xs font-bold text-gray-400 border border-dashed border-[#EBDBCE] rounded-2xl">
          <BookUser className="w-8 h-8 mx-auto mb-2 opacity-40" />
          شماره‌ای پیدا نشد.
        </div>
      ) : (
        <div className="border border-[#EBDBCE] rounded-2xl overflow-hidden divide-y divide-[#F3E8DF] h-[52vh] overflow-y-auto bg-white">
          {shown.slice(0, 600).map((r) => {
            const letter = (r.customer.name.trim()[0] || '').toUpperCase();
            const head = letter !== lastLetter ? ((lastLetter = letter), letter) : '';
            const K = KIND[r.kind];
            return (
              <React.Fragment key={r.key}>
                {head && <div className="px-4 py-1 bg-[#FAF5F1] text-[11px] font-black text-violet-700 sticky top-0">{head}</div>}
                <div className="px-3 py-2.5 flex items-center gap-2.5">
                  <button type="button" onClick={() => (r.customer.contactType ? undefined : onOpenCustomer(r.customer.id))} className="min-w-0 flex-1 text-right cursor-pointer">
                    <div className="text-xs font-black text-[#3A241F] truncate flex items-center gap-1">
                      {r.main && <Star className="w-3 h-3 fill-amber-400 text-amber-500 shrink-0" />}
                      {r.customer.name}
                    </div>
                    <div className="text-[10px] font-bold text-[#8C6F66] truncate">{[r.customer.company && r.customer.company !== r.customer.name ? r.customer.company : '', r.customer.city].filter(Boolean).join(' · ')}</div>
                  </button>
                  {r.customer.contactType ? (
                    <select value={contactTypeOf(r.customer)} onChange={(e) => setCustomers((prev) => prev.map((x) => (x.id === r.customer.id ? { ...x, contactType: e.target.value === 'CUSTOMER' ? undefined : (e.target.value as Customer['contactType']), updatedAt: new Date().toISOString() } : x)))} className={`shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-full border ${CONTACT_TYPES.find((t) => t.id === contactTypeOf(r.customer))?.cls || ''}`} data-contact-type-select>
                      {CONTACT_TYPES.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
                    </select>
                  ) : (
                    <span className="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full border text-violet-700 bg-violet-50 border-violet-200">مشتری</span>
                  )}
                  <span className={`shrink-0 flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border ${K.cls}`}><K.icon className="w-3 h-3" />{K.label}</span>
                  <span className="shrink-0 text-xs font-black text-[#3A241F]" dir="ltr">{toPersianDigits(r.number)}</span>
                  <button type="button" onClick={() => copy(r.number)} title="کپی شماره" className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-[#8C6F66] hover:bg-[#FAF5F1] cursor-pointer">
                    {copied === r.number ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                  {canCall && r.kind !== 'fax' && (
                    <button type="button" onClick={() => onCall(r.number, r.customer.name)} title="تماس با یک کلیک" className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50 cursor-pointer">
                      <PhoneCall className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
      {shown.length > 600 && <div className="text-[11px] font-bold text-[#8C6F66] text-center">۶۰۰ مورد اول نشان داده شد؛ جستجو را دقیق‌تر کنید یا خروجی اکسل بگیرید.</div>}
      {adding !== null && <QuickCustomerDialog withType initialPhone={adding} onClose={() => { setAdding(null); onNewDone?.(); }} onCreated={() => { setAdding(null); onNewDone?.(); }} />}
    </Modal>
  );
};
