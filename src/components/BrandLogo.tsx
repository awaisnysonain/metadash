import React from 'react';
import type { BrandLabel } from '../utils/helpers';
import { brandChipClass } from '../utils/helpers';

const brandAssets: Partial<Record<BrandLabel, { src: string; alt: string }>> = {
  Flo: { src: '/brands/flologo.avif', alt: 'FLO' },
  Nobl: { src: '/brands/nobllogo.avif', alt: 'NOBL' },
};

export function BrandLogo({ brand, className = 'h-5 w-5' }: { brand: BrandLabel | 'Flo' | 'Nobl'; className?: string }) {
  const asset = brandAssets[brand as BrandLabel];
  if (!asset) {
    return <span className={`${className} rounded-full bg-slate-300`} />;
  }

  return (
    <img
      src={asset.src}
      alt={asset.alt}
      className={`${className} rounded-full object-contain bg-white ring-1 ring-slate-200`}
    />
  );
}

export function BrandLogoBadge({ brand }: { brand: BrandLabel }) {
  const isKnown = brand === 'Flo' || brand === 'Nobl';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${brandChipClass(brand)}`}>
      {isKnown && <BrandLogo brand={brand} className="h-4 w-4" />}
      {brand}
    </span>
  );
}
