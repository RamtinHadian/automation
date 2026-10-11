import { User } from '../types';

/**
 * THE LIST OF EVERY PERMISSION A PERSON CAN BE GIVEN.
 * The permission table in the management console («جدول مجوزها») is drawn from this list: when a new menu, tool or right is added to the system,
 * add it here (one line) and every employee gets a tick for it in the table. Nothing else has to change in the console.
 *
 *  - kind 'flag':  a true/false field on the user (user[key])
 *  - kind 'list':  one entry (item) inside an array field of the user (user[key] includes item)
 */
export interface PermDef {
  id: string;
  kind: 'flag' | 'list';
  key: keyof User & string;
  /** list kind: the entry inside the array */
  item?: string;
  /** the column group (menu) it belongs to */
  group: string;
  /** short column title */
  label: string;
  /** one sentence for the tooltip: what the person can do with it */
  hint: string;
}

export const PERM_GROUPS: { id: string; title: string; tone: string }[] = [
  { id: 'letters', title: 'نامه‌نگاری', tone: '#6E1B1B' },
  { id: 'work', title: 'کار روزانه', tone: '#0284C7' },
  { id: 'sales', title: 'مشتریان و فروش', tone: '#7C3AED' },
  { id: 'warehouse', title: 'انبار', tone: '#D97706' },
  { id: 'sepidar', title: 'حسابداری سپیدار', tone: '#BE123C' },
];

export const PERMISSIONS: PermDef[] = [
  { id: 'letters.write', kind: 'flag', key: 'canSendOfficialLetters', group: 'letters', label: 'نگارش و ارسال نامه', hint: 'نامهٔ رسمی می‌نویسد، قالب نامه را تعریف می‌کند و برای امضا می‌فرستد.' },
  { id: 'tasks', kind: 'flag', key: 'canUseTasks', group: 'work', label: 'وظایف', hint: 'منوی «وظایف»: تعریف، واگذاری و پیگیری کارها.' },
  { id: 'board', kind: 'flag', key: 'canPostAnnouncements', group: 'work', label: 'تابلو اعلانات', hint: 'می‌تواند اخبار و اطلاعیه را برای همه منتشر کند.' },
  { id: 'stats', kind: 'flag', key: 'canViewStats', group: 'work', label: 'گزارشات آماری', hint: 'منوی «گزارشات»: نمودارهای کار، نامه، فروش و تلفن شرکت.' },
  { id: 'crm', kind: 'flag', key: 'canUseCrm', group: 'sales', label: 'مشتریان (CRM)', hint: 'منوی «مشتریان»: مشتری، فرصت فروش، دفتر تلفن، قیمت‌های داده‌شده و گزارش‌ها.' },
  { id: 'sms', kind: 'flag', key: 'canSendSms', group: 'sales', label: 'ارسال پیامک', hint: 'برای مشتری‌های خودش پیامک تکی و گروهی می‌فرستد.' },
  { id: 'warranty', kind: 'flag', key: 'canUseWarranty', group: 'sales', label: 'گارانتی و پشتیبانی', hint: 'منوهای «گارانتی» و «پشتیبانی».' },
  { id: 'warehouse', kind: 'flag', key: 'canUseWarehouse', group: 'warehouse', label: 'انبارداری', hint: 'منوی «انبار»: کالا، انبار، رسید، حواله، انتقال، تعدیل و کاردکس (ابطال سند فقط مدیر).' },
  { id: 'sepidar.view', kind: 'list', key: 'sepidarPerms', item: 'view', group: 'sepidar', label: 'دیدن اطلاعات', hint: 'فاکتورها، قیمت‌ها، مانده مشتری و وضعیت اتصال سپیدار را می‌بیند.' },
  { id: 'sepidar.customer', kind: 'list', key: 'sepidarPerms', item: 'customer', group: 'sepidar', label: 'مشتری', hint: 'مشتری را در سپیدار ثبت یا بروز می‌کند.' },
  { id: 'sepidar.quotation', kind: 'list', key: 'sepidarPerms', item: 'quotation', group: 'sepidar', label: 'پیش‌فاکتور', hint: 'پیش‌فاکتور را به سپیدار می‌فرستد، می‌بندد و حذف می‌کند.' },
  { id: 'sepidar.invoice', kind: 'list', key: 'sepidarPerms', item: 'invoice', group: 'sepidar', label: 'صدور فاکتور', hint: 'از روی پیش‌فاکتور فاکتور فروش صادر می‌کند.' },
  { id: 'sepidar.receipt', kind: 'list', key: 'sepidarPerms', item: 'receipt', group: 'sepidar', label: 'ثبت دریافتی', hint: 'برای فاکتور رسید دریافت ثبت می‌کند.' },
];

export const isAdminUser = (u: Pick<User, 'role'>) => u.role === 'SUPER_ADMIN' || u.role === 'DEPT_ADMIN';

export const hasPerm = (u: User, p: PermDef): boolean => {
  if (p.kind === 'flag') return u[p.key] === true;
  const list = u[p.key];
  return Array.isArray(list) && list.includes(p.item as never);
};

/** The change to save on the user to switch one permission on or off. */
export const permPatch = (u: User, p: PermDef, on: boolean): Partial<User> => {
  if (p.kind === 'flag') return { [p.key]: on } as Partial<User>;
  const cur = (Array.isArray(u[p.key]) ? (u[p.key] as unknown as string[]) : []).filter((x) => x !== p.item);
  return { [p.key]: on ? [...cur, p.item as string] : cur } as Partial<User>;
};

/** The change that switches a whole set of permissions on or off at once. */
export const permPatchMany = (u: User, defs: PermDef[], on: boolean): Partial<User> =>
  defs.reduce<Partial<User>>((patch, p) => ({ ...patch, ...permPatch({ ...u, ...patch } as User, p, on) }), {});
