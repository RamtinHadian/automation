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
      { id: 'files.leave', label: 'درخواست مرخصی', hint: 'درخواست مرخصی می‌دهد و وضعیتش را می‌بیند.' },
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
      { id: 'warehouse.docs', label: 'اسناد', hint: 'رسید، حواله، انتقال و تعدیل ثبت‌شده.' },
      { id: 'warehouse.products', label: 'کالاها', hint: 'فهرست و تعریف کالا و قیمت‌ها.' },
      { id: 'warehouse.warehouses', label: 'انبارها', hint: 'تعریف انبارها.' },
      { id: 'warehouse.write', label: 'ثبت سند', hint: 'دکمه‌های ثبت رسید، حواله، انتقال و تعدیل.' },
    ],
  },
  {
    id: 'sepidar',
    title: 'حسابداری سپیدار',
    tone: '#BE123C',
    subs: [
      { id: 'sepidar.view', label: 'دیدن اطلاعات', hint: 'فاکتورها، قیمت‌ها، مانده مشتری و وضعیت اتصال.', flag: listItem('sepidar.view', 'sepidarPerms', 'view', 'دیدن اطلاعات', 'فاکتورها، قیمت‌ها، مانده مشتری و وضعیت اتصال.') },
      { id: 'sepidar.customer', label: 'مشتری', hint: 'مشتری را در سپیدار ثبت یا بروز می‌کند.', flag: listItem('sepidar.customer', 'sepidarPerms', 'customer', 'مشتری', 'مشتری را در سپیدار ثبت یا بروز می‌کند.') },
      { id: 'sepidar.quotation', label: 'پیش‌فاکتور', hint: 'پیش‌فاکتور را به سپیدار می‌فرستد، می‌بندد و حذف می‌کند.', flag: listItem('sepidar.quotation', 'sepidarPerms', 'quotation', 'پیش‌فاکتور', 'پیش‌فاکتور را به سپیدار می‌فرستد، می‌بندد و حذف می‌کند.') },
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
export const canSub = (u: Pick<User, 'role' | 'hiddenSub'>, id: string): boolean => isAdminUser(u) || !(u.hiddenSub || []).includes(id);
