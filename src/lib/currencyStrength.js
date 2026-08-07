// Currency Strength engine.
// IMPORTANT: informational/pair-selection only. This module must not alter the
// Prime Bias score, grade, direction, readiness or trade action.

export const STRENGTH_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];

// Seven USD crosses form a complete connected graph for the eight currencies.
// Using LOG returns means every other cross can be derived exactly as a relative
// move: log(A/B) = log(A/USD) - log(B/USD). This gives us the same mathematical
// full-basket relationship without paying 28 API credits in one minute.
export const STRENGTH_SYMBOLS = [
  'EUR/USD',
  'GBP/USD',
  'AUD/USD',
  'NZD/USD',
  'USD/JPY',
  'USD/CHF',
  'USD/CAD',
];

function logReturn(from, to) {
  const a = Number(from);
  const b = Number(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  return Math.log(b / a) * 100;
}

// Convert the seven quoted pairs into one common currency-vs-USD log-return
// scale. USD itself is zero before centring.
export function currencyReturnsVsUsd(pairPrices) {
  const returns = { USD: 0 };

  for (const symbol of STRENGTH_SYMBOLS) {
    const prices = pairPrices?.[symbol];
    if (!prices) continue;
    const [base, quote] = symbol.split('/');
    const r = logReturn(prices.from, prices.to);
    if (r == null) continue;

    if (quote === 'USD') returns[base] = r;
    else if (base === 'USD') returns[quote] = -r;
  }

  return returns;
}

// With a common numeraire, each currency's average performance versus ALL other
// seven currencies equals its centred log return. So this is a mathematically
// full 8-currency basket, not a "USD strength meter" despite using seven source
// quotes to reconstruct it.
export function calculateStrength(pairPrices) {
  const vsUsd = currencyReturnsVsUsd(pairPrices);
  const available = STRENGTH_CURRENCIES.filter((currency) => Number.isFinite(vsUsd[currency]));
  if (available.length < 2) return [];

  const mean = available.reduce((sum, currency) => sum + vsUsd[currency], 0) / available.length;

  return available
    .map((currency) => ({
      currency,
      strength: vsUsd[currency] - mean,
      samples: available.length - 1,
    }))
    .sort((a, b) => b.strength - a.strength);
}

export function calculatePairSeparations(strengthRows) {
  const strengths = Object.fromEntries(strengthRows.map(({ currency, strength }) => [currency, strength]));
  const rows = [];

  for (let i = 0; i < STRENGTH_CURRENCIES.length; i += 1) {
    for (let j = i + 1; j < STRENGTH_CURRENCIES.length; j += 1) {
      const a = STRENGTH_CURRENCIES[i];
      const b = STRENGTH_CURRENCIES[j];
      if (!Number.isFinite(strengths[a]) || !Number.isFinite(strengths[b])) continue;
      rows.push({
        pair: `${a}/${b}`,
        separation: Math.abs(strengths[a] - strengths[b]),
        first: { currency: a, strength: strengths[a] },
        second: { currency: b, strength: strengths[b] },
      });
    }
  }

  return rows.sort((a, b) => b.separation - a.separation);
}

export function buildStrengthSnapshot(pairPrices) {
  const strengths = calculateStrength(pairPrices);
  return { strengths, separations: calculatePairSeparations(strengths) };
}
