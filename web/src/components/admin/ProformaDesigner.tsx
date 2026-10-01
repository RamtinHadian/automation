import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Save, Trash2, Upload, X } from 'lucide-react';
import { buildProformaHtml, formatProformaNumber, sampleProforma } from '../../lib/proformaPdf';
import { HEADER_LABELS, normalizeTemplate, presetTemplate, PROFORMA_PALETTES, PROFORMA_PRESETS, SECTION_LABELS } from '../../lib/proformaTemplates';
import { ProformaHeaderItem, ProformaSectionId, ProformaTemplate, SystemSettings } from '../../types';

type CompanyPatch = Pick<SystemSettings, 'proformaCompanyName' | 'companySubtitle' | 'companyAddress' | 'companyPhone' | 'companyEconomicCode' | 'companyWebsite'>;

const PAPER_W = 794; // 210mm at 96dpi
const PAPER_H = 1123;

const input = 'w-full p-2 bg-[#FAF5F1] border border-[#EBDBCE] rounded-xl text-xs font-bold text-[#3A241F] focus:border-[#6E1B1B] focus:outline-none';
const lab = 'block text-[11px] font-black text-[#3A241F] mb-1';

function move<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return list;
  const next = list.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-2xl border border-[#EBDBCE] bg-white p-3.5 space-y-3">
    <h4 className="font-black text-xs text-[#6E1B1B]">{title}</h4>
    {children}
  </div>
);

const ColorField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <label className="flex items-center gap-2 text-[11px] font-bold text-[#3A241F]">
    <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 rounded-lg border border-[#EBDBCE] p-0 cursor-pointer bg-transparent" />
    <span className="flex-1">{label}</span>
    <span className="text-[10px] text-[#8C6F66] font-mono" dir="ltr">{value}</span>
  </label>
);

/** A list whose rows can be reordered by dragging (mouse) or with the arrow buttons (touch). */
function OrderList<T extends string>({
  items,
  label,
  visible,
  onChange,
  onToggle,
}: {
  items: T[];
  label: (id: T) => string;
  visible?: (id: T) => boolean;
  onChange: (next: T[]) => void;
  onToggle?: (id: T) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  return (
    <div className="space-y-1.5">
      {items.map((id, i) => (
        <div
          key={id}
          draggable
          onDragStart={() => setDragIdx(i)}
          onDragOver={(e) => {
            e.preventDefault();
            setOverIdx(i);
          }}
          onDrop={() => {
            if (dragIdx !== null) onChange(move(items, dragIdx, i));
            setDragIdx(null);
            setOverIdx(null);
          }}
          onDragEnd={() => {
            setDragIdx(null);
            setOverIdx(null);
          }}
          className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border text-[11px] font-bold bg-[#FAF5F1] ${overIdx === i && dragIdx !== null ? 'border-[#6E1B1B] bg-[#F6D9CD]' : 'border-[#EBDBCE]'} ${dragIdx === i ? 'opacity-40' : ''}`}
        >
          <GripVertical className="w-4 h-4 text-[#8C6F66] cursor-grab shrink-0" />
          <span className={`flex-1 ${visible && !visible(id) ? 'line-through text-[#8C6F66]' : 'text-[#3A241F]'}`}>{label(id)}</span>
          {onToggle && (
            <button type="button" onClick={() => onToggle(id)} className="p-1 text-[#6E1B1B] cursor-pointer" title={visible?.(id) ? 'پنهان کردن' : 'نمایش'}>
              {visible?.(id) ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          )}
          <button type="button" disabled={i === 0} onClick={() => onChange(move(items, i, i - 1))} className="p-1 text-[#3A241F] disabled:opacity-25 cursor-pointer"><ArrowUp className="w-4 h-4" /></button>
          <button type="button" disabled={i === items.length - 1} onClick={() => onChange(move(items, i, i + 1))} className="p-1 text-[#3A241F] disabled:opacity-25 cursor-pointer"><ArrowDown className="w-4 h-4" /></button>
        </div>
      ))}
    </div>
  );
}

export const ProformaDesigner: React.FC<{
  settings: SystemSettings;
  onSave: (patch: Partial<SystemSettings>) => void;
  onClose: () => void;
}> = ({ settings, onSave, onClose }) => {
  const [tpl, setTpl] = useState<ProformaTemplate>(() => normalizeTemplate(settings.proformaTemplate));
  const [co, setCo] = useState<CompanyPatch>({
    proformaCompanyName: settings.proformaCompanyName || '',
    companySubtitle: settings.companySubtitle || '',
    companyAddress: settings.companyAddress || '',
    companyPhone: settings.companyPhone || '',
    companyEconomicCode: settings.companyEconomicCode || '',
    companyWebsite: settings.companyWebsite || '',
  });
  const patch = (u: Partial<ProformaTemplate>) => setTpl((p) => ({ ...p, ...u }));
  const setColor = (k: keyof ProformaTemplate['colors'], v: string) => setTpl((p) => ({ ...p, colors: { ...p.colors, [k]: v } }));

  // ---- preview ----
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.7);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, Math.max(0.3, (el.clientWidth - 24) / PAPER_W)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const html = useMemo(() => {
    const preview: SystemSettings = { ...settings, ...co, proformaTemplate: tpl };
    const sample = sampleProforma(preview);
    sample.deal.proformaNumber = formatProformaNumber(tpl.numberFormat, tpl.numberStart);
    return buildProformaHtml({ ...sample, template: tpl }, 'design');
  }, [settings, co, tpl]);

  // Dragging a section or header item directly on the preview.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.data?.type !== 'pf-reorder') return;
      const { kind, from, to } = e.data as { kind: 'sec' | 'hdr'; from: string; to: string };
      if (kind === 'sec') {
        setTpl((p) => {
          const ids = p.sections.map((s) => s.id);
          const next = move(ids, ids.indexOf(from as ProformaSectionId), ids.indexOf(to as ProformaSectionId));
          return { ...p, sections: next.map((id) => p.sections.find((s) => s.id === id)!) };
        });
      } else {
        setTpl((p) => ({ ...p, headerOrder: move(p.headerOrder, p.headerOrder.indexOf(from as ProformaHeaderItem), p.headerOrder.indexOf(to as ProformaHeaderItem)) }));
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const uploadLogo = (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      window.alert('حجم لوگو باید کمتر از ۲ مگابایت باشد.');
      return;
    }
    const r = new FileReader();
    r.onload = (e) => e.target?.result && patch({ logoUrl: e.target.result as string });
    r.readAsDataURL(file);
  };

  const save = () => {
    onSave({ ...co, proformaTemplate: tpl });
    onClose();
  };

  const sectionIds = tpl.sections.map((s) => s.id);

  return (
    <div dir="rtl" className="fixed inset-0 z-[70] bg-[#F3ECE6] flex flex-col text-right">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-[#EBDBCE]">
        <div>
          <h3 className="font-black text-sm text-[#3A241F]">طراحی قالب پیش‌فاکتور</h3>
          <p className="text-[10px] text-[#8C6F66]">بخش‌ها و اجزای سربرگ را روی پیش‌نمایش یا در فهرست بکشید و جابه‌جا کنید.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-black text-[#3A241F] bg-[#FAF5F1] border border-[#EBDBCE] cursor-pointer">انصراف</button>
          <button type="button" onClick={save} className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-black text-white bg-[#6E1B1B] hover:bg-[#561414] cursor-pointer">
            <Save className="w-4 h-4" />
            ذخیرهٔ قالب
          </button>
          <button type="button" onClick={onClose} className="p-2 text-[#8C6F66] cursor-pointer sm:hidden"><X className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        {/* ---------- controls (right side) ---------- */}
        <div className="lg:w-[400px] shrink-0 overflow-y-auto p-3 space-y-3 order-2 lg:order-1 border-t lg:border-t-0 lg:border-l border-[#EBDBCE] bg-[#FBF7F3] max-h-[55vh] lg:max-h-none">
          <Group title="نمونه‌های آماده">
            <div className="grid grid-cols-2 gap-2">
              {PROFORMA_PRESETS.map((p) => {
                const t = presetTemplate(p.id);
                const on = tpl.presetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setTpl((prev) => ({ ...presetTemplate(p.id), logoUrl: prev.logoUrl, footerText: prev.footerText, showLogo: prev.showLogo }))}
                    className={`rounded-xl border p-2 text-[11px] font-black text-[#3A241F] cursor-pointer text-right ${on ? 'border-[#6E1B1B] ring-2 ring-[#6E1B1B]/20 bg-[#F6D9CD]/40' : 'border-[#EBDBCE] bg-white hover:bg-[#FAF5F1]'}`}
                  >
                    <div className="flex h-6 rounded-md overflow-hidden mb-1.5 border border-black/5">
                      <span className="flex-1" style={{ background: t.colors.primary }} />
                      <span className="flex-1" style={{ background: t.colors.accent }} />
                      <span className="flex-1" style={{ background: t.colors.tableHead }} />
                      <span className="flex-1" style={{ background: t.colors.soft }} />
                    </div>
                    {p.name}
                  </button>
                );
              })}
            </div>
          </Group>

          <Group title="ترتیب بخش‌ها (بکشید)">
            <OrderList
              items={sectionIds}
              label={(id) => SECTION_LABELS[id]}
              visible={(id) => !!tpl.sections.find((s) => s.id === id)?.visible}
              onToggle={(id) => setTpl((p) => ({ ...p, sections: p.sections.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)) }))}
              onChange={(ids) => setTpl((p) => ({ ...p, sections: ids.map((id) => p.sections.find((s) => s.id === id)!) }))}
            />
          </Group>

          <Group title="سربرگ">
            <OrderList items={tpl.headerOrder} label={(id) => HEADER_LABELS[id]} onChange={(headerOrder) => patch({ headerOrder })} />
            <div>
              <label className={lab}>سبک سربرگ</label>
              <select className={input} value={tpl.headerStyle} onChange={(e) => patch({ headerStyle: e.target.value as ProformaTemplate['headerStyle'] })}>
                <option value="band">نوار رنگی بالا</option>
                <option value="plain">ساده با خط زیر</option>
                <option value="boxed">کادر رنگی</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lab}>عنوان</label>
                <input className={input} value={tpl.title} onChange={(e) => patch({ title: e.target.value })} />
              </div>
              <div>
                <label className={lab}>عنوان انگلیسی (اختیاری)</label>
                <input className={input} dir="ltr" value={tpl.titleEn} onChange={(e) => patch({ titleEn: e.target.value })} />
              </div>
            </div>
          </Group>

          <Group title="لوگو">
            <label className="flex items-center gap-2 text-[11px] font-bold text-[#3A241F]">
              <input type="checkbox" checked={tpl.showLogo} onChange={(e) => patch({ showLogo: e.target.checked })} />
              نمایش لوگو
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-black text-white bg-[#6E1B1B] cursor-pointer">
                <Upload className="w-4 h-4" />
                {tpl.logoUrl ? 'تغییر لوگو' : 'بارگذاری لوگو'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
              </label>
              {tpl.logoUrl && (
                <button type="button" onClick={() => patch({ logoUrl: undefined })} className="flex items-center gap-1 px-3 py-2 rounded-xl text-[11px] font-black text-rose-600 bg-rose-50 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                  حذف
                </button>
              )}
            </div>
            <p className="text-[10px] text-[#8C6F66]">{tpl.logoUrl ? 'لوگوی مخصوص پیش‌فاکتور استفاده می‌شود.' : 'تا لوگوی جدیدی بارگذاری نکنید، لوگوی رسمی سازمان استفاده می‌شود.'}</p>
            <div>
              <label className={lab}>اندازهٔ لوگو: {tpl.logoSize} میلی‌متر</label>
              <input type="range" min={8} max={40} value={tpl.logoSize} onChange={(e) => patch({ logoSize: +e.target.value })} className="w-full" />
            </div>
          </Group>

          <Group title="مشخصات شرکت">
            {([
              ['proformaCompanyName', 'نام شرکت روی پیش‌فاکتور'],
              ['companySubtitle', 'عنوان فرعی'],
              ['companyAddress', 'نشانی'],
              ['companyPhone', 'تلفن'],
              ['companyEconomicCode', 'کد اقتصادی / شناسهٔ ملی'],
              ['companyWebsite', 'وب‌سایت'],
            ] as const).map(([k, t]) => (
              <div key={k}>
                <label className={lab}>{t}</label>
                <input className={input} value={co[k] || ''} onChange={(e) => setCo((p) => ({ ...p, [k]: e.target.value }))} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {([
                ['address', 'نشانی در سربرگ'],
                ['phone', 'تلفن در سربرگ'],
                ['economicCode', 'کد اقتصادی در سربرگ'],
                ['website', 'وب‌سایت در سربرگ'],
              ] as const).map(([k, t]) => (
                <label key={k} className="flex items-center gap-1.5 text-[11px] font-bold text-[#3A241F]">
                  <input type="checkbox" checked={tpl.contact[k]} onChange={(e) => patch({ contact: { ...tpl.contact, [k]: e.target.checked } })} />
                  {t}
                </label>
              ))}
            </div>
          </Group>

          <Group title="رنگ‌بندی">
            <p className="text-[10px] text-[#8C6F66]">یک پالت آماده را بزنید، بعد اگر خواستید هر رنگ را جدا تغییر بدهید.</p>
            <div className="grid grid-cols-3 gap-2">
              {PROFORMA_PALETTES.map((pl) => {
                const on = (['primary', 'accent', 'tableHead', 'soft'] as const).every((k) => pl.colors[k].toLowerCase() === tpl.colors[k].toLowerCase());
                return (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => setTpl((p) => ({ ...p, colors: { ...pl.colors } }))}
                    className={`rounded-xl border p-1.5 text-[10px] font-black text-[#3A241F] cursor-pointer ${on ? 'border-[#6E1B1B] ring-2 ring-[#6E1B1B]/20 bg-[#F6D9CD]/40' : 'border-[#EBDBCE] bg-white hover:bg-[#FAF5F1]'}`}
                  >
                    <div className="flex h-5 rounded-md overflow-hidden mb-1 border border-black/5">
                      <span className="flex-1" style={{ background: pl.colors.primary }} />
                      <span className="flex-1" style={{ background: pl.colors.accent }} />
                      <span className="flex-1" style={{ background: pl.colors.tableHead }} />
                      <span className="flex-1" style={{ background: pl.colors.soft }} />
                    </div>
                    {pl.name}
                  </button>
                );
              })}
            </div>
            <ColorField label="رنگ اصلی (عنوان‌ها و کادرها)" value={tpl.colors.primary} onChange={(v) => setColor('primary', v)} />
            <ColorField label="رنگ مکمل (خط‌ها و تأکید)" value={tpl.colors.accent} onChange={(v) => setColor('accent', v)} />
            <ColorField label="سرستون جدول" value={tpl.colors.tableHead} onChange={(v) => setColor('tableHead', v)} />
            <ColorField label="نوشتهٔ سرستون" value={tpl.colors.tableHeadText} onChange={(v) => setColor('tableHeadText', v)} />
            <ColorField label="زمینهٔ برگه" value={tpl.colors.paper} onChange={(v) => setColor('paper', v)} />
            <ColorField label="زمینهٔ کادرها و ردیف‌های راه‌راه" value={tpl.colors.soft} onChange={(v) => setColor('soft', v)} />
            <ColorField label="رنگ متن" value={tpl.colors.text} onChange={(v) => setColor('text', v)} />
          </Group>

          <Group title="ظاهر">
            <div>
              <label className={lab}>اندازهٔ نوشته: {tpl.fontSize}</label>
              <input type="range" min={10} max={14} step={0.5} value={tpl.fontSize} onChange={(e) => patch({ fontSize: +e.target.value })} className="w-full" />
            </div>
            <div>
              <label className={lab}>گردی گوشه‌ها: {tpl.radius}</label>
              <input type="range" min={0} max={22} value={tpl.radius} onChange={(e) => patch({ radius: +e.target.value })} className="w-full" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={lab}>سبک جدول</label>
                <select className={input} value={tpl.tableStyle} onChange={(e) => patch({ tableStyle: e.target.value as ProformaTemplate['tableStyle'] })}>
                  <option value="striped">راه‌راه</option>
                  <option value="lined">خط‌دار</option>
                  <option value="grid">شبکه‌ای</option>
                </select>
              </div>
              <div>
                <label className={lab}>جای جمع کل</label>
                <select className={input} value={tpl.totalsAlign} onChange={(e) => patch({ totalsAlign: e.target.value as ProformaTemplate['totalsAlign'] })}>
                  <option value="start">سمت راست</option>
                  <option value="end">سمت چپ</option>
                </select>
              </div>
            </div>
          </Group>

          <Group title="شمارهٔ پیش‌فاکتور">
            <div>
              <label className={lab}>قالب شماره</label>
              <input className={input} dir="ltr" value={tpl.numberFormat} onChange={(e) => patch({ numberFormat: e.target.value })} placeholder="PF-{YYYY}-{NNNN}" />
              <p className="text-[10px] text-[#8C6F66] mt-1 leading-5">
                {'{YYYY}'} سال شمسی چهاررقمی، {'{YY}'} دورقمی، {'{NNNN}'} شمارهٔ ترتیبی (هر N یک رقم). مثلاً INV-{'{YY}'}-{'{NNN}'}
              </p>
            </div>
            <div>
              <label className={lab}>شمارهٔ ترتیبی اولین پیش‌فاکتور</label>
              <input className={input} type="number" min={0} value={tpl.numberStart} onChange={(e) => patch({ numberStart: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
            </div>
            <div className="text-[11px] font-bold text-[#3A241F]">
              نمونه: <span dir="ltr" className="font-mono bg-[#FAF5F1] border border-[#EBDBCE] rounded-lg px-2 py-0.5">{formatProformaNumber(tpl.numberFormat, tpl.numberStart)}</span>
            </div>
          </Group>

          <Group title="پاورقی">
            <div>
              <label className={lab}>متن پاورقی</label>
              <input className={input} value={tpl.footerText} onChange={(e) => patch({ footerText: e.target.value })} placeholder="مثلاً: با تشکر از اعتماد شما" />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-[#3A241F]">
              <input type="checkbox" checked={tpl.showFooterContact} onChange={(e) => patch({ showFooterContact: e.target.checked })} />
              مشخصات تماس شرکت در پاورقی
            </label>
          </Group>
        </div>

        {/* ---------- live preview ---------- */}
        <div ref={box} className="flex-1 min-w-0 min-h-[40vh] overflow-auto p-3 order-1 lg:order-2">
          <div className="mx-auto shadow-2xl bg-white" style={{ width: PAPER_W * scale, height: PAPER_H * scale }}>
            <iframe
              ref={frame}
              title="پیش‌نمایش پیش‌فاکتور"
              srcDoc={html}
              style={{ width: PAPER_W, height: PAPER_H, border: 0, transform: `scale(${scale})`, transformOrigin: 'top right', display: 'block' }}
            />
          </div>
          <p className="text-center text-[10px] text-[#8C6F66] mt-2">این پیش‌نمایش با اطلاعات نمونه است. بخش‌ها را روی خود برگه بکشید تا جابه‌جا شوند.</p>
        </div>
      </div>
    </div>
  );
};
