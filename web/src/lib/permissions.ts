import { User } from '../types';

/**
 * THE LIST OF EVERY MENU AND SUB-MENU A PERSON CAN BE GIVEN OR DENIED.
 *
 * The permission table in the management console («جدول مجوزها») is drawn from MENUS: one group of columns per menu, the menu's own
 * switch first and then one column per sub-menu. THE RULE: whenever a menu, a sub-menu, a tab or a tool is added to the application,
 * add it here (one line), and use canSub(user, 'menu.sub') where it is drawn so that a person without the tick does not see it.
 * Nothing else in the console has to change.
 *
 *  - a sub-menu with no `flag` is allowed by default and switched off per person (user.hiddenSub holds the ids switched off);
 *  - a sub-menu with a `flag` (or a menu `main`) is an older, stronger right stored on the user and also checked by the server.
 */
export interface PermDef {
  id: string;
  kind: 'flag' | 'list';
  key: keyof User & string;
  /** list kind: the entry inside the array */
  item?: string;
  label: string;
  hint: string;
}

export interface SubDef {
  /** «menu.sub»: the id used in user.hiddenSub and in canSub() */
  id: string;
  label: string;
  hint: string;
  /** an existing stored right this sub-menu stands for */
  flag?: PermDef;
}

export interface MenuDef {
  id: string;
  title: string;
  tone: string;
  /** the right to enter the menu at all (menus without one are open to everybody, or open through their sub-menus) */
  main?: PermDef;
  subs: SubDef[];
}

/**
 * The totals of money and the numbers of sales (sums over many sales, per customer or per period) are for the managing director only:
 * the one person with the right to sign official letters. Even the other administrators do not see them.
 */
export const canSeeSalesTotals = (u?: Pick<User, 'canSignOfficialLetters'> | null): boolean => !!u?.canSignOfficialLetters;

const flag = (id: string, key: PermDef['key'], label: string, hint: string): PermDef => ({ id, kind: 'flag', key, label, hint });
const listItem = (id: string, key: PermDef['key'], item: string, label: string, hint: string): PermDef => ({ id, kind: 'list', key, item, label, hint });

export const MENUS: MenuDef[] = [
  {
    id: 'files',
    title: 'امور اداری',
    tone: '#6E1B1B',
    subs: [
      { id: 'files.transfer', label: 'ارسال و دریافت فایل‌ها', hint: 'فایل می‌فرستد و دریافت می‌کند و بایگانی فایل‌ها را می‌بیند.' },
      { id: 'files.chat', label: 'گفتگو', hint: 'با همکاران گفتگوی مستقیم دارد.' },
      { id: 'files.leave', label: 'درخواست مرخصی و مساعده', hint: 'درخواست مرخصی و مساعده می‌دهد و وضعیتشان را می‌بیند (تأییدکننده‌ها هم از همین‌جا تأیید و ارجاع می‌دهند).' },
      { id: 'files.board', label: 'تابلو اعلانات', hint: 'اخبار و اطلاعیه‌ها را می‌بیند.' },
      { id: 'files.board.post', label: 'انتشار در تابلو', hint: 'می‌تواند اخبار و اطلاعیه را برای همه منتشر کند.', flag: flag('board.post', 'canPostAnnouncements', 'انتشار در تابلو اعلانات', 'می‌تواند اخبار و اطلاعیه را برای همه منتشر کند.') },
      { id: 'files.reminders', label: 'یادآور', hint: 'یادآورهای شخصی خودش را می‌سازد.' },
    ],
  },
  {
    id: 'letters',
    title: 'نامه‌نگاری',
    tone: '#92400E',
    main: flag('letters.write', 'canSendOfficialLetters', 'ورود و نگارش نامه', 'منوی «نامه»: نامهٔ رسمی می‌نویسد، قالب نامه را تعریف می‌کند و برای امضا می‌فرستد.'),
    subs: [],
  },
  {
    id: 'tasks',
    title: 'وظایف',
    tone: '#0284C7',
    main: flag('tasks', 'canUseTasks', 'ورود به منو', 'منوی «وظایف»: تعریف، واگذاری و پیگیری کارها.'),
    subs: [
      { id: 'tasks.list', label: 'وظایف', hint: 'تابلو و فهرست وظایف.' },
      { id: 'tasks.reports', label: 'گزارش‌های روزانه', hint: 'گزارش کار روزانه را می‌نویسد و (اگر مجاز باشد) گزارش‌های تیم را می‌بیند.' },
    ],
  },
  {
    id: 'stats',
    title: 'گزارشات',
    tone: '#EA580C',
    main: flag('stats', 'canViewStats', 'ورود به منو', 'منوی «گزارشات»: نمودارهای کار، نامه، فروش و تلفن شرکت.'),
    subs: [],
  },
  {
    id: 'crm',
    title: 'مشتریان و فروش',
    tone: '#7C3AED',
    main: flag('crm', 'canUseCrm', 'ورود به منو', 'منوی «مشتریان»: مشتری، فرصت فروش و پیگیری.'),
    subs: [
      { id: 'crm.team', label: 'مشتریان همکاران', hint: 'مشتری، فرصت و پیگیری همکاران را هم می‌بیند (بدون این تیک فقط مال خودش را می‌بیند).', flag: flag('team', 'canSeeTeamCrm', 'مشتریان همکاران', 'مشتری، فرصت و پیگیری همکاران را هم می‌بیند (بدون این تیک فقط مال خودش را می‌بیند).') },
      { id: 'crm.calendar', label: 'تقویم', hint: 'تقویم پیگیری‌ها، قرارها، تاریخ بستن فرصت‌ها و تولدها.' },
      { id: 'crm.board', label: 'تیم (عملکرد و هدف)', hint: 'عملکرد هر همکار، هدف فروش و پیش‌بینی (فقط وقتی «مشتریان همکاران» هم باز باشد).' },
      { id: 'crm.today', label: 'امروز من', hint: 'کارهای امروز: پیگیری‌ها، فرصت‌های گیرکرده، تولدها.' },
      { id: 'crm.overview', label: 'خلاصه', hint: 'نمای کلی مشتری‌ها و فروش.' },
      { id: 'crm.customers', label: 'مشتریان', hint: 'فهرست، جستجو، ثبت و ویرایش مشتری.' },
      { id: 'crm.pipeline', label: 'فرصت‌های فروش', hint: 'تابلوی مراحل فروش و پیش‌فاکتور.' },
      { id: 'crm.followups', label: 'پیگیری‌ها', hint: 'کارهای پیگیری مشتری.' },
      { id: 'crm.reports', label: 'گزارش‌ها', hint: 'خریداران، تعامل‌ها، قیمت‌های داده‌شده و مشتریان بی‌پیگیری.' },
      { id: 'crm.club', label: 'باشگاه مشتریان', hint: 'امتیاز و سطح مشتری‌ها، تولدها و مشتریان بی‌خرید.' },
      { id: 'crm.phonebook', label: 'دفتر تلفن', hint: 'دفتر تلفن همهٔ مشتری‌ها.' },
      { id: 'crm.import', label: 'ورود از اکسل', hint: 'مشتری‌ها را از فایل اکسل وارد می‌کند.' },
      { id: 'crm.proforma', label: 'صدور پیش‌فاکتور', hint: 'دکمهٔ صدور سریع پیش‌فاکتور.' },
      { id: 'crm.callWatch', label: 'دیدن همهٔ تماس‌های شرکت', hint: 'همهٔ تماس‌های ورودی شرکت را در پاپ‌آپ می‌بیند: چه کسی زنگ زده و به کدام همکار. (وضعیت مالی مشتری در پاپ، با تیک «وضعیت مالی در پاپ تماس» در منوی سپیدار.)', flag: flag('callWatch', 'canSeeAllCalls', 'دیدن همهٔ تماس‌های شرکت', 'همهٔ تماس‌های ورودی شرکت را در پاپ‌آپ می‌بیند: چه کسی زنگ زده و به کدام همکار. (وضعیت مالی مشتری در پاپ، با تیک «وضعیت مالی در پاپ تماس» در منوی سپیدار.)') },
      { id: 'crm.sms', label: 'ارسال پیامک', hint: 'برای مشتری‌های خودش پیامک تکی و گروهی می‌فرستد.', flag: flag('sms', 'canSendSms', 'ارسال پیامک', 'برای مشتری‌های خودش پیامک تکی و گروهی می‌فرستد.') },
    ],
  },
  {
    id: 'warranty',
    title: 'گارانتی و پشتیبانی',
    tone: '#0D9488',
    main: flag('warranty', 'canUseWarranty', 'ورود به منوها', 'منوهای «گارانتی» و «پشتیبانی» (کسانی که با مشتری کار می‌کنند هم دارند).'),
    subs: [
      { id: 'warranty.warranty', label: 'گارانتی', hint: 'ثبت گارانتی و درخواست‌های خرابی.' },
      { id: 'warranty.support', label: 'پشتیبانی', hint: 'پلن‌ها، اشتراک‌ها و درخواست‌های پشتیبانی.' },
    ],
  },
  {
    id: 'warehouse',
    title: 'انبار',
    tone: '#D97706',
    main: flag('warehouse', 'canUseWarehouse', 'ورود به منو', 'منوی «انبار» (ابطال سند فقط مدیر).'),
    subs: [
      { id: 'warehouse.stock', label: 'موجودی', hint: 'موجودی هر کالا در هر انبار.' },
      { id: 'warehouse.qty', label: 'مرور تعدادی', hint: 'تعداد موجودی کالاها را می‌بیند. بدون این تیک تعداد، کارت کالا و اسناد را نمی‌بیند.' },
      { id: 'warehouse.money', label: 'مرور مبلغی', hint: 'قیمت‌ها و بهای تمام‌شدهٔ کالا را می‌بیند. بدون این تیک هیچ مبلغی نمی‌بیند و قیمت‌ها را عوض نمی‌کند.' },
      { id: 'warehouse.docs', label: 'اسناد', hint: 'رسید، حواله، انتقال و تعدیل ثبت‌شده. بدون این تیک هیچ سندی دیده نمی‌شود.' },
      { id: 'warehouse.doc.receipt', label: 'رسید ورود', hint: 'رسید ورود را می‌بیند و ثبت می‌کند. بدون این تیک رسیدها از او پنهان است.' },
      { id: 'warehouse.doc.issue', label: 'حواله خروج', hint: 'حواله خروج را می‌بیند و ثبت می‌کند.' },
      { id: 'warehouse.doc.transfer', label: 'انتقال بین انبارها', hint: 'انتقال بین انبارها را می‌بیند و ثبت می‌کند.' },
      { id: 'warehouse.doc.adjust', label: 'تعدیل انبارگردانی', hint: 'تعدیل انبارگردانی را می‌بیند و ثبت می‌کند.' },
      { id: 'warehouse.products', label: 'کالاها', hint: 'فهرست و تعریف کالا.' },
      { id: 'warehouse.warehouses', label: 'انبارها', hint: 'تعریف انبارها.' },
      { id: 'warehouse.write', label: 'ثبت سند', hint: 'دکمه‌های ثبت رسید، حواله، انتقال و تعدیل (فقط برای نوع‌هایی که می‌بیند).' },
    ],
  },
  {
    id: 'sepidar',
    title: 'حسابداری سپیدار',
    tone: '#BE123C',
    subs: [
      { id: 'sepidar.view', label: 'همهٔ بخش‌های دیدنی', hint: 'یک‌جا همهٔ دیدنی‌ها: فاکتورهای فروش، قیمت‌ها، مانده مشتری، بروزرسانی. برای محدودتر شدن به‌جای این، تیک‌های ریزتر پایین را بزنید.', flag: listItem('sepidar.view', 'sepidarPerms', 'view', 'همهٔ بخش‌های دیدنی', 'یک‌جا همهٔ دیدنی‌ها: فاکتورهای فروش، قیمت‌ها، مانده مشتری، بروزرسانی. برای محدودتر شدن به‌جای این، تیک‌های ریزتر پایین را بزنید.') },
      { id: 'sepidar.invoices', label: 'دیدن فاکتورهای فروش', hint: 'فهرست فاکتورهای فروش سپیدار با مبلغ، تخفیف و مالیات.', flag: listItem('sepidar.invoices', 'sepidarPerms', 'viewInvoices', 'دیدن فاکتورهای فروش', 'فهرست فاکتورهای فروش سپیدار با مبلغ، تخفیف و مالیات.') },
      { id: 'sepidar.prices', label: 'دیدن قیمت‌ها', hint: 'لیست قیمت کالاها در سپیدار.', flag: listItem('sepidar.prices', 'sepidarPerms', 'viewPrices', 'دیدن قیمت‌ها', 'لیست قیمت کالاها در سپیدار.') },
      { id: 'sepidar.balance', label: 'دیدن مانده و وضعیت مالی', hint: 'مانده حساب مشتری و کارت وضعیت مالی (هنگام تماس و در منوی سپیدار).', flag: listItem('sepidar.balance', 'sepidarPerms', 'viewBalance', 'دیدن مانده و وضعیت مالی', 'مانده حساب مشتری و کارت وضعیت مالی (هنگام تماس و در منوی سپیدار).') },
      { id: 'sepidar.credit', label: 'دیدن مانده اعتبار', hint: 'مانده اعتبار مشتری در کارت وضعیت مالی (بدون این تیک فقط مانده حساب یا فاکتورها دیده می‌شود).', flag: listItem('sepidar.credit', 'sepidarPerms', 'viewCredit', 'دیدن مانده اعتبار', 'مانده اعتبار مشتری در کارت وضعیت مالی.') },
      { id: 'sepidar.callFinance', label: 'وضعیت مالی در پاپ تماس', hint: 'هنگام تماس مشتری، کارت وضعیت مالی او بالای صفحه می‌آید. آنچه در آن دیده می‌شود از تیک‌های مانده، اعتبار و فاکتورها می‌آید.', flag: listItem('sepidar.callFinance', 'sepidarPerms', 'callFinance', 'وضعیت مالی در پاپ تماس', 'هنگام تماس مشتری، کارت وضعیت مالی او بالای صفحه می‌آید.') },
      { id: 'sepidar.refresh', label: 'بروزرسانی اطلاعات', hint: 'دکمهٔ بروزرسانی اطلاعات از سپیدار.', flag: listItem('sepidar.refresh', 'sepidarPerms', 'refresh', 'بروزرسانی اطلاعات', 'دکمهٔ بروزرسانی اطلاعات از سپیدار.') },
      { id: 'sepidar.customer', label: 'مشتری (ثبت و بروزرسانی)', hint: 'هر دو: مشتری تازه را در سپیدار ثبت و مشتری قبلی را بروز می‌کند.', flag: listItem('sepidar.customer', 'sepidarPerms', 'customer', 'مشتری (ثبت و بروزرسانی)', 'هر دو: مشتری تازه را در سپیدار ثبت و مشتری قبلی را بروز می‌کند.') },
      { id: 'sepidar.customerNew', label: 'ثبت مشتری تازه', hint: 'فقط مشتری‌ای را که هنوز در سپیدار نیست ثبت می‌کند.', flag: listItem('sepidar.customerNew', 'sepidarPerms', 'customerNew', 'ثبت مشتری تازه', 'فقط مشتری‌ای را که هنوز در سپیدار نیست ثبت می‌کند.') },
      { id: 'sepidar.customerUpdate', label: 'بروزرسانی مشتری', hint: 'فقط مشتری‌ای را که در سپیدار هست بروز می‌کند.', flag: listItem('sepidar.customerUpdate', 'sepidarPerms', 'customerUpdate', 'بروزرسانی مشتری', 'فقط مشتری‌ای را که در سپیدار هست بروز می‌کند.') },
      { id: 'sepidar.quotation', label: 'پیش‌فاکتور (همه)', hint: 'ارسال، بستن و حذف پیش‌فاکتور؛ برای محدودتر شدن، سه تیک ریزتر پایین را بزنید.', flag: listItem('sepidar.quotation', 'sepidarPerms', 'quotation', 'پیش‌فاکتور (همه)', 'ارسال، بستن و حذف پیش‌فاکتور؛ برای محدودتر شدن، سه تیک ریزتر پایین را بزنید.') },
      { id: 'sepidar.quotationSend', label: 'ارسال پیش‌فاکتور', hint: 'پیش‌فاکتور را به سپیدار می‌فرستد.', flag: listItem('sepidar.quotationSend', 'sepidarPerms', 'quotationSend', 'ارسال پیش‌فاکتور', 'پیش‌فاکتور را به سپیدار می‌فرستد.') },
      { id: 'sepidar.quotationClose', label: 'بستن و بازکردن پیش‌فاکتور', hint: 'پیش‌فاکتورِ ثبت‌شده را می‌بندد یا دوباره باز می‌کند.', flag: listItem('sepidar.quotationClose', 'sepidarPerms', 'quotationClose', 'بستن و بازکردن پیش‌فاکتور', 'پیش‌فاکتورِ ثبت‌شده را می‌بندد یا دوباره باز می‌کند.') },
      { id: 'sepidar.quotationDelete', label: 'حذف پیش‌فاکتور', hint: 'پیش‌فاکتور را از سپیدار حذف می‌کند.', flag: listItem('sepidar.quotationDelete', 'sepidarPerms', 'quotationDelete', 'حذف پیش‌فاکتور', 'پیش‌فاکتور را از سپیدار حذف می‌کند.') },
      { id: 'sepidar.invoice', label: 'صدور فاکتور', hint: 'از روی پیش‌فاکتور فاکتور فروش صادر می‌کند.', flag: listItem('sepidar.invoice', 'sepidarPerms', 'invoice', 'صدور فاکتور', 'از روی پیش‌فاکتور فاکتور فروش صادر می‌کند.') },
      { id: 'sepidar.receipt', label: 'ثبت دریافتی', hint: 'برای فاکتور رسید دریافت ثبت می‌کند.', flag: listItem('sepidar.receipt', 'sepidarPerms', 'receipt', 'ثبت دریافتی', 'برای فاکتور رسید دریافت ثبت می‌کند.') },
    ],
  },
];

export const isAdminUser = (u: Pick<User, 'role'>) => u.role === 'SUPER_ADMIN' || u.role === 'DEPT_ADMIN';

export const hasPerm = (u: User, p: PermDef): boolean => {
  if (p.kind === 'flag') return u[p.key] === true;
  const list = u[p.key];
  return Array.isArray(list) && list.includes(p.item as never);
};

/** The change to save on the user to switch one stored right on or off. */
export const permPatch = (u: User, p: PermDef, on: boolean): Partial<User> => {
  if (p.kind === 'flag') return { [p.key]: on } as Partial<User>;
  const cur = (Array.isArray(u[p.key]) ? (u[p.key] as unknown as string[]) : []).filter((x) => x !== p.item);
  return { [p.key]: on ? [...cur, p.item as string] : cur } as Partial<User>;
};

// ---------- the columns of the table ----------

export interface Column {
  id: string;
  menuId: string;
  label: string;
  hint: string;
  /** true for the menu's own switch */
  isMain: boolean;
  /** a stored right, or none: then the column is «not in user.hiddenSub» */
  def?: PermDef;
}

export const COLUMNS: Column[] = MENUS.flatMap((m) => [
  ...(m.main ? [{ id: m.main.id, menuId: m.id, label: m.main.label, hint: m.main.hint, isMain: true, def: m.main } as Column] : []),
  ...m.subs.map((s) => ({ id: s.id, menuId: m.id, label: s.label, hint: s.hint, isMain: false, def: s.flag } as Column)),
]);

export const colOn = (u: User, c: Column): boolean => (c.def ? hasPerm(u, c.def) : !(u.hiddenSub || []).includes(c.id));

export const colPatch = (u: User, c: Column, on: boolean): Partial<User> => {
  if (c.def) return permPatch(u, c.def, on);
  const cur = (u.hiddenSub || []).filter((x) => x !== c.id);
  return { hiddenSub: on ? cur : [...cur, c.id] };
};

/** One patch that switches a set of columns on or off for a person. */
export const colPatchMany = (u: User, cols: Column[], on: boolean): Partial<User> =>
  cols.reduce<Partial<User>>((patch, c) => ({ ...patch, ...colPatch({ ...u, ...patch } as User, c, on) }), {});

/**
 * Is this sub-menu open for the person? Administrators see everything; everybody else sees every sub-menu of a menu they may enter
 * unless the administrator switched it off. Use it where a sub-menu, tab or tool is drawn:  canSub(currentUser, 'crm.reports').
 */
export const canSub = (u: Pick<User, 'role' | 'hiddenSub'>, id: string): boolean => !(u.hiddenSub || []).includes(id);

/**
 * An administrator can also be kept from seeing a menu or sub-menu (the permission table has ticks for them too): the ticks switched off are in
 * hiddenSub, a whole menu as «menu:<id>». The older rights an administrator holds as part of the role (the flagged sub-menus) cannot be taken away.
 * This only decides what is drawn for them; the server's checks for an administrator stay as they were.
 */
export const adminMenuHidden = (u: Pick<User, 'role' | 'hiddenSub'>, menuId: string): boolean => isAdminUser(u) && (u.hiddenSub || []).includes('menu:' + menuId);
export const adminHideId = (c: { id: string; menuId: string; isMain: boolean }): string => (c.isMain ? 'menu:' + c.menuId : c.id);
