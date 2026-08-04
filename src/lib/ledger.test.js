import { describe, it, expect } from 'vitest';
import {
  ledgerEvents, sortLedgerEvents, buildLedger, rebuildBalance,
  checkLedgerIntegrity, formatIntegrityReport, KIND_RANK,
} from './ledger';
import { accountBalance } from './accounts';

const T = (iso) => new Date(iso).getTime();
const account = (over = {}) => ({ id: 'acc-1', name: 'Main', currency: 'USD', starting_balance: 10000, archived_at: null, ...over });
const txn = (over = {}) => ({ id: 'tx', account_id: 'acc-1', type: 'deposit', amount: 500, occurred_at: '2026-01-05T00:00:00.000Z', ...over });
const trade = (over = {}) => ({ id: 'ct', account_id: 'acc-1', status: 'completed', result: 'win', instrument: 'EUR/USD', net_pnl: 100, completed_at: '2026-01-10T00:00:00.000Z', ...over });

describe('buildLedger', () => {
  it('opens with the starting balance and derives a running balance per movement', () => {
    const rows = buildLedger(account({ starting_balance: 1000 }), [
      txn({ id: 'd1', type: 'deposit', amount: 500, occurred_at: '2026-01-01T00:00:00.000Z' }),
    ], [
      trade({ id: 't1', net_pnl: 120, completed_at: '2026-01-02T00:00:00.000Z' }),
      trade({ id: 't2', net_pnl: -85, completed_at: '2026-01-03T00:00:00.000Z' }),
    ]);
    expect(rows[0]).toMatchObject({ kind: 'starting', running_balance: 1000 });
    expect(rows.map(r => r.running_balance)).toEqual([1000, 1500, 1620, 1535]);
    expect(rows.map(r => r.kind)).toEqual(['starting', 'deposit', 'trade', 'trade']);
  });

  it('folds deposits, withdrawals, wages and adjustments into the running balance', () => {
    const rows = buildLedger(account({ starting_balance: 0 }), [
      txn({ id: 'a', type: 'deposit', amount: 500, occurred_at: '2026-01-01T00:00:00.000Z' }),
      txn({ id: 'b', type: 'withdrawal', amount: 85, occurred_at: '2026-01-03T00:00:00.000Z' }),
      txn({ id: 'c', type: 'wage_withdrawal', amount: 300, occurred_at: '2026-01-04T00:00:00.000Z' }),
      txn({ id: 'd', type: 'adjustment', amount: 20, occurred_at: '2026-01-05T00:00:00.000Z' }),
    ], [
      trade({ id: 't', net_pnl: 120, completed_at: '2026-01-02T00:00:00.000Z' }),
    ]);
    // 0 +500 +120 -85 -300 +20 = 255
    expect(rows.at(-1).running_balance).toBe(255);
    expect(rows.map(r => r.kind)).toEqual(['starting', 'deposit', 'trade', 'withdrawal', 'wage_withdrawal', 'adjustment']);
  });

  it('skips financially-incomplete trades (they move no money)', () => {
    const rows = buildLedger(account({ starting_balance: 0 }), [], [
      trade({ id: 't1', net_pnl: null }),
      trade({ id: 't2', net_pnl: 50 }),
    ]);
    expect(rows).toHaveLength(2); // starting + one real trade
    expect(rows.at(-1).running_balance).toBe(50);
  });
});

describe('deterministic ordering (same timestamp)', () => {
  const ts = '2026-02-01T00:00:00.000Z';
  it('applies money-in and the trade before money-out at an identical instant', () => {
    const rows = buildLedger(account({ starting_balance: 0 }), [
      txn({ id: 'w', type: 'withdrawal', amount: 100, occurred_at: ts }),
      txn({ id: 'd', type: 'deposit', amount: 1000, occurred_at: ts }),
      txn({ id: 'adj', type: 'adjustment', amount: 5, occurred_at: ts }),
    ], [
      trade({ id: 't', net_pnl: 50, completed_at: ts }),
    ]);
    // rank: deposit(1) < adjustment(2) < trade(3) < withdrawal(4)
    expect(rows.slice(1).map(r => r.kind)).toEqual(['deposit', 'adjustment', 'trade', 'withdrawal']);
    expect(KIND_RANK.deposit).toBeLessThan(KIND_RANK.withdrawal);
  });

  it('breaks a same-kind, same-timestamp tie by id, deterministically', () => {
    const evts = ledgerEvents([
      txn({ id: 'b', type: 'deposit', amount: 1, occurred_at: ts }),
      txn({ id: 'a', type: 'deposit', amount: 1, occurred_at: ts }),
    ], []);
    const ids = sortLedgerEvents(evts).map(e => e.id);
    expect(ids).toEqual(['a', 'b']);
    // Stable: sorting again yields the same order.
    expect(sortLedgerEvents(evts).map(e => e.id)).toEqual(ids);
  });

  it('treats undated legacy events as prior history (sorted first)', () => {
    const rows = buildLedger(account({ starting_balance: 0 }), [], [
      trade({ id: 'dated', net_pnl: 10, completed_at: ts }),
      trade({ id: 'legacy', net_pnl: 5, completed_at: null, created_at: null, created_date: null }),
    ]);
    expect(rows.slice(1).map(r => r.id)).toEqual(['legacy', 'dated']);
  });
});

describe('rebuildBalance matches the canonical balance', () => {
  const cases = [
    { name: 'trades + all txn types', txns: [
      txn({ id: 'd', type: 'deposit', amount: 1000 }),
      txn({ id: 'w', type: 'withdrawal', amount: 200 }),
      txn({ id: 'g', type: 'wage_withdrawal', amount: 300 }),
      txn({ id: 'a', type: 'adjustment', amount: -50 }),
    ], trades: [trade({ id: 't1', net_pnl: 200 }), trade({ id: 't2', net_pnl: -80 }), trade({ id: 't3', net_pnl: null })] },
    { name: 'legacy pnl-only trade', txns: [], trades: [{ id: 'L', account_id: 'acc-1', status: 'completed', pnl: 40, result: 'win' }] },
    { name: 'empty', txns: [], trades: [] },
  ];
  for (const c of cases) {
    it(`${c.name}: rebuilt === accountBalance`, () => {
      const acc = account();
      expect(rebuildBalance(acc, c.txns, c.trades)).toBe(accountBalance(acc, c.txns, c.trades));
    });
  }
});

describe('checkLedgerIntegrity', () => {
  it('reports OK on a clean single-account ledger', () => {
    const r = checkLedgerIntegrity({ accounts: [account()], txns: [txn()], trades: [trade()] });
    expect(r.ok).toBe(true);
    expect(r.counts.critical).toBe(0);
  });

  it('flags duplicate analysis IDs as critical', () => {
    const r = checkLedgerIntegrity({
      accounts: [account()],
      txns: [],
      trades: [
        trade({ id: 'a', analysis_id: 'EURUSD-1' }),
        trade({ id: 'b', analysis_id: 'EURUSD-1' }),
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.findings.some(f => f.code === 'duplicate_analysis_id')).toBe(true);
  });

  it('flags orphan trades (warning) and missing accounts (critical)', () => {
    const r = checkLedgerIntegrity({
      accounts: [account()],
      txns: [],
      trades: [trade({ id: 'orph', account_id: null }), trade({ id: 'miss', account_id: 'ghost' })],
    });
    expect(r.findings.find(f => f.code === 'orphan_trade')?.severity).toBe('warning');
    expect(r.findings.find(f => f.code === 'missing_account')?.severity).toBe('critical');
  });

  it('flags a broken transaction chain and a possible fee double-count', () => {
    const r = checkLedgerIntegrity({
      accounts: [account()],
      txns: [
        txn({ id: 'bad', account_id: 'ghost' }),
        txn({ id: 'feeadj', type: 'adjustment', amount: -5, note: 'broker commission' }),
      ],
      trades: [],
    });
    expect(r.findings.some(f => f.code === 'broken_txn_chain' && f.severity === 'critical')).toBe(true);
    expect(r.findings.some(f => f.code === 'possible_fee_double_count' && f.severity === 'warning')).toBe(true);
  });

  it('flags a negative balance as a warning', () => {
    const r = checkLedgerIntegrity({
      accounts: [account({ starting_balance: 100 })],
      txns: [txn({ id: 'w', type: 'withdrawal', amount: 500 })],
      trades: [],
    });
    expect(r.findings.some(f => f.code === 'negative_balance')).toBe(true);
  });

  it('formats a readable report', () => {
    const r = checkLedgerIntegrity({ accounts: [account()], txns: [], trades: [] });
    const text = formatIntegrityReport(r);
    expect(text).toContain('ledger integrity report');
    expect(text).toContain('status: OK');
  });
});

describe('double-count protection', () => {
  it('a trade fee is counted once (inside net_pnl), never as a second event', () => {
    // gross 200, fees 5 → net 195 stored on the trade. Fee is NOT a transaction.
    const t = trade({ id: 't', gross_pnl: 200, fees: 5, net_pnl: 195 });
    const rows = buildLedger(account({ starting_balance: 0 }), [], [t]);
    const tradeRows = rows.filter(r => r.kind === 'trade');
    expect(tradeRows).toHaveLength(1);
    expect(tradeRows[0].delta).toBe(195); // the fee is already inside, once
    expect(rebuildBalance(account({ starting_balance: 0 }), [], [t])).toBe(195);
  });

  it('a separate account adjustment is counted exactly once, additively', () => {
    const t = trade({ id: 't', net_pnl: 195 });
    const adj = txn({ id: 'a', type: 'adjustment', amount: -20, note: 'reconcile' });
    // 0 + 195 + (−20) = 175; the fee inside net_pnl is not re-subtracted.
    expect(rebuildBalance(account({ starting_balance: 0 }), [adj], [t])).toBe(175);
  });
});

// ── Migration 0009 static assertions (review blocker 1) ─────────────────────────
import { readFileSync } from 'node:fs';

describe('migration 0009_completed_trade_unique_analysis.sql', () => {
  const sql = readFileSync('supabase/migrations/0009_completed_trade_unique_analysis.sql', 'utf8').toLowerCase();

  it('FAILS on duplicates: the duplicate branch raises an exception', () => {
    expect(sql).toContain('raise exception');
    expect(sql).toContain('if dup_groups > 0');
  });

  it('does not create the index when duplicates exist (exception precedes create)', () => {
    const raiseIdx = sql.indexOf('raise exception');
    const createIdx = sql.indexOf('create unique index');
    expect(raiseIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(-1);
    expect(raiseIdx).toBeLessThan(createIdx); // duplicates abort before any create
  });

  it('clean branch creates the partial unique index; existing index is a safe no-op', () => {
    expect(sql).toContain('create unique index if not exists completed_trade_user_analysis_uk');
    expect(sql).toContain('where analysis_id is not null');
  });

  it('never deletes, updates or archives any row', () => {
    expect(sql).not.toMatch(/delete\s+from/);
    expect(sql).not.toMatch(/update\s+public\./);
    expect(sql).not.toMatch(/update\s+\w+\s+set/);
    expect(sql).not.toMatch(/drop\s+(table|column|index)/);
    expect(sql).not.toMatch(/set\s+archived_at/);
  });
});
