import React, { useMemo, useState } from 'react';
import { ChevronDown, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Minutes, MinutesConfig, MinutesDesign, MinutesNumbering, MinutesType, SystemSettings } from '../../types';
import { BUILTIN_MINUTES_TYPES, DEFAULT_MINUTES_DESIGN, DEFAULT_MINUTES_NUMBERING, formatMinutesNumber, getMinutesConfig, MINUTES_DESIGN_PRESETS, MINUTES_NUMBER_PATTERNS, typeOf } from '../../lib/minutesConfig';
import { buildMinutesHtml } from '../../lib/minutesHtml';
import { sample } from '../minutes/MinutesView';
import { todayIso } from '../../lib/taskDates';
import { askConfirm } from '../../lib/confirmDialog';

const input = 'w-full p-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none';
const lab = 'block text-[11px] font-black text-[#3A241F] mb-1';
const box = 'bg-white border border-[#EBDBCE] rounded-3xl p-5 sm:p-6 space-y-4';
const SECTION_LABELS: [keyof MinutesType['sections'], string][] = [
  ['attendees', 'حاضرین (با رئیس و دبیر جلسه)'],
  ['agenda', 'دستور جلسه'],
  ['discussion', 'شرح مذاکرات / گزارش'],
  ['decisions', 'مصوبات (مسئول و مهلت)'],
  ['nextMeeting', 'جلسهٔ بعد'],
  ['copies', 'رونوشت'],
  ['parties', 'دو طرف (تحویل‌دهنده / تحویل‌گیرنده)'],
  ['goods', 'جدول کالا'],
];

const Check: React.FC<{ checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }> = ({ checked, onChange, children }) => (
  <label className="flex items-center gap-2 text-[11px] font-bold text-[#3A241F] cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />
    {children}
  </label>
);

/**
 * «تنظیمات صورتجلسه» in the admin console: how the numbers of the minutes are made, how the printed sheet looks (with a live preview), and the sorts of
 * minutes (general meeting, delivery of goods …) with their parts, texts, extra fields and signature boxes. It changes the `minutesConfig` of the
 * settings; the page's «ذخیره کلیه تنظیمات» button saves it.
 */
export const MinutesSettingsCard: React.FC<{ settings: SystemSettings; setSettings: React.Dispatch<React.SetStateAction<SystemSettings>> }> = ({ settings, setSettings }) => {
  const cfg = useMemo(() => getMinutesConfig(settings), [settings]);
  const [open, setOpen] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState('general');

  const write = (next: MinutesConfig) => {
    // only what differs from the built-in sorts needs keeping, but writing the whole list is simple and safe
    setSettings((prev) => ({ ...prev, minutesConfig: next }));
  };
  const setNumbering = (u: Partial<MinutesNumbering>) => write({ ...cfg, numbering: { ...cfg.numbering, ...u } });
  const setDesign = (u: Partial<MinutesDesign>) => write({ ...cfg, design: { ...cfg.design, ...u, presetId: u.presetId || 'custom' } });
  const setType = (id: string, u: Partial<MinutesType>) => write({ ...cfg, types: cfg.types.map((t) => (t.id === id ? { ...t, ...u } : t)) });
  const addType = () => {
    const id = 'custom-' + Math.random().toString(36).slice(2, 7);
    const base = BUILTIN_MINUTES_TYPES[0];
    write({ ...cfg, types: [...cfg.types, { ...base, id, title: 'نوع جدید', printTitle: 'صورتجلسه', prefix: 'ص', builtin: false, fields: [], signs: ['دبیر جلسه', 'رئیس جلسه'] }] });
    setOpen(id);
  };
  const resetType = (id: string) => {
    const b = BUILTIN_MINUTES_TYPES.find((x) => x.id === id);
    if (b) setType(id, b);
  };

  const previewMinutes: Minutes = useMemo(() => {
    const m = sample(cfg, [], 'مدیرعامل نمونه', [{ id: 'a', fullName: 'علی رضایی', departmentName: 'فروش' }, { id: 'b', fullName: 'مریم احمدی', departmentName: 'مالی' }, { id: 'c', fullName: 'سارا محمدی', departmentName: 'اداری' }], previewType);
    return { ...m, number: formatMinutesNumber(cfg.numbering, typeOf(cfg, previewType), todayIso(), cfg.numbering.start), status: 'FINAL' };
  }, [cfg, previewType]);
  const html = useMemo(() => buildMinutesHtml(previewMinutes, settings, 'preview'), [previewMinutes, settings]);

  const numberExamples = cfg.types.filter((t) => t.active !== false).map((t) => ({ t, n: formatMinutesNumber(cfg.numbering, t, todayIso(), cfg.numbering.start) }));
  const patterns = MINUTES_NUMBER_PATTERNS.some((p) => p.id === cfg.numbering.pattern) ? MINUTES_NUMBER_PATTERNS : [{ id: cfg.numbering.pattern, label: 'الگوی دلخواه' }, ...MINUTES_NUMBER_PATTERNS];

  return (
    <div className="space-y-5" data-minutes-settings>
      <div className={box}>
        <h3 className="font-black text-sm text-[#3A241F]">شماره‌گذاری صورتجلسه</h3>
        <p className="text-[11px] text-[#8C6F66] leading-6">
          شمارهٔ هر صورتجلسه خودکار از روی این الگو ساخته می‌شود. در الگو می‌توانید از این نشانه‌ها استفاده کنید: <span dir="ltr">{'{PREFIX} {TYPE} {YYYY} {YY} {NNN}'}</span> (هر N یک رقم شمارهٔ ترتیبی است؛ سال، شمسی است).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <span className={lab}>الگوی شماره</span>
            <select className={input} value={cfg.numbering.pattern} onChange={(e) => setNumbering({ pattern: e.target.value })} data-minutes-pattern>
              {patterns.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <input className={`${input} mt-1.5`} dir="ltr" value={cfg.numbering.pattern} onChange={(e) => setNumbering({ pattern: e.target.value })} placeholder="{PREFIX}-{YYYY}-{NNN}" />
          </div>
          <div>
            <span className={lab}>پیشوند عمومی</span>
            <input className={input} value={cfg.numbering.prefix} onChange={(e) => setNumbering({ prefix: e.target.value })} />
          </div>
          <div>
            <span className={lab}>شمارهٔ شروع هر سال</span>
            <input className={input} type="number" min={1} value={cfg.numbering.start} onChange={(e) => setNumbering({ start: Math.max(1, Number(e.target.value) || 1) })} />
          </div>
        </div>
        <Check checked={cfg.numbering.perType} onChange={(v) => setNumbering({ perType: v })}>هر نوع صورتجلسه شمارهٔ ترتیبی و پیشوند خودش را داشته باشد (مثلاً «ت‌ک» برای تحویل کالا)</Check>
        <div className="rounded-2xl bg-[#FAF5F1] border border-[#EBDBCE] p-3 text-[11px] font-bold text-[#3A241F] leading-7">
          نمونهٔ شمارهٔ اول هر نوع:
          <div className="flex flex-wrap gap-2 mt-1">
            {numberExamples.map(({ t, n }) => (
              <span key={t.id} className="px-2.5 py-1 rounded-full bg-white border border-[#EBDBCE]">
                {t.title}: <b>{n}</b>
              </span>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => setNumbering(DEFAULT_MINUTES_NUMBERING)} className="flex items-center gap-1 text-[11px] font-black text-[#8C6F66] cursor-pointer">
          <RotateCcw className="w-3.5 h-3.5" />
          بازگرداندن شماره‌گذاری پیش‌فرض
        </button>
      </div>

      <div className={box}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-black text-sm text-[#3A241F]">طراحی برگهٔ چاپی</h3>
          <div className="flex flex-wrap gap-1.5">
            {MINUTES_DESIGN_PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => write({ ...cfg, design: { ...DEFAULT_MINUTES_DESIGN, ...p.look, presetId: p.id, logoPosition: cfg.design.logoPosition, logoSize: cfg.design.logoSize } })} className={`px-3 py-1.5 rounded-full text-[11px] font-black border cursor-pointer ${cfg.design.presetId === p.id ? 'bg-[#6E1B1B] text-white border-[#6E1B1B]' : 'bg-white border-[#EBDBCE] text-[#3A241F] hover:bg-[#FAF5F1]'}`}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([['primary', 'رنگ اصلی'], ['accent', 'رنگ تأکید'], ['headFill', 'پس‌زمینهٔ سرجدول'], ['text', 'رنگ متن']] as const).map(([k, l]) => (
                <div key={k}>
                  <span className={lab}>{l}</span>
                  <input type="color" value={cfg.design[k]} onChange={(e) => setDesign({ [k]: e.target.value })} className="w-full h-9 p-0.5 bg-white border border-[#EBDBCE] rounded-xl cursor-pointer" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <span className={lab}>سبک سربرگ</span>
                <select className={input} value={cfg.design.headerStyle} onChange={(e) => setDesign({ headerStyle: e.target.value as MinutesDesign['headerStyle'] })} data-minutes-header-style>
                  <option value="classic">کلاسیک (خط زیر سربرگ)</option>
                  <option value="boxed">کادردار</option>
                  <option value="band">نوار رنگی</option>
                  <option value="plain">ساده</option>
                </select>
              </div>
              <div>
                <span className={lab}>جای لوگو</span>
                <select className={input} value={cfg.design.logoPosition} onChange={(e) => setDesign({ logoPosition: e.target.value as MinutesDesign['logoPosition'] })} data-minutes-logo-position>
                  <option value="right">راست</option>
                  <option value="center">وسط (بالای نام)</option>
                  <option value="left">چپ</option>
                </select>
              </div>
              <div>
                <span className={lab}>اندازهٔ لوگو (میلی‌متر)</span>
                <input className={input} type="range" min={10} max={40} value={cfg.design.logoSize} onChange={(e) => setDesign({ logoSize: Number(e.target.value) })} />
              </div>
              <div>
                <span className={lab}>سبک جدول‌ها</span>
                <select className={input} value={cfg.design.tableStyle} onChange={(e) => setDesign({ tableStyle: e.target.value as MinutesDesign['tableStyle'] })}>
                  <option value="bordered">خانه‌خانه (کادردار)</option>
                  <option value="lined">فقط خط‌های افقی</option>
                  <option value="striped">راه‌راه</option>
                </select>
              </div>
              <div>
                <span className={lab}>اندازهٔ فونت</span>
                <input className={input} type="range" min={10} max={14} step={0.5} value={cfg.design.fontSize} onChange={(e) => setDesign({ fontSize: Number(e.target.value) })} />
              </div>
              <div>
                <span className={lab}>گردی گوشه‌ها</span>
                <input className={input} type="range" min={0} max={16} value={cfg.design.radius} onChange={(e) => setDesign({ radius: Number(e.target.value) })} />
              </div>
              <div>
                <span className={lab}>ارتفاع کادر امضا (میلی‌متر)</span>
                <input className={input} type="range" min={18} max={50} value={cfg.design.signHeight} onChange={(e) => setDesign({ signHeight: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Check checked={cfg.design.showLogo} onChange={(v) => setDesign({ showLogo: v })}>نمایش لوگو</Check>
              <Check checked={cfg.design.showOrgName} onChange={(v) => setDesign({ showOrgName: v })}>نمایش نام سازمان</Check>
              <Check checked={cfg.design.showSubtitle} onChange={(v) => setDesign({ showSubtitle: v })}>نمایش عنوان فرعی سازمان</Check>
              <Check checked={cfg.design.showNumberBox} onChange={(v) => setDesign({ showNumberBox: v })}>کادر شماره و تاریخ بالای برگه</Check>
              <Check checked={cfg.design.showStatusColumn} onChange={(v) => setDesign({ showStatusColumn: v })}>ستون وضعیت حضور در جدول حاضرین</Check>
              <Check checked={cfg.design.showSignColumn} onChange={(v) => setDesign({ showSignColumn: v })}>ستون امضا در جدول حاضرین</Check>
              <Check checked={cfg.design.pageBorder} onChange={(v) => setDesign({ pageBorder: v })}>کادر دور برگه</Check>
              <Check checked={cfg.design.showFooterContact} onChange={(v) => setDesign({ showFooterContact: v })}>نشانی و تلفن سازمان پایین برگه</Check>
            </div>
            <div>
              <span className={lab}>متن پایین برگه (اختیاری)</span>
              <input className={input} value={cfg.design.footerText} onChange={(e) => setDesign({ footerText: e.target.value })} placeholder="مثلاً: این صورتجلسه فقط با مهر و امضا معتبر است." />
            </div>
            <button type="button" onClick={() => write({ ...cfg, design: DEFAULT_MINUTES_DESIGN })} className="flex items-center gap-1 text-[11px] font-black text-[#8C6F66] cursor-pointer">
              <RotateCcw className="w-3.5 h-3.5" />
              بازگرداندن طراحی پیش‌فرض
            </button>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-black text-[#3A241F]">پیش‌نمایش زنده</span>
              <select className={`${input} w-auto`} value={previewType} onChange={(e) => setPreviewType(e.target.value)} data-minutes-preview-type>
                {cfg.types.filter((t) => t.active !== false).map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl border border-[#EBDBCE] bg-[#E5DCD2]/60 p-2 overflow-hidden" style={{ height: 560 }}>
              <iframe title="پیش‌نمایش صورتجلسه" srcDoc={html} className="origin-top-right bg-white border-0 shadow-lg" style={{ width: 794, height: 1123 * 1.6, transform: 'scale(0.46)', transformOrigin: 'top right' }} data-minutes-preview-frame />
            </div>
          </div>
        </div>
      </div>

      <div className={box}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-black text-sm text-[#3A241F]">انواع صورتجلسه</h3>
            <p className="text-[11px] text-[#8C6F66] leading-6">هر نوع بخش‌ها، متن آغاز و پایان، فیلدهای اضافه و کادرهای امضای خودش را دارد؛ مثلاً «تحویل کالا» جدول کالا و دو طرف تحویل دارد.</p>
          </div>
          <button type="button" onClick={addType} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-[#6E1B1B] hover:bg-[#581717] cursor-pointer" data-minutes-add-type>
            <Plus className="w-4 h-4" />
            نوع تازه
          </button>
        </div>
        <div className="space-y-2">
          {cfg.types.map((t) => (
            <div key={t.id} className="rounded-2xl border border-[#EBDBCE] overflow-hidden" data-minutes-type-row>
              <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-[#FAF5F1] cursor-pointer text-right">
                <span className="font-black text-xs text-[#3A241F]">
                  {t.title}
                  {t.builtin && <span className="text-[10px] font-bold text-[#8C6F66] mr-2">(پیش‌فرض)</span>}
                  {t.active === false && <span className="text-[10px] font-black text-rose-600 mr-2">غیرفعال</span>}
                </span>
                <ChevronDown className={`w-4 h-4 text-[#8C6F66] transition-transform ${open === t.id ? 'rotate-180' : ''}`} />
              </button>
              {open === t.id && (
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <span className={lab}>نام نوع (در فهرست)</span>
                      <input className={input} value={t.title} onChange={(e) => setType(t.id, { title: e.target.value })} />
                    </div>
                    <div>
                      <span className={lab}>عنوان بزرگ روی برگه</span>
                      <input className={input} value={t.printTitle} onChange={(e) => setType(t.id, { printTitle: e.target.value })} />
                    </div>
                    <div>
                      <span className={lab}>پیشوند شماره</span>
                      <input className={input} value={t.prefix} onChange={(e) => setType(t.id, { prefix: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <span className={lab}>بخش‌های این نوع</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {SECTION_LABELS.map(([k, l]) => (
                        <Check key={k} checked={t.sections[k]} onChange={(v) => setType(t.id, { sections: { ...t.sections, [k]: v } })}>{l}</Check>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className={lab}>متن آغاز برگه</span>
                    <textarea className={`${input} min-h-[64px] leading-6`} value={t.intro} onChange={(e) => setType(t.id, { intro: e.target.value })} />
                    <span className={lab + ' mt-2'}>متن پایان برگه</span>
                    <textarea className={`${input} min-h-[54px] leading-6`} value={t.closing} onChange={(e) => setType(t.id, { closing: e.target.value })} />
                    <p className="text-[10px] text-[#8C6F66] leading-5 mt-1">نشانه‌های قابل‌استفاده در متن: <span dir="ltr">{'{{title}} {{date}} {{time}} {{place}} {{count}} {{decisions}} {{copies}}'}</span> (موضوع، تاریخ، ساعت، محل، تعداد حاضرین، تعداد مصوبات و تعداد نسخه).</p>
                  </div>
                  {t.sections.parties && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <span className={lab}>عنوان طرف اول</span>
                        <input className={input} value={t.partyLabels[0]} onChange={(e) => setType(t.id, { partyLabels: [e.target.value, t.partyLabels[1]] })} />
                      </div>
                      <div>
                        <span className={lab}>عنوان طرف دوم</span>
                        <input className={input} value={t.partyLabels[1]} onChange={(e) => setType(t.id, { partyLabels: [t.partyLabels[0], e.target.value] })} />
                      </div>
                    </div>
                  )}
                  {t.sections.goods && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-x-5 gap-y-1">
                        <Check checked={t.goodsColumns.code} onChange={(v) => setType(t.id, { goodsColumns: { ...t.goodsColumns, code: v } })}>ستون کد کالا</Check>
                        <Check checked={t.goodsColumns.unit} onChange={(v) => setType(t.id, { goodsColumns: { ...t.goodsColumns, unit: v } })}>ستون واحد</Check>
                        <Check checked={t.goodsColumns.note} onChange={(v) => setType(t.id, { goodsColumns: { ...t.goodsColumns, note: v } })}>ستون توضیحات</Check>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <span className={lab}>عنوان ستون توضیحات</span>
                          <input className={input} value={t.goodsNoteLabel} onChange={(e) => setType(t.id, { goodsNoteLabel: e.target.value })} />
                        </div>
                        <div>
                          <span className={lab}>عنوان کادر شرایط و ملاحظات</span>
                          <input className={input} value={t.conditionsLabel} onChange={(e) => setType(t.id, { conditionsLabel: e.target.value })} />
                        </div>
                      </div>
                      <div>
                        <span className={lab}>متن پیش‌فرض شرایط تحویل</span>
                        <textarea className={`${input} min-h-[54px] leading-6`} value={t.defaultConditions} onChange={(e) => setType(t.id, { defaultConditions: e.target.value })} />
                      </div>
                    </div>
                  )}
                  <div>
                    <span className={lab}>فیلدهای اضافه (مثل شمارهٔ فاکتور)</span>
                    {t.fields.map((f, i) => (
                      <div key={f.id} className="flex gap-2 mb-1.5">
                        <input className={input} value={f.label} onChange={(e) => setType(t.id, { fields: t.fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                        <select className={`${input} w-28`} value={f.kind} onChange={(e) => setType(t.id, { fields: t.fields.map((x, j) => (j === i ? { ...x, kind: e.target.value as 'text' | 'date' } : x)) })}>
                          <option value="text">متن</option>
                          <option value="date">تاریخ</option>
                        </select>
                        <button type="button" onClick={() => setType(t.id, { fields: t.fields.filter((_, j) => j !== i) })} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer" aria-label="حذف"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setType(t.id, { fields: [...t.fields, { id: 'f' + Math.random().toString(36).slice(2, 6), label: 'فیلد تازه', kind: 'text' }] })} className="flex items-center gap-1 text-[11px] font-black text-[#6E1B1B] cursor-pointer">
                      <Plus className="w-3.5 h-3.5" />
                      فیلد دیگر
                    </button>
                  </div>
                  {t.sections.agenda && (
                    <div>
                      <span className={lab}>بندهای پیش‌فرض دستور جلسه (هر بند یک خط)</span>
                      <textarea className={`${input} min-h-[54px] leading-6`} value={t.defaultAgenda.join('\n')} onChange={(e) => setType(t.id, { defaultAgenda: e.target.value.split('\n') })} />
                    </div>
                  )}
                  <div>
                    <span className={lab}>کادرهای امضا پایین برگه (حداکثر ۴)</span>
                    {t.signs.map((s, i) => (
                      <div key={i} className="flex gap-2 mb-1.5">
                        <input className={input} value={s} onChange={(e) => setType(t.id, { signs: t.signs.map((x, j) => (j === i ? e.target.value : x)) })} />
                        <button type="button" disabled={t.signs.length <= 1} onClick={() => setType(t.id, { signs: t.signs.filter((_, j) => j !== i) })} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg disabled:opacity-30 cursor-pointer" aria-label="حذف"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                    {t.signs.length < 4 && (
                      <button type="button" onClick={() => setType(t.id, { signs: [...t.signs, 'امضا'] })} className="flex items-center gap-1 text-[11px] font-black text-[#6E1B1B] cursor-pointer">
                        <Plus className="w-3.5 h-3.5" />
                        کادر امضای دیگر
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <Check checked={t.active !== false} onChange={(v) => setType(t.id, { active: v })}>این نوع در فهرست انتخاب نمایش داده شود</Check>
                    {t.builtin ? (
                      <button type="button" onClick={() => resetType(t.id)} className="flex items-center gap-1 text-[11px] font-black text-[#8C6F66] cursor-pointer">
                        <RotateCcw className="w-3.5 h-3.5" />
                        بازگرداندن همین نوع به پیش‌فرض
                      </button>
                    ) : (
                      <button type="button" onClick={async () => { if (await askConfirm(`نوع «${t.title}» حذف شود؟ صورتجلسه‌های ثبت‌شده با این نوع به نوع «جلسهٔ عمومی» برمی‌گردند.`)) write({ ...cfg, types: cfg.types.filter((x) => x.id !== t.id) }); }} className="flex items-center gap-1 text-[11px] font-black text-rose-600 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                        حذف این نوع
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
