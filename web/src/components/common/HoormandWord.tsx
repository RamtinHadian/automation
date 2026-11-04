import React from 'react';

/** The Hoormand wordmark (the square-cut Persian lettering), drawn as one SVG: its colour is the main colour of the chosen palette (and a lighter tone at night). */
export const HoormandWord: React.FC<{ className?: string }> = ({ className = 'h-6 sm:h-8 w-auto' }) => (
  <svg viewBox="0 0 2000 552" className={`hoormand-word ${className}`} role="img" aria-label="هورمند" data-hoormand-word>
    {/* ه */}
    <rect x="1635" y="8" width="362" height="105" />
    <rect x="1893" y="8" width="104" height="382" />
    <rect x="1570" y="285" width="427" height="105" />
    <rect x="1635" y="150" width="79" height="135" />
    <rect x="1771" y="150" width="80" height="135" />
    <rect x="1714" y="150" width="57" height="80" />
    {/* و */}
    <path fillRule="evenodd" d="M1203 8H1542V390H1203Z M1308 113V285H1437V113Z" />
    <rect x="1203" y="445" width="335" height="105" />
    <rect x="1438" y="390" width="104" height="160" />
    {/* ا */}
    <rect x="1046" y="8" width="105" height="542" />
    {/* م */}
    <rect x="670" y="8" width="341" height="105" />
    <rect x="670" y="8" width="106" height="382" />
    <rect x="905" y="8" width="106" height="382" />
    <rect x="584" y="285" width="192" height="105" />
    <path d="M776 288H905V390H864Z" />
    {/* ن و د */}
    <rect x="4" y="8" width="271" height="105" />
    <rect x="170" y="8" width="105" height="277" />
    <rect x="4" y="285" width="596" height="105" />
    <rect x="449" y="153" width="105" height="132" />
    <rect x="449" y="8" width="105" height="105" />
  </svg>
);
