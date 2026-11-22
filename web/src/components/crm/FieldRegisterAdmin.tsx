import React, { useCallback, useEffect, useState } from 'react';
import { Copy, ExternalLink, Globe, KeyRound, MessageSquare, ShieldCheck, Smartphone, Trash2, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { User } from '../../types';
import { toPersianDigits } from '../../lib/jalali';
import { askConfirm } from '../../lib/confirmDialog';

type S = Awaited<ReturnType<typeof api.fieldSettings>>;

const card = 'bg-white border border-[#EBDBCE] rounded-3xl p-5 space-y-3';

/** «صفحه ورود مشتریان»: the link of the marketer's page, its switches, and the keys for the company's web-site form. */
export const FieldRegisterAdmin: React.FC<{ staff: User[]; isAdmin: boolean; showToast: (m: string) => void }> = ({ staff, isAdmin, showToast }) => {
  const [s, setS] = useState<S | null>(null);
  const [who, setWho] = useState('');
  const origin = window.location.origin;
  const [slug, setSlug] = useState('');
  const [q, setQ] = useState('');
  const link = `${origin}/${slug || 'field'}`;

  const load = useCallback(() => { api.fieldSettings().then(setS).catch(() => setS(null)); }, []);
  useEffect(load, [load]);
  useEffect(() => { if (s) setSlug(s.slug); }, [s?.slug]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveUsers = (allowedUsers: string[], onlyUsers: string[]) => api.fieldSaveSettings({ allowedUsers, onlyUsers }).then(() => load()).catch((e) => showToast(e instanceof Error ? e.message : 'ذخیره نشد.'));

  const copy = async (text: string, msg = 'کپی شد.') => {
    try { await navigator.clipboard.writeText(text); showToast(msg); } catch { showToast('کپی نشد؛ متن را خودتان انتخاب کنید.'); }
  };
  const embed = (key: string) => `<iframe src="${origin}/lead?k=${key}" style="width:100%;max-width:440px;height:640px;border:0" loading="lazy" title="فرم تماس"></iframe>`;
  const marketers = staff.filter((u) => u.isActive !== false && (u.role === 'SUPER_ADMIN' || u.canUseCrm));

  if (!s) return <div className="text-xs font-bold text-[#8C6F66] p-4">در حال خواندن…</div>;

  return (
    <div className="space-y-4 max-w-4xl" data-field-admin>
      <section className={card}>
        <h3 className="font-black text-sm flex items-center gap-2"><Smartphone className="w-4 h-4 text-[#6E1B1B]" />صفحهٔ ثبت سریع مشتری برای بازاریاب میدانی</h3>
        <p className="text-[12px] font-bold text-[#8C6F66] leading-7">این صفحه روی اینترنت باز می‌شود و مخصوص گوشی است (نمایشگاه و بازاریابی بیرون از شرکت). بازاریاب با نام کاربری و رمز خودش وارد می‌شود، نام و موبایل مشتری را می‌نویسد و مشتری همان لحظه با نام خودِ او در سامانه می‌نشیند. همهٔ قواعد مشتری اعمال می‌شود: موبایل لازم است، شمارهٔ تکراری با نام صاحبش رد می‌شود، به سپیدار می‌رود و پیامک خوش‌آمد (اگر روشن باشد) فرستاده می‌شود.</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="px-3 py-2 rounded-xl bg-[#FAF5F1] border border-[#EBDBCE] text-[12px] font-bold" dir="ltr">{link}</code>
          <button type="button" onClick={() => void copy(link, 'آدرس کپی شد.')} className="px-3 py-2 rounded-xl border border-[#EBDBCE] text-xs font-black flex items-center gap-1.5 cursor-pointer"><Copy className="w-3.5 h-3.5" />کپی</button>
          <a href={link} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl border border-[#EBDBCE] text-xs font-black flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" />باز کردن</a>
        </div>
        {s.isAdmin && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[11px] font-black text-[#8C6F66]">
              آدرس صفحه (انگلیسی، ۳ تا ۳۰ نویسه)
              <div className="mt-1 flex items-center gap-1 px-3 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold" dir="ltr"><span className="text-[#8C6F66]">{origin}/</span><input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="bg-transparent outline-hidden w-40" maxLength={30} data-field-slug /></div>
            </label>
            <button type="button" disabled={!slug || slug === s.slug} onClick={() => { api.fieldSaveSettings({ slug }).then(() => { showToast('آدرس صفحه عوض شد؛ لینک قبلی دیگر کار نمی‌کند.'); load(); }).catch((e) => showToast(e instanceof Error ? e.message : 'ذخیره نشد.')); }} className="px-4 py-2.5 rounded-xl bg-[#6E1B1B] text-white text-xs font-black cursor-pointer disabled:opacity-50">ذخیرهٔ آدرس</button>
          </div>
        )}
        <p className="text-[11px] font-bold text-[#8C6F66]">برای نمایش در گوشی: لینک را در مرورگر باز کنید و «افزودن به صفحهٔ اصلی» بزنید. اینکه چه فیلدهایی باشند را از «تنظیمات سیستم ← فرم‌ها ← ثبت سریع مشتری» تعیین کنید.</p>
      </section>

      {s.isAdmin && (
        <section className={card} data-field-people>
          <h3 className="font-black text-sm flex items-center gap-2"><Users className="w-4 h-4 text-[#6E1B1B]" />چه کسانی می‌توانند وارد این صفحه شوند؟</h3>
          <p className="text-[12px] font-bold text-[#8C6F66] leading-7">اگر هیچ‌کس را تیک نزنید، همهٔ کارمندانی که به بخش مشتریان دسترسی دارند می‌توانند. اگر چند نفر را تیک «مجاز» بزنید، فقط همان‌ها (و مدیران ارشد) وارد می‌شوند. «فقط این صفحه» یعنی آن حساب (مثلاً بازاریاب نمایشگاه) به هیچ جای دیگر سامانه راه ندارد و فقط از همین صفحه می‌تواند وارد شود و مشتری ثبت کند.</p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی نام…" className="w-full sm:w-72 p-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold" />
          <div className="max-h-[320px] overflow-auto rounded-2xl border border-[#EBDBCE] divide-y divide-[#F3E8DF]">
            {marketers.filter((u) => !q.trim() || u.fullName.includes(q.trim())).map((u) => {
              const ok = s.allowedUsers.includes(u.id) || s.onlyUsers.includes(u.id);
              const only = s.onlyUsers.includes(u.id);
              return (
                <div key={u.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-[#3A241F]">
                  <span className="min-w-0 truncate">{u.fullName}<span className="text-[10px] text-[#8C6F66]"> · {u.departmentName}</span></span>
                  <span className="flex items-center gap-4 shrink-0">
                    <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" className="accent-[#6E1B1B]" checked={ok} disabled={u.role === 'SUPER_ADMIN'} onChange={(e) => { const a = s.allowedUsers.filter((x) => x !== u.id); const o = s.onlyUsers.filter((x) => x !== u.id); void saveUsers(e.target.checked ? [...a, u.id] : a, o); }} />مجاز</label>
                    <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" className="accent-rose-700" checked={only} disabled={u.role === 'SUPER_ADMIN'} onChange={(e) => { const a = s.allowedUsers.filter((x) => x !== u.id); const o = s.onlyUsers.filter((x) => x !== u.id); void saveUsers(a, e.target.checked ? [...o, u.id] : o); }} />فقط این صفحه</label>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className={card}>
        <h3 className="font-black text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#6E1B1B]" />امنیت و پیامک</h3>
        <label className={`flex items-start gap-2 text-[12px] font-black text-[#3A241F] ${s.isAdmin ? 'cursor-pointer' : 'opacity-70'}`}>
          <input type="checkbox" className="mt-1 accent-[#6E1B1B]" disabled={!s.isAdmin} checked={s.require2fa} onChange={(e) => { api.fieldSaveSettings({ require2fa: e.target.checked }).then(() => { showToast(e.target.checked ? 'احراز هویت دو مرحله‌ای برای این صفحه الزامی شد.' : 'الزام برداشته شد.'); load(); }).catch((er) => showToast(er instanceof Error ? er.message : 'ذخیره نشد.')); }} />
          <span>احراز هویت دو مرحله‌ای (کد برنامهٔ Google Authenticator) برای ورود به این صفحه الزامی باشد
            <span className="block text-[11px] font-bold text-[#8C6F66] mt-0.5">هر بازاریاب باید آن را یک بار در «حساب من» روشن کرده باشد. اگر روشن باشد و او روشن نکرده باشد، به او گفته می‌شود و ثبت انجام نمی‌شود. اگر الزامی نباشد، کسی که آن را روشن کرده باشد هنگام ورود، کد را هم می‌نویسد.</span>
          </span>
        </label>
        <div className={`flex items-start gap-2 text-[12px] font-bold rounded-2xl px-3 py-2 border ${s.smsWelcome ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          <MessageSquare className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{s.smsWelcome ? 'پیامک خوش‌آمد به مشتری تازه روشن است؛ هر مشتری ثبت‌شده، پیامک می‌گیرد.' : s.smsEnabled ? 'پیامک خوش‌آمد به مشتری تازه خاموش است. برای فرستادن پیامک به مشتریِ ثبت‌شده، در «پیامک» پیام خودکار «خوش‌آمدگویی به مشتری تازه» را روشن کنید.' : 'پیامک هنوز تنظیم یا روشن نشده است؛ بعد از تنظیم پیامک، «خوش‌آمدگویی به مشتری تازه» را روشن کنید تا مشتری بعد از ثبت پیامک بگیرد.'}</span>
        </div>
      </section>

      <section className={card}>
        <h3 className="font-black text-sm flex items-center gap-2"><Globe className="w-4 h-4 text-[#6E1B1B]" />فرم برای سایت شما</h3>
        <p className="text-[12px] font-bold text-[#8C6F66] leading-7">این فرم را در سایت بگذارید (کد را در صفحهٔ سایت بچسبانید). هر کس فرم را پر کند، مشتری <b>همان بازاریابی</b> می‌شود که کلید را برایش ساخته‌اید (بازاریابی که سایت را مدیریت می‌کند) و منبع آشنایی «سایت» نوشته می‌شود. هر کلید یک رمز است؛ اگر لو رفت حذفش کنید و تازه بسازید. فیلدهای فرم همان‌هایی‌اند که در «فرم‌ها» تنظیم کرده‌اید.</p>
        <div className="flex flex-wrap items-end gap-2">
          {isAdmin && (
            <label className="text-[11px] font-black text-[#8C6F66]">
              برای کدام بازاریاب؟
              <select value={who} onChange={(e) => setWho(e.target.value)} className="block mt-1 p-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F]">
                <option value="">خودم</option>
                {marketers.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </label>
          )}
          <button type="button" disabled={!s.allowed} onClick={() => { api.fieldNewKey(who || undefined).then(() => { showToast('کلید ساخته شد.'); load(); }).catch((e) => showToast(e instanceof Error ? e.message : 'ساخته نشد.')); }} className="px-4 py-2.5 rounded-xl bg-[#6E1B1B] text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"><KeyRound className="w-3.5 h-3.5" />ساخت کلید تازه</button>
        </div>
        {s.keys.length === 0 ? (
          <p className="text-[11px] font-bold text-[#8C6F66]">هنوز کلیدی نساخته‌اید.</p>
        ) : (
          <div className="space-y-2">
            {s.keys.map((k) => (
              <div key={k.key} className="border border-[#EBDBCE] rounded-2xl p-3 space-y-2 bg-[#FAF5F1]/60">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-black text-[#3A241F]">
                  <span>مشتری‌ها به نام «{k.userName || '—'}» ثبت می‌شوند · {toPersianDigits(new Date(k.createdAt).toLocaleDateString('fa-IR'))}</span>
                  <button type="button" onClick={async () => { if (!(await askConfirm('این کلید حذف شود؟ فرمی که در سایت گذاشته‌اید دیگر کار نمی‌کند.', { title: 'حذف کلید فرم سایت؟', confirmText: 'بله، حذف شود' }))) return; api.fieldDeleteKey(k.key).then(() => { showToast('کلید حذف شد.'); load(); }).catch(() => showToast('حذف نشد.')); }} className="px-2.5 py-1 rounded-lg text-rose-700 bg-rose-50 border border-rose-200 text-[11px] font-black flex items-center gap-1 cursor-pointer"><Trash2 className="w-3 h-3" />حذف</button>
                </div>
                <textarea readOnly rows={2} dir="ltr" value={embed(k.key)} onFocus={(e) => e.currentTarget.select()} className="w-full p-2 bg-white border border-[#EBDBCE] rounded-xl text-[11px] font-mono" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void copy(embed(k.key), 'کد فرم کپی شد.')} className="px-3 py-1.5 rounded-lg border border-[#EBDBCE] text-[11px] font-black flex items-center gap-1 cursor-pointer"><Copy className="w-3 h-3" />کپی کد فرم</button>
                  <a href={`${origin}/lead?k=${k.key}`} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg border border-[#EBDBCE] text-[11px] font-black flex items-center gap-1"><ExternalLink className="w-3 h-3" />دیدن فرم</a>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
