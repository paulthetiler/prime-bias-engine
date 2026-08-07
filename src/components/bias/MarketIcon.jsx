import React from 'react';

// Compact coloured market marks for the instrument pills. These are deliberately
// recognisable at mobile size while the instrument name remains the primary label.
// No flags or emoji; colour is confined to the artwork inside the existing tile.

const FX = {
  USD: { label: '$', colour: '#16A34A' },
  EUR: { label: '€', colour: '#2563EB' },
  JPY: { label: '¥', colour: '#DC2626' },
  GBP: { label: '£', colour: '#7C3AED' },
  CHF: { label: 'Fr', colour: '#E11D48' },
  AUD: { label: 'A$', colour: '#0891B2' },
  CAD: { label: 'C$', colour: '#EA580C' },
  NZD: { label: 'NZ$', colour: '#0F766E' },
};

const METALS = new Set(['GOLD', 'GOLD/USD', 'Copper', 'Aluminum', 'Zinc', 'Lead', 'Carbon']);
const CRYPTO = new Set(['BITCOIN', 'ETHUSDT']);
const ENERGY = new Set(['OIL', 'GAS']);
const INDICES = new Set(['DAX', 'FTSE', 'DOW', 'SP500', 'US100', 'CAC40', 'JAP225', 'Hong HS50', 'AUD200', 'SMI', 'Dollar']);

const Gold = (
  <g stroke="#A16207" strokeLinejoin="round">
    <path d="M6 10.2h12l2.1 6.3H3.9z" fill="#FBBF24" strokeWidth="1.2" />
    <path d="M8.2 10.2 9.5 7h5l1.3 3.2" fill="#FDE68A" strokeWidth="1.3" />
    <path d="M7.2 13.5h9.6" fill="none" strokeWidth="1" opacity=".55" />
  </g>
);

const Bitcoin = (
  <g>
    <circle cx="12" cy="12" r="9" fill="#F7931A" />
    <text x="12" y="17" fontSize="13.5" fontWeight="900" fill="#fff" textAnchor="middle">₿</text>
  </g>
);

const Ethereum = (
  <g strokeLinejoin="round">
    <path d="M12 3.2 17.8 12 12 15.1 6.2 12z" fill="#627EEA" />
    <path d="M6.7 13.2 12 20.4l5.3-7.2L12 16.4z" fill="#8A9DF0" />
    <path d="M12 3.2v11.9L6.2 12z" fill="#8A9DF0" opacity=".9" />
  </g>
);

const Oil = (
  <g>
    <path d="M12 3.8c3.2 4.2 5.2 7 5.2 9.5a5.2 5.2 0 0 1-10.4 0c0-2.5 2-5.3 5.2-9.5z" fill="#111827" />
    <path d="M9.2 14.2c.5 1.4 1.5 2.1 3 2.2" fill="none" stroke="#64748B" strokeWidth="1.2" strokeLinecap="round" />
  </g>
);

const Index = (
  <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 18.5V14h3v4.5M10.5 18.5v-7.8h3v7.8M16 18.5V8h3v10.5" stroke="#64748B" strokeWidth="1.55" />
    <path d="m5.2 11.5 4-3.1 3.4 1.7 5.8-5" stroke="#0D9488" strokeWidth="2" />
    <path d="m15.8 5.2 2.6-.1-.1 2.6" stroke="#0D9488" strokeWidth="1.7" />
  </g>
);

function fxPair(base, quote) {
  const a = FX[base];
  const b = FX[quote];
  const aSize = a.label.length > 1 ? 7 : 10;
  const bSize = b.label.length > 1 ? 7 : 10;

  return (
    <>
      <circle cx="8.2" cy="9.2" r="6.3" fill={a.colour} />
      <circle cx="15.8" cy="14.8" r="6.3" fill={b.colour} stroke="#fff" strokeWidth="1.25" />
      <text x="8.2" y="12.1" fontSize={aSize} fontWeight="900" fill="#fff" textAnchor="middle">{a.label}</text>
      <text x="15.8" y="17.7" fontSize={bSize} fontWeight="900" fill="#fff" textAnchor="middle">{b.label}</text>
    </>
  );
}

function resolveGlyph(instrument) {
  if (!instrument) return Index;
  if (METALS.has(instrument)) return Gold;
  if (CRYPTO.has(instrument)) return instrument === 'BITCOIN' ? Bitcoin : Ethereum;
  if (ENERGY.has(instrument)) return Oil;
  if (INDICES.has(instrument)) return Index;

  if (instrument.includes('/')) {
    const [base, quote] = instrument.split('/');
    if (FX[base] && FX[quote]) return fxPair(base, quote);
  }

  return Index;
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
