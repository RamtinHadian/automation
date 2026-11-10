/** One place for every error the user must see: shown as a red pop-up above everything (see ErrorPopups). */
type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

export const subscribeErrors = (l: Listener) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const showError = (msg: string) => {
  const m = (msg || '').trim();
  if (m) listeners.forEach((l) => l(m));
};

/** A toast text that tells the user something went wrong (not a success note). */
const isErrorText = (msg: string) =>
  !/با موفقیت|موفق\b|انجام شد|ذخیره شد|ارسال شد\b|گردید|منتقل شد|بازگردانده شد|حذف شد|دریافت شد/.test(msg) && /خطا|نیست|نشد|بیش از سقف|اول |فقط |ممکن نیست|نادرست|ناموفق|نامعتبر|مجاز نیست|نمی‌توان|نمی‌تواند|الزامی|لطفاً|باید |قطع|مسدود|تکراری|failed|error/i.test(msg);

/** A toast text that tells the user something went wrong. A file name or a quoted title inside the text does not decide (the name «…خطاب به…» once made a success note look like an error). */
export const looksLikeError = (msg: string) => isErrorText(msg.replace(/"[^"]*"|«[^»]*»/g, ' '));

let installed = false;
/** Alerts, unhandled failures and script errors all become the same red pop-up. */
export function installGlobalErrorHandlers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.alert = (m?: unknown) => showError(String(m ?? ''));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    const text = r instanceof Error ? r.message : typeof r === 'string' ? r : '';
    showError(/failed to fetch|networkerror|load failed/i.test(text) ? 'ارتباط با سرور برقرار نشد؛ اینترنت یا وضعیت سرور را بررسی کنید.' : text || 'خطای ناشناخته‌ای رخ داد.');
  });
}
