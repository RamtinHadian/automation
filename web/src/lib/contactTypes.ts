import { Customer } from '../types';

/** What a person in the phone book is. A customer has no contactType (it is a customer of the CRM); the others are only phone-book entries. */
export const CONTACT_TYPES: { id: NonNullable<Customer['contactType']> | 'CUSTOMER'; label: string; cls: string }[] = [
  { id: 'CUSTOMER', label: 'مشتری', cls: 'text-violet-700 bg-violet-50 border-violet-200' },
  { id: 'SUPPLIER', label: 'تأمین‌کننده', cls: 'text-amber-800 bg-amber-50 border-amber-200' },
  { id: 'COLLEAGUE', label: 'همکار', cls: 'text-sky-700 bg-sky-50 border-sky-200' },
  { id: 'AGENT', label: 'نماینده', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  { id: 'OTHER', label: 'سایر', cls: 'text-slate-700 bg-slate-100 border-slate-200' },
];

export const contactTypeOf = (c: Pick<Customer, 'contactType'>) => c.contactType || 'CUSTOMER';
export const isCustomerRecord = (c: Pick<Customer, 'contactType'>) => !c.contactType;
