// Money reconciliation for imported trades.
//
// The rule the whole app already trusts (see lib/tradeCompletion): store the
// SIGNED gross result, the fees, and the net result separately, with
//   net = gross − fees.
// A broker import may give us any subset of those three, so this fills in the
// missing one and derives win/loss/breakeven purely from the SIGN of the money —
// never from a label. Deposits/withdrawals are excluded upstream (adapters), so
// by the time a value reaches here it is a genuine trade result.

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Reconcile the three money figures from whatever the adapter found.
 * `fees` is treated as a non-negative cost; a missing fee counts as 0 for the
 * arithmetic but is reported back as null so the review screen can flag it.
 *
 * @param {{ grossPnl?: number|null, netPnl?: number|null, fees?: number|null }} input
 * @returns {{ grossPnl: number|null, fees: number|null, netPnl: number|null,
 *             result: 'win'|'loss'|'breakeven'|null }}
 */
export function reconcileMoney({ grossPnl = null, netPnl = null, fees = null } = {}) {
  const g = numOrNull(grossPnl);
  const n = numOrNull(netPnl);
  const f = fees == null ? null : Math.abs(Number(fees));
  const feeForMath = f ?? 0;

  let gross = g;
  let net = n;

  if (gross == null && net != null) gross = net + feeForMath;
  else if (net == null && gross != null) net = gross - feeForMath;
  // Both present: trust them as-is (don't overwrite a broker's own net).

  const signal = net != null ? net : gross;
  const result = classifyResult(signal);

  return {
    grossPnl: gross == null ? null : round2(gross),
    fees: f == null ? null : round2(f),
    netPnl: net == null ? null : round2(net),
    result,
  };
}

/**
 * win/loss/breakeven from a signed number, or null when there is no number.
 * @param {number|null|undefined} signed
 * @returns {'win'|'loss'|'breakeven'|null}
 */
export function classifyResult(signed) {
  const v = numOrNull(signed);
  if (v == null) return null;
  if (v > 0) return 'win';
  if (v < 0) return 'loss';
  return 'breakeven';
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
