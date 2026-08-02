import { describe, it, expect } from 'vitest';
import {
  windowStart,
  filterByTimeframe,
  rMultiple,
  computeStats,
  buildEquitySeries,
  resolveStartingBalance,
  recordTime,
} from './journalStats';

const NOW = new Date('2026-08-02T12:00:00.000Z').getTime();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

const trade = (over = {}) => ({
  id: 'ct',
  result: 'win',
  direction: 'BUY',
  target: 2,
  pnl: 100,
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
  it('banks the planned target on a win', () => {
    expect(rMultiple({ result: 'win', target: 2.5 })).toBe(2.5);
  });
  it('defaults to 1R when no target', () => {
    expect(rMultiple({ result: 'win' })).toBe(1);
  });
  it('is -1 on a loss and 0 on break-even', () => {
    expect(rMultiple({ result: 'loss', target: 3 })).toBe(-1);
    expect(rMultiple({ result: 'breakeven' })).toBe(0);
  });
  it('is null for non-decisive results', () => {
    expect(rMultiple({ result: 'not_taken' })).toBeNull();
    expect(rMultiple(null)).toBeNull();
  });
});

describe('computeStats', () => {
  it('computes win rate over decisive trades only', () => {
    const trades = [
      trade({ result: 'win' }),
      trade({ result: 'loss' }),
      trade({ result: 'win' }),
      trade({ result: 'breakeven' }),
      trade({ result: 'not_taken' }),
    ];
    const s = computeStats(trades);
    expect(s.totalTrades).toBe(5);
    expect(s.decisiveCount).toBe(3);
    expect(s.wins).toBe(2);
    expect(s.losses).toBe(1);
    expect(Math.round(s.winRate)).toBe(67);
  });

  it('computes net P&L, gross figures and profit factor', () => {
    const trades = [
      trade({ result: 'win', pnl: 200 }),
      trade({ result: 'win', pnl: 100 }),
      trade({ result: 'loss', pnl: -150 }),
    ];
    const s = computeStats(trades);
    expect(s.grossProfit).toBe(300);
    expect(s.grossLoss).toBe(150);
    expect(s.netPnl).toBe(150);
    expect(s.profitFactor).toBe(2);
    expect(s.hasPnl).toBe(true);
  });

  it('profit factor is Infinity with no losses and null with no P&L', () => {
    expect(computeStats([trade({ result: 'win', pnl: 100 })]).profitFactor).toBe(Infinity);
    expect(computeStats([trade({ pnl: null }), trade({ pnl: undefined })]).profitFactor).toBeNull();
  });

  it('averages planned risk:reward from targets', () => {
    const s = computeStats([trade({ target: 2 }), trade({ target: 4 }), trade({ target: null })]);
    expect(s.avgRr).toBe(3);
  });

  it('computes ROI against starting balance', () => {
    const s = computeStats([trade({ pnl: 500 })], { startingBalance: 10000 });
    expect(s.roiPct).toBe(5);
    expect(s.endingBalance).toBe(10500);
  });

  it('tracks best win streak and current streak with direction', () => {
    // chronological: W W L W  -> best win streak 2, current streak 1 win
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
    expect(s.roiPct).toBeNull();
  });
});

describe('buildEquitySeries', () => {
  it('accumulates P&L chronologically across all three read-outs', () => {
    const trades = [
      trade({ pnl: 100, completed_at: daysAgo(3) }),
      trade({ pnl: -40, completed_at: daysAgo(2) }),
      trade({ pnl: 60, completed_at: daysAgo(1) }),
    ];
    const series = buildEquitySeries(trades, { startingBalance: 1000 });
    expect(series.map(p => p.equity)).toEqual([100, 60, 120]);
    expect(series.map(p => p.balance)).toEqual([1100, 1060, 1120]);
    expect(series.map(p => p.roi)).toEqual([10, 6, 12]);
  });

  it('excludes trades without a numeric P&L', () => {
    const series = buildEquitySeries([trade({ pnl: null }), trade({ pnl: 50 })]);
    expect(series).toHaveLength(1);
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
