// Read-time compatibility for completed trades and account transactions across
// schema generations (migrations 0005 engine snapshot, 0006 ledger fields,
// 0007 wage transactions).
//
// Everything here is PURE and NON-DESTRUCTIVE: nothing recomputes an engine
// grade, nothing writes back to the database, and nothing overwrites a real
// stored value. Normalisation only fills predictable read-time defaults for
// columns that a given row predates, so the rest of the app can rely on a stable
// shape. Invalid or missing values become null or a safe compatibility default —
// never 0, because 0 is a real financial/movement value.

/** Synthetic version stamped on trades saved before the snapshot existed. */
export const LEGACY_ENGINE_VERSION = 'legacy-pre-snapshot';

/** Read-time default for split_count when a trade predates the column. */
export const DEFAULT_SPLIT_COUNT = 1;

// ── Pure field validators ──────────────────────────────────────────────────────

/**
 * A finite number, or null. Preserves 0 (a meaningful value); rejects
 * null/undefined/''/NaN/Infinity and non-numeric input.
 * @param {any} v
 * @returns {number|null}
 */
export function finiteOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Whether a value is a usable finite number. */
export function isFiniteNumber(v) {
  return finiteOrNull(v) !== null;
}

/**
 * Normalise a split count to an integer >= 1. Missing or invalid values fall
 * back to the read-time default of 1 (a trade is at least one position).
 * @param {any} v
 * @returns {number}
 */
export function normalizeSplitCount(v) {
  const n = finiteOrNull(v);
  if (n === null || n < 1) return DEFAULT_SPLIT_COUNT;
  return Math.floor(n);
}

/**
 * Normalise reason tags to an array. A missing/invalid value becomes an empty
 * read-time list; a real array is returned as-is.
 * @param {any} v
 * @returns {any[]}
 */
export function normalizeReasonTags(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * Normalise an EXECUTED trade direction to 'long' | 'short' | null. Accepts the
 * stored values ('long'/'short') and tolerantly maps engine-style 'buy'/'sell'
 * when a caller explicitly passes them. Anything else → null. This is only ever
 * fed an EXPLICIT executed-direction value — it must not be used to guess the
 * executed side from the engine recommendation.
 * @param {any} v
 * @returns {'long'|'short'|null}
 */
export function normalizeTradeDirection(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s === 'long' || s === 'buy') return 'long';
  if (s === 'short' || s === 'sell') return 'short';
  return null;
}

// ── Trade normalisation ─────────────────────────────────────────────────────────

/**
 * Ensure a completed-trade record has a predictable shape across schema
 * generations, WITHOUT changing any stored calculation output. Missing columns
 * are filled with safe read-time defaults; present values are preserved. No grade
 * is ever recalculated, and the source object is never mutated.
 *
 * Read-time defaults for a pre-ledger / legacy trade:
 *   engine_version → 'legacy-pre-snapshot' (when absent)
 *   position_size  → null
 *   points_pips    → null
 *   split_count    → 1
 *   mood           → null
 *   reason_tags    → []
 *   trade_direction→ null  (the executed side is unknown; we do NOT derive it
 *                           from the engine recommendation in `direction`)
 * @param {any} trade
 * @returns {any}
 */
export function normalizeTrade(trade) {
  if (!trade) return trade;
  return {
    ...trade,
    engine_version: trade.engine_version || LEGACY_ENGINE_VERSION,
    position_size: finiteOrNull(trade.position_size),
    points_pips: finiteOrNull(trade.points_pips),
    split_count: normalizeSplitCount(trade.split_count),
    mood: trade.mood ?? null,
    reason_tags: normalizeReasonTags(trade.reason_tags),
    trade_direction: normalizeTradeDirection(trade.trade_direction),
  };
}

/** True when a trade predates the immutable engine snapshot. */
export function isLegacyTrade(trade) {
  return !trade?.engine_version || trade.engine_version === LEGACY_ENGINE_VERSION;
}

// ── Transaction compatibility ────────────────────────────────────────────────────

/**
 * Whether a transaction is an explicit wage withdrawal. This is based SOLELY on
 * the new explicit type — an ordinary 'withdrawal' is never guessed to be a wage.
 * @param {any} txn
 * @returns {boolean}
 */
export function isWageWithdrawal(txn) {
  return txn?.type === 'wage_withdrawal';
}
