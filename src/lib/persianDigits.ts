// Shows every number in the interface with Persian digits (۰-۹).
//
// A single observer converts the Latin digits of all rendered text, placeholders and tooltips, including
// text that appears later (new screens, live updates, pop-ups). Anything that would be corrupted by a
// rewrite is left alone: what the user types into fields, editable letter content, code, e-mail and web
// addresses, IP addresses and file names.

const LATIN = /[0-9]/g;
const PERSIAN = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
const HAS_DIGIT = /[0-9]/;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'NOSCRIPT']);
const ATTRS = ['placeholder', 'title', 'aria-label'];

const toFa = (s: string) => s.replace(LATIN, (d) => PERSIAN[+d]);

/** Text that must keep its digits: addresses, e-mails, IPs and file names. */
const looksTechnical = (s: string) =>
  /@|https?:\/\/|www\.|\b\d{1,3}(\.\d{1,3}){3}\b|\.(pdf|docx?|xlsx?|pptx?|zip|rar|7z|png|jpe?g|gif|svg|mp[34]|txt|csv|json|exe)\b/i.test(s);

function skipped(node: Node): boolean {
  for (let el: Element | null = node.nodeType === 1 ? (node as Element) : node.parentElement; el; el = el.parentElement) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if ((el as HTMLElement).isContentEditable || el.hasAttribute('data-keep-digits')) return true;
  }
  return false;
}

function convertText(node: Text) {
  const v = node.nodeValue;
  if (!v || !HAS_DIGIT.test(v) || looksTechnical(v) || skipped(node)) return;
  node.nodeValue = toFa(v);
}

function convertAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v && HAS_DIGIT.test(v) && !looksTechnical(v)) el.setAttribute(a, toFa(v));
  }
}

function convertTree(root: Node) {
  if (root.nodeType === 3) return convertText(root as Text);
  if (root.nodeType !== 1) return;
  const el = root as Element;
  if (SKIP_TAGS.has(el.tagName)) {
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') convertAttrs(el);
    return;
  }
  convertAttrs(el);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) convertText(n as Text);
    else convertAttrs(n as Element);
  }
}

export function installPersianDigits() {
  if (typeof document === 'undefined') return;
  const run = () => {
    convertTree(document.body);
    const pending = new Set<Node>();
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      const items = [...pending];
      pending.clear();
      observer.disconnect();
      items.forEach((n) => {
        if (n.isConnected) convertTree(n);
      });
      observe();
    };
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') m.addedNodes.forEach((n) => pending.add(n));
        else pending.add(m.target);
      }
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(flush);
      }
    });
    const observe = () =>
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ATTRS,
      });
    observe();
  };
  if (document.body) run();
  else document.addEventListener('DOMContentLoaded', run, { once: true });
}
