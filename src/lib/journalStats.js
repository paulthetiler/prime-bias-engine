// Trading-performance maths for the Journal dashboard.
//
// Everything here is pure and side-effect free so it can be unit tested in
// isolation and reused by the UI without re-deriving the same numbers in a
// dozen places. The functions operate on `completed_trade` records — the
// authoritative P&L history. Monetary figures use `net_pnl` (the realised net
// result after fees); a trade only contributes money when `net_pnl` is a real
// number. Account-relative figures (balance, ROI, equity curve) live in
// `lib/accounts.js`, which understands deposits/withdrawals.

import { hasFinancialResult } from './accounts';

/** @typedef {{ id: string, label: string, days: number|null }} TimeFilter */

/** The time-window chips shown above the dashboard. `days: null` means "all time". */
export const TIME_FILTERS = /** @type {TimeFilter[]} */ ([
  { id: 'today', label: 'Today', days: 0 },
  { id: '7d', label: '7 Days', days: 7 },
  { id: '30d', label: '30 Days', days: 30 },
  { id: '90d', label: '90 Days', days: 90 },
  { id: 'all', label: 'All Time', days: null },
]);

// Retained for seeding a brand-new account's starting balance when the user has
// no ledger yet (see lib/accounts.DEFAULT_STARTING_BALANCE).
export const DEFAULT_STARTING_BALANCE = 10000;

/**
 * Best-known timestamp for a record, tolerant of the slightly different shapes
 * used by completed trades vs journal entries.
 * @param {any} record
 * @returns {number|null} epoch ms, or null when no usable date exists
 */
export function recordTime(record) {
  const raw = record?.completed_at || record?.created_at || record?.created_date;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Inclusive lower bound (epoch ms) for a filter, or null for "all time".
 * "Today" is the local calendar day; the rest are rolling N-day windows.
 * @param {string} filterId
 * @param {number} [now]
 */
export function windowStart(filterId, now = Date.now()) {
  const filter = TIME_FILTERS.find(f => f.id === filterId);
  if (!filter || filter.days === null) return null;
  if (filter.days === 0) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  return now - filter.days * 24 * 60 * 60 * 1000;
}

/**
 * Keep only records inside the selected time window. Records with no usable
 * date are dropped from bounded windows but kept for "all time".
 * @template T
 * @param {T[]} records
 * @param {string} filterId
 * @param {number} [now]
 * @returns {T[]}
 */
export function filterByTimeframe(records, filterId, now = Date.now()) {
  const start = windowStart(filterId, now);
  if (start === null) return [...records];
  return records.filter(r => {
    const t = recordTime(r);
    return t !== null && t >= start;
  });
}

/**
 * Real R-multiple for a trade: realised net P/L divided by the amount risked.
 * Only defined when a positive `amount_risked` was recorded AND the monetary
 * result exists — there is no planned-R fallback (that was the source of the
 * bogus "Avg R:R" figure). Returns null when risk data is missing.
 * @param {any} trade
 * @returns {number|null}
 */
export function rMultiple(trade) {
  const risk = Number(trade?.amount_risked);
  if (!Number.isFinite(risk) || risk <= 0) return null;
  if (!hasFinancialResult(trade)) return null;
  return Number(trade.net_pnl) / risk;
}

const isDirectional = (t) => t?.result === 'win' || t?.result === 'loss';

/**
 * Resolve the account's starting capital from legacy monthly-journal data, used
 * only to seed a brand-new default account. Prefers the earliest monthly-journal
 * `start_balance` on record; falls back to a neutral constant.
 * @param {any[]} monthlyEntries
 * @param {number} [fallback]
 * @returns {{ value: number, source: 'journal'|'default' }}
 */
export function resolveStartingBalance(monthlyEntries = [], fallback = DEFAULT_STARTING_BALANCE) {
  const withBalance = monthlyEntries
    .filter(e => e?.start_balance != null && Number.isFinite(Number(e.start_balance)) && Number(e.start_balance) > 0)
    .sort((a, b) => {
      const yd = Number(a.year) - Number(b.year);
      if (yd !== 0) return yd;
      return MONTH_ORDER[a.month] - MONTH_ORDER[b.month];
    });
  if (withBalance.length) return { value: Number(withBalance[0].start_balance), source: 'journal' };
  return { value: fallback, source: 'default' };
}

const MONTH_ORDER = {
  January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
  July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
};

/**
 * Chronological order (oldest first) by best-known timestamp.
 * @template T
 * @param {T[]} records
 * @returns {T[]}
 */
export function sortChronological(records) {
  return [...records].sort((a, b) => (recordTime(a) ?? 0) - (recordTime(b) ?? 0));
}

/**
 * Headline performance metrics for a set of completed trades. Money figures use
 * `net_pnl` and only count trades whose monetary result has been entered.
 * ROI is NOT computed here — it needs account context (opening balance) and is
 * produced by lib/accounts.periodRoi.
 * @param {any[]} trades
 */
export function computeStats(trades = []) {
  const directional = trades.filter(isDirectional);
  const wins = directional.filter(t => t.result === 'win').length;
  const losses = directional.filter(t => t.result === 'loss').length;
  const winRate = directional.length ? (wins / directional.length) * 100 : 0;

  // Money aggregates only consider trades with a recorded monetary result.
  const pnlTrades = trades.filter(hasFinancialResult);
  const hasPnl = pnlTrades.length > 0;
  let grossProfit = 0, grossLoss = 0;
  for (const t of pnlTrades) {
    const v = Number(t.net_pnl);
    if (v >= 0) grossProfit += v; else grossLoss += Math.abs(v);
  }
  const netPnl = grossProfit - grossLoss;
  // Profit factor: gross win / gross loss.
  //   grossLoss > 0            -> ratio
  //   no losing dollars, wins  -> Infinity ("No losing trades")
  //   nothing at all           -> null ("not enough data")
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null);

  // Average REAL R-multiple, only over trades that recorded amount risked.
  const rValues = trades.map(rMultiple).filter(v => v != null);
  const hasRiskData = rValues.length > 0;
  const avgR = hasRiskData ? rValues.reduce((a, b) => a + b, 0) / rValues.length : null;

  // Streaks run over directional trades in chronological order.
  const directionalChrono = sortChronological(directional);
  let bestWinStreak = 0, run = 0;
  for (const t of directionalChrono) {
    if (t.result === 'win') { run += 1; bestWinStreak = Math.max(bestWinStreak, run); }
    else run = 0;
  }
  let currentStreak = 0, streakType = /** @type {'win'|'loss'|null} */ (null);
  for (let i = directionalChrono.length - 1; i >= 0; i--) {
    if (streakType === null) { streakType = directionalChrono[i].result; currentStreak = 1; }
    else if (directionalChrono[i].result === streakType) currentStreak += 1;
    else break;
  }

  return {
    totalTrades: trades.length,
    directionalCount: directional.length,
    completeCount: pnlTrades.length,
    incompleteCount: trades.length - pnlTrades.length,
    wins,
    losses,
    winRate,
    hasPnl,
    grossProfit,
    grossLoss,
    netPnl,
    profitFactor,
    avgR,
    hasRiskData,
    bestWinStreak,
    currentStreak,
    streakType,
  };
}

/** The trade grades the engine assigns, best → worst. */
export const GRADES = ['A', 'B', 'C', 'D', 'F'];

/**
 * Win rate per grade — the engine's report card. One row per grade (always all
 * five, in order) so the caller can decide whether to hide the empty ones.
 * Rate is a whole-number percentage over directional (win/loss) trades.
 * @param {any[]} trades
 * @returns {{ grade: string, rate: number, count: number }[]}
 */
export function computeGradeBreakdown(trades = []) {
  const directional = trades.filter(isDirectional);
  return GRADES.map(grade => {
    const rows = directional.filter(t => t.grade === grade);
    const wins = rows.filter(t => t.result === 'win').length;
    const rate = rows.length ? Math.round((wins / rows.length) * 100) : 0;
    return { grade, rate, count: rows.length };
  });
}

/**
 * Instruments ranked by win rate (best first), so the UI can surface the best
 * and weakest asset. Only instruments with at least `minTrades` directional
 * trades qualify, keeping a single lucky win from topping the table. Rate is a
 * 0–1 fraction.
 * @param {any[]} trades
 * @param {{ minTrades?: number }} [opts]
 * @returns {{ asset: string, rate: number, n: number }[]}
 */
export function computeAssetRanking(trades = [], { minTrades = 2 } = {}) {
  const directional = trades.filter(isDirectional);
  /** @type {Record<string, { wins: number, n: number }>} */
  const byAsset = {};
  for (const t of directional) {
    const bucket = (byAsset[t.instrument] ||= { wins: 0, n: 0 });
    bucket.n += 1;
    if (t.result === 'win') bucket.wins += 1;
  }
  return Object.entries(byAsset)
    .filter(([, s]) => s.n >= minTrades)
    .map(([asset, s]) => ({ asset, rate: s.wins / s.n, n: s.n }))
    .sort((a, b) => b.rate - a.rate);
}
