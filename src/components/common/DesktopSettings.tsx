import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MonitorUp, X, Pin, PictureInPicture2, AppWindow, Bell } from 'lucide-react';
import { DesktopSettings as Settings, getDesktop } from '../../lib/desktop';
import { toPersianDigits } from '../../lib/jalali';

const CORNERS: { id: Settings['corner']; label: string }[] = [
  { id: 'top-right', label: 'بالا راست' },
  { id: 'top-left', label: 'بالا چپ' },
  { id: 'bottom-right', label: 'پایین راست' },
  { id: 'bottom-left', label: 'پایین چپ' },
];

/** Display options of the Windows app (always on top, small corner window, opacity...). Hidden in a normal browser. */
export const DesktopSettings: React.FC = () => {
  const desktop = getDesktop();
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<Settings | null>(null);
  const [server, setServer] = useState('');

  useEffect(() => {
    if (!desktop) return;
    void desktop.getSettings().then((v) => {
      setS(v);
      setServer(v.serverUrl);
    });
    return desktop.onSettings((v) => setS(v));
  }, [desktop]);

  if (!desktop || !s) return null;

  const set = (patch: Partial<Settings>) => {
    setS({ ...s, ...patch });
    void desktop.setSettings(patch).then(setS);
  };

  const row = 'flex items-center justify-between gap-3 p-3 bg-[#FAF5F1] rounded-2xl border border-[#EBDBCE]';
  const toggle = (on: boolean, onChange: (v: boolean) => void) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${on ? 'bg-[#6E1B1B]' : 'bg-gray-300'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${on ? 'right-0.5' : 'right-[22px]'}`} />
    </button>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="نحوهٔ نمایش برنامه روی ویندوز"
        className={`flex items-center justify-center w-9 h-9 rounded-2xl border transition-all cursor-pointer ${
          s.alwaysOnTop ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white text-[#3A241F] border-[#EBDBCE] hover:bg-[#F6D9CD]/40'
        }`}
      >
        <MonitorUp className="w-4 h-4" />
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-xs p-3" onMouseDown={() => setOpen(false)}>
            <div dir="rtl" onMouseDown={(e) => e.stopPropagation()} className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[92vh] flex flex-col border border-[#EBDBCE] text-right">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#EBDBCE]">
                <h3 className="flex items-center gap-2 font-black text-sm text-[#3A241F]">
                  <MonitorUp className="w-4 h-4 text-[#6E1B1B]" />
                  نحوهٔ نمایش روی ویندوز
                </h3>
                <button type="button" onClick={() => setOpen(false)} className="p-1.5 text-[#8C6F66] hover:text-[#3A241F] rounded-xl cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-3 overflow-y-auto">
                <div className={row}>
                  <div>
                    <div className="flex items-center gap-1.5 font-black text-xs text-[#3A241F]">
                      <Pin className="w-4 h-4 text-[#6E1B1B]" />
                      همیشه روی همهٔ پنجره‌ها
                    </div>
                    <p className="text-[10px] text-[#8C6F66] mt-0.5 leading-5">برنامه بالاتر از سایر برنامه‌ها می‌ماند، حتی وقتی روی برنامهٔ دیگری کار می‌کنید.</p>
                  </div>
                  {toggle(s.alwaysOnTop, (v) => set({ alwaysOnTop: v }))}
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-black text-[#3A241F]">اندازهٔ پنجره</div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ['normal', 'پنجرهٔ عادی', AppWindow],
                      ['compact', 'پنجرهٔ کوچک گوشه‌ای', PictureInPicture2],
                    ] as const).map(([id, label, Icon]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => set({ mode: id })}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-[11px] font-black transition-all cursor-pointer ${
                          s.mode === id ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-[#FAF5F1] text-[#3A241F] border-[#EBDBCE] hover:bg-white'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {s.mode === 'compact' && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-black text-[#3A241F]">محل پنجرهٔ کوچک روی صفحه</div>
                    <div className="grid grid-cols-2 gap-2">
                      {CORNERS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => set({ corner: c.id })}
                          className={`p-2.5 rounded-xl border text-[11px] font-bold cursor-pointer ${
                            s.corner === c.id ? 'bg-[#F6D9CD] border-[#C98B6A] text-[#6E1B1B]' : 'bg-white border-[#EBDBCE] text-[#3A241F] hover:bg-[#FAF5F1]'
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className={`${row} flex-col items-stretch`}>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-xs text-[#3A241F]">شفافیت پنجره</span>
                    <span className="text-[11px] font-black text-[#6E1B1B]">{toPersianDigits(Math.round(s.opacity * 100))}٪</span>
                  </div>
                  <input type="range" min={40} max={100} step={5} value={Math.round(s.opacity * 100)} onChange={(e) => set({ opacity: Number(e.target.value) / 100 })} className="w-full accent-[#6E1B1B]" />
                </div>

                <div className={row}>
                  <div className="font-black text-xs text-[#3A241F]">اجرا همراه با روشن شدن ویندوز</div>
                  {toggle(s.autoStart, (v) => set({ autoStart: v }))}
                </div>

                <div className={row}>
                  <div>
                    <div className="font-black text-xs text-[#3A241F]">با بستن پنجره، در نوار وظیفه بماند</div>
                    <p className="text-[10px] text-[#8C6F66] mt-0.5 leading-5">اعلان‌ها و صدا حتی با پنجرهٔ بسته می‌رسند. خروج کامل از آیکون کنار ساعت.</p>
                  </div>
                  {toggle(s.closeToTray, (v) => set({ closeToTray: v }))}
                </div>

                <div className="space-y-1.5">
                  <div className="text-[11px] font-black text-[#3A241F]">آدرس سرور</div>
                  <div className="flex gap-2">
                    <input
                      dir="ltr"
                      value={server}
                      onChange={(e) => setServer(e.target.value)}
                      className="flex-1 min-w-0 px-3 py-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-mono text-[#3A241F] outline-hidden"
                      placeholder="https://office.example.ir:8443"
                    />
                    <button
                      type="button"
                      disabled={server === s.serverUrl || !/^https?:\/\//i.test(server)}
                      onClick={() => set({ serverUrl: server.trim().replace(/\/+$/, '') })}
                      className="px-3 rounded-xl bg-[#3A241F] text-white text-xs font-black disabled:opacity-40 cursor-pointer"
                    >
                      ذخیره
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => desktop.notify({ id: 'test', title: 'آزمایش اعلان', body: 'اعلان ویندوز به‌درستی کار می‌کند.', kind: 'file', ref: null })}
                  className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-[#EBDBCE] bg-white hover:bg-[#FAF5F1] text-xs font-black text-[#3A241F] cursor-pointer"
                >
                  <Bell className="w-4 h-4" />
                  آزمایش اعلان ویندوز
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
