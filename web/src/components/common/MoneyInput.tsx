import React from 'react';
import { toPersianDigits } from '../../lib/jalali';
import { unitName } from '../../lib/money';

const AR = '٠١٢٣٤٥٦٧٨٩';
const FA = '۰۱۲۳۴۵۶۷۸۹';

/** Only the digits of what was typed (Persian and Arabic digits too). */
export const digitsOf = (s: string) =>
  s
    .replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR.indexOf(d)))
    .replace(/\D/g, '');

/** 1234567 → «۱٬۲۳۴٬۵۶۷»: three digits at a time, in Persian digits. */
export const groupedFa = (raw: string) => toPersianDigits(raw.replace(/\B(?=(\d{3})+(?!\d))/g, '٬'));

/**
 * An amount box: digits are grouped by three while typing and the system's money unit (تومان or ریال, as set in the settings)
 * stays inside the box. `value` and `onChange` hold the plain digits ("1250000").
 */
export const MoneyInput: React.FC<{ value: string; onChange: (digits: string) => void; placeholder?: string; className?: string; unit?: boolean; disabled?: boolean }> = ({ value, onChange, placeholder, className, unit = true, disabled }) => {
  const raw = digitsOf(value);
  return (
    <div className="relative" data-money-input>
      <input
        disabled={disabled}
        inputMode="numeric"
        dir="ltr"
        value={raw ? groupedFa(raw) : ''}
        onChange={(e) => onChange(digitsOf(e.target.value).replace(/^0+(?=\d)/, ''))}
        placeholder={placeholder}
        className={`${className || ''} text-left ${unit ? 'pr-3 pl-14' : ''}`}
      />
      {unit && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] font-black text-[#8C6F66]">{unitName()}</span>}
    </div>
  );
};
