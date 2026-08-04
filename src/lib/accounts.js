// Account ledger maths for the account-led financial model.
//
// The account balance is always CALCULATED, never stored/overwritten:
//
//   balance = starting_balance
//           + deposits
//           - withdrawals
//           + realised net trade P/L (financially-complete trades only)
//           + reconciliation adjustments
//
// Everything here is pure and side-effect free so it can be unit tested in
// isolation. It operates on `trading_account`, `account_transaction` and
// `completed_trade` records. A trade contributes money ONLY when its `net_pnl`
// is a real number — `net_pnl == null` means the monetary result has not been
// entered yet (financially incomplete) and it must not move any total.

/** @typedef {{ id: string, name: string, currency: string, starting_balance: number, archived_at?: string|null }} Account */
/** @typedef {{ account_id: string, type: 'deposit'|'withdrawal'|'adjustment'|'wage_withdrawal', amount: number, occurred_at: string }} Txn */

/** Fallback starting balance when the user has recorded nothing yet. */
export const DEFAULT_STARTING_BALANCE = 10000;

/**
 * True when a completed trade has a real monetary result recorded. Break-even
 * (net_pnl === 0) is complete; a missing amount (null/undefined/NaN) is not.
 * @param {any} trade
 */
export function hasFinancialResult(trade) {
  return trade?.net_pnl != null && Number.isFinite(Number(trade.net_pnl));
}

/**
 * Normalise a completed trade so money maths can rely on `net_pnl`. Legacy rows
 * created before this model stored their result in the single `pnl` column; a
 * real number there is a genuine result (not invented), so it becomes `net_pnl`.
 * Rows with neither stay financially incomplete (net_pnl left null). This is a
 * read-time shim — no database rows are mutated.
 * @param {any} trade
 * @returns {any}
 */
export function withDerivedFinancials(trade) {
  if (!trade) return trade;
  if (trade.net_pnl != null && Number.isFinite(Number(trade.net_pnl))) return trade;
  if (trade.pnl != null && Number.isFinite(Number(trade.pnl))) {
    return { ...trade, net_pnl: Number(trade.pnl) };
  }
  return trade;
}

/**
 * Whether a trade should be shown/counted for a given account selection.
 * A null-account (legacy) trade belongs to the user's sole account when there is
 * exactly one, so historic data isn't stranded outside every account view.
 * @param {any} trade
 * @param {string|null} accountId  selected account id, or null for "all"
 * @param {string|null} soleAccountId  the only active account id, if exactly one
 */
export function tradeInAccount(trade, accountId, soleAccountId = null) {
  const tid = trade?.account_id ?? null;
  const effective = tid ?? soleAccountId;
  if (accountId == null) return true; // all accounts
  return effective === accountId;
}

/**
 * Signed cash effect of a transaction on the balance. Deposits add; withdrawals
 * AND wage withdrawals subtract their (positive) magnitude; adjustments are
 * already signed. A wage withdrawal moves cash exactly like a withdrawal — it is
 * kept as a distinct type only so wages can be reported separately, never so they
 * move the balance differently.
 * @param {Txn} txn
 * @returns {number}
 */
export function txnDelta(txn) {
  const amt = Number(txn?.amount);
  if (!Number.isFinite(amt)) return 0;
  switch (txn?.type) {
    case 'deposit': return Math.abs(amt);
    case 'withdrawal': return -Math.abs(amt);
    case 'wage_withdrawal': return -Math.abs(amt);
    case 'adjustment': return amt; // signed
    default: return 0;
  }
}

/**
 * Total wages withdrawn across the given transactions, as a positive magnitude.
 * Counts ONLY the explicit 'wage_withdrawal' type — ordinary withdrawals are
 * never treated as wages. Kept separate from trading P/L for future reporting.
 * @param {Txn[]} txns
 * @returns {number}
 */
export function wagesWithdrawn(txns = []) {
  let sum = 0;
  for (const tx of txns) {
    if (tx?.type !== 'wage_withdrawal') continue;
    const amt = Number(tx.amount);
    if (Number.isFinite(amt)) sum += Math.abs(amt);
  }
  return round2(sum);
}

/**
 * Best-known event time for a trade or transaction, in epoch ms.
 * @param {any} record
 * @returns {number|null}
 */
export function eventTime(record) {
  const raw = record?.occurred_at || record?.completed_at || record?.created_at || record?.created_date;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Realised net trade P/L across the given trades (complete trades only).
 * @param {any[]} trades
 * @returns {number}
 */
export function realisedPnl(trades = []) {
  let sum = 0;
  for (const t of trades) if (hasFinancialResult(t)) sum += Number(t.net_pnl);
  return sum;
}

/**
 * Net cash flow across the given transactions (deposits − withdrawals ± adjustments).
 * @param {Txn[]} txns
 * @returns {number}
 */
export function netCashFlow(txns = []) {
  let sum = 0;
  for (const tx of txns) sum += txnDelta(tx);
  return sum;
}

/**
 * Current calculated balance of an account.
 * @param {Account} account
 * @param {Txn[]} txns  transactions for this account
 * @param {any[]} trades  completed trades for this account
 * @returns {number}
 */
export function accountBalance(account, txns = [], trades = []) {
  const start = Number(account?.starting_balance) || 0;
  return round2(start + netCashFlow(txns) + realisedPnl(trades));
}

/**
 * Balance immediately BEFORE a moment in time — the sum restricted to events
 * that occurred strictly before `beforeMs`. This is the ROI opening balance and
 * the equity-curve origin. Events with no usable timestamp are treated as prior
 * history (included), matching how "all time" keeps undated rows.
 * @param {Account} account
 * @param {Txn[]} txns
 * @param {any[]} trades
 * @param {number|null} beforeMs  epoch ms, or null for "no lower bound" (=> full balance)
 * @returns {number}
 */
export function balanceBefore(account, txns = [], trades = [], beforeMs = null) {
  const start = Number(account?.starting_balance) || 0;
  const priorTxns = beforeMs == null ? txns : txns.filter(tx => beforeInclusivePrior(tx, beforeMs));
  const priorTrades = beforeMs == null ? trades : trades.filter(t => beforeInclusivePrior(t, beforeMs));
  return round2(start + netCashFlow(priorTxns) + realisedPnl(priorTrades));
}

// An event is "prior" when it has no timestamp (legacy history) or occurred
// strictly before the cutoff.
function beforeInclusivePrior(record, beforeMs) {
  const t = eventTime(record);
  return t == null || t < beforeMs;
}

/**
 * Return-on-investment for a period.
 *   ROI = period net trade P/L / opening balance × 100
 * Opening balance = account balance immediately before the first event in the
 * period. Deposits and withdrawals never count as trading profit, so only
 * realised net P/L is in the numerator. Undefined (null) when the opening
 * balance is non-positive or there is no realised P/L to speak of.
 * @param {Account} account
 * @param {Txn[]} txns  ALL transactions for the account (not pre-filtered)
 * @param {any[]} allTrades  ALL completed trades for the account (not pre-filtered)
 * @param {number|null} windowStartMs  inclusive lower bound, or null for all-time
 * @returns {{ roiPct: number|null, openingBalance: number, periodPnl: number }}
 */
export function periodRoi(account, txns = [], allTrades = [], windowStartMs = null) {
  const periodTrades = windowStartMs == null
    ? allTrades
    : allTrades.filter(t => {
        const at = eventTime(t);
        return at != null && at >= windowStartMs;
      });
  const periodPnl = realisedPnl(periodTrades);
  const openingBalance = balanceBefore(account, txns, allTrades, windowStartMs);
  const roiPct = openingBalance > 0 && periodTrades.some(hasFinancialResult)
    ? round2((periodPnl / openingBalance) * 100)
    : null;
  return { roiPct, openingBalance: round2(openingBalance), periodPnl: round2(periodPnl) };
}

/**
 * Equity curve = the account balance after each chronologically completed
 * trade. Starts from the balance immediately before the window (so prior
 * deposits/withdrawals are baked in) and walks the merged trade + transaction
 * timeline, folding interim cash flows into the running balance but emitting a
 * point only at each financially-complete trade.
 * @param {any[]} trades  completed trades in the window
 * @param {Txn[]} txns  transactions in the window
 * @param {{ openingBalance?: number }} [opts]
 * @returns {{ i: number, date: string|null, instrument: string|null, balance: number, equity: number, netPnl: number }[]}
 */
export function buildEquitySeries(trades = [], txns = [], { openingBalance = 0 } = {}) {
  const events = [
    ...trades.filter(hasFinancialResult).map(t => ({ kind: 'trade', t: eventTime(t) ?? 0, rec: t })),
    ...txns.map(tx => ({ kind: 'txn', t: eventTime(tx) ?? 0, rec: tx })),
  ].sort((a, b) => a.t - b.t);

  let balance = openingBalance;
  let i = 0;
  const points = [];
  for (const ev of events) {
    if (ev.kind === 'txn') {
      balance += txnDelta(ev.rec);
      continue;
    }
    const net = Number(ev.rec.net_pnl);
    balance += net;
    i += 1;
    points.push({
      i,
      date: ev.rec.completed_at || ev.rec.created_at || ev.rec.created_date || null,
      instrument: ev.rec.instrument ?? null,
      balance: round2(balance),
      equity: round2(balance - openingBalance),
      netPnl: round2(net),
    });
  }
  return points;
}

/**
 * Group accounts by currency so monetary totals are never combined across
 * currencies. Returns a map { currency: Account[] }.
 * @param {Account[]} accounts
 * @returns {Record<string, Account[]>}
 */
export function groupByCurrency(accounts = []) {
  /** @type {Record<string, Account[]>} */
  const out = {};
  for (const a of accounts) {
    const cur = a?.currency || 'USD';
    (out[cur] ||= []).push(a);
  }
  return out;
}

/** Active (non-archived) accounts only. */
export function activeAccounts(accounts = []) {
  return accounts.filter(a => !a?.archived_at);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
