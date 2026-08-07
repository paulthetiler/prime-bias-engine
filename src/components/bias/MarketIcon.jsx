import React from 'react';

// Strong, instantly readable market glyphs for the compact instrument pills.
// Keep these monochrome/currentColor so they inherit the pill state and work in
// both themes. No flags, no emoji, no extra labels outside the icon tile.

const FX_LABEL = {
  USD: '$',
  EUR: '€',
  JPY: '¥',
  GBP: '£',
  CHF: 'Fr',
  AUD: 'A$',
  CAD: 'C$',
  NZD: 'NZ$',
};

const METALS = new Set(['GOLD', 'GOLD/USD', 'Copper', 'Aluminum', 'Zinc', 'Lead', 'Carbon']);
const CRYPTO = new Set(['BITCOIN', 'ETHUSDT']);
const ENERGY = new Set(['OIL', 'GAS']);
const INDICES = new Set(['DAX', 'FTSE', 'DOW', 'SP500', 'US100', 'CAC40', 'JAP225', 'Hong HS50', 'AUD200', 'SMI', 'Dollar']);

// Bold gold-bar silhouette. At 18px this reads as an ingot rather than a
// briefcase or generic stacked-bars icon.
const Ingot = (
  <g stroke="currentColor" strokeLinejoin="round">
    <path d="M6.2 10.2h11.6l2.1 6.2H4.1z" fill="currentColor" opacity="0.9" />
    <path d="M8.2 10.2 9.5 7.1h5l1.3 3.1" fill="none" strokeWidth="1.8" />
    <path d="M7.2 13.5h9.6" fill="none" strokeWidth="1.2" opacity="0.45" />
  </g>
);

const Bitcoin = (
  <text x="12" y="18.6" fontSize="17" fontWeight="900" fill="currentColor" textAnchor="middle">₿</text>
);

const EthDiamond = (
  <g fill="currentColor" stroke="currentColor" strokeLinejoin="round">
    <path d="M12 3.8 17.6 12 12 15.2 6.4 12z" opacity="0.9" />
    <path d="M6.8 13.4 12 20.2l5.2-6.8L12 16.5z" opacity="0.65" />
  </g>
);

const Droplet = (
  <path
    d="M12 4.3c3 4 4.9 6.6 4.9 9a4.9 4.9 0 0 1-9.8 0c0-2.4 1.9-5 4.9-9z"
    fill="currentColor"
    opacity="0.9"
  />
);

// Stronger market/index mark: rising line over three bars. This is visually
// distinct from FX and commodity glyphs at pill size.
const MarketChart = (
  <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5.2 18.4V14h3v4.4M10.5 18.4V10.8h3v7.6M15.8 18.4V7.5h3v10.9" strokeWidth="1.7" />
    <path d="m5.5 11.2 4-3 3.3 1.6 5.2-4.4" strokeWidth="1.8" />
  </g>
);

function fxPair(base, quote) {
  const baseLabel = FX_LABEL[base];
  const quoteLabel = FX_LABEL[quote];

  // No tiny diagonal slash: it was visual noise at this size. Put the two
  // currency marks side-by-side as a compact monogram instead.
  const combined = `${baseLabel}${quoteLabel}`;
  const fontSize = combined.length >= 5 ? 6.1 : combined.length >= 4 ? 7 : combined.length >= 3 ? 8.2 : 10.2;

  return (
    <text
      x="12"
      y="16.1"
      fontSize={fontSize}
      fontWeight="900"
      letterSpacing="-0.45"
      fill="currentColor"
      textAnchor="middle"
    >
      {combined}
    </text>
  );
}

function resolveGlyph(instrument) {
  if (!instrument) return MarketChart;
  if (METALS.has(instrument)) return Ingot;
  if (CRYPTO.has(instrument)) return instrument === 'BITCOIN' ? Bitcoin : EthDiamond;
  if (ENERGY.has(instrument)) return Droplet;
  if (INDICES.has(instrument)) return MarketChart;

  if (instrument.includes('/')) {
    const [base, quote] = instrument.split('/');
    if (FX_LABEL[base] && FX_LABEL[quote]) return fxPair(base, quote);
  }

  return MarketChart;
}

export default function MarketIcon({ instrument, size = 18, className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block' }}
      aria-hidden="true"
      focusable="false"
    >
      {resolveGlyph(instrument)}
    </svg>
  );
}
