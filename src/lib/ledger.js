// Ledger hardening — the account balance as one ordered, derived sequence of
// events (issue #14, phase 5). This is the single, pure, deterministic view of
// every monetary movement, built from the existing sources of truth:
//   * AccountTransaction — deposits, withdrawals, wage withdrawals, adjustments.
//   * CompletedTrade     — realised net P&L (net_pnl), fees already inside it.
//
// Running balances are DERIVED here, never stored. Everything is side-effect free
// and unit-tested. No money value is invented and none is counted twice: a trade
// contributes its net_pnl exactly once (fees are inside net_pnl, never a separate
// event), and each transaction contributes its signed delta exactly once.

import {
  txnDelta, hasFinancialResult, eventTime, withDerivedFinancials, accountBalance,
} from './accounts';

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Deterministic same-timestamp ordering. Final balance is order-independent (a
// sum), but the DISPLAYED running balance is not, so ties are broken by a fixed
// rank — money in and the trade that may depend on it apply before money out —
// then by record id as a final stable tiebreak.
export const KIND_RANK = {
  starting: 0,
  deposit: 1,
  adjustment: 2,
  trade: 3,
  withdrawal: 4,
  wage_withdrawal: 5,
};

const KIND_LABEL = {
  starting: 'Starting balance',
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  wage_withdrawal: 'Wage withdrawal',
  adjustment: 'Adjustment',
  trade: 'Trade',
};

/** Best-known ISO timestamp string for a record (for display). */
function recordIso(rec) {
  return rec?.occurred_at || rec?.completed_at || rec?.created_at || rec?.created_date || null;
}

/**
 * Normalise transactions + completed trades into a flat list of ledger events,
 * each carrying its signed cash effect. Financially-incomplete trades (net_pnl
 * null) are skipped — they move no money. Fees are never a separate event.
 * @param {any[]} txns
 * @param {any[]} trades
 * @returns {{ kind: string, t: number|null, delta: number, reference: string|null, id: string, account_id: string|null, raw: any }[]}
 */
export function ledgerEvents(txns = [], trades = []) {
  const events = [];
  for (const tx of txns) {
    events.push({
      kind: tx?.type || 'adjustment',
      t: eventTime(tx),
      delta: round2(txnDelta(tx)),
      reference: tx?.note ?? null,
      id: tx?.id != null ? String(tx.id) : '',
      account_id: tx?.account_id ?? null,
      raw: tx,
    });
  }
  for (const raw of trades) {
    const t = withDerivedFinancials(raw);
    if (!hasFinancialResult(t)) continue; // no money → not a ledger event
    events.push({
      kind: 'trade',
      t: eventTime(t),
      delta: round2(Number(t.net_pnl)),
      reference: t?.instrument ?? null,
      id: t?.id != null ? String(t.id) : '',
      account_id: t?.account_id ?? null,
      raw: t,
    });
  }
  return events;
}

/**
 * Deterministic ordering: by event time ascending (undated legacy events sort
 * first, as prior history), then by KIND_RANK, then by id.
 * @param {any[]} events
 */
export function sortLedgerEvents(events = []) {
  return [...events].sort((a, b) => {
    const ta = a.t == null ? -Infinity : a.t;
    const tb = b.t == null ? -Infinity : b.t;
    if (ta !== tb) return ta - tb;
    const ra = KIND_RANK[a.kind] ?? 99;
    const rb = KIND_RANK[b.kind] ?? 99;
    if (ra !== rb) return ra - rb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * The full ledger for one account: an opening row, then every movement in
 * deterministic order, each with a DERIVED running balance.
 * @param {{ id?: string, starting_balance?: number }} account
 * @param {any[]} txns  transactions for this account
 * @param {any[]} trades  completed trades for this account
 * @returns {{ kind: string, label: string, delta: number, running_balance: number, timestamp: string|null, reference: string|null, account_id: string|null, id: string }[]}
 */
export function buildLedger(account, txns = [], trades = []) {
  const start = round2(Number(account?.starting_balance) || 0);
  const ordered = sortLedgerEvents(ledgerEvents(txns, trades));
  let running = start;
  const rows = [{
    kind: 'starting',
    label: KIND_LABEL.starting,
    delta: start,
    running_balance: start,
    timestamp: null,
    reference: null,
    account_id: account?.id ?? null,
    id: `start:${account?.id ?? ''}`,
  }];
  for (const e of ordered) {
    running = round2(running + e.delta);
    rows.push({
      kind: e.kind,
      label: KIND_LABEL[e.kind] ?? e.kind,
      delta: e.delta,
      running_balance: running,
      timestamp: recordIso(e.raw),
      reference: e.reference,
      account_id: e.account_id,
      id: e.id,
    });
  }
  return rows;
}

/**
 * Rebuild an account balance purely from its starting balance + ordered ledger
 * events. By construction this equals accountBalance() — a divergence signals a
 * bug, which the integrity checker surfaces.
 * @param {any} account
 * @param {any[]} txns
 * @param {any[]} trades
 * @returns {number}
 */
export function rebuildBalance(account, txns = [], trades = []) {
  const rows = buildLedger(account, txns, trades);
  return rows[rows.length - 1].running_balance;
}

// ── Integrity checker (developer-only; NO automatic repairs) ────────────────────

/** @typedef {{ severity: 'critical'|'warning', code: string, message: string, detail?: any }} Finding */

/**
 * Scan accounts + transactions + trades for financial-integrity problems and
 * return a structured report. It never mutates or repairs anything.
 * @param {{ accounts?: any[], txns?: any[], trades?: any[] }} data
 */
export function checkLedgerIntegrity({ accounts = [], txns = [], trades = [] } = {}) {
  /** @type {Finding[]} */
  const findings = [];
  const add = (severity, code, message, detail) => findings.push({ severity, code, message, detail });

  const accountById = new Map(accounts.map(a => [a.id, a]));
  const active = accounts.filter(a => !a?.archived_at);
  const soleId = active.length === 1 ? active[0].id : null;

  // Duplicate analysis IDs among live (non-archived) completed trades.
  const byAnalysis = new Map();
  for (const t of trades) {
    if (t?.analysis_id == null || t?.status === 'archived') continue;
    const arr = byAnalysis.get(t.analysis_id) || [];
    arr.push(t.id);
    byAnalysis.set(t.analysis_id, arr);
  }
  for (const [aid, ids] of byAnalysis) {
    if (ids.length > 1) add('critical', 'duplicate_analysis_id', `analysis_id "${aid}" maps to ${ids.length} completed trades`, ids);
  }

  // Orphan trades (no account) and trades referencing a missing account.
  for (const t of trades) {
    if (t?.status === 'archived') continue;
    const acc = t?.account_id ?? null;
    if (acc == null) add('warning', 'orphan_trade', `trade ${t.id} (${t.instrument ?? '—'}) has no account`, t.id);
    else if (!accountById.has(acc)) add('critical', 'missing_account', `trade ${t.id} references unknown account ${acc}`, t.id);
  }

  // Transactions pointing at a non-existent account (broken chain).
  for (const tx of txns) {
    if (!accountById.has(tx?.account_id)) add('critical', 'broken_txn_chain', `transaction ${tx.id} references unknown account ${tx?.account_id}`, tx.id);
  }

  // Possible fee double-count: an adjustment that looks like a trade fee (fees
  // already live inside completed_trade.net_pnl, so this would double-count).
  for (const tx of txns) {
    if (tx?.type === 'adjustment' && /fee|comm/i.test(String(tx?.note || ''))) {
      add('warning', 'possible_fee_double_count', `adjustment ${tx.id} note mentions fees/commission — verify it is not a trade fee already inside net_pnl`, tx.id);
    }
  }

  // Per-account balance reconstruction + negative-balance surfacing.
  for (const acc of accounts) {
    const accTxns = txns.filter(t => t.account_id === acc.id);
    const accTrades = trades.filter(t => (t.account_id ?? soleId) === acc.id && t.status !== 'archived');
    const stored = accountBalance(acc, accTxns, accTrades);
    const rebuilt = rebuildBalance(acc, accTxns, accTrades);
    if (Math.abs(stored - rebuilt) > 0.001) {
      add('critical', 'balance_reconstruction_failure', `account ${acc.id} (${acc.name}) balance mismatch: canonical ${stored} vs rebuilt ${rebuilt}`, { stored, rebuilt });
    }
    if (rebuilt < 0) add('warning', 'negative_balance', `account ${acc.id} (${acc.name}) balance is negative: ${rebuilt}`, rebuilt);
  }

  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  return {
    ok: criticalCount === 0,
    counts: { critical: criticalCount, warning: findings.length - criticalCount, total: findings.length },
    findings,
  };
}

/**
 * Render an integrity report as readable plain text.
 * @param {ReturnType<typeof checkLedgerIntegrity>} report
 * @returns {string}
 */
export function formatIntegrityReport(report) {
  const lines = [];
  lines.push('PrimeBias ledger integrity report');
  lines.push('=================================');
  lines.push(`status: ${report.ok ? 'OK (no critical issues)' : 'ISSUES FOUND'}`);
  lines.push(`critical: ${report.counts.critical}  warning: ${report.counts.warning}  total: ${report.counts.total}`);
  lines.push('');
  if (!report.findings.length) {
    lines.push('No issues detected.');
    return lines.join('\n');
  }
  for (const f of report.findings) {
    lines.push(`[${f.severity.toUpperCase()}] ${f.code}: ${f.message}`);
  }
  return lines.join('\n');
}
