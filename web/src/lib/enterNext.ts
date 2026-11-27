import type React from 'react';

const FIELDS = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button]),select,textarea';

/**
 * Enter goes to the next field instead of doing whatever the form does on Enter (like saving too early).
 * Put it as onKeyDown on the box that holds the fields (a dialog, a form): it walks the fields of that box in page order.
 * A multi-line box (textarea), the last field and anything outside the box are left alone; Shift+Enter and the Enter of an input method keep working.
 */
export function enterNextKeyDown(e: React.KeyboardEvent<HTMLElement>) {
  if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.nativeEvent.isComposing) return;
  const t = e.target as HTMLElement;
  if (!t || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || !t.matches(FIELDS)) return;
  const list = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FIELDS)).filter((el) => !(el as HTMLInputElement).disabled && !(el as HTMLInputElement).readOnly && el.offsetParent !== null && el.tabIndex !== -1);
  const at = list.indexOf(t);
  if (at < 0) return; // the field is in another window (a picker) or hidden
  e.preventDefault();
  const next = list[at + 1];
  if (next) {
    next.focus();
    if (next.tagName === 'INPUT') (next as HTMLInputElement).select?.();
  }
}
