import { describe, it, expect } from 'vitest';
import {
  tradeSummary, cashflowSummary, maxDrawdown, tradingEquityCurve, tradingDrawdown,
  cashDrawdown, scoreBand, sampleStatus, SCORE_BANDS, breakdown, breakdownByReasonTags,
  withAgainstEngine, KEYERS, engineVersionsInScope, combinesEngineVersions,
  filterByEngineVersion, reconcile, computePerformance,
} from './performance';

const T = (iso) => new Date(iso).getTime();
const account = (over = {}) => ({ id: 'acc-1', name: 'Main', currency: 'USD', starting_balance: 10000, archived_at: null, ...over });
const txn = (over = {}) => ({ id: 'tx', account_id: 'acc-1', type: 'deposit', amount: 500, occurred_at: '2026-01-05T00:00:00.000Z', ...over });
let n = 0;
const trade = (over = {}) => ({
  id: `ct-${n++}`, account_id: 'acc-1', status: 'completed', result: 'win',
  instrument: 'EUR/USD', net_pnl: 100, completed_at: '2026-01-10T00:00:00.000Z', ...over,
});

// ── Core metrics ────────────────────────────────────────────────────────────────

describe('tradeSummary — core metrics', () => {
  it('all wins', () => {
    const s = tradeSummary([trade({ net_pnl: 100 }), trade({ net_pnl: 50 })]);
    expect(s.wins).toBe(2); expect(s.losses).toBe(0);
    expect(s.winRate).toBe(1);
    expect(s.profitFactor).toBe(Infinity);
    expect(s.averageWin).toBe(75); expect(s.averageLoss).toBeNull();
    expect(s.largestWin).toBe(100); expect(s.largestLoss).toBeNull();
  });

  it('all losses', () => {
    const s = tradeSummary([trade({ result: 'loss', net_pnl: -40 }), trade({ result: 'loss', net_pnl: -60 })]);
    expect(s.losses).toBe(2); expect(s.winRate).toBe(0);
    expect(s.averageLoss).toBe(50); // positive magnitude
    expect(s.largestLoss).toBe(60);
    expect(s.profitFactor).toBe(0); // real losses, zero winning dollars → PF 0
  });

  it('mixed wins/losses with fees and expectancy', () => {
    const s = tradeSummary([
      trade({ result: 'win', net_pnl: 200, gross_pnl: 205, fees: 5 }),
      trade({ result: 'win', net_pnl: 100, gross_pnl: 100, fees: 0 }),
      trade({ result: 'loss', net_pnl: -150, gross_pnl: -145, fees: 5 }),
    ]);
    expect(s.grossProfit).toBe(300); expect(s.grossLoss).toBe(150);
    expect(s.netPnl).toBe(150); expect(s.totalFees).toBe(10);
    expect(s.profitFactor).toBe(2);
    expect(s.averageWin).toBe(150); expect(s.averageLoss).toBe(150);
    // winRate 2/3, lossRate 1/3 → 0.6667*150 − 0.3333*150 = 50
    expect(s.expectancyMoney).toBeCloseTo(50, 1);
  });

  it('breakevens excluded from win-rate denominator, counted separately', () => {
    const s = tradeSummary([trade({ result: 'win', net_pnl: 100 }), trade({ result: 'breakeven', net_pnl: 0 })]);
    expect(s.breakevens).toBe(1);
    expect(s.directionalCount).toBe(1);
    expect(s.winRate).toBe(1);
    expect(s.completeCount).toBe(2);
  });

  it('outcome-only trades count in total but not money', () => {
    const s = tradeSummary([trade({ result: 'win', net_pnl: 100 }), trade({ result: 'loss', net_pnl: null })]);
    expect(s.totalTrades).toBe(2);
    expect(s.completeCount).toBe(1);
    expect(s.outcomeOnlyCount).toBe(1);
    expect(s.netPnl).toBe(100);
    expect(s.directionalCount).toBe(2); // still directional for win rate
  });

  it('missing risk excludes only R metrics', () => {
    const s = tradeSummary([trade({ net_pnl: 200, amount_risked: 100 }), trade({ net_pnl: 100 })]);
    expect(s.hasRiskData).toBe(true);
    expect(s.avgR).toBe(2); // only the one with risk
    expect(s.expectancyR).toBe(2);
    const s2 = tradeSummary([trade({ net_pnl: 100 })]);
    expect(s2.hasRiskData).toBe(false); expect(s2.avgR).toBeNull();
  });

  it('no winning trades / no losing trades profit factor', () => {
    expect(tradeSummary([trade({ result: 'win', net_pnl: 100 })]).profitFactor).toBe(Infinity); // no losses
    expect(tradeSummary([trade({ result: 'loss', net_pnl: -100 })]).profitFactor).toBe(0);       // no wins
    expect(tradeSummary([]).profitFactor).toBeNull();                                            // no data
  });

  it('best/worst/current streak', () => {
    const s = tradeSummary([
      trade({ id: 'a', result: 'win', completed_at: '2026-01-01T00:00:00Z' }),
      trade({ id: 'b', result: 'win', completed_at: '2026-01-02T00:00:00Z' }),
      trade({ id: 'c', result: 'loss', net_pnl: -10, completed_at: '2026-01-03T00:00:00Z' }),
      trade({ id: 'd', result: 'loss', net_pnl: -10, completed_at: '2026-01-04T00:00:00Z' }),
      trade({ id: 'e', result: 'loss', net_pnl: -10, completed_at: '2026-01-05T00:00:00Z' }),
    ]);
    expect(s.bestWinStreak).toBe(2);
    expect(s.worstLossStreak).toBe(3);
    expect(s.currentStreak).toBe(3);
    expect(s.streakType).toBe('loss');
  });

  it('explicit pips only; estimated values never counted', () => {
    const s = tradeSummary([
      trade({ net_pnl: 100, points_pips: 20 }),
      trade({ net_pnl: 100, points_pips: 10 }),
      trade({ net_pnl: 100, position_size: 0.5 }), // has size but no explicit pips → excluded
    ]);
    expect(s.pipsCount).toBe(2);
    expect(s.totalPips).toBe(30);
    expect(s.avgPips).toBe(15);
  });

  it('legacy pnl-only trade contributes', () => {
    const s = tradeSummary([{ id: 'L', result: 'win', pnl: 40, status: 'completed' }]);
    expect(s.netPnl).toBe(40);
    expect(s.completeCount).toBe(1);
  });
});

// ── Cashflow ────────────────────────────────────────────────────────────────────

describe('cashflowSummary', () => {
  it('splits deposits / withdrawals / wages / adjustments and nets them', () => {
    const c = cashflowSummary([
      txn({ type: 'deposit', amount: 1000 }),
      txn({ type: 'withdrawal', amount: 200 }),
      txn({ type: 'wage_withdrawal', amount: 300 }),
      txn({ type: 'adjustment', amount: -50 }),
    ]);
    expect(c).toMatchObject({ deposits: 1000, withdrawals: 200, wages: 300, adjustments: -50 });
    expect(c.netExternalCashflow).toBe(450); // 1000 - 200 - 300 - 50
  });
});

// ── Drawdown ────────────────────────────────────────────────────────────────────

describe('maxDrawdown & drawdown curves', () => {
  it('steadily rising equity → zero drawdown', () => {
    expect(maxDrawdown([100, 110, 120, 130]).maxDrawdown).toBe(0);
  });
  it('one peak-to-trough decline', () => {
    const d = maxDrawdown([100, 150, 90, 130]);
    expect(d.maxDrawdown).toBe(60); // 150 → 90
    expect(d.maxDrawdownPct).toBe(40); // 60/150
  });
  it('multiple drawdowns returns the worst', () => {
    const d = maxDrawdown([100, 120, 110, 200, 140]);
    expect(d.maxDrawdown).toBe(60); // 200 → 140 worse than 120 → 110
  });
  it('trading-equity drawdown EXCLUDES external cashflows', () => {
    const trades = [
      trade({ id: 'a', net_pnl: 100, completed_at: '2026-01-01T00:00:00Z' }),
      trade({ id: 'b', net_pnl: -300, completed_at: '2026-01-02T00:00:00Z' }),
      trade({ id: 'c', net_pnl: 50, completed_at: '2026-01-03T00:00:00Z' }),
    ];
    // opening 1000 → 1100 → 800 (peak 1100) → 850. worst trading DD = 300.
    expect(tradingDrawdown(trades, 1000).maxDrawdown).toBe(300);
  });
  it('a wage withdrawal is NOT trading drawdown but IS cash drawdown', () => {
    const trades = [trade({ id: 'a', net_pnl: 100, completed_at: '2026-01-01T00:00:00Z' })];
    const txns = [txn({ id: 'w', type: 'wage_withdrawal', amount: 500, occurred_at: '2026-01-02T00:00:00Z' })];
    // trading equity: 1000 → 1100, only rises → 0 trading DD.
    expect(tradingDrawdown(trades, 1000).maxDrawdown).toBe(0);
    // cash balance: 1000 → 1100 → 600, so a 500 cash drawdown appears.
    expect(cashDrawdown(trades, txns, 1000).maxDrawdown).toBe(500);
  });
  it('negative starting balance edge case does not divide by zero', () => {
    const d = maxDrawdown([-100, -50, -200]);
    expect(d.maxDrawdown).toBe(150); // -50 → -200
    expect(Number.isFinite(d.maxDrawdownPct)).toBe(true);
  });
  it('same-timestamp trades order deterministically by id in the equity curve', () => {
    const ts = '2026-02-01T00:00:00.000Z';
    const c1 = tradingEquityCurve([trade({ id: 'b', net_pnl: -50, completed_at: ts }), trade({ id: 'a', net_pnl: 100, completed_at: ts })], 0);
    const c2 = tradingEquityCurve([trade({ id: 'a', net_pnl: 100, completed_at: ts }), trade({ id: 'b', net_pnl: -50, completed_at: ts })], 0);
    expect(c1).toEqual(c2); // input order independent → deterministic
    expect(c1).toEqual([0, 100, 50]); // 'a' before 'b'
  });
});

// ── Score bands & sample status ─────────────────────────────────────────────────

describe('scoreBand', () => {
  it('maps saved scores to non-overlapping bands', () => {
    expect(scoreBand(95)).toBe('90–100');
    expect(scoreBand(89)).toBe('85–89');
    expect(scoreBand(84)).toBe('75–84');
    expect(scoreBand(60)).toBe('60–74');
    expect(scoreBand(50)).toBe('50–59');
    expect(scoreBand(40)).toBe('40–49');
    expect(scoreBand(39)).toBe('<40');
    expect(scoreBand(null)).toBe('unknown');
    expect(SCORE_BANDS).toContain('90–100');
  });
});

describe('sampleStatus', () => {
  it('thresholds: 0/1/4 insufficient, 5/19 early, 20+ usable', () => {
    expect(sampleStatus(0)).toBe('insufficient');
    expect(sampleStatus(1)).toBe('insufficient');
    expect(sampleStatus(4)).toBe('insufficient');
    expect(sampleStatus(5)).toBe('early');
    expect(sampleStatus(19)).toBe('early');
    expect(sampleStatus(20)).toBe('usable');
    expect(sampleStatus(50)).toBe('usable');
  });
});

// ── Breakdowns ──────────────────────────────────────────────────────────────────

describe('breakdown (generic grouping)', () => {
  const trades = [
    trade({ id: '1', grade: 'A', result: 'win', net_pnl: 100, score: 95, deep_strength: 'STRONG' }),
    trade({ id: '2', grade: 'A', result: 'loss', net_pnl: -50, score: 92, deep_strength: 'STRONG' }),
    trade({ id: '3', grade: 'B', result: 'win', net_pnl: 30, score: 60, deep_strength: 'WEAK' }),
  ];

  it('by effective grade', () => {
    const rows = breakdown(trades, KEYERS.effectiveGrade);
    const a = rows.find(r => r.key === 'A');
    expect(a).toMatchObject({ totalTrades: 2, wins: 1, losses: 1, winRate: 0.5, netPnl: 50 });
    expect(rows.find(r => r.key === 'B').netPnl).toBe(30);
  });

  it('by score band (authoritative saved score, not grade)', () => {
    const rows = breakdown(trades, KEYERS.scoreBand);
    expect(rows.find(r => r.key === '90–100').totalTrades).toBe(2);
    expect(rows.find(r => r.key === '60–74').totalTrades).toBe(1);
  });

  it('by Deep strength and by asset', () => {
    expect(breakdown(trades, KEYERS.deepStrength).find(r => r.key === 'STRONG').totalTrades).toBe(2);
    expect(breakdown(trades, KEYERS.asset).find(r => r.key === 'EUR/USD').totalTrades).toBe(3);
  });

  it('unknown/missing values bucket under "unknown"', () => {
    const rows = breakdown([trade({ grade: undefined, result: 'win' })], KEYERS.effectiveGrade);
    expect(rows[0].key).toBe('unknown');
  });

  it('each row carries a sample status', () => {
    expect(breakdown(trades, KEYERS.effectiveGrade)[0].sampleStatus).toBeTruthy();
  });
});

describe('direction & engine breakdowns', () => {
  it('executed vs engine direction and with/against', () => {
    const trades = [
      trade({ id: '1', direction: 'BUY', trade_direction: 'long', result: 'win' }),   // with
      trade({ id: '2', direction: 'BUY', trade_direction: 'short', result: 'loss', net_pnl: -10 }), // against
      trade({ id: '3', direction: 'SELL', trade_direction: null, result: 'win' }),     // unknown
    ];
    expect(withAgainstEngine(trades[0])).toBe('with');
    expect(withAgainstEngine(trades[1])).toBe('against');
    expect(withAgainstEngine(trades[2])).toBe('unknown');
    const rows = breakdown(trades, KEYERS.withAgainstEngine);
    expect(rows.find(r => r.key === 'with').totalTrades).toBe(1);
    expect(rows.find(r => r.key === 'against').totalTrades).toBe(1);
    expect(rows.find(r => r.key === 'unknown').totalTrades).toBe(1);
    expect(breakdown(trades, KEYERS.executedDirection).find(r => r.key === 'unknown').totalTrades).toBe(1);
  });
});

describe('time breakdowns', () => {
  it('hour, day and month keys', () => {
    const t = trade({ completed_at: '2026-03-05T14:30:00.000Z' });
    expect(KEYERS.hourOfDay(t)).toBe(String(new Date(t.completed_at).getHours()));
    expect(KEYERS.month(t)).toBe('2026-03');
    expect(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']).toContain(KEYERS.dayOfWeek(t));
    expect(KEYERS.hourOfDay({})).toBe('unknown');
  });
});

describe('mood & reason-tag breakdowns', () => {
  it('mood, with unknown bucket', () => {
    const rows = breakdown([trade({ mood: 'calm' }), trade({ mood: null })], KEYERS.mood);
    expect(rows.find(r => r.key === 'calm').totalTrades).toBe(1);
    expect(rows.find(r => r.key === 'unknown').totalTrades).toBe(1);
  });
  it('reason tags: a trade contributes to each tag; untagged bucket', () => {
    const rows = breakdownByReasonTags([
      trade({ id: '1', reason_tags: ['breakout', 'trend'] }),
      trade({ id: '2', reason_tags: ['trend'] }),
      trade({ id: '3', reason_tags: [] }),
    ]);
    expect(rows.find(r => r.key === 'trend').totalTrades).toBe(2);
    expect(rows.find(r => r.key === 'breakout').totalTrades).toBe(1);
    expect(rows.find(r => r.key === 'untagged').totalTrades).toBe(1);
  });
});

// ── Engine-version separation ───────────────────────────────────────────────────

describe('engine-version separation', () => {
  const trades = [
    trade({ id: '1', engine_version: 'prime-bias-current-v1' }),
    trade({ id: '2', engine_version: undefined }), // legacy
    trade({ id: '3', engine_version: 'prime-bias-current-v1' }),
  ];
  it('lists distinct versions and detects a mixed scope', () => {
    expect(engineVersionsInScope(trades)).toEqual(['legacy-pre-snapshot', 'prime-bias-current-v1']);
    expect(combinesEngineVersions(trades)).toBe(true);
    expect(combinesEngineVersions([trades[0], trades[2]])).toBe(false);
  });
  it('filters by version (missing treated as legacy)', () => {
    expect(filterByEngineVersion(trades, 'legacy-pre-snapshot').map(t => t.id)).toEqual(['2']);
    expect(filterByEngineVersion(trades, 'prime-bias-current-v1')).toHaveLength(2);
  });
  it('breakdown by engine version', () => {
    const rows = breakdown(trades, KEYERS.engineVersion);
    expect(rows.find(r => r.key === 'legacy-pre-snapshot').totalTrades).toBe(1);
    expect(rows.find(r => r.key === 'prime-bias-current-v1').totalTrades).toBe(2);
  });
});

// ── Reconciliation ──────────────────────────────────────────────────────────────

describe('reconcile — balance identity', () => {
  it('reconciles deposits, withdrawals, wages, adjustments and fees over all time', () => {
    const txns = [
      txn({ id: 'd', type: 'deposit', amount: 1000 }),
      txn({ id: 'w', type: 'withdrawal', amount: 200 }),
      txn({ id: 'g', type: 'wage_withdrawal', amount: 300 }),
      txn({ id: 'a', type: 'adjustment', amount: -50 }),
    ];
    const trades = [trade({ net_pnl: 195, gross_pnl: 200, fees: 5 }), trade({ result: 'loss', net_pnl: -80 })];
    const r = reconcile({ account: account(), txns, trades, windowStartMs: null });
    expect(r.tradingPnl).toBe(115); // 195 - 80 (fees already inside net)
    expect(r.deposits).toBe(1000); expect(r.wages).toBe(300);
    // 10000 + 115 + 1000 - 50 - 200 - 300 = 10565
    expect(r.expectedClosing).toBe(10565);
    expect(r.actualClosing).toBe(10565);
    expect(r.difference).toBe(0);
    expect(r.reconciled).toBe(true);
  });

  it('reconciles a bounded period (opening excludes prior events)', () => {
    const txns = [txn({ id: 'd', type: 'deposit', amount: 5000, occurred_at: '2026-01-01T00:00:00Z' })];
    const trades = [
      trade({ id: 't1', net_pnl: 200, completed_at: '2026-01-10T00:00:00Z' }),
      trade({ id: 't2', net_pnl: 300, completed_at: '2026-03-10T00:00:00Z' }),
    ];
    const r = reconcile({ account: account(), txns, trades, windowStartMs: T('2026-03-01T00:00:00Z') });
    expect(r.openingBalance).toBe(15200); // 10000 + 5000 + 200
    expect(r.tradingPnl).toBe(300);
    expect(r.reconciled).toBe(true);
  });

  it('legacy pnl-only trades reconcile too', () => {
    const trades = [{ id: 'L', status: 'completed', result: 'win', pnl: 40 }];
    const r = reconcile({ account: account({ starting_balance: 0 }), txns: [], trades, windowStartMs: null });
    expect(r.tradingPnl).toBe(40);
    expect(r.reconciled).toBe(true);
  });
});

// ── Aggregate ───────────────────────────────────────────────────────────────────

describe('computePerformance', () => {
  it('combines summary, cashflow, balances, ROI, both drawdowns and versions', () => {
    const txns = [
      txn({ id: 'd', type: 'deposit', amount: 1000, occurred_at: '2026-01-01T00:00:00Z' }),
      txn({ id: 'g', type: 'wage_withdrawal', amount: 200, occurred_at: '2026-01-15T00:00:00Z' }),
    ];
    const trades = [
      trade({ id: 't1', net_pnl: 300, completed_at: '2026-01-10T00:00:00Z', engine_version: 'prime-bias-current-v1' }),
      trade({ id: 't2', result: 'loss', net_pnl: -100, completed_at: '2026-01-12T00:00:00Z', engine_version: 'legacy-pre-snapshot' }),
    ];
    const p = computePerformance({ account: account(), txns, trades, windowStartMs: null });
    expect(p.netPnl).toBe(200);
    expect(p.wages).toBe(200);
    expect(p.deposits).toBe(1000);
    expect(p.closingBalance).toBe(11000); // 10000 + 1000 - 200 + 200
    expect(p.combinesEngineVersions).toBe(true);
    expect(p.engineVersions).toEqual(['legacy-pre-snapshot', 'prime-bias-current-v1']);
    expect(typeof p.tradingDrawdown).toBe('number');
    expect(typeof p.cashDrawdown).toBe('number');
  });

  it('respects the period window', () => {
    const trades = [
      trade({ id: 'old', net_pnl: 999, completed_at: '2020-01-01T00:00:00Z' }),
      trade({ id: 'new', net_pnl: 50, completed_at: '2026-03-10T00:00:00Z' }),
    ];
    const p = computePerformance({ account: account(), txns: [], trades, windowStartMs: T('2026-03-01T00:00:00Z') });
    expect(p.netPnl).toBe(50); // old trade excluded from the period summary
  });
});
