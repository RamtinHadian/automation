import React from 'react';
import { BRAND_NAME } from '../../lib/brand';

/** The product name in its own display font. */
export const BrandName: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={className} style={{ fontFamily: "'Lalezar', 'Vazirmatn', sans-serif", fontWeight: 400, letterSpacing: 0 }}>
    {BRAND_NAME}
  </span>
);
