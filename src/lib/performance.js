// Tested performance metrics + engine-quality breakdowns (issue #14, phase 6).
//
// Pure, side-effect free, and computed ONLY from realised ledger data
// (completed_trade net_pnl/fees/points_pips + account_transaction cashflows). No
// monetary, risk or pips value is ever invented. All trade inputs are run through
// `withDerivedFinancials` so legacy `pnl`-only rows contribute correctly.
//
// Conventions (documented once, applied everywhere):
//   * winRate / lossRate are FRACTIONS in [0,1] (not percentages). They are the
//     OUTCOME rates over all win/loss trades (may include outcome-only trades
//     with no money) — an outcome statistic.
//   * moneyWinRate / moneyLossRate are the rates over FINANCIALLY-COMPLETE
//     directional trades only, and are the basis for monetary expectancy. An
//     outcome-only loss (net_pnl null) is NEVER treated as a £0 loss.
//   * averageLoss and largestLoss are POSITIVE MAGNITUDES.
//   * a trade "counts financially" only when net_pnl is a real number.
//   * expectancy in R === average realised R (mean net_pnl/amount_risked).
//   * expectancyMoney === mean(net_pnl) over complete directional trades.

import {
  withDerivedFinancials, hasFinancialResult, realisedPnl,
  accountBalance, balanceBefore, periodRoi, eventTime,
} from './accounts';
import { buildLedger } from './ledger';
import { realisedR } from './tradeFinancials';
import { recordTime } from './journalStats';

function round2(n) {
  const r = Math.round(n * 100) / 100;
  return r === 0 ? 0 : r; // normalise -0 → 0
}

// Opening balance for a period: the true starting balance for all-time, else the
// account balance immediately before the window. (balanceBefore(…, null) returns
// the FULL current balance, which is not a period opening.)
function periodOpening(account, txns, trades, windowStartMs) {
  if (windowStartMs == null) return round2(Number(account?.starting_balance) || 0);
  return balanceBefore(account, txns, trades, windowStartMs);
}

const isDirectional = (t) => t?.result === 'win' || t?.result === 'loss';

// Chronological order with a stable id tiebreak (deterministic on same timestamp).
function chronoWithId(records = []) {
  return [...records].sort((a, b) => {
    const ta = recordTime(a) ?? 0;
    const tb = recordTime(b) ?? 0;
    if (ta !== tb) return ta - tb;
    const ia = String(a?.id ?? '');
    const ib = String(b?.id ?? '');
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
}

// ── Sample status ───────────────────────────────────────────────────────────────

/** Directional-trade thresholds; the stats layer owns these, not the UI. */
export const SAMPLE_THRESHOLDS = { early: 5, usable: 20 };

/**
 * Confidence status for a group, from its directional-trade count.
 * <5 → 'insufficient' · 5–19 → 'early' · 20+ → 'usable'.
 * @param {number} directionalCount
 * @returns {'insufficient'|'early'|'usable'}
 */
export function sampleStatus(directionalCount = 0) {
  if (directionalCount >= SAMPLE_THRESHOLDS.usable) return 'usable';
  if (directionalCount >= SAMPLE_THRESHOLDS.early) return 'early';
  return 'insufficient';
}

// ── Score bands ─────────────────────────────────────────────────────────────────

/** Explicit, non-overlapping bands over the SAVED score (authoritative). */
export const SCORE_BANDS = ['90–100', '85–89', '75–84', '60–74', '50–59', '40–49', '<40'];

/**
 * Band label for a saved score, or 'unknown' when no numeric score exists. Bands
 * are defined on the persisted score, NOT derived from the grade (thresholds vary
 * by engine version/settings).
 * @param {any} score
 * @returns {string}
 */
export function scoreBand(score) {
  if (score == null || score === '') return 'unknown';
  const s = Number(score);
  if (!Number.isFinite(s)) return 'unknown';
  if (s >= 90) return '90–100';
  if (s >= 85) return '85–89';
  if (s >= 75) return '75–84';
  if (s >= 60) return '60–74';
  if (s >= 50) return '50–59';
  if (s >= 40) return '40–49';
  return '<40';
}

// ── Core trade summary (the single shared summariser) ───────────────────────────

/**
 * Every trading metric for a set of completed trades, computed once. Used by the
 * headline stats AND every breakdown so no maths is duplicated.
 * @param {any[]} rawTrades
 */
export function tradeSummary(rawTrades = []) {
  const trades = rawTrades.map(withDerivedFinancials);
  const totalTrades = trades.length;
  const directional = trades.filter(isDirectional);
  const directionalCount = directional.length;
  const wins = directional.filter(t => t.result === 'win').length;
  const losses = directional.filter(t => t.result === 'loss').length;
  const breakevens = trades.filter(t => t.result === 'breakeven').length;
  const complete = trades.filter(hasFinancialResult);
  const completeCount = complete.length;
  const outcomeOnlyCount = totalTrades - completeCount;
  const denom = wins + losses;
  const winRate = denom ? wins / denom : 0;
  const lossRate = denom ? losses / denom : 0;

  let grossProfit = 0, grossLoss = 0, grossPnlSum = 0, totalFees = 0;
  const winAmts = [], lossAmts = [];
  for (const t of complete) {
    const v = Number(t.net_pnl);
    if (v > 0) { grossProfit += v; winAmts.push(v); }
    else if (v < 0) { grossLoss += Math.abs(v); lossAmts.push(Math.abs(v)); }
    if (Number.isFinite(Number(t.gross_pnl))) grossPnlSum += Number(t.gross_pnl);
    if (Number.isFinite(Number(t.fees))) totalFees += Number(t.fees);
  }
  const netPnl = round2(grossProfit - grossLoss);
  const averageWin = winAmts.length ? round2(winAmts.reduce((a, b) => a + b, 0) / winAmts.length) : null;
  const averageLoss = lossAmts.length ? round2(lossAmts.reduce((a, b) => a + b, 0) / lossAmts.length) : null; // positive
  const largestWin = winAmts.length ? round2(Math.max(...winAmts)) : null;
  const largestLoss = lossAmts.length ? round2(Math.max(...lossAmts)) : null; // positive magnitude
  const profitFactor = grossLoss > 0 ? round2(grossProfit / grossLoss) : (grossProfit > 0 ? Infinity : null);

  // Realised R (only where amount_risked > 0 and net exists). expectancyR === avgR.
  const rValues = complete.map(t => realisedR(t.net_pnl, t.amount_risked)).filter(v => v != null);
  const avgR = rValues.length ? round2(rValues.reduce((a, b) => a + b, 0) / rValues.length) : null;

  // Monetary expectancy MUST use the financially-complete directional population,
  // NOT the outcome win rate — an outcome-only loss (net_pnl null) has no known
  // amount and must never be treated as a £0 loss. winAmts/lossAmts already hold
  // only complete directional wins/losses (break-even net 0 is excluded).
  const moneyWins = winAmts.length;
  const moneyLosses = lossAmts.length;
  const moneyDenom = moneyWins + moneyLosses;
  const moneyWinRate = moneyDenom ? moneyWins / moneyDenom : null;
  const moneyLossRate = moneyDenom ? moneyLosses / moneyDenom : null;
  // expectancyMoney = moneyWinRate*avgWin − moneyLossRate*avgLoss. By construction
  // this equals the direct mean net_pnl of complete directional trades.
  const expectancyMoney = moneyDenom
    ? round2(moneyWinRate * (averageWin ?? 0) - moneyLossRate * (averageLoss ?? 0))
    : null;

  // Streaks over directional trades, chronological.
  const chrono = chronoWithId(directional);
  let bestWinStreak = 0, worstLossStreak = 0, runW = 0, runL = 0;
  for (const t of chrono) {
    if (t.result === 'win') { runW += 1; runL = 0; bestWinStreak = Math.max(bestWinStreak, runW); }
    else { runL += 1; runW = 0; worstLossStreak = Math.max(worstLossStreak, runL); }
  }
  let currentStreak = 0, streakType = null;
  for (let i = chrono.length - 1; i >= 0; i--) {
    if (streakType === null) { streakType = chrono[i].result; currentStreak = 1; }
    else if (chrono[i].result === streakType) currentStreak += 1;
    else break;
  }

  // Explicit pips only (never estimated).
  const pipTrades = trades.filter(t => Number.isFinite(Number(t.points_pips)));
  const pipsCount = pipTrades.length;
  const totalPips = pipsCount ? round2(pipTrades.reduce((a, t) => a + Number(t.points_pips), 0)) : null;
  const avgPips = pipsCount ? round2(totalPips / pipsCount) : null;

  return {
    totalTrades, directionalCount, completeCount, outcomeOnlyCount,
    wins, losses, breakevens, winRate, lossRate,
    // Money population (financially-complete directional trades) — the basis for
    // monetary expectancy; distinct from the outcome-based winRate above.
    moneyWins, moneyLosses, moneyWinRate, moneyLossRate,
    grossProfit: round2(grossProfit), grossLoss: round2(grossLoss),
    grossPnl: round2(grossPnlSum), totalFees: round2(totalFees), netPnl,
    averageWin, averageLoss, largestWin, largestLoss, profitFactor,
    avgR, expectancyR: avgR, expectancyMoney,
    bestWinStreak, worstLossStreak, currentStreak, streakType,
    pipsCount, totalPips, avgPips,
    hasPnl: completeCount > 0, hasRiskData: rValues.length > 0,
    sampleStatus: sampleStatus(directionalCount),
  };
}

// ── Cashflow reporting ──────────────────────────────────────────────────────────

/**
 * Split external cashflow by type. Wages are separate from ordinary withdrawals
 * and never touch trading P&L.
 * @param {any[]} txns
 */
export function cashflowSummary(txns = []) {
  let deposits = 0, withdrawals = 0, wages = 0, adjustments = 0;
  for (const tx of txns) {
    const amt = Number(tx?.amount);
    if (!Number.isFinite(amt)) continue;
    switch (tx?.type) {
      case 'deposit': deposits += Math.abs(amt); break;
      case 'withdrawal': withdrawals += Math.abs(amt); break;
      case 'wage_withdrawal': wages += Math.abs(amt); break;
      case 'adjustment': adjustments += amt; break;
      default: break;
    }
  }
  return {
    deposits: round2(deposits), withdrawals: round2(withdrawals),
    wages: round2(wages), adjustments: round2(adjustments),
    netExternalCashflow: round2(deposits - withdrawals - wages + adjustments),
  };
}

// ── Drawdown ────────────────────────────────────────────────────────────────────

/**
 * Worst peak-to-trough drawdown over a series of equity values. Returns positive
 * magnitudes. The money and % are read at the same (worst-by-money) trough. When
 * the running peak is non-positive the % contribution is 0 (undefined base).
 * @param {number[]} values
 * @returns {{ maxDrawdown: number, maxDrawdownPct: number }}
 */
export function maxDrawdown(values = []) {
  let peak = -Infinity;
  let worstMoney = 0;
  let worstPct = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const ddMoney = v - peak; // <= 0
    const ddPct = peak > 0 ? (ddMoney / peak) * 100 : 0;
    if (ddMoney < worstMoney) { worstMoney = ddMoney; worstPct = ddPct; }
  }
  return { maxDrawdown: round2(-worstMoney), maxDrawdownPct: round2(-worstPct) };
}

/**
 * TRADING-equity curve: opening balance then the running balance after each
 * completed trade, folding ONLY trade net P&L — external cashflows (deposits,
 * withdrawals, wages) are deliberately excluded so performance drawdown reflects
 * trading alone, not cash movements.
 * @param {any[]} trades
 * @param {number} openingBalance
 * @returns {number[]}
 */
export function tradingEquityCurve(trades = [], openingBalance = 0) {
  const complete = chronoWithId(trades.map(withDerivedFinancials).filter(hasFinancialResult));
  const values = [round2(openingBalance)];
  let eq = openingBalance;
  for (const t of complete) { eq += Number(t.net_pnl); values.push(round2(eq)); }
  return values;
}

/** Trading-performance drawdown (excludes external cashflows). */
export function tradingDrawdown(trades = [], openingBalance = 0) {
  return maxDrawdown(tradingEquityCurve(trades, openingBalance));
}

/**
 * CASH-balance drawdown: over the real account balance curve, which INCLUDES
 * deposits/withdrawals/wages. Informational — it is not trading performance.
 * @param {any[]} trades
 * @param {any[]} txns
 * @param {number} openingBalance
 */
export function cashDrawdown(trades = [], txns = [], openingBalance = 0) {
  // Reuse the ledger so EVERY movement (incl. trailing withdrawals/wages) carries
  // a running balance — buildEquitySeries only emits points at trades.
  const rows = buildLedger({ id: 'scope', starting_balance: openingBalance }, txns, trades);
  return maxDrawdown(rows.map(r => r.running_balance));
}

// ── Engine-version separation ───────────────────────────────────────────────────

const engineVersionOf = (t) => t?.engine_version || 'legacy-pre-snapshot';

/** Distinct engine versions present in a set of trades (sorted). */
export function engineVersionsInScope(trades = []) {
  return [...new Set(trades.map(engineVersionOf))].sort();
}

/** True when a scope mixes more than one engine version. */
export function combinesEngineVersions(trades = []) {
  return engineVersionsInScope(trades).length > 1;
}

/** Keep only trades from one engine version (treats missing as legacy). */
export function filterByEngineVersion(trades = [], version) {
  return trades.filter(t => engineVersionOf(t) === version);
}

// ── Breakdowns (generic grouping — no bespoke per-dimension maths) ──────────────

function summaryRow(key, label, groupTrades) {
  const s = tradeSummary(groupTrades);
  return {
    key, label,
    totalTrades: s.totalTrades,
    directionalCount: s.directionalCount,
    completeCount: s.completeCount,
    wins: s.wins, losses: s.losses, breakevens: s.breakevens,
    winRate: s.winRate,           // outcome-based (all win/loss)
    moneyWinRate: s.moneyWinRate, // financially-complete directional only
    netPnl: s.hasPnl ? s.netPnl : null,
    avgR: s.avgR,
    expectancy: s.expectancyMoney, // uses moneyWinRate (corrected)
    profitFactor: s.profitFactor,
    sampleStatus: s.sampleStatus,
  };
}

/**
 * Group trades by a single key function and summarise each group. Rows are sorted
 * by directional count desc, then key, for stable output.
 * @param {any[]} trades
 * @param {(t:any)=>string} keyFn
 * @param {{ labelFn?: (k:string)=>string }} [opts]
 */
export function breakdown(trades = [], keyFn, { labelFn } = {}) {
  const groups = new Map();
  for (const raw of trades) {
    const key = keyFn(withDerivedFinancials(raw));
    if (key == null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(raw);
  }
  return [...groups.entries()]
    .map(([key, g]) => summaryRow(key, labelFn ? labelFn(key) : String(key), g))
    .sort((a, b) => b.directionalCount - a.directionalCount || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Reason-tags breakdown — a trade with multiple tags contributes to each tag;
 * trades with none fall under 'untagged'.
 * @param {any[]} trades
 */
export function breakdownByReasonTags(trades = []) {
  const groups = new Map();
  for (const raw of trades) {
    const t = withDerivedFinancials(raw);
    const tags = Array.isArray(t.reason_tags) && t.reason_tags.length ? t.reason_tags : ['untagged'];
    for (const tag of tags) {
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag).push(raw);
    }
  }
  return [...groups.entries()]
    .map(([key, g]) => summaryRow(key, String(key), g))
    .sort((a, b) => b.directionalCount - a.directionalCount || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Executed vs engine: 'with' | 'against' | 'unknown'. */
export function withAgainstEngine(t) {
  const eng = t?.direction;          // 'BUY' | 'SELL'
  const taken = t?.trade_direction;  // 'long' | 'short'
  if (!taken || (eng !== 'BUY' && eng !== 'SELL')) return 'unknown';
  const engLong = eng === 'BUY';
  const takenLong = taken === 'long';
  return engLong === takenLong ? 'with' : 'against';
}

/** Key functions for every supported breakdown dimension. */
export const KEYERS = {
  effectiveGrade: (t) => t?.grade ?? 'unknown',
  rawGrade: (t) => t?.raw_grade ?? 'unknown',
  scoreBand: (t) => scoreBand(t?.score),
  asset: (t) => t?.instrument ?? 'unknown',
  executedDirection: (t) => t?.trade_direction ?? 'unknown',
  engineDirection: (t) => t?.direction ?? 'unknown',
  withAgainstEngine,
  deepStrength: (t) => t?.deep_strength ?? 'unknown',
  ddStrength: (t) => t?.dd_strength ?? 'unknown',
  nowStrength: (t) => t?.now_strength ?? 'unknown',
  alignment: (t) => t?.alignment ?? 'unknown',
  engineVersion: engineVersionOf,
  mood: (t) => t?.mood ?? 'unknown',
  hourOfDay: (t) => { const ms = recordTime(t); return ms == null ? 'unknown' : String(new Date(ms).getHours()); },
  dayOfWeek: (t) => { const ms = recordTime(t); return ms == null ? 'unknown' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(ms).getDay()]; },
  month: (t) => {
    const ms = recordTime(t);
    if (ms == null) return 'unknown';
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  },
};

// ── Reconciliation ──────────────────────────────────────────────────────────────

/**
 * Prove the balance identity for a scope (account + period):
 *   closing = opening + net trading P&L + deposits + adjustments − withdrawals − wages
 * Opening = balance before the window; the window runs to "now" (the filters have
 * no upper bound), so opening + period contributions must equal the current
 * balance. Returns the components, expected vs actual closing, and a reconciled
 * flag. No automatic corrections.
 * @param {{ account?:any, txns?:any[], trades?:any[], windowStartMs?:number|null }} scope
 */
export function reconcile({ account, txns = [], trades = [], windowStartMs = null } = {}) {
  const opening = periodOpening(account, txns, trades, windowStartMs);
  const periodTrades = windowStartMs == null ? trades : trades.filter(t => { const ms = recordTime(t); return ms != null && ms >= windowStartMs; });
  const periodTxns = windowStartMs == null ? txns : txns.filter(tx => { const ms = eventTime(tx); return ms != null && ms >= windowStartMs; });
  const tradingPnl = round2(realisedPnl(periodTrades));
  const cash = cashflowSummary(periodTxns);
  const expectedClosing = round2(opening + tradingPnl + cash.deposits + cash.adjustments - cash.withdrawals - cash.wages);
  const actualClosing = accountBalance(account, txns, trades);
  const difference = round2(actualClosing - expectedClosing);
  return {
    openingBalance: opening,
    tradingPnl,
    deposits: cash.deposits,
    withdrawals: cash.withdrawals,
    wages: cash.wages,
    adjustments: cash.adjustments,
    expectedClosing,
    actualClosing,
    difference,
    reconciled: Math.abs(difference) < 0.01,
  };
}

// ── Aggregate (what the Performance page consumes) ──────────────────────────────

/**
 * Full performance snapshot for a scope: trade summary + cashflow split + opening
 * / closing balance + ROI + BOTH drawdowns + engine-version info. Period filtering
 * matches the rest of the app (lower bound only, to "now").
 * @param {{ account?:any, txns?:any[], trades?:any[], windowStartMs?:number|null }} scope
 */
export function computePerformance({ account, txns = [], trades = [], windowStartMs = null } = {}) {
  const periodTrades = windowStartMs == null ? trades : trades.filter(t => { const ms = recordTime(t); return ms != null && ms >= windowStartMs; });
  const periodTxns = windowStartMs == null ? txns : txns.filter(tx => { const ms = eventTime(tx); return ms != null && ms >= windowStartMs; });

  const summary = tradeSummary(periodTrades);
  const cash = cashflowSummary(periodTxns);
  const openingBalance = periodOpening(account, txns, trades, windowStartMs);
  const closingBalance = accountBalance(account, txns, trades);
  const roi = periodRoi(account, txns, trades, windowStartMs);
  const tradeDD = tradingDrawdown(periodTrades, openingBalance);
  const cashDD = cashDrawdown(periodTrades, periodTxns, openingBalance);
  const engineVersions = engineVersionsInScope(periodTrades);

  return {
    ...summary,
    ...cash,
    openingBalance,
    closingBalance,
    roiPct: roi.roiPct,
    periodPnl: roi.periodPnl,
    tradingDrawdown: tradeDD.maxDrawdown,
    tradingDrawdownPct: tradeDD.maxDrawdownPct,
    cashDrawdown: cashDD.maxDrawdown,
    cashDrawdownPct: cashDD.maxDrawdownPct,
    engineVersions,
    combinesEngineVersions: engineVersions.length > 1,
  };
}
