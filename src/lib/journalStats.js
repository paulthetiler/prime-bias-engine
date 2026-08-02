// Trading-performance maths for the Journal dashboard.
//
// Everything here is pure and side-effect free so it can be unit tested in
// isolation and reused by the UI without re-deriving the same numbers in a
// dozen places. The functions operate on `completed_trade` records (the
// authoritative P&L history) and, for account-relative figures like ROI and
// the balance curve, a resolved starting balance.

/** @typedef {{ id: string, label: string, days: number|null }} TimeFilter */

/** The time-window chips shown above the dashboard. `days: null` means "all time". */
export const TIME_FILTERS = /** @type {TimeFilter[]} */ ([
  { id: 'today', label: 'Today', days: 0 },
  { id: '7d', label: '7 Days', days: 7 },
  { id: '30d', label: '30 Days', days: 30 },
  { id: '90d', label: '90 Days', days: 90 },
  { id: 'all', label: 'All Time', days: null },
]);

// When no monthly journal balance is on record we still want the ROI and
// Account-Balance views to render, so fall back to a neutral round number and
// surface that assumption in the UI.
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
 * Realised R-multiple for a trade, using planned-R accounting: a win banks its
 * planned reward (the `target` R:R, default 1R), a loss gives back 1R, and a
 * break-even is flat. Non-decisive trades return null. This is the standard
 * approximation for journals that don't record the exact stop distance.
 * @param {any} trade
 * @returns {number|null}
 */
export function rMultiple(trade) {
  const target = Number(trade?.target);
  const reward = Number.isFinite(target) && target > 0 ? target : 1;
  switch (trade?.result) {
    case 'win': return reward;
    case 'loss': return -1;
    case 'breakeven': return 0;
    default: return null;
  }
}

const isDecisive = (t) => t?.result === 'win' || t?.result === 'loss';
const hasNumericPnl = (t) => t?.pnl != null && Number.isFinite(Number(t.pnl));

/**
 * Resolve the account's starting capital for ROI / balance figures. Prefers the
 * earliest monthly-journal `start_balance` on record (real user data); falls
 * back to a neutral constant so the dashboard still renders.
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
 * Headline performance metrics for a set of completed trades.
 * @param {any[]} trades
 * @param {{ startingBalance?: number }} [opts]
 */
export function computeStats(trades = [], { startingBalance = DEFAULT_STARTING_BALANCE } = {}) {
  const decisive = trades.filter(isDecisive);
  const wins = decisive.filter(t => t.result === 'win').length;
  const losses = decisive.filter(t => t.result === 'loss').length;
  const winRate = decisive.length ? (wins / decisive.length) * 100 : 0;

  // P&L aggregates only consider trades that actually recorded a number.
  const pnlTrades = trades.filter(hasNumericPnl);
  const hasPnl = pnlTrades.length > 0;
  let grossProfit = 0, grossLoss = 0;
  for (const t of pnlTrades) {
    const v = Number(t.pnl);
    if (v >= 0) grossProfit += v; else grossLoss += Math.abs(v);
  }
  const netPnl = grossProfit - grossLoss;
  // Profit factor: gross win / gross loss. Undefined with no losing dollars.
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null);
  const roiPct = hasPnl && startingBalance ? (netPnl / startingBalance) * 100 : null;

  // Average planned Risk:Reward across trades that set a target.
  const rrValues = trades
    .map(t => Number(t.target))
    .filter(v => Number.isFinite(v) && v > 0);
  const avgRr = rrValues.length ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : null;

  // Streaks run over decisive trades in chronological order.
  const decisiveChrono = sortChronological(decisive);
  let bestWinStreak = 0, run = 0;
  for (const t of decisiveChrono) {
    if (t.result === 'win') { run += 1; bestWinStreak = Math.max(bestWinStreak, run); }
    else run = 0;
  }
  let currentStreak = 0, streakType = /** @type {'win'|'loss'|null} */ (null);
  for (let i = decisiveChrono.length - 1; i >= 0; i--) {
    if (streakType === null) { streakType = decisiveChrono[i].result; currentStreak = 1; }
    else if (decisiveChrono[i].result === streakType) currentStreak += 1;
    else break;
  }

  return {
    totalTrades: trades.length,
    decisiveCount: decisive.length,
    wins,
    losses,
    winRate,
    hasPnl,
    grossProfit,
    grossLoss,
    netPnl,
    profitFactor,
    roiPct,
    avgRr,
    bestWinStreak,
    currentStreak,
    streakType,
    startingBalance,
    endingBalance: startingBalance + netPnl,
  };
}

/**
 * Cumulative series for the equity curve. Each point exposes three read-outs
 * off the same running P&L so the chart can switch modes without recompute:
 *   - `equity`  cumulative P&L (starts at 0)
 *   - `balance` starting balance + cumulative P&L
 *   - `roi`     cumulative P&L as % of starting balance
 * Only trades with a numeric P&L contribute; an unpriced win still advances the
 * index but leaves the running total flat.
 * @param {any[]} trades
 * @param {{ startingBalance?: number }} [opts]
 */
export function buildEquitySeries(trades = [], { startingBalance = DEFAULT_STARTING_BALANCE } = {}) {
  const chrono = sortChronological(trades.filter(hasNumericPnl));
  let running = 0;
  return chrono.map((t, i) => {
    running += Number(t.pnl);
    const equity = round2(running);
    return {
      i: i + 1,
      date: t.completed_at || t.created_at || t.created_date || null,
      instrument: t.instrument,
      equity,
      balance: round2(startingBalance + running),
      roi: startingBalance ? round2((running / startingBalance) * 100) : 0,
    };
  });
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Attach the P&L-bearing fields from a completed trade onto a journal entry so
 * the entry card can show profit, ROI and R-multiple. Falls back gracefully
 * when the linked trade is missing.
 * @param {any} entry a trade_journal_entry
 * @param {Map<string, any>} tradesById completed trades keyed by id
 * @param {{ startingBalance?: number }} [opts]
 */
export function enrichEntry(entry, tradesById, { startingBalance = DEFAULT_STARTING_BALANCE } = {}) {
  const trade = entry?.completed_trade_id ? tradesById.get(entry.completed_trade_id) : null;
  const pnl = trade && hasNumericPnl(trade) ? Number(trade.pnl) : null;
  const roi = pnl != null && startingBalance ? round2((pnl / startingBalance) * 100) : null;
  // Prefer the linked trade for R-multiple (it owns direction/result/target),
  // but the entry carries the same fields, so either works.
  const r = rMultiple(trade || entry);
  return { ...entry, pnl, roi, rMultiple: r };
}
