import { describe, it, expect, beforeEach, vi } from 'vitest';

const upsert = vi.fn();
const create = vi.fn();
const update = vi.fn();

vi.mock('@/api/base44Client', () => ({
  base44: { entities: { BiasAnalysis: { upsert: (...a) => upsert(...a), create: (...a) => create(...a), update: (...a) => update(...a) } } },
}));

const { saveBiasAnalysis, AUTOSAVE_CONFLICT_KEY } = await import('./autoSave');

beforeEach(() => {
  upsert.mockReset();
  create.mockReset();
  update.mockReset();
  upsert.mockResolvedValue({ id: 'row-1' });
});

describe('saveBiasAnalysis', () => {
  it('always upserts on the (user_id, analysis_id) key — never plain insert/update', async () => {
    await saveBiasAnalysis({ analysis_id: 'EUR/USD-1', grade: 'A' });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      { analysis_id: 'EUR/USD-1', grade: 'A' },
      { onConflict: AUTOSAVE_CONFLICT_KEY },
    );
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('repeated saves for the same analysis session upsert one record (same key), not many inserts', async () => {
    await saveBiasAnalysis({ analysis_id: 'EUR/USD-1', grade: 'D' });
    await saveBiasAnalysis({ analysis_id: 'EUR/USD-1', grade: 'C' });
    await saveBiasAnalysis({ analysis_id: 'EUR/USD-1', grade: 'B' });

    expect(upsert).toHaveBeenCalledTimes(3);
    // Every call targets the SAME conflict key and SAME analysis_id → one row.
    const analysisIds = upsert.mock.calls.map((c) => c[0].analysis_id);
    expect(new Set(analysisIds)).toEqual(new Set(['EUR/USD-1']));
    for (const call of upsert.mock.calls) {
      expect(call[1]).toEqual({ onConflict: AUTOSAVE_CONFLICT_KEY });
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('a failed save rejects and does NOT fall back to an insert (no unsafe duplicate)', async () => {
    upsert.mockRejectedValueOnce(new Error('network timeout'));
    await expect(saveBiasAnalysis({ analysis_id: 'EUR/USD-1' })).rejects.toThrow('network timeout');
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('retrying after a failure re-upserts the same key (idempotent — still one row)', async () => {
    upsert.mockRejectedValueOnce(new Error('temporary'));
    const payload = { analysis_id: 'EUR/USD-1', grade: 'A' };
    await expect(saveBiasAnalysis(payload)).rejects.toThrow('temporary');
    // Retry with the same payload succeeds via upsert (no insert ever issued).
    await saveBiasAnalysis(payload);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][0].analysis_id).toBe('EUR/USD-1');
    expect(upsert.mock.calls[1][0].analysis_id).toBe('EUR/USD-1');
    expect(create).not.toHaveBeenCalled();
  });
});
