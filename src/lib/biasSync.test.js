import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mutable Supabase-configured flag so we can exercise the "not configured" path.
const state = vi.hoisted(() => ({ configured: true }));

const me = vi.fn();
const biasList = vi.fn();
const completedFilter = vi.fn();
const upsert = vi.fn();

vi.mock('@/api/base44Client', () => ({
  base44: {
    auth: { me: (...a) => me(...a) },
    entities: {
      BiasAnalysis: { list: (...a) => biasList(...a), upsert: (...a) => upsert(...a) },
      CompletedTrade: { filter: (...a) => completedFilter(...a) },
    },
  },
}));

vi.mock('@/api/supabaseClient', () => ({
  get isSupabaseConfigured() {
    return state.configured;
  },
}));

const { hydrateActiveAnalyses, syncActiveAnalyses, hydrateOnceForUser, resetHydrationGuard } = await import('./biasSync');
const { isAnalysisLocked } = await import('./tradeCompletion');
const { getDefaultInputs } = await import('./biasEngine');

const inputs = {
  month: { close: 1, macd: 1, rsi: 1, boli: 1 },
  week: { close: 1, macd: 1, rsi: 1, boli: 1 },
};

function biasRow(overrides = {}) {
  return {
    id: 'row-1',
    instrument: 'EUR/USD',
    analysis_id: 'EUR/USD-2026-08-03-120000-abc',
    inputs,
    extra_check: { h1: 1, m15: null },
    results: { grade: 'A', mainDirection: 'BUY' },
    timestamp: '2026-08-03T12:00:00.000Z',
    updated_date: '2026-08-03T12:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  state.configured = true;
  me.mockReset().mockResolvedValue({ id: 'user-1', email: 'a@b.com' });
  biasList.mockReset().mockResolvedValue([]);
  completedFilter.mockReset().mockResolvedValue([]);
  upsert.mockReset().mockResolvedValue({ id: 'row-1' });
  localStorage.clear();
  resetHydrationGuard();
});

// A local active-store entry with a complete inputs shape (all timeframes),
// which calculateBias requires when the push path recomputes results.
function localEntry(instrument, analysisId, timestamp) {
  return {
    instrument,
    analysisId,
    inputs: getDefaultInputs(),
    extraCheck: { h1: null, m15: null },
    timestamp,
  };
}

describe('hydrateActiveAnalyses', () => {
  it('skips when Supabase is not configured', async () => {
    state.configured = false;
    const res = await hydrateActiveAnalyses();
    expect(res).toEqual({ ok: false, reason: 'not_configured' });
    expect(me).not.toHaveBeenCalled();
  });

  it('skips when not authenticated', async () => {
    me.mockRejectedValue(Object.assign(new Error('Not authenticated'), { status: 401 }));
    const res = await hydrateActiveAnalyses();
    expect(res).toEqual({ ok: false, reason: 'not_authenticated' });
    expect(biasList).not.toHaveBeenCalled();
  });

  it('hydrates a server row with inputs into the local cache and fires biasUpdated', async () => {
    biasList.mockResolvedValue([biasRow()]);
    const spy = vi.fn();
    window.addEventListener('biasUpdated', spy);

    const res = await hydrateActiveAnalyses();

    expect(res.ok).toBe(true);
    expect(res.hydrated).toBe(1);
    const active = JSON.parse(localStorage.getItem('primebias_active'));
    expect(active['EUR/USD'].inputs).toEqual(inputs);
    expect(active['EUR/USD'].analysisId).toBe('EUR/USD-2026-08-03-120000-abc');
    expect(active['EUR/USD'].extraCheck).toEqual({ h1: 1, m15: null });
    const inputStore = JSON.parse(localStorage.getItem('primebias_inputs'));
    expect(inputStore['EUR/USD'].inputs).toEqual(inputs);
    expect(spy).toHaveBeenCalled();
    window.removeEventListener('biasUpdated', spy);
  });

  it('does not resurrect an analysis completed on another device, and locks it locally', async () => {
    const row = biasRow();
    biasList.mockResolvedValue([row]);
    completedFilter.mockResolvedValue([{ analysis_id: row.analysis_id, status: 'completed' }]);

    const res = await hydrateActiveAnalyses();

    expect(res.completed).toBe(1);
    expect(res.hydrated).toBe(0);
    const active = JSON.parse(localStorage.getItem('primebias_active') || '{}');
    expect(active['EUR/USD']).toBeUndefined();
    expect(isAnalysisLocked(row.analysis_id)).toBe(true);
  });

  it('ignores legacy summary-only rows that have no inputs', async () => {
    biasList.mockResolvedValue([biasRow({ inputs: null, results: { grade: 'B' } })]);
    const res = await hydrateActiveAnalyses();
    expect(res.hydrated).toBe(0);
    expect(res.skippedNoInputs).toBe(1);
    expect(localStorage.getItem('primebias_active')).toBe(JSON.stringify({}));
  });

  it('keeps a newer local edit over an older server copy (last-write-wins)', async () => {
    const localInputs = { month: { close: -1, macd: 0, rsi: 0, boli: 0 } };
    localStorage.setItem('primebias_active', JSON.stringify({
      'EUR/USD': {
        instrument: 'EUR/USD',
        analysisId: 'EUR/USD-local',
        inputs: localInputs,
        extraCheck: { h1: null, m15: null },
        timestamp: '2026-08-03T18:00:00.000Z', // newer than server row (12:00)
      },
    }));
    biasList.mockResolvedValue([biasRow()]);

    const res = await hydrateActiveAnalyses();

    expect(res.keptLocal).toBe(1);
    expect(res.hydrated).toBe(0);
    const active = JSON.parse(localStorage.getItem('primebias_active'));
    expect(active['EUR/USD'].inputs).toEqual(localInputs);
  });

  it('overwrites an older local copy with a newer server row', async () => {
    localStorage.setItem('primebias_active', JSON.stringify({
      'EUR/USD': {
        instrument: 'EUR/USD',
        analysisId: 'EUR/USD-local',
        inputs: { month: { close: -1, macd: 0, rsi: 0, boli: 0 } },
        extraCheck: { h1: null, m15: null },
        timestamp: '2026-08-01T00:00:00.000Z', // older than server row (12:00 on 3rd)
      },
    }));
    biasList.mockResolvedValue([biasRow()]);

    const res = await hydrateActiveAnalyses();

    expect(res.hydrated).toBe(1);
    const active = JSON.parse(localStorage.getItem('primebias_active'));
    expect(active['EUR/USD'].inputs).toEqual(inputs);
  });

  it('picks the most recent server row per instrument', async () => {
    const older = biasRow({ id: 'old', analysis_id: 'EUR/USD-old', timestamp: '2026-08-03T09:00:00.000Z', results: { grade: 'D' } });
    const newer = biasRow({ id: 'new', analysis_id: 'EUR/USD-new', timestamp: '2026-08-03T15:00:00.000Z', results: { grade: 'A' } });
    biasList.mockResolvedValue([older, newer]);

    const res = await hydrateActiveAnalyses();

    expect(res.hydrated).toBe(1);
    const active = JSON.parse(localStorage.getItem('primebias_active'));
    expect(active['EUR/USD'].analysisId).toBe('EUR/USD-new');
  });

  it('returns fetch_failed and does not throw when the query errors', async () => {
    biasList.mockRejectedValue(new Error('network down'));
    const res = await hydrateActiveAnalyses();
    expect(res).toEqual({ ok: false, reason: 'fetch_failed' });
  });
});

describe('syncActiveAnalyses (two-way)', () => {
  it('pushes a local-only analysis up, then pulls the server set down', async () => {
    // Local device has BITCOIN that never reached the server (created pre-migration).
    localStorage.setItem('primebias_active', JSON.stringify({
      BITCOIN: localEntry('BITCOIN', 'BITCOIN-2026-08-03-100000-x', '2026-08-03T10:00:00.000Z'),
    }));
    // Server only knows about a different instrument.
    biasList.mockResolvedValue([biasRow({ instrument: 'DAX', analysis_id: 'DAX-1' })]);

    const res = await syncActiveAnalyses();

    // BITCOIN was uploaded with its full inputs …
    expect(res.pushed).toBe(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    const pushedPayload = upsert.mock.calls[0][0];
    expect(pushedPayload.analysis_id).toBe('BITCOIN-2026-08-03-100000-x');
    expect(pushedPayload.instrument).toBe('BITCOIN');
    expect(pushedPayload.inputs).toBeTruthy();
    // … and DAX was pulled down.
    expect(res.hydrated).toBe(1);
    const active = JSON.parse(localStorage.getItem('primebias_active'));
    expect(active.BITCOIN).toBeTruthy();
    expect(active.DAX).toBeTruthy();
  });

  it('does not re-push an analysis already synced on the server', async () => {
    const analysisId = 'EUR/USD-2026-08-03-120000-abc';
    localStorage.setItem('primebias_active', JSON.stringify({
      'EUR/USD': localEntry('EUR/USD', analysisId, '2026-08-03T12:00:00.000Z'),
    }));
    // Server already has this exact analysis with inputs, same timestamp.
    biasList.mockResolvedValue([biasRow({ analysis_id: analysisId })]);

    const res = await syncActiveAnalyses();

    expect(res.pushed).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('re-pushes when the server row has no inputs (saved before the DB was set up)', async () => {
    const analysisId = 'EUR/USD-2026-08-03-120000-abc';
    localStorage.setItem('primebias_active', JSON.stringify({
      'EUR/USD': localEntry('EUR/USD', analysisId, '2026-08-03T12:00:00.000Z'),
    }));
    // A legacy summary-only row: same id, but no inputs to hydrate from.
    biasList.mockResolvedValue([biasRow({ analysis_id: analysisId, inputs: null })]);

    const res = await syncActiveAnalyses();

    expect(res.pushed).toBe(1);
    expect(upsert.mock.calls[0][0].inputs).toBeTruthy();
  });

  it('does not push an analysis completed on another device', async () => {
    const analysisId = 'BITCOIN-2026-08-03-100000-x';
    localStorage.setItem('primebias_active', JSON.stringify({
      BITCOIN: localEntry('BITCOIN', analysisId, '2026-08-03T10:00:00.000Z'),
    }));
    completedFilter.mockResolvedValue([{ analysis_id: analysisId, status: 'completed' }]);

    const res = await syncActiveAnalyses();

    expect(res.pushed).toBe(0);
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('hydrateOnceForUser', () => {
  it('runs hydration at most once per user per load', async () => {
    biasList.mockResolvedValue([]);
    hydrateOnceForUser('user-1');
    hydrateOnceForUser('user-1');
    // Let the async hydration settle.
    await vi.waitFor(() => expect(me).toHaveBeenCalledTimes(1));
  });

  it('does nothing without a user id', () => {
    hydrateOnceForUser(undefined);
    expect(me).not.toHaveBeenCalled();
  });
});
