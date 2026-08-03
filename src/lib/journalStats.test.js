import { describe, it, expect } from 'vitest';
import {
  windowStart,
  filterByTimeframe,
  rMultiple,
  computeStats,
  resolveStartingBalance,
  recordTime,
  computeGradeBreakdown,
  computeAssetRanking,
} from './journalStats';

const NOW = new Date('2026-08-02T12:00:00.000Z').getTime();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

const trade = (over = {}) => ({
  id: 'ct',
  result: 'win',
  direction: 'BUY',
  net_pnl: 100,
  completed_at: daysAgo(1),
  instrument: 'EUR/USD',
  ...over,
});

describe('recordTime', () => {
  it('prefers completed_at, then created_at, then created_date', () => {
    expect(recordTime({ completed_at: daysAgo(1), created_at: daysAgo(5) })).toBe(new Date(daysAgo(1)).getTime());
    expect(recordTime({ created_at: daysAgo(5) })).toBe(new Date(daysAgo(5)).getTime());
    expect(recordTime({})).toBeNull();
  });
});

describe('windowStart / filterByTimeframe', () => {
  it('returns null (no bound) for all time', () => {
    expect(windowStart('all', NOW)).toBeNull();
  });

  it('today uses local midnight', () => {
    const start = windowStart('today', NOW);
    const d = new Date(start);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('filters to the rolling N-day window', () => {
    const trades = [trade({ completed_at: daysAgo(2) }), trade({ completed_at: daysAgo(20) }), trade({ completed_at: daysAgo(100) })];
    expect(filterByTimeframe(trades, '7d', NOW)).toHaveLength(1);
    expect(filterByTimeframe(trades, '30d', NOW)).toHaveLength(2);
    expect(filterByTimeframe(trades, 'all', NOW)).toHaveLength(3);
  });

  it('drops undated records from bounded windows but keeps them for all time', () => {
    const trades = [trade({ completed_at: null, created_at: null, created_date: null })];
    expect(filterByTimeframe(trades, '30d', NOW)).toHaveLength(0);
    expect(filterByTimeframe(trades, 'all', NOW)).toHaveLength(1);
  });
});

describe('rMultiple', () => {
  it('is realised net P/L divided by amount risked', () => {
    expect(rMultiple({ result: 'win', net_pnl: 200, amount_risked: 100 })).toBe(2);
    expect(rMultiple({ result: 'loss', net_pnl: -50, amount_risked: 100 })).toBe(-0.5);
    expect(rMultiple({ result: 'breakeven', net_pnl: 0, amount_risked: 100 })).toBe(0);
  });
  it('is null without a positive amount risked (no fake planned-R fallback)', () => {
    expect(rMultiple({ result: 'win', net_pnl: 200 })).toBeNull();
    expect(rMultiple({ result: 'win', net_pnl: 200, amount_risked: 0 })).toBeNull();
    expect(rMultiple({ result: 'win', net_pnl: 200, amount_risked: -5 })).toBeNull();
  });
  it('is null when the monetary result is missing', () => {
    expect(rMultiple({ result: 'win', amount_risked: 100 })).toBeNull();
    expect(rMultiple(null)).toBeNull();
  });
});

describe('computeStats', () => {
  it('computes win rate over directional trades only', () => {
    const trades = [
      trade({ result: 'win' }),
      trade({ result: 'loss' }),
      trade({ result: 'win' }),
      trade({ result: 'breakeven' }),
      trade({ result: 'not_taken' }),
    ];
    const s = computeStats(trades);
    expect(s.totalTrades).toBe(5);
    expect(s.directionalCount).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(Math.round(s.winRate)).toBe(67);
  });

  it('computes net P&L, gross figures and profit factor from net_pnl', () => {
    const trades = [
      trade({ result: 'win', net_pnl: 200 }),
      trade({ result: 'win', net_pnl: 100 }),
      trade({ result: 'loss', net_pnl: -150 }),
    ];
    const s = computeStats(trades);
    expect(s.grossProfit).toBe(300);
    expect(s.grossLoss).toBe(150);
    expect(s.netPnl).toBe(150);
    expect(s.profitFactor).toBe(2);
    expect(s.hasPnl).toBe(true);
  });

  it('break-even counts as complete, contributes 0, and is not in the win-rate denominator', () => {
    const s = computeStats([
      trade({ result: 'win', net_pnl: 100 }),
      trade({ result: 'breakeven', net_pnl: 0 }),
    ]);
    expect(s.directionalCount).toBe(1); // breakeven excluded
    expect(s.winRate).toBe(100);
    expect(s.completeCount).toBe(2);    // breakeven is financially complete
    expect(s.grossProfit).toBe(100);
    expect(s.grossLoss).toBe(0);
  });

  it('profit factor is Infinity with no losing dollars and null with no P&L', () => {
    expect(computeStats([trade({ result: 'win', net_pnl: 100 })]).profitFactor).toBe(Infinity);
    expect(computeStats([trade({ net_pnl: null }), trade({ net_pnl: undefined })]).profitFactor).toBeNull();
  });

  it('excludes financially-incomplete trades from money stats but still counts them', () => {
    const s = computeStats([
      trade({ result: 'win', net_pnl: 100 }),
      trade({ result: 'loss', net_pnl: null }), // historic, no amount entered
    ]);
    expect(s.totalTrades).toBe(2);
    expect(s.completeCount).toBe(1);
    expect(s.incompleteCount).toBe(1);
    expect(s.netPnl).toBe(100);        // the null trade does not move P/L
    expect(s.directionalCount).toBe(2); // but it still counts toward win rate
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(1);
  });

  it('averages REAL R only over trades with amount risked', () => {
    const s = computeStats([
      trade({ net_pnl: 200, amount_risked: 100 }), // 2R
      trade({ net_pnl: -50, amount_risked: 100 }), // -0.5R
      trade({ net_pnl: 100, amount_risked: null }), // no risk data → ignored
    ]);
    expect(s.hasRiskData).toBe(true);
    expect(s.avgR).toBeCloseTo(0.75, 5);
  });

  it('reports no risk data when amount risked was never recorded', () => {
    const s = computeStats([trade({ net_pnl: 100 }), trade({ net_pnl: -20 })]);
    expect(s.hasRiskData).toBe(false);
    expect(s.avgR).toBeNull();
  });

  it('tracks best win streak and current streak with direction', () => {
    const trades = [
      trade({ result: 'win', completed_at: daysAgo(4) }),
      trade({ result: 'win', completed_at: daysAgo(3) }),
      trade({ result: 'loss', completed_at: daysAgo(2) }),
      trade({ result: 'win', completed_at: daysAgo(1) }),
    ];
    const s = computeStats(trades);
    expect(s.bestWinStreak).toBe(2);
    expect(s.currentStreak).toBe(1);
    expect(s.streakType).toBe('win');
  });

  it('handles an empty set without throwing', () => {
    const s = computeStats([]);
    expect(s.totalTrades).toBe(0);
    expect(s.winRate).toBe(0);
    expect(s.hasPnl).toBe(false);
    expect(s.profitFactor).toBeNull();
    expect(s.avgR).toBeNull();
  });
});

describe('computeGradeBreakdown', () => {
  it('returns all five grades in order, win rate over directional trades only', () => {
    const trades = [
      trade({ grade: 'A', result: 'win' }),
      trade({ grade: 'A', result: 'win' }),
      trade({ grade: 'A', result: 'loss' }),
      trade({ grade: 'B', result: 'loss' }),
      trade({ grade: 'B', result: 'breakeven' }),
      trade({ grade: 'B', result: 'not_taken' }),
    ];
    const rows = computeGradeBreakdown(trades);
    expect(rows.map(r => r.grade)).toEqual(['A', 'B', 'C', 'D', 'F']);
    expect(rows.find(r => r.grade === 'A')).toEqual({ grade: 'A', rate: 67, count: 3 });
    expect(rows.find(r => r.grade === 'B')).toEqual({ grade: 'B', rate: 0, count: 1 });
    expect(rows.find(r => r.grade === 'C')).toEqual({ grade: 'C', rate: 0, count: 0 });
  });

  it('handles an empty set without throwing', () => {
    expect(computeGradeBreakdown([]).every(r => r.count === 0)).toBe(true);
  });
});

describe('computeAssetRanking', () => {
  it('ranks instruments by win rate, best first', () => {
    const trades = [
      trade({ instrument: 'GBP/USD', result: 'win' }),
      trade({ instrument: 'GBP/USD', result: 'win' }),
      trade({ instrument: 'EUR/USD', result: 'win' }),
      trade({ instrument: 'EUR/USD', result: 'loss' }),
    ];
    const ranked = computeAssetRanking(trades);
    expect(ranked.map(r => r.asset)).toEqual(['GBP/USD', 'EUR/USD']);
    expect(ranked[0]).toEqual({ asset: 'GBP/USD', rate: 1, n: 2 });
    expect(ranked[1]).toEqual({ asset: 'EUR/USD', rate: 0.5, n: 2 });
  });

  it('excludes instruments below the minimum directional-trade count', () => {
    const trades = [
      trade({ instrument: 'GBP/USD', result: 'win' }),
      trade({ instrument: 'EUR/USD', result: 'win' }),
      trade({ instrument: 'EUR/USD', result: 'loss' }),
      trade({ instrument: 'USD/JPY', result: 'breakeven' }),
    ];
    const ranked = computeAssetRanking(trades);
    expect(ranked.map(r => r.asset)).toEqual(['EUR/USD']);
  });

  it('respects a custom minimum', () => {
    const trades = [trade({ instrument: 'GBP/USD', result: 'win' })];
    expect(computeAssetRanking(trades, { minTrades: 1 })).toHaveLength(1);
  });
});

describe('resolveStartingBalance', () => {
  it('uses the earliest monthly journal start balance', () => {
    const entries = [
      { year: 2026, month: 'March', start_balance: 3000 },
      { year: 2026, month: 'January', start_balance: 1000 },
      { year: 2025, month: 'December', start_balance: 500 },
    ];
    const r = resolveStartingBalance(entries);
    expect(r.value).toBe(500);
    expect(r.source).toBe('journal');
  });

  it('falls back to the default when no balance data exists', () => {
    const r = resolveStartingBalance([{ year: 2026, month: 'January' }]);
    expect(r.source).toBe('default');
    expect(r.value).toBe(10000);
  });
});
