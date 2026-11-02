/**
 * Typing boxes with more than one line (textarea), everywhere in the app:
 *   Enter        = this box is finished (focus goes on to the next field; a box that has its own Enter action, like sending, keeps it)
 *   Shift+Enter  = a new line inside the box
 * A faint hint saying so is written inside every empty box (as its placeholder).
 * A box that really needs Enter for new lines can carry the attribute  data-enter-newline.
 */
const HINT = 'Enter: تأیید · Shift+Enter: خط بعد';
const FOCUSABLE = 'input:not([type=hidden]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]):not([readonly]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

let installed = false;
export function installEnterKey() {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  // bubble phase on the document: the box's own handlers (sending a chat message, saving a note) have already run and said preventDefault
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.defaultPrevented) return;
    const el = e.target as HTMLElement | null;
    if (!el || el.tagName !== 'TEXTAREA' || el.hasAttribute('data-enter-newline')) return;
    const box = el as HTMLTextAreaElement;
    if (box.readOnly || box.disabled) return;
    e.preventDefault();
    const scope = el.closest('[role="dialog"], form, [data-modal]') || document.body;
    const list = Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.offsetParent !== null || x === el);
    const i = list.indexOf(el);
    const next = i >= 0 ? list[i + 1] : undefined;
    if (next) next.focus();
    else box.blur();
  });

  const mark = () => {
    document.querySelectorAll<HTMLTextAreaElement>('textarea:not([data-eh]):not([data-enter-newline])').forEach((t) => {
      t.setAttribute('data-eh', '1');
      if (t.readOnly || t.disabled || t.hasAttribute('data-no-hint')) return;
      const own = t.getAttribute('placeholder') || '';
      if (!own.includes('Shift+Enter')) t.setAttribute('placeholder', own ? `${own} — ${HINT}` : HINT);
    });
  };
  let scheduled = false;
  const obs = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; mark(); });
  });
  const run = () => { mark(); obs.observe(document.body, { childList: true, subtree: true }); };
  if (document.body) run(); else document.addEventListener('DOMContentLoaded', run, { once: true });
}
