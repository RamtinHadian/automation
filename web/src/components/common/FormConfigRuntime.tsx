import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../../context/AppContext';
import { FormCfg, requiredOf } from '../../lib/formConfig';

/**
 * The forms of the app can be tuned from the management console: which fields exist, which are required, and where Enter goes from a field.
 * A form takes part by carrying  data-form-id="<name>"  on its <form> tag. This component (mounted once at the top of the app) finds such
 * forms in the page, and
 *   - normal mode: hides the fields the administrator switched off, adds the red star and blocks saving while a required field is empty,
 *     and makes Enter go where the administrator said (or on to the next field);
 *   - design mode (opened from the console): puts a small bar under every field with its three choices, and saves them at once.
 * Fields are recognised by the text of their label, so no form has to list its fields by hand.
 */

type Field = { key: string; container: HTMLElement; label: HTMLElement; controls: HTMLElement[]; bar?: HTMLElement; list?: boolean };
const CONTROLS = 'input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]),select,textarea';

const keyOf = (label: HTMLElement) => (label.textContent || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();

function scan(form: HTMLFormElement): Field[] {
  const out: Field[] = [];
  const seen = new Map<string, number>();
  form.querySelectorAll<HTMLElement>('label').forEach((label) => {
    if (label.closest('[data-design-bar]')) return;
    const container = label.parentElement;
    if (!container || container === form) return;
    // a tick box (or any control) wrapped in its own label is not a field here
    if (label.querySelector('input, select, textarea')) return;
    const controls = Array.from(container.querySelectorAll<HTMLElement>(CONTROLS)).filter((c) => !c.closest('[data-design-bar]'));
    if (controls.length === 0) return;
    // a shared parent (a grid holding several fields, each with its own label) must never be treated as one field: hiding it would hide them all
    const siblings = Array.from(container.children).filter((k) => k.tagName === 'LABEL' && !k.hasAttribute('data-design-bar') && !(k as HTMLElement).querySelector('input, select, textarea'));
    if (siblings.length > 1 || container.children.length > 6) return;
    const base = keyOf(label);
    if (!base) return;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    out.push({ key: n > 1 ? `${base} #${n}` : base, container, label, controls });
  });
  // boxes that hold a list (the mobile numbers, the landlines) carry data-fc-field="name": they can be hidden and can be a target of Enter
  form.querySelectorAll<HTMLElement>('[data-fc-field]').forEach((box) => {
    const key = box.getAttribute('data-fc-field') || '';
    const controls = Array.from(box.querySelectorAll<HTMLElement>(CONTROLS)).filter((c) => !c.closest('[data-design-bar]') && (c as HTMLInputElement).type !== 'radio');
    // data-fc-single: a box that holds ONE field (like the title of an opportunity, whose input sits outside any label), not a list of entries
    if (key && controls.length) out.push({ key, container: box, label: box.querySelector<HTMLElement>('[data-fc-title]') || box, controls, list: !box.hasAttribute('data-fc-single') });
  });
  out.sort((a, b) => (a.container.compareDocumentPosition(b.container) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  return out;
}

const isEmpty = (el: HTMLElement) => !(el as HTMLInputElement).value || !(el as HTMLInputElement).value.trim();

const Bar: React.FC<{ field: Field; fields: Field[]; cfg: FormCfg; formId: string; update: (f: (c: FormCfg) => FormCfg) => void }> = ({ field, fields, cfg, formId, update }) => {
  const hidden = (cfg.hidden || []).includes(field.key);
  const required = requiredOf(cfg, formId).includes(field.key);
  const toggle = (list: 'hidden' | 'required', on: boolean) => update((c) => {
    const cur = (list === 'required' ? requiredOf(c, formId) : c[list] || []).filter((k) => k !== field.key);
    return { ...c, [list]: on ? [...cur, field.key] : cur };
  });
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-violet-50 border border-violet-200 px-2 py-1 text-[10.5px] font-black text-violet-900" dir="rtl">
      <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" className="accent-violet-600" checked={!hidden} onChange={(e) => toggle('hidden', !e.target.checked)} />نمایش</label>
      <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" className="accent-violet-600" checked={required} disabled={hidden} onChange={(e) => toggle('required', e.target.checked)} />اجباری</label>
      <label className="flex items-center gap-1">Enter برود به:
        <select className="border border-violet-200 rounded-md bg-white px-1 py-0.5 text-[10.5px] font-bold max-w-[150px]" value={(cfg.enterTo || {})[field.key] || ''} onChange={(e) => update((c) => {
          const m = { ...(c.enterTo || {}) };
          if (e.target.value) m[field.key] = e.target.value; else delete m[field.key];
          return { ...c, enterTo: m };
        })}>
          <option value="">فیلد بعدی (پیش‌فرض)</option>
          {fields.filter((f) => f.key !== field.key).map((f) => <option key={f.key} value={f.key}>{f.key}</option>)}
        </select>
      </label>
    </div>
  );
};

export const FormConfigRuntime: React.FC = () => {
  const { settings, setSettings } = useAppContext();
  const [design, setDesign] = useState<string | null>(null);
  const [, bump] = useState(0);
  const forms = useRef<Map<HTMLFormElement, Field[]>>(new Map());
  const cfgRef = useRef<Record<string, FormCfg>>({});
  const designRef = useRef<string | null>(null);
  cfgRef.current = settings.formConfig || {};
  designRef.current = design;

  useEffect(() => {
    const on = (e: Event) => setDesign((e as CustomEvent<string | null>).detail || null);
    window.addEventListener('hoormand-form-design', on);
    return () => window.removeEventListener('hoormand-form-design', on);
  }, []);

  const update = useCallback((formId: string, f: (c: FormCfg) => FormCfg) => {
    setSettings((prev) => ({ ...prev, formConfig: { ...(prev.formConfig || {}), [formId]: f((prev.formConfig || {})[formId] || {}) } }));
  }, [setSettings]);

  const apply = useCallback(() => {
    const live = new Set<HTMLFormElement>();
    document.querySelectorAll<HTMLFormElement>('form[data-form-id]').forEach((form) => {
      live.add(form);
      const id = form.getAttribute('data-form-id') || '';
      const cfg = cfgRef.current[id] || {};
      const isDesign = designRef.current === id;
      const fields = scan(form);
      forms.current.set(form, fields);
      for (const f of fields) {
        const hidden = (cfg.hidden || []).includes(f.key);
        const required = requiredOf(cfg, id).includes(f.key) && !hidden;
        f.container.style.display = hidden && !isDesign ? 'none' : '';
        f.container.style.opacity = hidden && isDesign ? '0.45' : '';
        // the red star of a required field
        const starHost = f.list ? (f.container.querySelector<HTMLElement>('[data-fc-title]') || f.label) : f.label;
        const star = starHost.querySelector('[data-fc-star]');
        if (required && !star) {
          const s = document.createElement('span');
          s.setAttribute('data-fc-star', '1');
          s.className = 'text-rose-600';
          s.textContent = ' *';
          starHost.appendChild(s);
        } else if (!required && star) star.remove();
        // the bar of design mode
        let bar = f.container.querySelector<HTMLElement>(':scope > [data-design-bar]');
        if (isDesign && !bar) {
          bar = document.createElement('div');
          bar.setAttribute('data-design-bar', '1');
          f.container.appendChild(bar);
        } else if (!isDesign && bar) bar.remove();
        f.bar = bar || undefined;
      }
      if (!form.hasAttribute('data-fc-bound')) {
        form.setAttribute('data-fc-bound', '1');
        // saving is blocked while a required field is empty
        form.addEventListener('submit', (e) => {
          if (designRef.current === id) { e.preventDefault(); e.stopImmediatePropagation(); return; }
          const c = cfgRef.current[id] || {};
          const fs = forms.current.get(form) || [];
          const bad = fs.filter((f) => !f.list && requiredOf(c, id).includes(f.key) && !(c.hidden || []).includes(f.key) && f.container.style.display !== 'none' && f.controls.every(isEmpty));
          form.querySelectorAll<HTMLElement>('[data-fc-error]').forEach((n) => n.remove());
          form.querySelectorAll<HTMLElement>('.fc-bad').forEach((n) => n.classList.remove('fc-bad'));
          if (bad.length) {
            e.preventDefault();
            e.stopImmediatePropagation();
            for (const f of bad) {
              f.controls[0].classList.add('fc-bad');
              f.controls[0].style.outline = '2px solid #e11d48';
              const m = document.createElement('div');
              m.setAttribute('data-fc-error', '1');
              m.className = 'text-[11px] font-bold text-rose-700 mt-1';
              m.textContent = 'این فیلد اجباری است.';
              f.container.appendChild(m);
            }
            bad[0].controls[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
            bad[0].controls[0].focus();
          }
        }, true);
        // Enter goes where the administrator said, or on to the next field
        form.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
          if (designRef.current === id) return;
          const t = e.target as HTMLElement;
          if (!t || t.tagName === 'BUTTON' || t.tagName === 'TEXTAREA' || t.closest('[data-design-bar]')) return;
          if (t.tagName !== 'INPUT') return;
          const c = cfgRef.current[id] || {};
          const fs = forms.current.get(form) || [];
          const cur = fs.find((f) => f.controls.includes(t));
          if (!cur) return;
          if (cur.list && (t as HTMLInputElement).value.trim()) return;
          let target: HTMLElement | undefined;
          const to = (c.enterTo || {})[cur.key];
          if (to) target = fs.find((f) => f.key === to && f.container.style.display !== 'none')?.controls[0];
          else if (c.enterNext) {
            const i = fs.indexOf(cur);
            target = fs.slice(i + 1).find((f) => f.container.style.display !== 'none')?.controls[0];
          }
          if (!target) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          target.focus();
          if (target.tagName === 'INPUT') (target as HTMLInputElement).select?.();
        }, true);
      }
    });
    for (const f of Array.from(forms.current.keys())) if (!live.has(f)) forms.current.delete(f);
    bump((n) => n + 1);
  }, []);

  useEffect(() => {
    let raf = 0;
    const run = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); };
    const mo = new MutationObserver((list) => {
      // our own bars, stars and messages must not start another scan
      if (list.every((m) => Array.from(m.addedNodes).concat(Array.from(m.removedNodes)).every((n) => n instanceof HTMLElement && (n.hasAttribute('data-design-bar') || n.hasAttribute('data-fc-error') || n.hasAttribute('data-fc-star')) ))) return;
      run();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    run();
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, [apply]);
  useEffect(() => { apply(); }, [settings.formConfig, design, apply]);

  const portals: React.ReactNode[] = [];
  if (design) {
    forms.current.forEach((fields, form) => {
      const id = form.getAttribute('data-form-id') || '';
      if (id !== design) return;
      const cfg = cfgRef.current[id] || {};
      for (const f of fields) if (f.bar) portals.push(createPortal(<Bar field={f} fields={fields} cfg={cfg} formId={id} update={(fn) => update(id, fn)} />, f.bar, `${id}:${f.key}`));
    });
  }
  return <>{portals}</>;
};
