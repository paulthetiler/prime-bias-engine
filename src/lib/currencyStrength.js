// Currency Strength engine.
// IMPORTANT: informational/pair-selection only. This module must not alter the
// Prime Bias score, grade, direction, readiness or trade action.

export const STRENGTH_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];

// Use the complete 8-currency basket: 28 unique crosses. A currency's strength
// is the average of its return against each of the other seven currencies.
// This removes the USD-anchor distortion from the original proof of concept.
export const STRENGTH_SYMBOLS = STRENGTH_CURRENCIES.flatMap((base, i) =>
  STRENGTH_CURRENCIES.slice(i + 1).map((quote) => `${base}/${quote}`),
);

function pctChange(from, to) {
  const a = Number(from);
  const b = Number(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;
  return ((b / a) - 1) * 100;
}

// Every pair contributes equally and symmetrically:
//   pair rises  -> base gets +return, quote gets the inverse return
//   pair falls  -> base gets -return, quote gets the inverse positive return
// Using the exact reciprocal return avoids sign/magnitude drift on larger moves.
export function calculateStrength(pairPrices) {
  const totals = Object.fromEntries(STRENGTH_CURRENCIES.map((c) => [c, 0]));
  const counts = Object.fromEntries(STRENGTH_CURRENCIES.map((c) => [c, 0]));

  for (const [symbol, prices] of Object.entries(pairPrices || {})) {
    const [base, quote] = symbol.split('/');
    if (!(base in totals) || !(quote in totals)) continue;

    const baseReturn = pctChange(prices?.from, prices?.to);
    const quoteReturn = pctChange(1 / Number(prices?.from), 1 / Number(prices?.to));
    if (baseReturn == null || quoteReturn == null) continue;

    totals[base] += baseReturn;
    counts[base] += 1;
    totals[quote] += quoteReturn;
    counts[quote] += 1;
  }

  const rows = STRENGTH_CURRENCIES
    .filter((currency) => counts[currency] > 0)
    .map((currency) => ({
      currency,
      strength: totals[currency] / counts[currency],
      samples: counts[currency],
    }));

  if (rows.length < 2) return [];

  // Centre the complete basket around zero so positive/negative reads naturally.
  const mean = rows.reduce((sum, row) => sum + row.strength, 0) / rows.length;
  return rows
    .map((row) => ({ ...row, strength: row.strength - mean }))
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
