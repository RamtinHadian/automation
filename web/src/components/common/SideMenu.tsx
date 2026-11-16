import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { LogOut } from 'lucide-react';
import { playMenuPop } from '../../lib/menuSound';

/**
 * The styled menus of the page (a computer only). SideMenu: the vertical layout (off by default, chosen per person in the header): the main
 * menus in a narrow rail on the right edge, from top to bottom, the open menu's sub-menus in a panel on its left. TopMenu: the same look laid
 * out horizontally under the header: the main menus in a bar, the open menu's sub-menus in a darker bar under it. In both, the open sub-menu is a
 * light tab that melts into the page.
 *
 * They build themselves from the page's own buttons (the main-menu bar [data-main-menu] and the first sub-menu bar [data-subtabs]) and click
 * them, so every menu and every sub-menu works as before and nothing in the pages had to change. The originals are hidden while these are on.
 */
interface Item {
  key: string;
  icon: string;
  label: string;
  /** the whole name (tooltip) */
  full: string;
  active: boolean;
  badge: string;
  count: string;
  el: HTMLElement;
}

/** long names are shortened in the styled menus so every button fits (the full name is the tooltip) */
const SHORT: Record<string, string> = {
  'گارانتی‌های ثبت‌شده': 'گارانتی‌ها',
  'درخواست‌های خرابی': 'خرابی‌ها',
  'پیش‌فاکتورهای ارسالی': 'پیش‌فاکتورها',
  'فرصت‌های فروش': 'فرصت‌ها',
  'باشگاه مشتریان': 'باشگاه',
  'پیامک گروهی': 'پیامک',
  'ارسال و دریافت فایل‌ها': 'فایل‌ها',
  'مرخصی و مساعده': 'مرخصی',
  'گزارش‌های روزانه': 'گزارش روزانه',
  'فاکتورهای فروش': 'فاکتورها',
  'دستورهای اداری': 'دستورها',
  'تابلو اعلانات': 'اعلانات',
};

const read = (container: Element | null, activeTest: (b: HTMLElement) => boolean): Item[] => {
  if (!container) return [];
  const out: Item[] = [];
  Array.from(container.children).forEach((c, i) => {
    if (!(c instanceof HTMLElement) || c.tagName !== 'BUTTON') return;
    const svg = c.querySelector('svg');
    // the name: the label span, or (a button whose name is bare text) its own text without the number badge that sits inside it
    const direct = Array.from(c.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent || '').join('').trim();
    const label = (c.querySelector('span.truncate, span:not([class*="rounded-full"]):not([data-count]):not([data-customer-count])') as HTMLElement | null)?.textContent?.trim() || direct || c.getAttribute('title') || c.textContent?.trim() || '';
    const badge = (c.querySelector('span[class*="rounded-full"]') as HTMLElement | null)?.textContent?.trim() || '';
    const count = (c.querySelector('[data-count], [data-customer-count]') as HTMLElement | null)?.textContent?.trim() || '';
    out.push({ key: `${i}-${label}`, icon: svg ? svg.outerHTML : '', label: SHORT[label] || label, full: label, active: activeTest(c), badge, count, el: c });
  });
  return out;
};

const own = (n: Node | null) => ((n instanceof Element ? n : n?.parentElement) || null)?.closest('[data-menu-own]');

const sig = (l: Item[]) => l.map((i) => `${i.key}|${i.active ? 1 : 0}|${i.badge}|${i.count}|${i.icon.length}`).join(';');

/**
 * The main menus and the sub-menus of the open page, read from the page's own buttons and kept up to date.
 * It draws again only when something it shows changed, and a click lights the chosen button at once (before the page, which may take a while to
 * draw, starts its own work); the page's real button is clicked one frame later.
 */
function useMenuItems() {
  const [mains, setMains] = useState<Item[]>([]);
  const [subs, setSubs] = useState<Item[]>([]);
  const [pending, setPending] = useState<{ main?: string; sub?: string }>({});
  const live = useRef<{ mains: Item[]; subs: Item[]; sm: string; ss: string }>({ mains: [], subs: [], sm: '', ss: '' });

  const sync = useCallback(() => {
    const root = document.querySelector('[data-app-scroll]');
    if (!root) return;
    const m = read(root.querySelector('[data-main-menu]'), (b) => b.className.includes('scale-[1.02]'));
    // the sub-menu bar of the open page: the first one on the page that is not inside a window on top of it
    const bars = Array.from(root.querySelectorAll('[data-subtabs]')).filter((b) => !b.closest('[role="dialog"], .fixed'));
    const bar = bars[0] || null;
    root.querySelectorAll('[data-side-moved]').forEach((e) => e !== bar && e.removeAttribute('data-side-moved'));
    if (bar && !bar.hasAttribute('data-side-moved')) bar.setAttribute('data-side-moved', '');
    const sb = read(bar, (b) => /\bbg-white\b/.test(b.className));
    // the buttons themselves are kept fresh (the page makes new ones), the drawing is redone only for a real change
    live.current.mains = m;
    live.current.subs = sb;
    const sm = sig(m);
    const ss = sig(sb);
    if (sm !== live.current.sm) {
      live.current.sm = sm;
      setMains(m);
      setPending((p) => (p.main && m.find((x) => x.active)?.key === p.main ? { ...p, main: undefined } : p));
    }
    if (ss !== live.current.ss) {
      live.current.ss = ss;
      setSubs(sb);
      setPending((p) => (p.sub && sb.find((x) => x.active)?.key === p.sub ? { ...p, sub: undefined } : p));
    }
  }, []);

  useEffect(() => {
    sync();
    const root = document.querySelector('[data-app-scroll]');
    if (!root) return;
    let raf = 0;
    const mo = new MutationObserver((records) => {
      // what the menu itself draws never starts another round
      if (records.every((r) => own(r.target))) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    });
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], characterData: true });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
      document.querySelectorAll('[data-side-moved]').forEach((e) => e.removeAttribute('data-side-moved'));
    };
  }, [sync]);

  const choose = useCallback((kind: 'main' | 'sub', key: string) => {
    flushSync(() => setPending((p) => (kind === 'main' ? { main: key } : { ...p, sub: key })));
    // the page's own work (it may be heavy) starts after the lit button has been painted
    requestAnimationFrame(() =>
      window.setTimeout(() => {
        const list = kind === 'main' ? live.current.mains : live.current.subs;
        list.find((i) => i.key === key)?.el.click();
      }, 0)
    );
    // if the page never confirms, the highlight goes back to what the page really shows
    window.setTimeout(() => setPending((p) => (kind === 'main' ? { ...p, main: undefined } : { ...p, sub: undefined })), 2500);
  }, []);

  const mainsView = mains.map((m) => (pending.main ? { ...m, active: m.key === pending.main } : m));
  const subsView = subs.map((m) => (pending.sub ? { ...m, active: m.key === pending.sub } : m));
  const domActive = mains.find((m) => m.active);
  return { mains: mainsView, subs: subsView, active: mainsView.find((m) => m.active), domActive, choose };
}

const Sub: React.FC<{ s: Item; i: number; cls: string; pick: (key: string) => void }> = ({ s, i, cls, pick }) => (
  <button type="button" className={`${cls} ${s.active ? 'is-active' : ''}`} style={{ ['--i' as string]: i } as React.CSSProperties} title={s.full} onClick={() => { if (!s.active) { playMenuPop(); pick(s.key); } }}>
    <span className={`${cls}-icon`} dangerouslySetInnerHTML={{ __html: s.icon }} />
    <span className={`${cls}-label`}>{s.label}</span>
    {s.count && <span className={`${cls}-count`}>{s.count}</span>}
    {s.badge && <span className={`${cls}-badge`}>{s.badge}</span>}
  </button>
);

/** the vertical layout */
export const SideMenu: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const { mains, subs, active, domActive, choose } = useMenuItems();
  return (
    <div className="side-menu" dir="rtl" data-side-menu data-menu-own>
      <nav className="side-rail" aria-label="منوی اصلی">
        {mains.map((m) => (
          <button key={m.key} type="button" className={`side-rail-item ${m.active ? 'is-active' : ''}`} onClick={() => { if (!m.active) choose('main', m.key); }} title={m.label} aria-current={m.active ? 'page' : undefined}>
            <span className="side-rail-icon" dangerouslySetInnerHTML={{ __html: m.icon }} />
            <span className="side-rail-label">{m.label}</span>
            {m.badge && <span className="side-rail-badge">{m.badge}</span>}
          </button>
        ))}
        <button type="button" className="side-rail-item side-rail-out" onClick={onLogout} title="خروج از حساب">
          <span className="side-rail-icon"><LogOut /></span>
          <span className="side-rail-label">خروج</span>
        </button>
      </nav>
      <aside className="side-panel" aria-label="زیرمنوها">
        <div className="side-panel-head" key={`h-${domActive?.key || 'none'}`}>
          {active && <span className="side-panel-icon" dangerouslySetInnerHTML={{ __html: active.icon }} />}
          <span className="side-panel-title">{active?.label || 'منو'}</span>
        </div>
        <ul className="side-panel-list" key={domActive?.key || 'none'}>
          {subs.map((s, i) => (
            <li key={s.key} style={{ ['--i' as string]: i } as React.CSSProperties}>
              <Sub s={s} i={i} cls="side-item" pick={(k) => choose('sub', k)} />
            </li>
          ))}
          {subs.length === 0 && <li className="side-panel-empty">این منو زیرمنو ندارد.</li>}
        </ul>
      </aside>
    </div>
  );
};

/** the same look, horizontal: the main menus in a bar, the sub-menus of the open one in a darker bar under it */
export const TopMenu: React.FC = () => {
  const { mains, subs, domActive, choose } = useMenuItems();
  return (
    <div className="top-menu" dir="rtl" data-top-menu data-menu-own>
      <nav className="top-main-wrap" aria-label="منوی اصلی">
        <div className="top-main">
        {mains.map((m) => (
          <button key={m.key} type="button" className={`top-main-item ${m.active ? 'is-active' : ''}`} title={m.full} onClick={() => { if (!m.active) choose('main', m.key); }} aria-current={m.active ? 'page' : undefined}>
            <span className="top-main-icon" dangerouslySetInnerHTML={{ __html: m.icon }} />
            <span className="top-main-label">{m.label}</span>
            {m.badge && <span className="top-main-badge">{m.badge}</span>}
          </button>
        ))}
        </div>
      </nav>
      <div className="top-sub-wrap" key={domActive?.key || 'none'} aria-label="زیرمنوها">
        <div className="top-sub">
          {subs.map((s, i) => (
            <Sub key={s.key} s={s} i={i} cls="top-item" pick={(k) => choose('sub', k)} />
          ))}
        </div>
      </div>
    </div>
  );
};
