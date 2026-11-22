import React, { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { FullRegForm, SelfField } from '../components/crm/FullRegForm';
import { PaperShell } from '../components/common/PaperShell';

// The company's own registration page (/register?k=KEY): the full details of the company, typed by the company itself. It becomes a customer of the
// marketer who owns the key.

interface Info { company: string; hidden: string[]; required: string[]; fields: SelfField[] }

export const RegisterPage: React.FC = () => {
  const key = new URLSearchParams(window.location.search).get('k') || '';
  const [info, setInfo] = useState<Info | null>(null);
  const [bad, setBad] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => { document.title = 'ثبت مشخصات شرکت'; }, []);
  useEffect(() => {
    fetch(`/api/public/lead/${encodeURIComponent(key)}?form=full`, { cache: 'no-store' })
      .then(async (r) => { if (!r.ok) throw new Error(); setInfo(await r.json()); })
      .catch(() => setBad(true));
  }, [key]);

  const submit = async (fields: Record<string, string>, trap: string) => {
    try {
      const r = await fetch(`/api/public/lead/${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ form: 'full', fields, trap }) });
      if (r.ok) { setSent(true); window.scrollTo({ top: 0 }); return null; }
      return (await r.json().catch(() => ({}))).error || 'ارسال نشد.';
    } catch {
      return 'ارتباط با اینترنت برقرار نیست؛ دوباره امتحان کنید.';
    }
  };

  if (bad) return <PaperShell title="این فرم فعال نیست"><div className="h-6" /></PaperShell>;
  if (!info) return <PaperShell title="ثبت مشخصات شرکت"><div className="h-24" /></PaperShell>;
  return (
    <PaperShell title="ثبت مشخصات شرکت" brand={info.company} subtitle={sent ? undefined : 'لطفاً مشخصات شرکت خود را کامل بنویسید. خانه‌های دارای ستاره (*) لازم است.'} wide>
      {sent ? (
        <div className="text-center space-y-3 py-6">
          <CheckCircle2 className="w-12 h-12 mx-auto text-[#3e574b]" />
          <p className="text-[17px] font-black text-[#1f2a24]">مشخصات شرکت شما ثبت شد</p>
          <p className="text-[13px] font-bold text-[#55645c] leading-7">همکاران {info.company} به‌زودی با شما تماس می‌گیرند. سپاس از وقتی که گذاشتید.</p>
        </div>
      ) : (
        <FullRegForm spec={info.fields} cfg={{ hidden: info.hidden, required: info.required }} onSubmit={submit} />
      )}
    </PaperShell>
  );
};
