import { Customer, Deal, Minutes, MinutesConfig } from '../types';
import { nextMinutesNumber, typeOf } from './minutesConfig';
import { todayIso } from './taskDates';

/** The product of the warehouse that a proforma line is about (by its code), with the months of warranty it carries. */
export interface WarrantyCatalogItem {
  code: string;
  warrantyMonths?: number;
}

/**
 * The delivery minutes («صورتجلسه تحویل») of a proforma, with exactly what the proforma says: its lines become the goods table (name, code, quantity,
 * unit), the issuing company is the one who delivers, the customer is the one who receives, and the proforma number is the invoice number.
 * A line whose product carries a warranty (in the warehouse) is marked, so the form can offer the warranty certificates.
 */
export function deliveryMinutesFromDeal(deal: Deal, customer: Customer | undefined, cfg: MinutesConfig, list: Minutes[], who: { id: string; name: string }, issuerName: string, catalog: WarrantyCatalogItem[]): Minutes {
  const t = typeOf(cfg, 'delivery');
  const date = todayIso();
  const byCode = new Map(catalog.filter((c) => c.code).map((c) => [c.code, c.warrantyMonths || 0]));
  const buyer = customer ? (customer.company && customer.company !== customer.name ? customer.company : customer.name) : deal.customerName;
  const fields: Record<string, string> = {};
  for (const f of t.fields) if (f.id === 'invoice') fields[f.id] = deal.proformaNumber || '';
  return {
    id: 'mn-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
    number: nextMinutesNumber(cfg, t.id, date, list),
    typeId: t.id,
    title: `تحویل کالاهای پیش‌فاکتور ${deal.proformaNumber || deal.title}`,
    kind: '',
    date,
    startTime: '',
    endTime: '',
    place: customer?.address || '',
    chair: '',
    secretary: who.name,
    attendees: [],
    agenda: [],
    discussion: '',
    decisions: [],
    copies: 'واحد مالی، انبار، بایگانی',
    parties: {
      first: { name: issuerName, position: 'فروشنده' },
      second: { name: buyer || '', position: customer && customer.company && customer.company !== customer.name ? customer.name : '', phone: (customer?.phones || [])[0] || '' },
    },
    goods: (deal.items || [])
      .filter((it) => it.title.trim() && it.qty > 0)
      .map((it) => ({ title: it.title, code: it.code || '', qty: it.qty, unit: it.unit || 'عدد', note: it.description || '', warrantyMonths: (it.code && byCode.get(it.code)) || 0, serial: '' })),
    fields,
    conditions: t.defaultConditions,
    customerId: deal.customerId,
    dealId: deal.id,
    proformaNumber: deal.proformaNumber,
    status: 'DRAFT',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
