import { describe, it, expect, beforeEach, vi } from 'vitest';

const createCompleted = vi.fn();

vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      CompletedTrade: { create: (...a) => createCompleted(...a), delete: vi.fn() },
    },
  },
}));

const {
  buildRestoredAnalysis,
  completeTrade,
  computeTradeFinancials,
  isAnalysisLocked,
  lockAnalysis,
  resolveAnalysisIdForEdit,
} = await import('./tradeCompletion');
// isValidAnalysisId is internal to tradeCompletion, so validity is asserted here
// through the id format and the lock system (isAnalysisLocked) instead.

const sampleTrade = {
  id: 'ct-src',
  instrument: 'EUR/USD',
  inputs_snapshot: { day: { close: 1, macd: 1, rsi: 0, boli: 0 } },
  created_at: '2026-01-01T00:00:00.000Z',
  extra_check_h1: 1,
  extra_check_m15: 1,
};

// The Dashboard keeps an active analysis only while it is NOT locked.
const dashboardVisible = (analyses) => analyses.filter((a) => !isAnalysisLocked(a.analysisId));

beforeEach(() => {
  localStorage.clear();
  createCompleted.mockReset();
  createCompleted.mockResolvedValue({ id: 'ct-new' });
});

describe('buildRestoredAnalysis', () => {
  it('gives the restored analysis a valid analysisId and copies its data', () => {
    const restored = buildRestoredAnalysis(sampleTrade);
    expect(typeof restored.analysisId).toBe('string');
    expect(restored.analysisId).toContain('EUR/USD-');
    expect(restored.analysisId).toContain('-'); // valid id format
    expect(restored.instrument).toBe('EUR/USD');
    expect(restored.inputs).toEqual(sampleTrade.inputs_snapshot);
    expect(restored.extraCheck).toEqual({ h1: 1, m15: 1 });
    // A valid id is required for the lock system to ever recognise it.
    expect(isAnalysisLocked(restored.analysisId)).toBe(false); // not yet completed
  });

  it('produces a distinct analysisId each time (each restore is its own session)', () => {
    const a = buildRestoredAnalysis(sampleTrade);
    const b = buildRestoredAnalysis(sampleTrade);
    expect(a.analysisId).not.toBe(b.analysisId);
  });
});

describe('resolveAnalysisIdForEdit', () => {
  const dashboardVisibleId = (id) => !isAnalysisLocked(id);

  it('keeps the existing id while an analysis is still in progress (not locked)', () => {
    const existing = 'BITCOIN-2026-08-02-100000-abc123';
    const { analysisId, isNew } = resolveAnalysisIdForEdit(existing, false, 'BITCOIN');
    expect(analysisId).toBe(existing);
    expect(isNew).toBe(false);
  });

  it('generates a fresh id for a brand-new instrument (no existing analysis)', () => {
    const { analysisId, isNew } = resolveAnalysisIdForEdit(undefined, false, 'BITCOIN');
    expect(analysisId).toContain('BITCOIN-');
    expect(analysisId).not.toBe(undefined);
    expect(isNew).toBe(true);
  });

  it('regression: editing a COMPLETED analysis starts a fresh one so it shows on the Summary again', () => {
    // Reproduces the reported bug: complete a BITCOIN trade, then change the engine
    // later that day. The old code reused the locked id, so the Summary stayed empty.
    const completedId = 'BITCOIN-2026-08-02-090000-old111';
    lockAnalysis(completedId);
    expect(dashboardVisibleId(completedId)).toBe(false); // hidden after completion

    const { analysisId, isNew } = resolveAnalysisIdForEdit(completedId, false, 'BITCOIN');

    expect(analysisId).not.toBe(completedId); // a brand-new analysis session
    expect(isNew).toBe(true);
    expect(isAnalysisLocked(analysisId)).toBe(false); // the new id is not locked…
    expect(dashboardVisibleId(analysisId)).toBe(true); // …so the card is visible again
  });

  it('a plain load/view of a completed analysis keeps the locked id (no pop-back on the Summary)', () => {
    const completedId = 'BITCOIN-2026-08-02-090000-old222';
    lockAnalysis(completedId);

    // isLoading = true → merely opening the Bias Tool must not resurrect the card.
    const { analysisId, isNew } = resolveAnalysisIdForEdit(completedId, true, 'BITCOIN');
    expect(analysisId).toBe(completedId);
    expect(isNew).toBe(false);
    expect(dashboardVisibleId(analysisId)).toBe(false); // stays completed/hidden
  });
});

describe('restore → complete workflow', () => {
  it('completing a restored trade locks it so the Summary card disappears', async () => {
    const restored = buildRestoredAnalysis(sampleTrade);
    expect(dashboardVisible([restored])).toHaveLength(1); // visible before completion

    await completeTrade(restored, 'win');

    expect(createCompleted).toHaveBeenCalledTimes(1);
    expect(isAnalysisLocked(restored.analysisId)).toBe(true);
    expect(dashboardVisible([restored])).toHaveLength(0); // card cleared
  });

  it('repeating restore/complete does not create duplicate completed trades or stuck cards', async () => {
    // First cycle
    const first = buildRestoredAnalysis(sampleTrade);
    await completeTrade(first, 'win');
    // Second cycle (user restores the same source trade again later)
    const second = buildRestoredAnalysis(sampleTrade);
    await completeTrade(second, 'loss');

    // Exactly one record created per completion — never a runaway duplicate.
    expect(createCompleted).toHaveBeenCalledTimes(2);
    expect(first.analysisId).not.toBe(second.analysisId);
    // Both cards are cleared from the Summary; nothing is stuck.
    expect(dashboardVisible([first, second])).toHaveLength(0);
  });

  it('regression: an entry with no analysisId (the old restore bug) can never be locked/cleared', () => {
    // Demonstrates why the fix matters: undefined ids are unlockable.
    expect(isAnalysisLocked(undefined)).toBe(false);
    const legacy = { instrument: 'EUR/USD', analysisId: undefined };
    expect(dashboardVisible([legacy])).toHaveLength(1); // would stay stuck forever
  });
});

describe('computeTradeFinancials', () => {
  it('a win banks the amount as a positive net (minus fees)', () => {
    expect(computeTradeFinancials({ result: 'win', amount: 200, fees: 5 }))
      .toEqual({ grossPnl: 200, fees: 5, netPnl: 195, amountRisked: null });
  });

  it('a loss stores a negative net from a POSITIVE input (no minus typed)', () => {
    expect(computeTradeFinancials({ result: 'loss', amount: 150 }))
      .toEqual({ grossPnl: -150, fees: null, netPnl: -150, amountRisked: null });
    // fees deepen the loss
    expect(computeTradeFinancials({ result: 'loss', amount: 150, fees: 10 }).netPnl).toBe(-160);
    // a stray minus in the input is ignored — magnitude is used
    expect(computeTradeFinancials({ result: 'loss', amount: -150 }).netPnl).toBe(-150);
  });

  it('break-even is net 0 (or -fees) regardless of amount', () => {
    expect(computeTradeFinancials({ result: 'breakeven', amount: 999 }).netPnl).toBe(0);
    expect(computeTradeFinancials({ result: 'breakeven', fees: 3 }).netPnl).toBe(-3);
  });

  it('a win/loss with no amount stays financially incomplete (net_pnl null)', () => {
    expect(computeTradeFinancials({ result: 'win' }).netPnl).toBeNull();
    expect(computeTradeFinancials({ result: 'loss', amount: '' }).netPnl).toBeNull();
  });

  it('carries amount risked through when provided', () => {
    expect(computeTradeFinancials({ result: 'win', amount: 100, amountRisked: 50 }).amountRisked).toBe(50);
  });

  it('not_taken carries no financials', () => {
    expect(computeTradeFinancials({ result: 'not_taken', amount: 100 }))
      .toEqual({ grossPnl: null, fees: null, netPnl: null, amountRisked: null });
  });
});

describe('completeTrade financial persistence', () => {
  it('writes account_id, gross/net/fees/risk and keeps legacy pnl in sync', async () => {
    const analysis = { instrument: 'EUR/USD', results: {}, analysisId: 'EUR/USD-2026-01-01-000000-x' };
    await completeTrade(analysis, 'loss', { amount: 80, fees: 4, amountRisked: 40, accountId: 'acc-9' });
    const payload = createCompleted.mock.calls.at(-1)[0];
    expect(payload.account_id).toBe('acc-9');
    expect(payload.gross_pnl).toBe(-80);
    expect(payload.fees).toBe(4);
    expect(payload.net_pnl).toBe(-84);
    expect(payload.amount_risked).toBe(40);
    expect(payload.pnl).toBe(-84); // legacy column mirrors net_pnl
  });
});

// ── Immutable engine snapshot persistence (issue #14, phase 2) ─────────────────
import { calculateBias, ENGINE_VERSION } from './biasEngine';

const STRONG_BUY_INPUTS = {
  month: { close: 1, macd: 1, rsi: 1, boli: 1 },
  week:  { close: 1, macd: 1, rsi: 1, boli: 1 },
  day:   { close: 1, macd: 1, rsi: 1, boli: 1 },
  h4:    { close: 1, macd: 1, rsi: 1, boli: 1 },
  h1:    { close: 1, macd: 1, rsi: 1, boli: 1 },
  m15:   { close: 1, macd: 1, rsi: 1, boli: 1 },
  m5:    { close: 1, macd: 1, rsi: 1, boli: 1 },
};
const EC = { h1: 1, m15: 1 };
const SNAPSHOT_KEYS = [
  'engine_version', 'engine_settings', 'raw_grade',
  'buy_score', 'sell_score', 'timeframes_snapshot', 'lights_result',
];

const analysisWith = (options, over = {}) => {
  const results = calculateBias(STRONG_BUY_INPUTS, EC, options);
  return {
    instrument: 'EUR/USD',
    analysisId: 'EUR/USD-2026-08-03-100000-x',
    results,
    inputs: STRONG_BUY_INPUTS,
    extraCheck: EC,
    timestamp: '2026-08-03T10:00:00.000Z',
    ...over,
  };
};

describe('completeTrade — engine snapshot persistence', () => {
  it('stores the entire engine snapshot on a newly completed trade', async () => {
    await completeTrade(analysisWith(), 'win', { amount: 100 });
    const payload = createCompleted.mock.calls.at(-1)[0];

    for (const k of SNAPSHOT_KEYS) expect(payload, k).toHaveProperty(k);
    expect(payload.engine_version).toBe(ENGINE_VERSION);
    expect(typeof payload.buy_score).toBe('number');
    expect(typeof payload.sell_score).toBe('number');
    expect(payload.buy_score).toBeGreaterThan(payload.sell_score);
    expect(payload.lights_result).toBe('buy');
    // engine_settings freezes the resolved options as concrete values.
    expect(payload.engine_settings.score_weights).toMatchObject({ h1: expect.any(Number) });
    expect(payload.engine_settings.grade_thresholds).toMatchObject({ A: expect.any(Number) });
    // per-timeframe results are stored, not left to be recomputed.
    expect(Object.keys(payload.timeframes_snapshot)).toEqual(
      ['month', 'week', 'day', 'h4', 'h1', 'm15', 'm5']
    );
    expect(payload.timeframes_snapshot.h1).toMatchObject({
      result: expect.any(Number), bias: expect.any(String),
    });
  });

  it('persists raw grade and effective grade separately', async () => {
    await completeTrade(analysisWith(), 'win', { amount: 100 });
    const payload = createCompleted.mock.calls.at(-1)[0];
    // `grade` is the effective/capped grade; `raw_grade` is pre-cap.
    expect(payload).toHaveProperty('raw_grade');
    expect(payload).toHaveProperty('grade');
    expect(payload.raw_grade).toBeTruthy();
  });

  it('quick and detailed completion store an identical snapshot structure', async () => {
    // Quick mode: money only. Detailed mode: adds entry/exit/notes.
    await completeTrade(analysisWith(), 'win', { amount: 100 });
    const quick = createCompleted.mock.calls.at(-1)[0];
    await completeTrade(analysisWith(), 'win', {
      amount: 100, fees: 2, entry: '1.25', exit: '1.26', notes: 'clean break',
    });
    const detailed = createCompleted.mock.calls.at(-1)[0];

    const pick = (o) => Object.fromEntries(SNAPSHOT_KEYS.map(k => [k, o[k]]));
    expect(Object.keys(pick(quick))).toEqual(Object.keys(pick(detailed)));
    expect(pick(quick)).toEqual(pick(detailed));
  });

  it('freezes each trade under its own settings — a later settings change never re-grades it', async () => {
    // Trade taken under threshold A=70.
    await completeTrade(analysisWith({ thresholds: { A: 70 } }), 'win', { amount: 100 });
    const first = createCompleted.mock.calls.at(-1)[0];
    // User later changes the engine (A=99) and takes another trade.
    await completeTrade(analysisWith({ thresholds: { A: 99 } }), 'win', { amount: 100 });
    const second = createCompleted.mock.calls.at(-1)[0];

    expect(first.engine_settings.grade_thresholds.A).toBe(70);
    expect(second.engine_settings.grade_thresholds.A).toBe(99);
    // The first trade's frozen settings are untouched by the second completion.
    expect(first.engine_settings.grade_thresholds.A).not.toBe(
      second.engine_settings.grade_thresholds.A
    );
  });
});
