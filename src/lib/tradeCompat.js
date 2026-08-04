// Read-time compatibility for completed trades that predate the immutable engine
// snapshot (migration 0005).
//
// Purely additive and NON-DESTRUCTIVE: this never recomputes a grade, never
// overwrites stored engine outputs, and never touches the database. Historical
// trades are surfaced exactly as they were recorded. All it does is expose a
// synthetic engine version for rows that have none, so downstream code can tell
// "was this trade taken before snapshots existed?" without mistaking a missing
// version for a bug.

/** Synthetic version stamped on trades saved before the snapshot existed. */
export const LEGACY_ENGINE_VERSION = 'legacy-pre-snapshot';

/**
 * Ensure a completed-trade record carries an `engine_version`, WITHOUT changing
 * any of its stored calculation outputs. A row saved before migration 0005 has
 * no `engine_version` and is labelled {@link LEGACY_ENGINE_VERSION} at read time;
 * a row that already has a version is returned unchanged. No grade is ever
 * recalculated here.
 * @param {any} trade
 * @returns {any}
 */
export function normalizeTrade(trade) {
  if (!trade) return trade;
  if (trade.engine_version) return trade;
  return { ...trade, engine_version: LEGACY_ENGINE_VERSION };
}

/** True when a trade predates the immutable engine snapshot. */
export function isLegacyTrade(trade) {
  return !trade?.engine_version || trade.engine_version === LEGACY_ENGINE_VERSION;
}
