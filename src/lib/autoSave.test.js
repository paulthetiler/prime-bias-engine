import { describe, it, expect, beforeEach, vi } from 'vitest';

const upsert = vi.fn();
const create = vi.fn();
const update = vi.fn();

vi.mock('@/api/base44Client', () => ({
  base44: { entities: { BiasAnalysis: { upsert: (...a) => upsert(...a), create: (...a) => create(...a), update: (...a) => update(...a) } } },
}));

const { saveBiasAnalysis, saveBiasAnalysisWithRetry, AUTOSAVE_CONFLICT_KEY } = await import('./autoSave');

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

describe('saveBiasAnalysisWithRetry', () => {
  // A synchronous fake sleep so tests never wait on real timers.
  const noWait = () => Promise.resolve();

  it('returns immediately on success without sleeping', async () => {
    upsert.mockResolvedValue({ id: 'row-1' });
    const sleepFn = vi.fn(noWait);
    const result = await saveBiasAnalysisWithRetry({ analysis_id: 'EUR/USD-1' }, { sleepFn });
    expect(result).toEqual({ id: 'row-1' });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('self-heals a transient failure by retrying the SAME idempotent upsert', async () => {
    upsert
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce({ id: 'row-1' });
    const sleepFn = vi.fn(noWait);
    const onRetry = vi.fn();

    const result = await saveBiasAnalysisWithRetry({ analysis_id: 'EUR/USD-1', grade: 'A' }, { sleepFn, onRetry });

    expect(result).toEqual({ id: 'row-1' });
    expect(upsert).toHaveBeenCalledTimes(2);
    // Both attempts hit the same conflict key / analysis_id → one row, no duplicate.
    expect(upsert.mock.calls[0][0].analysis_id).toBe('EUR/USD-1');
    expect(upsert.mock.calls[1][0].analysis_id).toBe('EUR/USD-1');
    expect(upsert.mock.calls[1][1]).toEqual({ onConflict: AUTOSAVE_CONFLICT_KEY });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(sleepFn).toHaveBeenCalledTimes(1);
    // Never falls back to a plain insert/update.
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('backs off between attempts using the provided schedule', async () => {
    upsert.mockRejectedValue(new Error('down'));
    const sleepFn = vi.fn(noWait);
    await expect(
      saveBiasAnalysisWithRetry({ analysis_id: 'EUR/USD-1' }, { backoffMs: [10, 20, 40], sleepFn }),
    ).rejects.toThrow('down');
    // 4 attempts (3 backoffs + final), sleeping the exact schedule between them.
    expect(upsert).toHaveBeenCalledTimes(4);
    expect(sleepFn.mock.calls.map((c) => c[0])).toEqual([10, 20, 40]);
  });

  it('gives up after exhausting retries and throws the last error (no duplicate insert)', async () => {
    upsert
      .mockRejectedValueOnce(new Error('err-1'))
      .mockRejectedValueOnce(new Error('err-2'))
      .mockRejectedValueOnce(new Error('err-final'));
    const sleepFn = vi.fn(noWait);
    await expect(
      saveBiasAnalysisWithRetry({ analysis_id: 'EUR/USD-1' }, { backoffMs: [1, 1], sleepFn }),
    ).rejects.toThrow('err-final');
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
