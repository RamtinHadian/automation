/**
 * Follow-up rules for an opportunity: a ready sequence of reminders (a day count after the start day, and what to do at that step).
 * They are the well-known cadences that sales trainers teach (a few contacts spread over a week, a month…): the idea behind all of them is the same —
 * most sales are not closed on the first contact, so every opportunity gets several planned, spaced follow-ups with something new to say each time.
 */
export interface FollowUpStep { day: number; what: string }
export interface FollowUpRule { id: string; name: string; when: string; steps: FollowUpStep[] }

export const FOLLOW_UP_RULES: FollowUpRule[] = [
  {
    id: '1-3-7',
    name: 'قانون ۱ - ۳ - ۷',
    when: 'پیگیری سریع و فشرده در یک هفتهٔ اول؛ مناسب مشتری گرم (تازه قیمت یا پیش‌فاکتور گرفته).',
    steps: [
      { day: 1, what: 'تماس کوتاه: مطمئن شوید پیام یا قیمت رسیده و بپرسید سؤالی دارد.' },
      { day: 3, what: 'یک ارزش تازه بدهید (مقایسه، نمونه، تجربهٔ مشتری دیگر) و ببینید مانعش چیست.' },
      { day: 7, what: 'درخواست تصمیم: گام بعدی را پیشنهاد کنید (سفارش، جلسه، تأیید پیش‌فاکتور).' },
    ],
  },
  {
    id: '1-3-7-14-30',
    name: 'پیگیری ۵ مرحله‌ای در یک ماه (۱ - ۳ - ۷ - ۱۴ - ۳۰)',
    when: 'برای فروش‌هایی که زمان می‌برند؛ پنج تماس برنامه‌ریزی‌شده تا آخر ماه.',
    steps: [
      { day: 1, what: 'تماس تشکر و اطمینان از دریافت پیشنهاد.' },
      { day: 3, what: 'نیاز و مانع را بپرسید؛ سؤال باز بپرسید، نه فقط «تصمیم گرفتید؟».' },
      { day: 7, what: 'پیام ارزشمند بفرستید (مقایسه قیمت و کیفیت، نمونهٔ کار، گارانتی).' },
      { day: 14, what: 'تماس تصمیم‌گیری: بپرسید چه چیزی مانده تا بخرند و اگر لازم است شرط یا زمان‌بندی را مذاکره کنید.' },
      { day: 30, what: 'آخرین پیگیری ماه: پیشنهاد نهایی یا زمان تماس بعدی را روشن کنید؛ اگر نمی‌خرند، دلیل را بنویسید.' },
    ],
  },
  {
    id: '2-5-10',
    name: 'بعد از پیش‌فاکتور (۲ - ۵ - ۱۰)',
    when: 'وقتی پیش‌فاکتور فرستاده‌اید و منتظر پاسخ هستید.',
    steps: [
      { day: 2, what: 'بپرسید پیش‌فاکتور را دیده‌اند و اقلام و قیمت برایشان روشن است.' },
      { day: 5, what: 'اعتراض‌ها را بشنوید (قیمت، زمان تحویل، شرایط پرداخت) و راه‌حل بدهید.' },
      { day: 10, what: 'پیگیری نهایی پیش‌فاکتور: اعتبار آن را یادآوری کنید و تصمیم را بخواهید.' },
    ],
  },
  {
    id: 'same-day',
    name: 'فوری: همان روز و فردا',
    when: 'برای مشتری که همین الان تماس گرفته یا پیام داده؛ سرعت پاسخ مهم‌ترین چیز است.',
    steps: [
      { day: 0, what: 'همان روز: پاسخ بدهید و قیمت یا اطلاعات خواسته‌شده را بفرستید.' },
      { day: 1, what: 'فردا: ببینید رسیده و سؤال دارند؛ زمان تماس بعدی را هماهنگ کنید.' },
    ],
  },
  {
    id: '7-14-30',
    name: 'پیگیری آرام (۷ - ۱۴ - ۳۰)',
    when: 'مشتری مردد یا خرید دیرهنگام؛ بدون فشار، ولی فراموش نشود.',
    steps: [
      { day: 7, what: 'حال‌وهوای مشتری را بپرسید؛ فشار نیاورید، یک نکتهٔ مفید بگویید.' },
      { day: 14, what: 'یک خبر یا پیشنهاد تازه بدهید (تخفیف زمان‌دار، موجود شدن کالا، محصول جدید).' },
      { day: 30, what: 'پیگیری ماهانه: دوباره نیاز را بسنجید و تصمیم بعدی را بپرسید.' },
    ],
  },
  {
    id: '30-60-90',
    name: 'مشتری سرد یا از دست رفته (۳۰ - ۶۰ - ۹۰)',
    when: 'برای فرصتی که ساکت شده؛ سه یادآوری دور برای بازگرداندن.',
    steps: [
      { day: 30, what: 'تماس دوستانه: بپرسید هنوز نیاز دارند و چه چیزی تغییر کرده است.' },
      { day: 60, what: 'پیشنهاد تازه یا دلیلی برای شروع دوباره (قیمت جدید، موجودی، خدمت تازه).' },
      { day: 90, what: 'آخرین تلاش: صادقانه بپرسید چه شد؛ پاسخ را در فرصت ثبت کنید و پروندهٔ مشتری را بروز کنید.' },
    ],
  },
];

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The day of each step: `start` plus the day count; a Friday (the weekly day off) moves to Saturday when `skipFriday`. */
export function followUpDates(rule: FollowUpRule, start: string, skipFriday = true): string[] {
  const base = new Date(`${start}T12:00:00`);
  return rule.steps.map((s) => {
    const d = new Date(base.getTime() + s.day * 86400000);
    if (skipFriday && d.getDay() === 5) d.setDate(d.getDate() + 1);
    return toIso(d);
  });
}
