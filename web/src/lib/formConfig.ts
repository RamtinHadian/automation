/** What the management console decides about one form (fields are named by the text of their label). */
export interface FormCfg {
  /** fields that do not exist in the form at all */
  hidden?: string[];
  /** fields that must be filled before the form can be saved */
  required?: string[];
  /** «after this field, Enter goes to that field» */
  enterTo?: Record<string, string>;
  /** Enter in a one-line field walks on to the next field (instead of saving the form) */
  enterNext?: boolean;
}

/**
 * What is required until the administrator saves his own choice of a form (the same as the rules the form had before the console could
 * decide). Once he ticks anything, his list is the only list: unticking a field really removes the requirement.
 */
export const DEFAULT_REQUIRED: Record<string, string[]> = { customer: ['موبایل‌ها', 'منبع آشنایی'], field: ['نام و نام خانوادگی', 'موبایل'] };

/** The fields of the short registration form (the marketer's page /field and the web-site form /lead); the label is the key of the console's tuning. */
export const FIELD_FORM = {
  name: 'نام و نام خانوادگی',
  phone: 'موبایل',
  company: 'شرکت / فروشگاه',
  city: 'شهر',
  event: 'نمایشگاه / محل ثبت',
  note: 'توضیحات و علاقه‌مندی',
} as const;
export const requiredOf = (cfg: FormCfg | undefined, formId: string): string[] => cfg?.required ?? DEFAULT_REQUIRED[formId] ?? [];

/** The forms that can be tuned (each one carries data-form-id with this id). */
export const TUNABLE_FORMS: { id: string; title: string; hint: string }[] = [
  { id: 'field', title: 'ثبت سریع مشتری (صفحهٔ بازاریاب میدانی و فرم سایت)', hint: 'کدام فیلدها باشند و کدام اجباری باشند؛ نام و موبایل همیشه هستند' },
  { id: 'customer', title: 'مشتری جدید / ویرایش مشتری', hint: 'فیلدهای تعریف مشتری، اجباری‌ها و ترتیب Enter' },
  { id: 'deal', title: 'فرصت فروش جدید / ویرایش فرصت', hint: 'فیلدهای فرصت (کد کالا، تعداد، قیمت‌ها، مسئول، یادداشت…)، اجباری‌ها و ترتیب Enter' },
];
