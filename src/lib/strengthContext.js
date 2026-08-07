// Shared currency-strength interpretation helpers.
//
// These are the single source of truth for the strength terminology and
// thresholds used by the Strength page, the Summary separation badge and the
// Strength Context block in the full decision view. Keeping them here stops the
// three surfaces from drifting apart.
//
// IMPORTANT: this module is informational/context only. Nothing here feeds the
// Prime Bias score, grade, direction, readiness or trade action.

// Rank a strength table so the strongest currency is position 1.
export function rankMap(rows = []) {
  return Object.fromEntries(rows.map((row, index) => [row.currency, index + 1]));
}

// Positive = the currency climbed the table versus the reference window.
// Negative = it fell. null when either window is missing the currency.
export function rankChange(currency, currentRows, referenceRows) {
  const current = rankMap(currentRows)[currency];
  const previous = rankMap(referenceRows)[currency];
  if (!current || !previous) return null;
  return previous - current;
}

// Reduce a rank change to a movement direction used across every surface.
export function movementFromChange(change) {
  if (change == null || change === 0) return 'flat';
  return change > 0 ? 'climbing' : 'falling';
}

// The canonical strength interpretation shared with the Strength page. Strong is
// defined by absolute basket position (strength >= 0); momentum comes from the
// rank change versus the reference window.
export function interpretation(row, change) {
  const strong = row?.strength >= 0;
  if (change > 0) return strong
    ? { state: 'STRONG · CLIMBING', helper: 'Strengthening — strength has momentum', className: 'text-emerald-600 dark:text-emerald-400' }
    : { state: 'WEAK · CLIMBING', helper: 'Weak but recovering', className: 'text-amber-600 dark:text-amber-400' };
  if (change < 0) return strong
    ? { state: 'STRONG · FALLING', helper: 'Strong but fading', className: 'text-amber-600 dark:text-amber-400' }
    : { state: 'WEAK · FALLING', helper: 'Weakening further', className: 'text-red-600 dark:text-red-400' };
  return strong
    ? { state: 'STRONG · FLAT', helper: 'Strong — established', className: 'text-emerald-600 dark:text-emerald-400' }
    : { state: 'WEAK · FLAT', helper: 'Weak — established', className: 'text-red-600 dark:text-red-400' };
}

// Bucket a pair separation against the current strongest separation. Shared so
// the Summary badge and Strength Context agree on what "HIGH" means.
export function separationLabel(value, maxSeparation) {
  if (!Number.isFinite(value) || maxSeparation <= 0) return 'LOW';
  const ratio = value / maxSeparation;
  if (ratio >= 0.75) return 'VERY HIGH';
  if (ratio >= 0.50) return 'HIGH';
  if (ratio >= 0.25) return 'MED';
  return 'LOW';
}

export function strongerAndWeaker(row) {
  const first = row?.first;
  const second = row?.second;
  if (!first || !second) return { stronger: null, weaker: null };
  return first.strength >= second.strength ? { stronger: first, weaker: second } : { stronger: second, weaker: first };
}

// Short per-currency phrase reused inside the Strength Context sentence. The
// wording mirrors the interpretation() helper so both surfaces stay consistent.
function currencyPhrase(isStrong, movement) {
  if (isStrong) {
    if (movement === 'climbing') return 'strong & climbing';
    if (movement === 'falling') return 'still strong, but falling';
    return 'strong but flat';
  }
  if (movement === 'falling') return 'weak & falling';
  if (movement === 'climbing') return 'weak but recovering';
  return 'weak but flat';
}

// Build the compact contextual reason for a selected FX instrument.
//
// Returns null when strength data is unavailable or the instrument is not one of
// the eight-currency FX pairs, so callers can render nothing in those cases.
//
// State semantics (context only — never a direction signal):
//   SUPPORTING — strong side climbing and/or weak side falling (separation widening)
//   FADING     — stronger side falling and/or weaker side recovering (separation narrowing)
//   MIXED      — one side offsets the other, or both are flat (separation stable)
export function buildPairStrengthContext({ instrument, todayStrengths, referenceStrengths, separations }) {
  if (!instrument || !instrument.includes('/')) return null;
  const rows = Array.isArray(todayStrengths) ? todayStrengths : [];
  if (rows.length < 2) return null;

  const [base, quote] = instrument.split('/').map((part) => part?.trim().toUpperCase());
  if (!base || !quote || base === quote) return null;

  const baseRow = rows.find((row) => row.currency === base);
  const quoteRow = rows.find((row) => row.currency === quote);
  if (!baseRow || !quoteRow) return null; // Not an eight-currency FX pair (e.g. metals, indices).

  const separation = Math.abs(baseRow.strength - quoteRow.strength);
  const maxSeparation = Array.isArray(separations) && separations.length ? separations[0].separation : 0;
  const sepLabel = separationLabel(separation, maxSeparation);

  const reference = Array.isArray(referenceStrengths) ? referenceStrengths : [];
  const baseMove = movementFromChange(rankChange(base, rows, reference));
  const quoteMove = movementFromChange(rankChange(quote, rows, reference));

  const baseIsStronger = baseRow.strength >= quoteRow.strength;
  const stronger = baseIsStronger
    ? { currency: base, row: baseRow, movement: baseMove }
    : { currency: quote, row: quoteRow, movement: quoteMove };
  const weaker = baseIsStronger
    ? { currency: quote, row: quoteRow, movement: quoteMove }
    : { currency: base, row: baseRow, movement: baseMove };

  // Forces on the gap between the two currencies. Widening pushes the pair apart
  // (strong side up, weak side down); narrowing closes it (strong side down, weak
  // side recovering).
  const widening = (stronger.movement === 'climbing' ? 1 : 0) + (weaker.movement === 'falling' ? 1 : 0);
  const narrowing = (stronger.movement === 'falling' ? 1 : 0) + (weaker.movement === 'climbing' ? 1 : 0);
  const net = widening - narrowing;

  let state;
  let suffix;
  if (net > 0) {
    state = 'SUPPORTING';
    suffix = ' — separation widening';
  } else if (net < 0) {
    state = 'FADING';
    suffix = ' — separation narrowing';
  } else {
    state = 'MIXED';
    suffix = widening === 0 && narrowing === 0 ? ' — separation stable' : '';
  }

  const strongerPhrase = currencyPhrase(stronger.row.strength >= 0, stronger.movement);
  const weakerPhrase = currencyPhrase(weaker.row.strength >= 0, weaker.movement);
  const reason = `${stronger.currency} ${strongerPhrase} / ${weaker.currency} ${weakerPhrase}${suffix}`;

  return {
    state,
    tone: state.toLowerCase(),
    reason,
    separation,
    separationLabel: sepLabel,
    stronger: stronger.currency,
    weaker: weaker.currency,
  };
}
