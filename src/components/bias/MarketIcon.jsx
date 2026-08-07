import React from 'react';

// ── Monochrome market icons ──────────────────────────────────────────────────
// A subtle supporting glyph for each instrument — the instrument NAME stays the
// primary identifier. Every glyph uses `currentColor` so it inherits the pill's
// colour and works in both themes. No flags or emoji.

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

// Clear ingot silhouette — deliberately larger and more centred than the old
// stacked-bars mark, which could read as a briefcase at pill size.
const Ingot = (
  <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
    <path d="M6.2 9.1h11.6l2 6.2H4.2z" />
    <path d="M8.4 9.1 9.5 6.8h5L15.6 9" />
    <path d="M7.1 13.1h9.8" opacity="0.45" />
  </g>
);

const Bitcoin = (
  <text x="12" y="18" fontSize="16" fontWeight="800" fill="currentColor" textAnchor="middle">₿</text>
);

const EthDiamond = (
  <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
    <path d="M12 4 17.5 12 12 15 6.5 12z" />
    <path d="M6.9 13.2 12 20l5.1-6.8" />
  </g>
);

const Droplet = (
  <path
    d="M12 4.5c2.8 3.8 4.6 6.2 4.6 8.6a4.6 4.6 0 0 1-9.2 0c0-2.4 1.8-4.8 4.6-8.6z"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinejoin="round"
  />
);

const Candles = (
  <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="9" y1="4.6" x2="9" y2="19.4" />
    <rect x="7.3" y="8" width="3.4" height="6.6" rx="1" />
    <line x1="15" y1="6.6" x2="15" y2="17.4" />
    <rect x="13.3" y="9.6" width="3.4" height="5.4" rx="1" />
  </g>
);

// FX pair — readable at 18px without pretending every currency has a unique
// symbol. Dollar currencies use a tiny qualifier (A$, C$, NZ$) where needed.
function pair(base, quote) {
  const baseLabel = FX_LABEL[base];
  const quoteLabel = FX_LABEL[quote];
  const baseSize = baseLabel.length > 1 ? 6.7 : 9.5;
  const quoteSize = quoteLabel.length > 1 ? 6.7 : 9.5;

  return (
    <>
      <text
        x="7.1"
        y="11"
        fontSize={baseSize}
        fontWeight="750"
        fill="currentColor"
        textAnchor="middle"
      >
        {baseLabel}
      </text>
      <path
        d="M9.6 16.7 14.5 7.3"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.35"
      />
      <text
        x="16.9"
        y="19.1"
        fontSize={quoteSize}
        fontWeight="750"
        fill="currentColor"
        textAnchor="middle"
      >
        {quoteLabel}
      </text>
    </>
  );
}

function resolveGlyph(instrument) {
  if (!instrument) return Candles;
  if (METALS.has(instrument)) return Ingot;
  if (CRYPTO.has(instrument)) return instrument === 'BITCOIN' ? Bitcoin : EthDiamond;
  if (ENERGY.has(instrument)) return Droplet;
  if (INDICES.has(instrument)) return Candles;

  if (instrument.includes('/')) {
    const [base, quote] = instrument.split('/');
    if (FX_LABEL[base] && FX_LABEL[quote]) return pair(base, quote);
  }

  return Candles;
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
