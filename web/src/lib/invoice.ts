import type { Customer, Deal, DealInvoice, ProformaFields, SystemSettings, User } from '../types';
import { issuerOf, officialProblems } from './proformaIssuer';
import { buildProformaHtml, nextProformaNumber, ProformaRenderInput } from './proformaPdf';
import { canSub } from './permissions';
import { proformaReleased } from './proformaApproval';

/** Hoormand's own sales invoice: made from a deal's proforma, official (tax-style, all identity codes) or unofficial, as the proforma's issuing company is. */

export const OFFICIAL_INVOICE_FORMAT = 'FA-{YYYY}-{NNNN}';
export const UNOFFICIAL_INVOICE_FORMAT = 'NF-{YYYY}-{NNNN}';

export const invoiceTitle = (kind: DealInvoice['kind']) => (kind === 'OFFICIAL' ? 'فاکتور رسمی فروش' : 'فاکتور فروش');

/** The next free invoice number of that kind (each kind counts on its own, every Jalali year starts again). */
export function nextInvoiceNumber(deals: Deal[], kind: DealInvoice['kind']): string {
  const same = deals.map((d) => ({ ...d, proformaNumber: d.invoice && d.invoice.kind === kind ? d.invoice.number : undefined }));
  return nextProformaNumber(same, { numberFormat: kind === 'OFFICIAL' ? OFFICIAL_INVOICE_FORMAT : UNOFFICIAL_INVOICE_FORMAT });
}

export const hasInvoice = (d: Pick<Deal, 'invoice'>) => !!d.invoice && !!d.invoice.number;

/** May an invoice be issued for this deal now? Says why not (null = yes). */
export function invoiceBlocker(deal: Deal, settings: SystemSettings, customer?: Customer): string | null {
  if (hasInvoice(deal)) return 'برای این فرصت فاکتور صادر شده است.';
  if (!deal.proformaNumber || !deal.items?.some((i) => i.title.trim())) return 'اول پیش‌فاکتور بسازید؛ فاکتور از روی آن صادر می‌شود.';
  if (!proformaReleased(deal, settings)) return 'پیش‌فاکتور هنوز تأیید مدیر را نگرفته است.';
  const issuer = issuerOf(deal, settings);
  if (issuer.kind === 'OFFICIAL') {
    const f: ProformaFields = deal.proformaFields || {};
    const merged = {
      sellerName: f.sellerName ?? issuer.name, sellerNationalId: f.sellerNationalId ?? issuer.nationalId, sellerEconomicCode: f.sellerEconomicCode ?? issuer.economicCode,
      sellerAddress: f.sellerAddress ?? issuer.address, sellerPostalCode: f.sellerPostalCode ?? issuer.postalCode, sellerProvince: f.sellerProvince ?? issuer.province, sellerCity: f.sellerCity ?? issuer.city,
      buyerName: f.buyerName ?? (customer?.name || deal.customerName), buyerNationalId: f.buyerNationalId ?? (customer?.kind === 'COMPANY' ? customer.nationalId : customer?.nationalCode),
      buyerAddress: f.buyerAddress ?? customer?.address, buyerPostalCode: f.buyerPostalCode ?? customer?.postalCode, buyerProvince: f.buyerProvince ?? customer?.province, buyerCity: f.buyerCity ?? customer?.city,
    };
    const lacks = officialProblems(merged as Parameters<typeof officialProblems>[0], deal.items || []);
    if (lacks.length) return `فاکتور رسمی این موارد را کم دارد: ${lacks.join('، ')}. آن‌ها را در پیش‌فاکتور کامل کنید.`;
  }
  return null;
}

/** The invoice to be saved with the deal: a frozen copy of the proforma (the server writes the same copy itself and keeps its own). */
export function draftInvoice(deal: Deal, deals: Deal[], settings: SystemSettings, me: Pick<User, 'id' | 'fullName'>, note = ''): DealInvoice {
  const kind: DealInvoice['kind'] = issuerOf(deal, settings).kind === 'OFFICIAL' ? 'OFFICIAL' : 'UNOFFICIAL';
  return {
    number: nextInvoiceNumber(deals, kind), kind, status: 'issued', issuedAt: new Date().toISOString(), issuedById: me.id, issuedByName: me.fullName,
    issuerId: deal.proformaIssuerId, proformaNumber: deal.proformaNumber, items: deal.items || [], discountPercent: deal.discountPercent, taxPercent: deal.taxPercent,
    fields: deal.proformaFields, amount: deal.amount, customerName: deal.customerName, note,
  };
}

/** The deal as the proforma printer needs it, with the invoice's own number, date, lines and title in place of the proforma's. */
export function invoiceAsDeal(deal: Deal): Deal {
  const inv = deal.invoice;
  if (!inv) return deal;
  return {
    ...deal,
    proformaIssuerId: inv.issuerId ?? deal.proformaIssuerId,
    proformaNumber: inv.number,
    proformaAt: inv.issuedAt.slice(0, 10),
    items: inv.items,
    discountPercent: inv.discountPercent,
    taxPercent: inv.taxPercent,
    terms: '',
    notes: inv.note || '',
    proformaFields: { ...(inv.fields || {}), title: invoiceTitle(inv.kind) },
  };
}

export const invoiceRenderInput = (deal: Deal, customer: Customer | undefined, settings: SystemSettings, issuerName: string): ProformaRenderInput => ({
  deal: invoiceAsDeal(deal), customer, settings, issuerName, docKind: 'invoice',
});

/** Opens the invoice in a print window (Save as PDF there). Must be called from a click. */
export function openInvoicePdf(deal: Deal, customer: Customer | undefined, settings: SystemSettings, issuerName: string) {
  const html = buildProformaHtml(invoiceRenderInput(deal, customer, settings, issuerName), 'print');
  const w = window.open('', '_blank');
  if (!w) {
    window.alert('مرورگر بازشدن پنجرهٔ فاکتور را مسدود کرد؛ اجازهٔ پنجره‌های بازشو را بدهید و دوباره بزنید.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

/** The permission table's «صدور فاکتور» (on by default; the server checks it too). */
export const canIssueInvoice = (u: Pick<User, 'role' | 'hiddenSub'> | null | undefined) => !!u && canSub(u, 'crm.invoice');
