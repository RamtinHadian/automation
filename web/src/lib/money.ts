// The money unit of the whole system (system settings): Toman or Rial.
// Every amount is stored in Toman; Rial is only how it is shown and typed (1 Toman = 10 Rial).
export type CurrencyUnit = 'TOMAN' | 'RIAL';

let unit: CurrencyUnit = 'TOMAN';
export const setCurrencyUnit = (u?: CurrencyUnit) => {
  unit = u === 'RIAL' ? 'RIAL' : 'TOMAN';
};
export const currencyUnit = () => unit;
export const unitName = () => (unit === 'RIAL' ? 'ریال' : 'تومان');
export const unitShort = () => (unit === 'RIAL' ? 'ر' : 'ت');
/** Stored Toman -> number in the chosen unit. */
export const toDisplay = (toman: number) => Math.round((toman || 0) * (unit === 'RIAL' ? 10 : 1));
/** Number typed in the chosen unit -> Toman for storage. */
export const fromDisplay = (value: number) => (unit === 'RIAL' ? value / 10 : value);
export const formatNumber = (n: number) => new Intl.NumberFormat('fa-IR').format(Math.round(n || 0));
/** «۱٬۲۰۰٬۰۰۰» in the chosen unit. */
export const formatMoney = (toman: number) => formatNumber(toDisplay(toman));
