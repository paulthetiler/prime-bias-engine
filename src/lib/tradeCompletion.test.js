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
  isAnalysisLocked,
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
