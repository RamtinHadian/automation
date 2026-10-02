import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Play, RotateCcw, Save, Send, Trash2, Upload, VolumeX } from 'lucide-react';
import { api, UploadedSound } from '../../lib/api';
import { useAppContext } from '../../context/AppContext';
import { toPersianDigits } from '../../lib/jalali';
import { DEFAULT_KIND_SOUND, DEFAULT_NOTIFY, EVENTS, KINDS, KIND_LABEL, resolveRule } from '../../lib/notifyConfig';
import { playSound, preloadSounds } from '../../lib/notifications';
import { forgetCustomSound, NO_SOUND, SOUND_PRESETS } from '../../lib/sounds';
import { NotifyRule, NotifySettings, SystemSettings } from '../../types';

const box = 'w-full p-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none';
const card = 'bg-white p-5 sm:p-6 rounded-3xl border border-[#EBDBCE] shadow-sm space-y-4 text-xs';

type Kind = keyof typeof KIND_LABEL;

/** Everything about how notifications look and sound for the whole organisation. */
export const NotificationSettingsCard: React.FC<{ settings: SystemSettings; onSave: (n: NotifySettings) => void }> = ({ settings, onSave }) => {
  const { showToast } = useAppContext();
  const [cfg, setCfg] = useState<NotifySettings>(settings.notifySettings || {});
  const [dirty, setDirty] = useState(false);
  const [sounds, setSounds] = useState<UploadedSound[]>([]);
  const [uploadName, setUploadName] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadSounds = useCallback(() => api.sounds().then((r) => { setSounds(r.sounds); preloadSounds(r.sounds.map((s) => 'custom:' + s.id)); }).catch(() => {}), []);
  useEffect(() => {
    void loadSounds();
  }, [loadSounds]);
  useEffect(() => {
    if (!dirty) setCfg(settings.notifySettings || {});
  }, [settings.notifySettings, dirty]);

  const volume = cfg.volume ?? DEFAULT_NOTIFY.volume;
  const patch = (u: Partial<NotifySettings>) => {
    setCfg((p) => ({ ...p, ...u }));
    setDirty(true);
  };
  const setKind = (k: Kind, u: NotifyRule) => patch({ kinds: { ...cfg.kinds, [k]: { ...cfg.kinds?.[k], ...u } } });
  const setEvent = (label: string, u: NotifyRule) => patch({ events: { ...cfg.events, [label]: { ...cfg.events?.[label], ...u } } });
  const clearEvent = (label: string) => {
    const e = { ...cfg.events };
    delete e[label];
    patch({ events: e });
  };

  const soundOptions = (withInherit: boolean) => (
    <>
      {withInherit && <option value="inherit">مثل نوع ناتیف</option>}
      <optgroup label="صداهای آماده">
        {SOUND_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </optgroup>
      {sounds.length > 0 && (
        <optgroup label="صداهای آپلودشدهٔ شما">
          {sounds.map((s) => (
            <option key={s.id} value={'custom:' + s.id}>{s.name}</option>
          ))}
        </optgroup>
      )}
      <option value={NO_SOUND}>بدون صدا</option>
    </>
  );

  const listen = (id: string) => {
    if (!playSound(id, volume)) showToast('صدا پخش نشد: اگر صدا را در زنگوله بی‌صدا کرده‌اید روشنش کنید، یا یک بار روی صفحه کلیک کنید.');
  };

  const save = () => {
    onSave(cfg);
    setDirty(false);
    showToast('تنظیمات ناتیفیکیشن ذخیره شد و برای همهٔ کاربران اعمال می‌شود.');
  };

  const reset = () => {
    if (!window.confirm('همهٔ تنظیمات ناتیفیکیشن به حالت پیش‌فرض برگردد؟ صداهای آپلودشده پاک نمی‌شوند.')) return;
    setCfg({});
    setDirty(true);
  };

  const tryIt = async (kind: string, label: string) => {
    if (dirty) {
      onSave(cfg);
      setDirty(false);
      await new Promise((r) => setTimeout(r, 900));
    }
    try {
      await api.notifyTest(kind, label);
    } catch {
      showToast('ارسال ناتیف آزمایشی ممکن نشد.');
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    try {
      const s = await api.soundUpload(file, uploadName.trim());
      setUploadName('');
      if (fileRef.current) fileRef.current.value = '';
      await loadSounds();
      showToast(`صدای «${s.name}» اضافه شد.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'آپلود نشد.');
    } finally {
      setBusy(false);
    }
  };

  const removeSound = async (s: UploadedSound) => {
    const used = [...Object.values(cfg.kinds || {}), ...Object.values(cfg.events || {})].some((r) => r?.sound === 'custom:' + s.id);
    if (!window.confirm(used ? `«${s.name}» در تنظیمات استفاده شده؛ با پاک کردنش آن بخش‌ها بی‌صدا می‌شوند. پاک شود؟` : `«${s.name}» پاک شود؟`)) return;
    await api.soundDelete(s.id).catch(() => {});
    forgetCustomSound(s.id);
    await loadSounds();
  };

  const groups = useMemo(() => {
    const m = new Map<string, typeof EVENTS>();
    EVENTS.forEach((e) => m.set(e.group, [...(m.get(e.group) || []), e]));
    return [...m.entries()];
  }, []);

  const check = (on: boolean, change: (v: boolean) => void, title: string) => (
    <label className="flex items-center gap-1 font-bold text-[#3A241F] whitespace-nowrap">
      <input type="checkbox" checked={on} onChange={(e) => change(e.target.checked)} />
      {title}
    </label>
  );

  return (
    <div className="space-y-5">
      <div className={card}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-black text-sm text-[#3A241F] flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-600" />
            تنظیمات ناتیفیکیشن سامانه
            {dirty && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black">ذخیره‌نشده</span>}
          </h3>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">
              <RotateCcw className="w-3.5 h-3.5" />
              پیش‌فرض
            </button>
            <button type="button" disabled={!dirty} onClick={save} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-[#6E1B1B] hover:bg-[#561414] disabled:opacity-40 cursor-pointer">
              <Save className="w-4 h-4" />
              ذخیرهٔ تنظیمات ناتیف
            </button>
          </div>
        </div>
        <p className="text-[#8C6F66] leading-6">این تنظیمات برای همهٔ کاربران است. هر کاربر خودش هم می‌تواند صدای خودش را از زنگوله بی‌صدا کند.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3 space-y-3">
            {check(cfg.enabled ?? true, (v) => patch({ enabled: v }), 'ناتیفیکیشن‌ها فعال باشند (خاموش = هیچ پاپ‌آپ و صدایی نمی‌آید)')}
            <div>
              <label className="block font-bold text-[#3A241F] mb-1">بلندی صدا: {toPersianDigits(Math.round(volume * 100))}٪</label>
              <div className="flex items-center gap-2">
                <input type="range" min={0.1} max={1} step={0.05} value={volume} onChange={(e) => patch({ volume: Number(e.target.value) })} className="flex-1" />
                <button type="button" onClick={() => listen(resolveRule(cfg, 'task').sound)} className="p-2 rounded-xl bg-white border border-[#EBDBCE] text-emerald-700 cursor-pointer" title="امتحان صدا">
                  <Play className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div>
              <label className="block font-bold text-[#3A241F] mb-1">مدت نمایش پاپ‌آپ: {toPersianDigits(cfg.popupSeconds ?? DEFAULT_NOTIFY.popupSeconds)} ثانیه</label>
              <input type="range" min={3} max={30} step={1} value={cfg.popupSeconds ?? DEFAULT_NOTIFY.popupSeconds} onChange={(e) => patch({ popupSeconds: Number(e.target.value) })} className="w-full" />
            </div>
          </div>

          <div className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7] p-3 space-y-3">
            {check(cfg.quiet?.enabled ?? false, (v) => patch({ quiet: { from: '22:00', to: '07:00', ...cfg.quiet, enabled: v } }), 'ساعت سکوت (صدا قطع می‌شود، پاپ‌آپ‌ها می‌آیند)')}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-[#3A241F] mb-1">از ساعت</label>
                <input type="time" className={box} dir="ltr" value={cfg.quiet?.from || '22:00'} onChange={(e) => patch({ quiet: { enabled: cfg.quiet?.enabled ?? false, to: cfg.quiet?.to || '07:00', from: e.target.value } })} />
              </div>
              <div>
                <label className="block font-bold text-[#3A241F] mb-1">تا ساعت</label>
                <input type="time" className={box} dir="ltr" value={cfg.quiet?.to || '07:00'} onChange={(e) => patch({ quiet: { enabled: cfg.quiet?.enabled ?? false, from: cfg.quiet?.from || '22:00', to: e.target.value } })} />
              </div>
            </div>
            <p className="text-[10px] text-[#8C6F66] leading-5">ساعت بر اساس ساعت رایانهٔ هر کاربر است. اعلان موبایل (وقتی برنامه بسته است) را سیستم‌عامل خودش مدیریت می‌کند.</p>
          </div>
        </div>
      </div>

      <div className={card}>
        <h3 className="font-black text-sm text-[#3A241F]">هر نوع ناتیف، یک صدا و رفتار</h3>
        <div className="space-y-2">
          {KINDS.map((k) => {
            const r = resolveRule(cfg, k);
            return (
              <div key={k} className="rounded-2xl border border-[#EBDBCE] p-3 flex flex-wrap items-center gap-3 bg-[#FDFAF7]">
                <div className="w-40 font-black text-[#3A241F]">{KIND_LABEL[k]}</div>
                <div className="flex items-center gap-1.5 flex-1 min-w-52">
                  <select className={box} value={cfg.kinds?.[k]?.sound || DEFAULT_KIND_SOUND[k]} onChange={(e) => setKind(k, { sound: e.target.value })}>
                    {soundOptions(false)}
                  </select>
                  <button type="button" onClick={() => listen(cfg.kinds?.[k]?.sound || DEFAULT_KIND_SOUND[k])} className="p-2 rounded-xl bg-white border border-[#EBDBCE] text-emerald-700 cursor-pointer shrink-0" title="شنیدن">
                    <Play className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {check(r.enabled && (cfg.kinds?.[k]?.enabled ?? true), (v) => setKind(k, { enabled: v }), 'فعال')}
                  {check(cfg.kinds?.[k]?.popup ?? true, (v) => setKind(k, { popup: v }), 'پاپ‌آپ')}
                  {check(cfg.kinds?.[k]?.os ?? true, (v) => setKind(k, { os: v }), 'اعلان سیستم')}
                  {check(cfg.kinds?.[k]?.push ?? true, (v) => setKind(k, { push: v }), 'موبایل (بسته بودن برنامه)')}
                </div>
                <button type="button" onClick={() => tryIt(k, k === 'call' ? 'تماس ورودی' : k === 'letter' ? 'جهت امضا' : k === 'file' ? 'فایل جدید' : k === 'alert' ? 'رد شد' : 'وظیفه جدید')} className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-black text-sky-800 bg-sky-50 border border-sky-200 cursor-pointer">
                  <Send className="w-3.5 h-3.5" />
                  امتحان کامل
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className={card}>
        <h3 className="font-black text-sm text-[#3A241F]">رویدادهای ویژه (اختیاری)</h3>
        <p className="text-[#8C6F66] leading-6">اگر برای یک رویداد خاص مثلاً «جهت امضا» یا «موعد گذشته» صدا یا رفتار جدا می‌خواهید، اینجا بگذارید. بقیه از تنظیم نوع خودشان پیروی می‌کنند.</p>
        <div className="space-y-2">
          {groups.map(([group, list]) => (
            <details key={group} className="rounded-2xl border border-[#EBDBCE] bg-[#FDFAF7]">
              <summary className="cursor-pointer px-3 py-2.5 font-black text-[#3A241F]">
                {group}
                <span className="mr-2 text-[10px] text-[#8C6F66] font-bold">{toPersianDigits(list.filter((e) => cfg.events?.[e.label]).length)} تنظیم جدا</span>
              </summary>
              <div className="divide-y divide-[#EBDBCE]/60">
                {list.map((e) => {
                  const own = cfg.events?.[e.label];
                  return (
                    <div key={e.label} className="px-3 py-2.5 flex flex-wrap items-center gap-3">
                      <div className="w-36 font-bold text-[#3A241F]">{e.label}</div>
                      <div className="flex items-center gap-1.5 flex-1 min-w-48">
                        <select className={box} value={own?.sound || 'inherit'} onChange={(ev) => setEvent(e.label, { sound: ev.target.value })}>
                          {soundOptions(true)}
                        </select>
                        <button type="button" onClick={() => listen(resolveRule(cfg, e.kind, e.label).sound)} className="p-2 rounded-xl bg-white border border-[#EBDBCE] text-emerald-700 cursor-pointer shrink-0" title="شنیدن">
                          <Play className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {check(own?.enabled ?? true, (v) => setEvent(e.label, { enabled: v }), 'فعال')}
                        {check(own?.popup ?? resolveRule(cfg, e.kind).popup, (v) => setEvent(e.label, { popup: v }), 'پاپ‌آپ')}
                        {check(own?.os ?? resolveRule(cfg, e.kind).os, (v) => setEvent(e.label, { os: v }), 'اعلان سیستم')}
                        {check(own?.push ?? resolveRule(cfg, e.kind).push, (v) => setEvent(e.label, { push: v }), 'موبایل')}
                      </div>
                      <button type="button" onClick={() => tryIt(e.kind, e.label)} className="p-1.5 rounded-lg text-sky-700 hover:bg-sky-50 cursor-pointer" title="امتحان کامل (ناتیف آزمایشی برای خودتان)">
                        <Send className="w-4 h-4" />
                      </button>
                      {own && (
                        <button type="button" onClick={() => clearEvent(e.label)} className="p-1.5 rounded-lg text-[#8C6F66] hover:bg-[#F6D9CD]/40 cursor-pointer" title="برگرداندن به تنظیم نوع">
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className={card}>
        <h3 className="font-black text-sm text-[#3A241F]">کتابخانهٔ صداها</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {SOUND_PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => listen(p.id)} className="text-right rounded-xl border border-[#EBDBCE] bg-[#FDFAF7] hover:bg-[#F6D9CD]/40 p-2.5 cursor-pointer flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-white border border-[#EBDBCE] text-emerald-700 flex items-center justify-center shrink-0">
                <Play className="w-3.5 h-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block font-black text-[#3A241F] truncate">{p.name}</span>
                <span className="block text-[10px] text-[#8C6F66] truncate">{p.description}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-dashed border-[#C98B6A] bg-[#FFFBF7] p-3 space-y-3">
          <div className="font-black text-[#3A241F]">صدای خودتان را آپلود کنید</div>
          <p className="text-[#8C6F66] leading-6">فایل mp3 یا wav یا ogg یا m4a، حداکثر ۶۰۰ کیلوبایت (حدود ۸ ثانیه اول آن پخش می‌شود). تا ۱۲ صدا. بعد از آپلود، در فهرست صداها بالا می‌آید.</p>
          <div className="flex flex-wrap gap-2">
            <input className={`${box} flex-1 min-w-40`} value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="نام صدا (اختیاری)" />
            <label className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black text-white bg-[#6E1B1B] cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
              <Upload className="w-4 h-4" />
              انتخاب فایل و آپلود
              <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
          </div>
          {sounds.length > 0 && (
            <div className="divide-y divide-[#EBDBCE]/60 rounded-xl border border-[#EBDBCE] bg-white">
              {sounds.map((s) => (
                <div key={s.id} className="flex items-center gap-2 px-3 py-2">
                  <button type="button" onClick={() => listen('custom:' + s.id)} className="p-2 rounded-lg bg-[#FAF5F1] border border-[#EBDBCE] text-emerald-700 cursor-pointer" title="شنیدن">
                    <Play className="w-3.5 h-3.5" />
                  </button>
                  <span className="flex-1 font-bold text-[#3A241F] truncate">{s.name}</span>
                  <span className="text-[10px] text-[#8C6F66]">{toPersianDigits(Math.max(1, Math.round(s.size / 1024)))} کیلوبایت</span>
                  <button type="button" onClick={() => removeSound(s)} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer" title="حذف">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {sounds.length === 0 && (
            <div className="flex items-center gap-1.5 text-[#8C6F66] text-[11px]">
              <VolumeX className="w-3.5 h-3.5" />
              هنوز صدایی آپلود نشده است.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
