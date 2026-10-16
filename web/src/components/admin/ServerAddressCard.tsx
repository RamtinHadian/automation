import React, { useEffect, useState } from 'react';
import { Check, Copy, RefreshCw, Server } from 'lucide-react';
import { api } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';

interface Addr { interface: string; ip: string; kind: 'private' | 'public' | 'link-local'; ipv6: boolean }
interface Svc { name: string; host: string; port: string; note: string }
interface Info {
  hostname: string;
  port: string;
  mainIP: string;
  docker: boolean;
  addresses: Addr[];
  services: Svc[];
  request: { host: string; proto: string; forwarded: string; remote: string };
}

const KIND: Record<Addr['kind'], { label: string; cls: string }> = {
  private: { label: 'شبکهٔ داخلی (فقط داخل ساختمان یا شبکه)', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  public: { label: 'آی‌پی عمومی (از اینترنت دیده می‌شود)', cls: 'bg-sky-100 text-sky-800 border-sky-200' },
  'link-local': { label: 'محلیِ خودکار (کاربردی ندارد)', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

/** A value that is always Latin (address, port): its own box, left-to-right, with a copy button. */
const Copyable: React.FC<{ value: string }> = ({ value }) => {
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(value).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    }).catch(() => undefined);
  };
  return (
    <button type="button" onClick={copy} dir="ltr" title="کپی" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FAF5F1] border border-[#EBDBCE] font-mono text-xs font-bold text-[#3A241F] hover:bg-amber-50 cursor-pointer text-left">
      <span className="break-all">{value}</span>
      {done ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3 text-[#B8A39C]" />}
    </button>
  );
};

/** Where is this server? Its addresses, the port, how this page was reached, and the other services it talks to. */
export const ServerAddressCard: React.FC = () => {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  const load = () => api.serverInfo().then((r: Info) => { setInfo(r); setError(''); }).catch((e: unknown) => setError(String((e as Error)?.message || e)));
  useEffect(() => { load(); }, []);

  const ipv4 = info?.addresses.filter((a) => !a.ipv6) || [];
  const ipv6 = info?.addresses.filter((a) => a.ipv6 && a.kind !== 'link-local') || [];
  const here = typeof window !== 'undefined' ? window.location : null;

  return (
    <div className="bg-white border border-[#EBDBCE] rounded-3xl p-4 sm:p-6 space-y-5" data-server-address>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-[#F6D9CD] text-[#6E1B1B] flex items-center justify-center"><Server className="w-5 h-5" /></div>
          <div>
            <h3 className="text-sm font-black text-[#3A241F]">آدرس و پورت سرور</h3>
            <p className="text-[11px] text-[#8C6F66]">سرور کجاست و با چه آدرسی باز می‌شود؛ روی هر آدرس بزنید تا کپی شود.</p>
          </div>
        </div>
        <button type="button" onClick={load} className="px-3 py-2 rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] text-xs font-black text-[#6E1B1B] flex items-center gap-1.5 cursor-pointer" aria-label="تازه‌سازی">
          <RefreshCw className="w-3.5 h-3.5" /> تازه‌سازی
        </button>
      </div>

      {error && <div className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</div>}
      {!info && !error && <div className="text-xs text-[#8C6F66]">در حال خواندن…</div>}

      {info && (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[#EBDBCE] p-3 space-y-2">
              <div className="text-[11px] font-black text-[#6E1B1B]">روی همین دستگاه (لوکال)</div>
              <div className="flex flex-wrap gap-2">
                <Copyable value={`http://localhost:${info.port}`} />
                <Copyable value={`http://127.0.0.1:${info.port}`} />
              </div>
              <p className="text-[10px] text-[#8C6F66] leading-5">فقط روی خود سرور کار می‌کند؛ از رایانهٔ دیگر باز نمی‌شود.</p>
            </div>
            <div className="rounded-2xl border border-[#EBDBCE] p-3 space-y-2">
              <div className="text-[11px] font-black text-[#6E1B1B]">از رایانهٔ دیگرِ همین شبکه</div>
              <div className="flex flex-wrap gap-2">
                {info.mainIP ? <Copyable value={`http://${info.mainIP}:${info.port}`} /> : <span className="text-xs text-[#8C6F66]">آی‌پی اصلی پیدا نشد</span>}
              </div>
              <p className="text-[10px] text-[#8C6F66] leading-5">
                {info.docker
                  ? 'برنامه داخل داکر اجرا می‌شود و این آی‌پی مالِ داخل داکر است. آی‌پی و پورتِ داخل داکر فقط برای خود داکر است؛ برای رایانه‌های دیگر آی‌پی دستگاه میزبان و پورتِ بیرونی را بزنید. همان را در کادر «این صفحه با چه آدرسی باز شده» می‌بینید.'
                  : 'با آی‌پی شبکهٔ داخلی سرور و پورت.'}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
            <div className="text-[11px] font-black text-amber-900">این صفحه با چه آدرسی باز شده؟</div>
            <div className="flex flex-wrap gap-2 items-center">
              <Copyable value={`${info.request.proto}://${info.request.host}`} />
              {here && here.host !== info.request.host && <Copyable value={here.origin} />}
            </div>
            <div className="text-[10px] text-[#8C6F66] leading-5 space-y-1">
              <div className="flex flex-wrap items-center gap-2"><span>آی‌پی که سرور از شما دید:</span><Copyable value={info.request.remote} /></div>
              {info.request.forwarded && <div className="flex flex-wrap items-center gap-2"><span>از طریق پروکسی (آی‌پی اصلی شما):</span><Copyable value={info.request.forwarded} /></div>}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-black text-[#3A241F]">همهٔ آی‌پی‌های سرور</div>
            <div className="rounded-2xl border border-[#EBDBCE] divide-y divide-[#EBDBCE] overflow-hidden">
              {[...ipv4, ...ipv6].length === 0 && <div className="p-3 text-xs text-[#8C6F66]">آدرسی پیدا نشد.</div>}
              {[...ipv4, ...ipv6].map((a, i) => (
                <div key={i} className="p-2.5 flex flex-wrap items-center gap-2 text-xs">
                  <Copyable value={a.ip} />
                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-black ${KIND[a.kind].cls}`}>{KIND[a.kind].label}</span>
                  <span className="text-[10px] text-[#8C6F66]">کارت شبکه:</span>
                  <span dir="ltr" className="font-mono text-[10px] text-[#5A4640]">{a.interface}</span>
                  {a.ipv6 && <span className="text-[10px] text-[#8C6F66]">نسخهٔ ۶</span>}
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[#8C6F66]">نام دستگاه: <span dir="ltr" className="font-mono">{info.hostname}</span></p>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-black text-[#3A241F]">پورت‌ها و سرویس‌ها</div>
            <div className="rounded-2xl border border-[#EBDBCE] divide-y divide-[#EBDBCE] overflow-hidden">
              {info.services.map((s, i) => (
                <div key={i} className="p-2.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-black text-[#3A241F]">{s.name}</span>
                  <Copyable value={`${s.host}:${s.port}`} />
                  <span className="text-[10px] text-[#8C6F66]">پورت {toPersianDigits(s.port)}؛ {s.note}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
