// Currency Strength proof of concept.
// IMPORTANT: informational/pair-selection only. This module must not alter the
// Prime Bias score, grade, direction, readiness or trade action.

export const STRENGTH_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];

// Seven USD crosses are sufficient to place all eight currencies on one common
// relative-performance scale. This keeps API usage small enough for prototyping.
export const STRENGTH_SYMBOLS = [
  'EUR/USD',
  'GBP/USD',
  'AUD/USD',
  'NZD/USD',
  'USD/JPY',
  'USD/CHF',
  'USD/CAD',
];

function pctChange(from, to) {
  const a = Number(from);
  const b = Number(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return null;
  return ((b / a) - 1) * 100;
}

// Converts each USD cross into a currency-vs-USD return. For XXX/USD, a rising
// pair means XXX is stronger. For USD/XXX, a rising pair means XXX is weaker,
// so the return is inverted by using the reciprocal prices.
export function returnsVsUsd(pairPrices) {
  const result = { USD: 0 };

  for (const symbol of STRENGTH_SYMBOLS) {
    const prices = pairPrices[symbol];
    if (!prices) continue;

    const [base, quote] = symbol.split('/');
    let change;

    if (quote === 'USD') {
      change = pctChange(prices.from, prices.to);
      if (change != null) result[base] = change;
    } else if (base === 'USD') {
      // Reciprocal return gives the quote currency's performance versus USD.
      change = pctChange(1 / Number(prices.from), 1 / Number(prices.to));
      if (change != null) result[quote] = change;
    }
  }

  return result;
}

// Centre the basket around zero. Scores remain percentage-like and deliberately
// unweighted in phase one; 1H/4H/24H should be inspected independently before
// we invent a composite formula.
export function calculateStrength(pairPrices) {
  const vsUsd = returnsVsUsd(pairPrices);
  const available = STRENGTH_CURRENCIES.filter((currency) => Number.isFinite(vsUsd[currency]));
  if (available.length < 2) return [];

  const mean = available.reduce((sum, currency) => sum + vsUsd[currency], 0) / available.length;

  return available
    .map((currency) => ({
      currency,
      strength: vsUsd[currency] - mean,
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
  return {
    strengths,
    separations: calculatePairSeparations(strengths),
  };
}
