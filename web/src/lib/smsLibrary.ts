/** The ready-made SMS texts. The admin chooses in «تنظیمات سیستم ← پیامک» which of them (and which own texts) show up as buttons in the send window.
 *  {name} is replaced by the customer's name when a text is put into the box. */
export interface SmsTemplate {
  key: string;
  group: string;
  label: string;
  text: string;
}

export const SMS_GROUPS = ['فروش و پیش‌فاکتور', 'پیگیری و جلسه', 'پشتیبانی و گارانتی', 'تشکر و مناسبت', 'پرداخت و تحویل'] as const;

export const SMS_LIBRARY: SmsTemplate[] = [
  { key: 'proforma-sent', group: 'فروش و پیش‌فاکتور', label: 'ارسال پیش‌فاکتور', text: 'با سلام و احترام؛ پیش‌فاکتور درخواستی برای شما ارسال شد. لطفاً پس از بررسی اعلام نظر بفرمایید.' },
  { key: 'proforma-expiring', group: 'فروش و پیش‌فاکتور', label: 'یادآوری اعتبار پیش‌فاکتور', text: 'با سلام؛ یادآوری می‌کنیم که اعتبار پیش‌فاکتور ارسالی در حال اتمام است.' },
  { key: 'proforma-expired', group: 'فروش و پیش‌فاکتور', label: 'پایان اعتبار پیش‌فاکتور', text: 'با سلام؛ اعتبار پیش‌فاکتور قبلی به پایان رسیده است. در صورت تمایل، پیش‌فاکتور تازه با قیمت روز برایتان صادر می‌کنیم.' },
  { key: 'offer-ready', group: 'فروش و پیش‌فاکتور', label: 'ارسال پیشنهاد قیمت', text: 'با سلام؛ پیشنهاد قیمت درخواستی شما آماده شد و برایتان ارسال گردید. منتظر نظر شما هستیم.' },
  { key: 'price-change', group: 'فروش و پیش‌فاکتور', label: 'اطلاع تغییر قیمت', text: 'با سلام؛ قیمت برخی کالاها تغییر کرده است. برای دریافت قیمت روز با ما تماس بگیرید.' },
  { key: 'stock-back', group: 'فروش و پیش‌فاکتور', label: 'موجود شدن کالا', text: 'با سلام؛ کالایی که درخواست کرده بودید موجود شد. برای هماهنگی خرید با ما در تماس باشید.' },
  { key: 'stock-none', group: 'فروش و پیش‌فاکتور', label: 'کالا فعلاً موجود نیست', text: 'با سلام؛ کالای درخواستی شما فعلاً موجود نیست. به‌محض تأمین، به شما اطلاع می‌دهیم.' },
  { key: 'welcome', group: 'فروش و پیش‌فاکتور', label: 'خوش‌آمدگویی', text: 'با سلام؛ از آشنایی با شما خوشحالیم. برای هر راهنمایی و سفارش، در خدمت شما هستیم.' },

  { key: 'meeting', group: 'پیگیری و جلسه', label: 'هماهنگی جلسه', text: 'با سلام؛ جلسهٔ هماهنگی فردا در ساعت مقرر برگزار می‌شود. منتظر شما هستیم.' },
  { key: 'meeting-remind', group: 'پیگیری و جلسه', label: 'یادآوری جلسه', text: 'با سلام؛ یادآوری می‌کنیم که امروز با شما جلسه داریم. لطفاً در ساعت تعیین‌شده حضور داشته باشید.' },
  { key: 'meeting-move', group: 'پیگیری و جلسه', label: 'تغییر زمان جلسه', text: 'با سلام؛ به‌دلیل پیش‌آمدن مورد ضروری، زمان جلسه تغییر کرد. لطفاً برای هماهنگی زمان تازه با ما تماس بگیرید.' },
  { key: 'follow-up', group: 'پیگیری و جلسه', label: 'پیگیری درخواست', text: 'با سلام؛ برای پیگیری درخواست قبلی شما تماس گرفتیم. لطفاً در اولین فرصت با ما در تماس باشید.' },
  { key: 'missed-call', group: 'پیگیری و جلسه', label: 'تماس بی‌پاسخ ما', text: 'با سلام؛ تماس گرفتیم و پاسخی دریافت نشد. هر زمان که مناسب بود با ما تماس بگیرید.' },
  { key: 'callback', group: 'پیگیری و جلسه', label: 'تماس مجدد خواهیم گرفت', text: 'با سلام؛ پیام شما را دریافت کردیم و در اولین فرصت با شما تماس می‌گیریم.' },
  { key: 'visit', group: 'پیگیری و جلسه', label: 'هماهنگی بازدید', text: 'با سلام؛ برای هماهنگی بازدید حضوری لطفاً زمان مناسب خود را اعلام بفرمایید.' },
  { key: 'docs-needed', group: 'پیگیری و جلسه', label: 'درخواست مدارک', text: 'با سلام؛ برای ادامهٔ کار، لطفاً مدارک درخواستی را در اولین فرصت ارسال بفرمایید.' },

  { key: 'support-received', group: 'پشتیبانی و گارانتی', label: 'دریافت درخواست پشتیبانی', text: 'با سلام؛ درخواست پشتیبانی شما دریافت شد و کارشناس ما در حال بررسی است.' },
  { key: 'support-done', group: 'پشتیبانی و گارانتی', label: 'پایان درخواست پشتیبانی', text: 'با سلام؛ درخواست پشتیبانی شما انجام شد. اگر مشکل ادامه داشت، لطفاً پاسخ بدهید تا دوباره بررسی شود.' },
  { key: 'support-info', group: 'پشتیبانی و گارانتی', label: 'نیاز به اطلاعات بیشتر', text: 'با سلام؛ برای بررسی درخواست شما به اطلاعات بیشتری نیاز داریم. لطفاً توضیح یا تصویر مشکل را ارسال بفرمایید.' },
  { key: 'plan-expiring', group: 'پشتیبانی و گارانتی', label: 'پایان نزدیک پلن پشتیبانی', text: 'با سلام؛ اشتراک پشتیبانی شما به‌زودی به پایان می‌رسد. برای تمدید با ما تماس بگیرید.' },
  { key: 'warranty-registered', group: 'پشتیبانی و گارانتی', label: 'ثبت گارانتی', text: 'با سلام؛ گارانتی کالای شما ثبت شد. لطفاً گواهی گارانتی را تا پایان دوره نزد خود نگه دارید.' },
  { key: 'warranty-expiring', group: 'پشتیبانی و گارانتی', label: 'پایان نزدیک گارانتی', text: 'با سلام؛ گارانتی کالای شما به‌زودی به پایان می‌رسد. برای بررسی و خدمات پس از آن با ما تماس بگیرید.' },
  { key: 'claim-received', group: 'پشتیبانی و گارانتی', label: 'دریافت کالای خراب', text: 'با سلام؛ کالای شما برای بررسی گارانتی دریافت شد. نتیجه را به‌زودی اطلاع می‌دهیم.' },
  { key: 'claim-done', group: 'پشتیبانی و گارانتی', label: 'آماده تحویل (گارانتی)', text: 'با سلام؛ بررسی گارانتی کالای شما انجام شد و برای تحویل آماده است.' },

  { key: 'thanks-trust', group: 'تشکر و مناسبت', label: 'تشکر از اعتماد', text: 'با سلام؛ از اعتماد شما سپاسگزاریم. در صورت نیاز به راهنمایی با ما تماس بگیرید.' },
  { key: 'thanks-buy', group: 'تشکر و مناسبت', label: 'تشکر از خرید', text: 'با سلام؛ از خرید شما سپاسگزاریم. امیدواریم از آن راضی باشید. هر سؤالی داشتید در خدمتیم.' },
  { key: 'feedback', group: 'تشکر و مناسبت', label: 'درخواست نظر', text: 'با سلام؛ نظر شما برای ما ارزشمند است. لطفاً دربارهٔ تجربهٔ خود از همکاری با ما بنویسید.' },
  { key: 'newyear', group: 'تشکر و مناسبت', label: 'تبریک نوروز', text: 'با سلام؛ فرارسیدن نوروز و سال نو را صمیمانه تبریک می‌گوییم. سالی سرشار از موفقیت برایتان آرزومندیم.' },
  { key: 'holiday', group: 'تشکر و مناسبت', label: 'تعطیلی شرکت', text: 'با سلام؛ به‌مناسبت تعطیلات، شرکت در روزهای اعلام‌شده تعطیل است. درخواست‌ها پس از بازگشایی پیگیری می‌شود.' },
  { key: 'birthday', group: 'تشکر و مناسبت', label: 'تبریک تولد', text: 'با سلام؛ تولدتان مبارک! آرزوی سلامتی و شادکامی برای شما داریم.' },

  { key: 'pay-remind', group: 'پرداخت و تحویل', label: 'یادآوری پرداخت', text: 'با سلام؛ یادآوری می‌کنیم که موعد پرداخت فاکتور شما نزدیک است. لطفاً نسبت به تسویه اقدام فرمایید.' },
  { key: 'pay-received', group: 'پرداخت و تحویل', label: 'دریافت وجه', text: 'با سلام؛ پرداخت شما دریافت شد. سپاس از همکاری شما.' },
  { key: 'pay-late', group: 'پرداخت و تحویل', label: 'پرداخت معوق', text: 'با سلام؛ موعد پرداخت فاکتور شما گذشته است. لطفاً در اولین فرصت نسبت به تسویه اقدام بفرمایید.' },
  { key: 'order-ready', group: 'پرداخت و تحویل', label: 'سفارش آماده است', text: 'با سلام؛ سفارش شما آماده تحویل است. لطفاً برای هماهنگی دریافت یا ارسال با ما تماس بگیرید.' },
  { key: 'order-sent', group: 'پرداخت و تحویل', label: 'سفارش ارسال شد', text: 'با سلام؛ سفارش شما ارسال شد. پس از رسیدن، لطفاً دریافت آن را تأیید بفرمایید.' },
  { key: 'delivery-time', group: 'پرداخت و تحویل', label: 'زمان تحویل', text: 'با سلام؛ سفارش شما در بازهٔ زمانی اعلام‌شده تحویل داده می‌شود. هر تغییری را اطلاع می‌دهیم.' },
];

/** What was in the send window before the admin chose anything (the four texts that always existed). */
export const DEFAULT_SMS_KEYS = ['proforma-sent', 'proforma-expiring', 'thanks-trust', 'meeting'];

export interface CustomSms {
  id: string;
  title: string;
  text: string;
}

/** The buttons of the send window: the chosen ready-made texts first, then the company's own texts. */
export const smsButtons = (library: string[] | null | undefined, custom: CustomSms[] | undefined) => {
  const keys = library ?? DEFAULT_SMS_KEYS;
  const ready = SMS_LIBRARY.filter((t) => keys.includes(t.key)).map((t) => ({ id: t.key, label: t.label, text: t.text }));
  const own = (custom || []).map((c) => ({ id: c.id, label: c.title, text: c.text }));
  return [...ready, ...own];
};

/** The name this text has in the Kavenegar panel (the server sends it by this name; see tools/kavenegar). */
export const smsTemplateName = (key: string) => 'hm' + key.replace(/-/g, '');

/** The text the customer receives: «{name} عزیز، …», then the company name (a variable of the template) and the fixed line of the product. */
export const smsFinalText = (key: string, name: string, company: string) => {
  const t = SMS_LIBRARY.find((x) => x.key === key);
  if (!t) return '';
  return `${name} عزیز، ${t.text.replace(/^با سلام( و احترام)?[؛،]?\s*/, '')}
${company}
اتوماسیون هورمند`;
};
