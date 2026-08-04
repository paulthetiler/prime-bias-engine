// Shared, pure financial maths for the trade-capture and journal-edit flows.
//
// Every completion / edit path in the app must funnel its money maths through
// these helpers so quick completion, detailed completion, "Add result" and
// journal editing can never disagree about what gross / net / result mean. All
// functions are side-effect free and unit-tested. Nothing here recomputes an
// engine grade or writes to the database.
//
// Money model (authoritative):
//   * gross P&L is entered DIRECTLY and signed — a loss is negative.
//   * fees are a positive cost.
//   * net P&L = gross P&L − fees.  (A loss with fees becomes MORE negative.)
//   * result is derived from / validated against net P&L when it exists.

import {
  finiteOrNull,
  normalizeSplitCount,
  normalizeReasonTags,
  normalizeTradeDirection,
} from './tradeCompat';

export { finiteOrNull, normalizeSplitCount, normalizeReasonTags, normalizeTradeDirection };

/** Fixed, deliberately small mood vocabulary (no psychological inference). */
export const MOODS = ['calm', 'confident', 'hesitant', 'frustrated', 'impulsive'];

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * A non-negative money magnitude (fees, amount risked), or null. A negative input
 * is treated as its magnitude; non-numeric/empty becomes null (never 0).
 * @param {any} v
 * @returns {number|null}
 */
export function nonNegMoney(v) {
  const n = finiteOrNull(v);
  return n === null ? null : Math.abs(n);
}

/** Validate that a mood is in the known set, else null. */
export function normalizeMood(v) {
  return MOODS.includes(v) ? v : null;
}

/**
 * Net P&L = gross − fees. Null when no gross P&L was entered (financially
 * incomplete). Missing fees count as 0. Break-even is represented by gross 0.
 * @param {any} gross  signed gross P&L (may be null)
 * @param {any} fees   non-negative cost (may be null)
 * @returns {number|null}
 */
export function computeNetPnl(gross, fees) {
  const g = finiteOrNull(gross);
  if (g === null) return null;
  const f = nonNegMoney(fees) ?? 0;
  return round2(g - f);
}

/**
 * The result implied by a net P&L. Positive → win, negative → loss, zero →
 * breakeven. Null when there is no net P&L to judge.
 * @param {any} net
 * @returns {'win'|'loss'|'breakeven'|null}
 */
export function resultFromNet(net) {
  const n = finiteOrNull(net);
  if (n === null) return null;
  if (n > 0) return 'win';
  if (n < 0) return 'loss';
  return 'breakeven';
}

/**
 * Reconcile a user-selected result against the entered financial data. When a net
 * P&L exists it is authoritative — the result is set to match it (auto-correct
 * with a message policy, chosen over blocking). Without financial data the
 * user's selected result stands.
 * @param {string|null|undefined} selected  win|loss|breakeven|not_taken
 * @param {any} net
 * @returns {{ result: string|null, changed: boolean }}
 */
export function reconcileResult(selected, net) {
  const expected = resultFromNet(net);
  if (expected === null) return { result: selected ?? null, changed: false };
  return { result: expected, changed: selected !== expected };
}

/**
 * Projected account balance after a trade = balance before + net P&L. Null when
 * either input is unavailable (so callers never render a misleading number).
 * @param {any} balanceBefore
 * @param {any} net
 * @returns {number|null}
 */
export function projectedBalance(balanceBefore, net) {
  const b = finiteOrNull(balanceBefore);
  const n = finiteOrNull(net);
  if (b === null || n === null) return null;
  return round2(b + n);
}

/**
 * Risk percentage = amount risked / balance before × 100. Null unless BOTH are
 * positive. This is the true risk fraction — not the workbook's P&L/invested.
 * @param {any} amountRisked
 * @param {any} balanceBefore
 * @returns {number|null}
 */
export function riskPct(amountRisked, balanceBefore) {
  const risk = finiteOrNull(amountRisked);
  const bal = finiteOrNull(balanceBefore);
  if (risk === null || bal === null || risk <= 0 || bal <= 0) return null;
  return round2((risk / bal) * 100);
}

/**
 * Realised R multiple = net P&L / amount risked. This is the TRUE R (money made
 * or lost per unit risked), never the workbook's "P&L / invested amount". Null
 * unless amount risked is positive and net P&L exists.
 * @param {any} net
 * @param {any} amountRisked
 * @returns {number|null}
 */
export function realisedR(net, amountRisked) {
  const n = finiteOrNull(net);
  const risk = finiteOrNull(amountRisked);
  if (n === null || risk === null || risk <= 0) return null;
  return n / risk;
}

/**
 * ESTIMATED points from net P&L and position size — a clearly-labelled fallback
 * only, never broker-verified. Null unless position size is positive and net P&L
 * exists. Callers must not persist this without explicit user confirmation.
 * @param {any} net
 * @param {any} positionSize
 * @returns {number|null}
 */
export function estimatedPoints(net, positionSize) {
  const n = finiteOrNull(net);
  const size = finiteOrNull(positionSize);
  if (n === null || size === null || size <= 0) return null;
  return round2(n / size);
}

/**
 * Financial-completeness state for a completed trade, derived (no DB column):
 *   - 'outcome_only'      : a win/loss/breakeven with no net P&L recorded.
 *   - 'account_unassigned': net P&L exists but no account is linked.
 *   - 'risk_incomplete'   : net P&L + account exist but amount risked is missing.
 *   - 'complete'          : net P&L, account and a positive amount risked all present.
 * @param {any} trade
 * @returns {'outcome_only'|'account_unassigned'|'risk_incomplete'|'complete'}
 */
export function financialCompletenessState(trade) {
  const net = finiteOrNull(trade?.net_pnl);
  if (net === null) return 'outcome_only';
  if (!trade?.account_id) return 'account_unassigned';
  const risk = finiteOrNull(trade?.amount_risked);
  if (risk === null || risk <= 0) return 'risk_incomplete';
  return 'complete';
}

/** Human labels for the completeness states, for badges. */
export const COMPLETENESS_LABEL = {
  complete: 'Complete',
  outcome_only: 'Outcome only',
  risk_incomplete: 'Risk incomplete',
  account_unassigned: 'Account unassigned',
};
