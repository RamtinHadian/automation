import { useEffect, useState } from 'react';
import { api } from './api';

/**
 * The fields Sepidar keeps for a customer (person) that Hoormand has no field of its own for. They live in one group, «اطلاعات سپیدار», on the
 * customer: the form, the customer's page and the import from Excel show it only on a Hoormand that the Sepidar program is connected to.
 * `keys` are the column headings of Sepidar's customer export (Arabic ي and ك are read as Persian ی and ک).
 */
export type SepidarFieldKind = 'text' | 'num' | 'date' | 'bool';
export interface SepidarField { id: string; label: string; kind: SepidarFieldKind; keys: string[] }

export const SEPIDAR_FIELDS: SepidarField[] = [
  { id: 'code', label: 'کد مشتری در سپیدار', kind: 'text', keys: ['کد', 'کد مشتری', 'کد طرف حساب'] },
  { id: 'customerGroup', label: 'گروه مشتری', kind: 'text', keys: ['گروه مشتری'] },
  { id: 'customerGroupCode', label: 'کد گروه مشتری', kind: 'text', keys: ['کد گروه مشتری'] },
  { id: 'supplierGroup', label: 'گروه تأمین‌کننده', kind: 'text', keys: ['گروه تامین کننده', 'گروه تأمین کننده'] },
  { id: 'supplierGroupCode', label: 'کد گروه تأمین‌کننده', kind: 'text', keys: ['کد گروه تامین کننده', 'کد گروه تأمین کننده'] },
  { id: 'intermediaryGroup', label: 'گروه واسط', kind: 'text', keys: ['گروه واسط'] },
  { id: 'intermediaryGroupCode', label: 'کد گروه واسط', kind: 'text', keys: ['کد گروه واسط'] },
  { id: 'ministryCategory', label: 'دسته‌بندی وزارت دارایی', kind: 'text', keys: ['دسته بندی وزارت دارایی'] },
  { id: 'detailType', label: 'نوع تفصیل', kind: 'text', keys: ['نوع تفصیل'] },
  { id: 'subType', label: 'نوع فرعی', kind: 'text', keys: ['نوع فرعی'] },
  { id: 'creditLimit', label: 'سقف اعتبار', kind: 'num', keys: ['سقف اعتبار'] },
  { id: 'creditControl', label: 'کنترل اعتبار', kind: 'text', keys: ['کنترل اعتبار'] },
  { id: 'qtyCreditLimit', label: 'سقف اعتبار تعدادی', kind: 'num', keys: ['سقف اعتبار تعدادی'] },
  { id: 'qtyCreditControl', label: 'کنترل اعتبار تعدادی', kind: 'text', keys: ['کنترل اعتبار تعدادی'] },
  { id: 'discountRate', label: 'نرخ تخفیف', kind: 'num', keys: ['نرخ تخفیف'] },
  { id: 'commissionRate', label: 'نرخ پورسانت', kind: 'num', keys: ['نرخ پورسانت'] },
  { id: 'issuer', label: 'صادرکننده', kind: 'text', keys: ['صادر کننده'] },
  { id: 'marriageDate', label: 'تاریخ ازدواج', kind: 'date', keys: ['تاریخ ازدواج'] },
  { id: 'passportNumber', label: 'شمارهٔ گذرنامه', kind: 'text', keys: ['شماره گذرنامه', 'شماره گذرنامه 2', 'شماره گذرنامه (2)'] },
  { id: 'isCustomer', label: 'مشتری است', kind: 'bool', keys: ['مشتری'] },
  { id: 'isSupplier', label: 'تأمین‌کننده است', kind: 'bool', keys: ['تامین کننده', 'تأمین کننده'] },
  { id: 'isIntermediary', label: 'واسطه است', kind: 'bool', keys: ['واسطه'] },
  { id: 'isEmployee', label: 'کارمند است', kind: 'bool', keys: ['کارمند'] },
  { id: 'blacklist', label: 'در لیست سیاه', kind: 'bool', keys: ['لیست سیاه'] },
  { id: 'active', label: 'فعال در سپیدار', kind: 'bool', keys: ['فعال'] },
  { id: 'createdAt', label: 'زمان ایجاد در سپیدار', kind: 'text', keys: ['زمان ایجاد'] },
  { id: 'updatedAt', label: 'زمان آخرین ویرایش', kind: 'text', keys: ['زمان آخرین ویرایش'] },
  { id: 'lastModifier', label: 'آخرین تغییردهنده', kind: 'text', keys: ['آخرین تغییر دهنده'] },
  { id: 'sentFromDevice', label: 'ارسالی از دستگاه', kind: 'text', keys: ['ارسالی از دستگاه'] },
];

/** Whether the Sepidar program is connected to this Hoormand (asked once per page load). */
let connectedCache: Promise<boolean> | null = null;
export const loadSepidarConnected = (): Promise<boolean> => (connectedCache ||= api.sepidarConnected().then((r) => !!r.connected).catch(() => false));

export const useSepidarConnected = (): boolean => {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadSepidarConnected().then((v) => alive && setOn(v));
    return () => { alive = false; };
  }, []);
  return on;
};

/** How a stored value is shown: a yes / no for tick columns, the number with separators. */
export const sepidarValueText = (f: SepidarField, v: string): string => {
  if (!v) return '';
  if (f.kind === 'bool') return /^(1|true|بله|فعال|yes|y|✓)$/i.test(v.trim()) ? 'بله' : /^(0|false|خیر|غیرفعال|no|n)$/i.test(v.trim()) ? 'خیر' : v;
  return v;
};
