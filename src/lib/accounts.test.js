import { describe, it, expect } from 'vitest';
import {
  hasFinancialResult,
  withDerivedFinancials,
  tradeInAccount,
  txnDelta,
  realisedPnl,
  netCashFlow,
  accountBalance,
  balanceBefore,
  periodRoi,
  buildEquitySeries,
  groupByCurrency,
  activeAccounts,
} from './accounts';

const T = (iso) => new Date(iso).getTime();

const account = (over = {}) => ({
  id: 'acc-1', name: 'Main', currency: 'USD', starting_balance: 10000, archived_at: null, ...over,
});
const trade = (over = {}) => ({
  id: 'ct', result: 'win', instrument: 'EUR/USD',
  net_pnl: 100, completed_at: '2026-01-10T00:00:00.000Z', account_id: 'acc-1', ...over,
});
const txn = (over = {}) => ({
  id: 'tx', account_id: 'acc-1', type: 'deposit', amount: 500,
  occurred_at: '2026-01-05T00:00:00.000Z', ...over,
});

describe('hasFinancialResult', () => {
  it('true for a real number including break-even 0', () => {
    expect(hasFinancialResult({ net_pnl: 50 })).toBe(true);
    expect(hasFinancialResult({ net_pnl: 0 })).toBe(true);
    expect(hasFinancialResult({ net_pnl: -25 })).toBe(true);
  });
  it('false when the monetary result is missing', () => {
    expect(hasFinancialResult({ net_pnl: null })).toBe(false);
    expect(hasFinancialResult({ net_pnl: undefined })).toBe(false);
    expect(hasFinancialResult({})).toBe(false);
    expect(hasFinancialResult({ net_pnl: NaN })).toBe(false);
  });
});

describe('withDerivedFinancials', () => {
  it('keeps an explicit net_pnl (including 0)', () => {
    expect(withDerivedFinancials({ net_pnl: 0, pnl: 99 }).net_pnl).toBe(0);
  });
  it('derives net_pnl from a legacy pnl value', () => {
    expect(withDerivedFinancials({ net_pnl: null, pnl: 50 }).net_pnl).toBe(50);
    expect(withDerivedFinancials({ pnl: -25 }).net_pnl).toBe(-25);
  });
  it('leaves a value-less trade financially incomplete', () => {
    expect(withDerivedFinancials({ net_pnl: null, pnl: null }).net_pnl).toBeNull();
    expect(hasFinancialResult(withDerivedFinancials({ result: 'loss' }))).toBe(false);
  });
});

describe('tradeInAccount', () => {
  it('matches by account_id', () => {
    expect(tradeInAccount({ account_id: 'a' }, 'a')).toBe(true);
    expect(tradeInAccount({ account_id: 'b' }, 'a')).toBe(false);
  });
  it('all-accounts selection matches everything', () => {
    expect(tradeInAccount({ account_id: null }, null)).toBe(true);
  });
  it('a legacy null-account trade belongs to the sole account', () => {
    expect(tradeInAccount({ account_id: null }, 'a', 'a')).toBe(true);
    expect(tradeInAccount({ account_id: null }, 'a', null)).toBe(false);
  });
});

describe('txnDelta', () => {
  it('deposits add, withdrawals subtract magnitude, adjustments are signed', () => {
    expect(txnDelta({ type: 'deposit', amount: 500 })).toBe(500);
    expect(txnDelta({ type: 'withdrawal', amount: 200 })).toBe(-200);
    expect(txnDelta({ type: 'withdrawal', amount: -200 })).toBe(-200); // magnitude
    expect(txnDelta({ type: 'adjustment', amount: -75 })).toBe(-75);
    expect(txnDelta({ type: 'adjustment', amount: 75 })).toBe(75);
  });
  it('ignores non-numeric or unknown types', () => {
    expect(txnDelta({ type: 'deposit', amount: 'x' })).toBe(0);
    expect(txnDelta({ type: 'mystery', amount: 5 })).toBe(0);
  });
});

describe('realisedPnl / netCashFlow', () => {
  it('sums only financially-complete trades', () => {
    expect(realisedPnl([trade({ net_pnl: 100 }), trade({ net_pnl: -40 }), trade({ net_pnl: null })])).toBe(60);
  });
  it('sums signed cash flow', () => {
    expect(netCashFlow([
      txn({ type: 'deposit', amount: 500 }),
      txn({ type: 'withdrawal', amount: 200 }),
      txn({ type: 'adjustment', amount: -50 }),
    ])).toBe(250);
  });
});

describe('accountBalance', () => {
  it('= starting + deposits - withdrawals + net P/L + adjustments', () => {
    const txns = [
      txn({ type: 'deposit', amount: 1000 }),
      txn({ type: 'withdrawal', amount: 300 }),
      txn({ type: 'adjustment', amount: -50 }),
    ];
    const trades = [trade({ net_pnl: 200 }), trade({ net_pnl: -80 }), trade({ net_pnl: null })];
    // 10000 + 1000 - 300 - 50 + (200 - 80) = 10770
    expect(accountBalance(account(), txns, trades)).toBe(10770);
  });
  it('deposits/withdrawals move balance but not via trade P/L', () => {
    expect(accountBalance(account({ starting_balance: 0 }), [txn({ type: 'deposit', amount: 500 })], [])).toBe(500);
  });
  it('allows a negative balance when withdrawals exceed funds', () => {
    expect(accountBalance(account({ starting_balance: 100 }), [txn({ type: 'withdrawal', amount: 500 })], [])).toBe(-400);
  });
});

describe('balanceBefore', () => {
  const txns = [
    txn({ type: 'deposit', amount: 1000, occurred_at: '2026-01-01T00:00:00.000Z' }),
    txn({ type: 'deposit', amount: 500, occurred_at: '2026-02-01T00:00:00.000Z' }),
  ];
  const trades = [
    trade({ net_pnl: 200, completed_at: '2026-01-15T00:00:00.000Z' }),
    trade({ net_pnl: 300, completed_at: '2026-02-15T00:00:00.000Z' }),
  ];
  it('excludes events at/after the cutoff', () => {
    // before Feb 1: 10000 + 1000 (Jan deposit) + 200 (Jan trade) = 11200
    expect(balanceBefore(account(), txns, trades, T('2026-02-01T00:00:00.000Z'))).toBe(11200);
  });
  it('null cutoff returns the full balance', () => {
    expect(balanceBefore(account(), txns, trades, null)).toBe(12000);
  });
  it('treats undated legacy events as prior history', () => {
    const legacy = [trade({ net_pnl: 50, completed_at: null })];
    expect(balanceBefore(account({ starting_balance: 0 }), [], legacy, T('2026-01-01T00:00:00.000Z'))).toBe(50);
  });
});

describe('periodRoi', () => {
  const txns = [txn({ type: 'deposit', amount: 5000, occurred_at: '2026-01-01T00:00:00.000Z' })];
  const trades = [
    trade({ net_pnl: 200, completed_at: '2026-01-10T00:00:00.000Z' }),
    trade({ net_pnl: 300, completed_at: '2026-03-10T00:00:00.000Z' }),
  ];
  it('uses the opening balance immediately before the period', () => {
    const start = T('2026-03-01T00:00:00.000Z');
    // opening before Mar 1 = 10000 + 5000 + 200 = 15200; period P/L = 300
    const { roiPct, openingBalance, periodPnl } = periodRoi(account(), txns, trades, start);
    expect(openingBalance).toBe(15200);
    expect(periodPnl).toBe(300);
    expect(roiPct).toBeCloseTo((300 / 15200) * 100, 2);
  });
  it('deposits do not count as trading profit', () => {
    // A big deposit in-period must not inflate ROI numerator.
    const withDeposit = [...txns, txn({ type: 'deposit', amount: 9999, occurred_at: '2026-03-05T00:00:00.000Z' })];
    const { periodPnl } = periodRoi(account(), withDeposit, trades, T('2026-03-01T00:00:00.000Z'));
    expect(periodPnl).toBe(300);
  });
  it('returns null ROI when opening balance is non-positive', () => {
    const { roiPct } = periodRoi(account({ starting_balance: 0 }), [], trades, T('2026-01-01T00:00:00.000Z'));
    expect(roiPct).toBeNull();
  });
  it('returns null ROI when the period has no realised trades', () => {
    const { roiPct } = periodRoi(account(), txns, [trade({ net_pnl: null })], null);
    expect(roiPct).toBeNull();
  });
});

describe('buildEquitySeries', () => {
  it('is the running account balance after each completed trade', () => {
    const trades = [
      trade({ net_pnl: 100, completed_at: '2026-01-02T00:00:00.000Z' }),
      trade({ net_pnl: -40, completed_at: '2026-01-04T00:00:00.000Z' }),
    ];
    const series = buildEquitySeries(trades, [], { openingBalance: 10000 });
    expect(series.map(p => p.balance)).toEqual([10100, 10060]);
    expect(series.map(p => p.equity)).toEqual([100, 60]);
  });
  it('folds interim deposits/withdrawals into the balance between trades', () => {
    const trades = [
      trade({ net_pnl: 100, completed_at: '2026-01-02T00:00:00.000Z' }),
      trade({ net_pnl: 50, completed_at: '2026-01-06T00:00:00.000Z' }),
    ];
    const txns = [txn({ type: 'deposit', amount: 1000, occurred_at: '2026-01-04T00:00:00.000Z' })];
    const series = buildEquitySeries(trades, txns, { openingBalance: 10000 });
    // after trade1: 10100; deposit +1000 -> 11100; after trade2: 11150
    expect(series.map(p => p.balance)).toEqual([10100, 11150]);
  });
  it('skips financially incomplete trades', () => {
    const trades = [trade({ net_pnl: null }), trade({ net_pnl: 100 })];
    expect(buildEquitySeries(trades, [], { openingBalance: 0 })).toHaveLength(1);
  });
});

describe('grouping / active', () => {
  it('groups by currency and never mixes them', () => {
    const g = groupByCurrency([account({ id: 'a', currency: 'USD' }), account({ id: 'b', currency: 'GBP' }), account({ id: 'c', currency: 'USD' })]);
    expect(Object.keys(g).sort()).toEqual(['GBP', 'USD']);
    expect(g.USD.map(a => a.id)).toEqual(['a', 'c']);
  });
  it('filters out archived accounts', () => {
    expect(activeAccounts([account({ id: 'a' }), account({ id: 'b', archived_at: '2026-01-01' })]).map(a => a.id)).toEqual(['a']);
  });
});
