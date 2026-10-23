import React from 'react';
import { Check } from 'lucide-react';
import { forgetLoginImages } from '../../lib/loginStyle';

type Design = 'glass' | 'simple' | 'elegant' | 'dark';

const DESIGNS: { id: Design; name: string; note: string }[] = [
  { id: 'glass', name: 'شیشه‌ای با تصویر', note: 'تصویر تمام‌صفحه و کارت شیشه‌ای (طرح فعلی)' },
  { id: 'simple', name: 'ساده و شیک', note: 'صفحهٔ روشن، کارت سفید و دکمهٔ آجری؛ بدون تصویر' },
  { id: 'elegant', name: 'کرمی با قاب طلایی', note: 'زمینهٔ کرمی نرم و کارت با خط باریک طلایی' },
  { id: 'dark', name: 'تیره', note: 'زمینهٔ تیرهٔ سازمانی با کارت شیشه‌ای' },
];

/** A tiny picture of each design (what the page looks like), drawn with plain boxes. */
const Mini: React.FC<{ id: Design }> = ({ id }) => {
  const bg =
    id === 'glass' ? 'linear-gradient(135deg,#6ba5c8,#e9f4ee 60%,#5b8a4e)' : id === 'simple' ? 'linear-gradient(180deg,#fff,#F4EEE9)' : id === 'elegant' ? 'linear-gradient(180deg,#FFF8EE,#EFDFCB)' : 'linear-gradient(180deg,#4A2620,#1F100D)';
  const card = id === 'glass' ? 'rgba(255,255,255,.35)' : id === 'dark' ? 'rgba(255,255,255,.14)' : '#fff';
  const line = id === 'elegant' ? '#C9A24B' : id === 'glass' || id === 'dark' ? 'rgba(255,255,255,.7)' : '#EBDBCE';
  const ink = id === 'glass' || id === 'dark' ? 'rgba(255,255,255,.85)' : '#3A241F';
  const fieldBg = id === 'glass' || id === 'dark' ? 'rgba(255,255,255,.22)' : '#FAF5F1';
  const btn = id === 'glass' || id === 'dark' ? 'rgba(255,255,255,.45)' : '#6E1B1B';
  return (
    <div className="h-28 rounded-xl flex items-center justify-center" style={{ background: bg }} aria-hidden>
      <div className="w-24 rounded-lg p-2 space-y-1.5" style={{ background: card, border: `1px solid ${line}` }}>
        <div className="h-1.5 w-10 mx-auto rounded" style={{ background: ink }} />
        <div className="h-3 rounded" style={{ background: fieldBg, border: `1px solid ${line}` }} />
        <div className="h-3 rounded" style={{ background: fieldBg, border: `1px solid ${line}` }} />
        <div className="h-3.5 rounded" style={{ background: btn }} />
      </div>
    </div>
  );
};

/** The design of the sign-in pages (user sign-in and the administrators' console sign-in). Saved at once. */
export const LoginDesignCard: React.FC<{ value?: Design; onChange: (d: Design) => void }> = ({ value = 'glass', onChange }) => (
  <div className="bg-white p-6 rounded-3xl border border-[#EBDBCE] shadow-sm space-y-4" data-login-design-card>
    <div>
      <h3 className="font-black text-[#3A241F] text-sm">طرح صفحهٔ ورود</h3>
      <p className="text-[11px] text-[#8C6F66] mt-1 leading-6">طرح صفحه‌هایی را که کاربران و مدیران با آن وارد می‌شوند انتخاب کنید. در طرح «شیشه‌ای» تصویرهای زیر پس‌زمینه‌اند؛ طرح‌های دیگر تصویر ندارند.</p>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {DESIGNS.map((d) => {
        const on = value === d.id;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => {
              forgetLoginImages();
              onChange(d.id);
            }}
            className={`text-right rounded-2xl border p-2 cursor-pointer transition-colors ${on ? 'border-[#6E1B1B] ring-2 ring-[#6E1B1B]/15 bg-[#FDFAF7]' : 'border-[#EBDBCE] hover:border-[#C98B6A]'}`}
            data-login-design-option={d.id}
          >
            <Mini id={d.id} />
            <div className="flex items-center justify-between gap-2 mt-2 px-1">
              <span className="text-xs font-black text-[#3A241F]">{d.name}</span>
              {on && <Check className="w-4 h-4 text-[#6E1B1B]" />}
            </div>
            <div className="text-[10px] text-[#8C6F66] px-1 pb-1 leading-5">{d.note}</div>
          </button>
        );
      })}
    </div>
  </div>
);
