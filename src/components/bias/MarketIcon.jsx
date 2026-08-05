import React from 'react';

// ── Monochrome market icons ──────────────────────────────────────────────────
// A subtle supporting glyph for each instrument — the instrument NAME stays the
// primary identifier. Every glyph is drawn in `currentColor` so it inherits the
// pill's colour (muted on a resting pill, white on the selected one) and works
// in both themes. No flags, no emoji, no invented symbols: FX pairs show their
// two familiar currency symbols; commodities, crypto, energy and indices get a
// simple category mark.

const SYM = { USD: '$', EUR: '€', JPY: '¥', GBP: '£', CHF: '₣', AUD: '$', CAD: '$', NZD: '$' };

const METALS = new Set(['GOLD', 'GOLD/USD', 'Copper', 'Aluminum', 'Zinc', 'Lead', 'Carbon']);
const CRYPTO = new Set(['BITCOIN', 'ETHUSDT']);
const ENERGY = new Set(['OIL', 'GAS']);
const INDICES = new Set(['DAX', 'FTSE', 'DOW', 'SP500', 'US100', 'CAC40', 'JAP225', 'Hong HS50', 'AUD200', 'SMI', 'Dollar']);

// Stacked bars — metals.
const Bars = (
  <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
    <path d="M9.6 13h4.8l.7 2.7H8.9z" />
    <path d="M5.9 16.6h4.8l.7 2.7H5.2z" />
    <path d="M13.3 16.6h4.8l.7 2.7h-6.2z" />
  </g>
);

// Bitcoin — its own recognisable mark.
const Bitcoin = (
  <text x="12" y="18" fontSize="16" fontWeight="800" fill="currentColor" textAnchor="middle">₿</text>
);

// Ethereum — minimal diamond.
const EthDiamond = (
  <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round">
    <path d="M12 4 17.5 12 12 15 6.5 12z" />
    <path d="M6.9 13.2 12 20l5.1-6.8" />
  </g>
);

// Droplet — energy.
const Droplet = (
  <path d="M12 4.5c2.8 3.8 4.6 6.2 4.6 8.6a4.6 4.6 0 0 1-9.2 0c0-2.4 1.8-4.8 4.6-8.6z"
    fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
);

// Candlesticks — indices and generic fallback.
const Candles = (
  <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="9" y1="4.6" x2="9" y2="19.4" />
    <rect x="7.3" y="8" width="3.4" height="6.6" rx="1" />
    <line x1="15" y1="6.6" x2="15" y2="17.4" />
    <rect x="13.3" y="9.6" width="3.4" height="5.4" rx="1" />
  </g>
);

// FX pair — the two currency symbols, split by a hairline diagonal.
function pair(baseSym, quoteSym) {
  return (
    <>
      <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.35" />
      <text x="7.4" y="11.4" fontSize="9" fontWeight="700" fill="currentColor" textAnchor="middle">{baseSym}</text>
      <text x="16.4" y="19.6" fontSize="9" fontWeight="700" fill="currentColor" textAnchor="middle">{quoteSym}</text>
    </>
  );
}

function resolveGlyph(instrument) {
  if (!instrument) return Candles;
  if (METALS.has(instrument)) return Bars;
  if (CRYPTO.has(instrument)) return instrument === 'BITCOIN' ? Bitcoin : EthDiamond;
  if (ENERGY.has(instrument)) return Droplet;
  if (INDICES.has(instrument)) return Candles;
  if (instrument.includes('/')) {
    const [base, quote] = instrument.split('/');
    if (SYM[base] && SYM[quote]) return pair(SYM[base], SYM[quote]);
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
