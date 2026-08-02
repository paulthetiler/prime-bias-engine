import { describe, it, expect, beforeEach, vi } from 'vitest';

// A chainable Supabase query-builder mock that records calls.
let calls;
function makeBuilder(result) {
  const builder = {};
  for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'match', 'order', 'limit']) {
    builder[m] = vi.fn((...args) => {
      calls.push([m, ...args]);
      return builder;
    });
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  // Awaiting the builder itself (list/filter/delete) resolves to the result.
  builder.then = (resolve) => Promise.resolve(result).then(resolve);
  return builder;
}

let currentResult;
const fromMock = vi.fn(() => makeBuilder(currentResult));

vi.mock('./supabaseClient', () => ({
  supabase: { from: (...a) => fromMock(...a) },
  isSupabaseConfigured: true,
}));

const { base44 } = await import('./base44Client');

beforeEach(() => {
  calls = [];
  currentResult = { data: { id: 'row-1' }, error: null };
  fromMock.mockClear();
});

describe('base44 data layer — upsert', () => {
  it('sends an upsert with the explicit conflict key and returns the row', async () => {
    const payload = { analysis_id: 'EUR/USD-1', instrument: 'EUR/USD' };
    const out = await base44.entities.BiasAnalysis.upsert(payload, { onConflict: 'user_id,analysis_id' });

    expect(fromMock).toHaveBeenCalledWith('bias_analysis');
    const upsertCall = calls.find((c) => c[0] === 'upsert');
    expect(upsertCall).toBeTruthy();
    expect(upsertCall[1]).toEqual(payload);
    expect(upsertCall[2]).toEqual({ onConflict: 'user_id,analysis_id' });
    // Must never fall back to a plain insert.
    expect(calls.some((c) => c[0] === 'insert')).toBe(false);
    expect(out).toEqual({ id: 'row-1' });
  });

  it('throws when Supabase returns an error (so callers can surface it)', async () => {
    currentResult = { data: null, error: new Error('rls denied') };
    await expect(
      base44.entities.BiasAnalysis.upsert({ analysis_id: 'x' }, { onConflict: 'user_id,analysis_id' }),
    ).rejects.toThrow('rls denied');
  });

  it('create uses insert (distinct from upsert)', async () => {
    await base44.entities.BiasAnalysis.create({ instrument: 'EUR/USD' });
    expect(calls.some((c) => c[0] === 'insert')).toBe(true);
    expect(calls.some((c) => c[0] === 'upsert')).toBe(false);
  });
});
