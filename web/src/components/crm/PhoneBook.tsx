import React, { useMemo, useState } from 'react';
import { BookUser, Copy, Download, PhoneCall, Printer, Search, Smartphone, Phone, Star } from 'lucide-react';
import { Customer } from '../../types';
import { fold } from '../../lib/customerSearch';
import { downloadCsv } from '../../lib/csv';
import { toPersianDigits } from '../../lib/jalali';
import { isMobileNumber } from '../../lib/customerImport';
import { Modal, field } from './crmUi';

type Row = { key: string; customer: Customer; number: string; kind: 'mobile' | 'landline' | 'fax'; main: boolean; line: string };

const KIND: Record<Row['kind'], { label: string; icon: React.ElementType; cls: string }> = {
  mobile: { label: 'موبایل', icon: Smartphone, cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  landline: { label: 'ثابت', icon: Phone, cls: 'text-sky-700 bg-sky-50 border-sky-200' },
  fax: { label: 'فکس', icon: Printer, cls: 'text-violet-700 bg-violet-50 border-violet-200' },
};

/** The phone book: every number of every customer on one searchable list. */
export const PhoneBook: React.FC<{ customers: Customer[]; canCall: boolean; onCall: (number: string, name: string) => void; onOpenCustomer: (id: string) => void; onClose: () => void }> = ({ customers, canCall, onCall, onOpenCustomer, onClose }) => {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | Row['kind']>('all');
  const [copied, setCopied] = useState('');

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const c of customers) {
      (c.phones || []).forEach((p, i) => {
        const k: Row['kind'] = c.faxNumber === p ? 'fax' : isMobileNumber(p) ? 'mobile' : 'landline';
        const digits = p.replace(/\D/g, '');
        const line = fold(`${c.name} ${c.company || ''} ${c.firstName || ''} ${c.lastName || ''} ${p} ${digits.replace(/^0+/, '')} ${c.city || ''} ${c.province || ''} ${c.email || ''} ${(c.tags || []).join(' ')} ${c.address || ''} ${c.repName || ''} ${c.notes || ''}`);
        out.push({ key: c.id + '|' + p, customer: c, number: p, kind: k, main: i === 0, line });
      });
    }
    return out.sort((a, b) => a.customer.name.localeCompare(b.customer.name, 'fa') || Number(b.main) - Number(a.main));
  }, [customers]);

  const shown = useMemo(() => {
    const toks = fold(q).trim().split(/\s+/).filter(Boolean);
    return rows.filter((r) => (kind === 'all' || r.kind === kind) && toks.every((t) => r.line.includes(t)));
  }, [rows, q, kind]);

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
      <div className="flex flex-wrap gap-1.5">
        {(['all', 'mobile', 'landline', 'fax'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`px-3 py-1.5 rounded-xl text-[11px] font-black border cursor-pointer ${kind === k ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-[#3A241F] border-[#EBDBCE]'}`}>
            {k === 'all' ? 'همه' : KIND[k].label} ({toPersianDigits(counts[k])})
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="text-center text-xs font-bold text-gray-400 py-12 border border-dashed border-[#EBDBCE] rounded-2xl">
          <BookUser className="w-8 h-8 mx-auto mb-2 opacity-40" />
          شماره‌ای پیدا نشد.
        </div>
      ) : (
        <div className="border border-[#EBDBCE] rounded-2xl overflow-hidden divide-y divide-[#F3E8DF] max-h-[52vh] overflow-y-auto bg-white">
          {shown.slice(0, 600).map((r) => {
            const letter = (r.customer.name.trim()[0] || '').toUpperCase();
            const head = letter !== lastLetter ? ((lastLetter = letter), letter) : '';
            const K = KIND[r.kind];
            return (
              <React.Fragment key={r.key}>
                {head && <div className="px-4 py-1 bg-[#FAF5F1] text-[11px] font-black text-violet-700 sticky top-0">{head}</div>}
                <div className="px-3 py-2.5 flex items-center gap-2.5">
                  <button type="button" onClick={() => onOpenCustomer(r.customer.id)} className="min-w-0 flex-1 text-right cursor-pointer">
                    <div className="text-xs font-black text-[#3A241F] truncate flex items-center gap-1">
                      {r.main && <Star className="w-3 h-3 fill-amber-400 text-amber-500 shrink-0" />}
                      {r.customer.name}
                    </div>
                    <div className="text-[10px] font-bold text-[#8C6F66] truncate">{[r.customer.company && r.customer.company !== r.customer.name ? r.customer.company : '', r.customer.city].filter(Boolean).join(' · ')}</div>
                  </button>
                  <span className={`shrink-0 flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border ${K.cls}`}><K.icon className="w-3 h-3" />{K.label}</span>
                  <span className="shrink-0 text-xs font-black text-[#3A241F]" dir="ltr">{toPersianDigits(r.number)}</span>
                  <button type="button" onClick={() => copy(r.number)} title="کپی شماره" className="shrink-0 p-1.5 rounded-lg text-[#8C6F66] hover:bg-[#FAF5F1] cursor-pointer">
                    {copied === r.number ? <span className="text-[10px] font-black text-emerald-700">کپی شد</span> : <Copy className="w-4 h-4" />}
                  </button>
                  {canCall && r.kind !== 'fax' && (
                    <button type="button" onClick={() => onCall(r.number, r.customer.name)} title="تماس با یک کلیک" className="shrink-0 p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-50 cursor-pointer">
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
    </Modal>
  );
};
