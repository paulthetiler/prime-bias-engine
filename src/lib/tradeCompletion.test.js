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
