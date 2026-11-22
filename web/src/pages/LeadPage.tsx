import React, { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { FieldForm, FieldValues } from '../components/crm/FieldForm';

// The short form for the company's web site (/lead?k=KEY, shown in an iframe). Whoever fills it becomes a customer of the marketer who owns the key.

interface Info { company: string; hidden: string[]; required: string[] }

export const LeadPage: React.FC = () => {
  const key = new URLSearchParams(window.location.search).get('k') || '';
  const [info, setInfo] = useState<Info | null>(null);
  const [bad, setBad] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch(`/api/public/lead/${encodeURIComponent(key)}`, { cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error(); setInfo(await r.json()); })
      .catch(() => setBad(true));
  }, [key]);

  const submit = async (v: FieldValues) => {
    try {
      const r = await fetch(`/api/public/lead/${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) });
      if (r.ok) { setSent(true); return null; }
      return (await r.json().catch(() => ({}))).error || 'ارسال نشد.';
    } catch {
      return 'ارتباط با اینترنت برقرار نیست؛ دوباره امتحان کنید.';
    }
  };

  if (bad) return <div dir="rtl" className="min-h-[100dvh] flex items-center justify-center p-6 text-[14px] font-black text-[#8C6F66]">این فرم فعال نیست.</div>;
  if (!info) return <div className="min-h-[100dvh]" />;
  return (
    <div dir="rtl" className="min-h-[100dvh] bg-transparent px-4 py-4 flex justify-center">
      <div className="w-full max-w-md">
        {sent ? (
          <div className="rounded-3xl bg-emerald-50 border border-emerald-200 p-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600" />
            <p className="text-[17px] font-black text-emerald-900">اطلاعات شما ثبت شد</p>
            <p className="text-[14px] font-bold text-emerald-800">همکاران {info.company} به‌زودی با شما تماس می‌گیرند.</p>
          </div>
        ) : (
          <div className="rounded-3xl bg-white border border-[#EBDBCE] p-5 space-y-3">
            {info.company && <h1 className="text-[17px] font-black text-[#3A241F]">درخواست تماس از {info.company}</h1>}
            <FieldForm cfg={{ hidden: [...(info.hidden || []), 'نمایشگاه / محل ثبت'], required: info.required }} onSubmit={submit} trap submitText="ارسال اطلاعات" keepEvent={false} />
          </div>
        )}
      </div>
    </div>
  );
};
