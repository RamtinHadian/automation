import type { Deal, ProformaFields, ProformaIssuer, ProformaItem, SystemSettings } from '../types';

export const MAIN_ISSUER_ID = 'main';

/** The organisation itself, made from the ordinary company settings; it is always the first issuer. */
export const mainIssuer = (s: SystemSettings): ProformaIssuer => ({
  id: MAIN_ISSUER_ID,
  label: s.companyName || 'شرکت اصلی',
  kind: 'OFFICIAL',
  name: s.proformaCompanyName !== undefined ? s.proformaCompanyName : s.companyName || '',
  subtitle: s.companySubtitle,
  address: s.companyAddress,
  phone: s.companyPhone,
  website: s.companyWebsite,
  economicCode: s.companyEconomicCode,
  nationalId: s.companyNationalId,
  registrationNumber: s.companyRegistrationNumber,
  postalCode: s.companyPostalCode,
  bankInfo: s.proformaBankInfo,
  taxPercent: s.proformaTaxPercent,
  logoUrl: s.companyLogoUrl,
  stampUrl: s.companyStampUrl,
  signatureUrl: s.ceoSignatureUrl,
  ceoName: s.ceoName,
  ceoTitle: s.ceoTitle,
});

export const issuersOf = (s: SystemSettings): ProformaIssuer[] => [mainIssuer(s), ...(s.proformaIssuers || [])];

export const issuerById = (s: SystemSettings, id?: string): ProformaIssuer => issuersOf(s).find((i) => i.id === id) || mainIssuer(s);

export const issuerOf = (deal: Pick<Deal, 'proformaIssuerId'>, s: SystemSettings): ProformaIssuer => issuerById(s, deal.proformaIssuerId);

const blank = (v?: string) => !v || !v.trim();

/** What an official (tax-style) proforma still lacks; empty when it is complete. */
export function officialProblems(f: Pick<ProformaFields, 'sellerName' | 'sellerNationalId' | 'sellerEconomicCode' | 'sellerAddress' | 'sellerPostalCode' | 'buyerName' | 'buyerNationalId' | 'buyerAddress' | 'buyerPostalCode'>, items: ProformaItem[]): string[] {
  const p: string[] = [];
  if (blank(f.sellerName)) p.push('نام فروشنده');
  if (blank(f.sellerNationalId)) p.push('شناسه ملی فروشنده');
  if (blank(f.sellerEconomicCode)) p.push('کد اقتصادی فروشنده');
  if (blank(f.sellerAddress)) p.push('نشانی فروشنده');
  if (blank(f.sellerPostalCode)) p.push('کد پستی فروشنده');
  if (blank(f.buyerName)) p.push('نام خریدار');
  if (blank(f.buyerNationalId)) p.push('کد ملی / شناسه ملی خریدار');
  if (blank(f.buyerAddress)) p.push('نشانی خریدار');
  if (blank(f.buyerPostalCode)) p.push('کد پستی خریدار');
  const rows = items.filter((i) => i.title.trim());
  if (rows.some((i) => blank(i.code))) p.push('شناسه کالا / خدمت هر ردیف');
  if (rows.some((i) => blank(i.unit))) p.push('واحد اندازه‌گیری هر ردیف');
  return p;
}

/** An official proforma is headed «پیش‌فاکتور رسمی فروش» unless the admin gave the template a title of their own. */
export const titleFor = (issuer: Pick<ProformaIssuer, 'kind'>, templateTitle: string): string =>
  issuer.kind === 'OFFICIAL' && ['', 'پیش‌فاکتور', 'پیش‌فاکتور فروش'].includes((templateTitle || '').trim()) ? 'پیش‌فاکتور رسمی فروش' : templateTitle;
