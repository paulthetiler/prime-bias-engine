import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeTrade, isLegacyTrade, LEGACY_ENGINE_VERSION } from './tradeCompat';

const legacyTrade = {
  id: 'ct-legacy',
  instrument: 'EUR/USD',
  result: 'win',
  grade: 'B',
  score: 55,
  direction: 'BUY',
  net_pnl: 120,
  // NOTE: no engine_version — saved before migration 0005.
};

describe('normalizeTrade', () => {
  it('stamps a legacy trade with a synthetic version without changing its outputs', () => {
    const out = normalizeTrade(legacyTrade);
    expect(out.engine_version).toBe(LEGACY_ENGINE_VERSION);
    // Every stored calculation output is preserved verbatim.
    expect(out.grade).toBe('B');
    expect(out.score).toBe(55);
    expect(out.direction).toBe('BUY');
    expect(out.result).toBe('win');
    expect(out.net_pnl).toBe(120);
  });

  it('never re-grades a legacy trade (grade is copied, not recomputed)', () => {
    const out = normalizeTrade({ ...legacyTrade, grade: 'F' });
    expect(out.grade).toBe('F'); // untouched, even though inputs are absent
    expect(isLegacyTrade(out)).toBe(true);
  });

  it('leaves a snapshot-era trade untouched', () => {
    const modern = { id: 'ct-new', grade: 'A', engine_version: 'prime-bias-current-v1' };
    const out = normalizeTrade(modern);
    expect(out).toBe(modern); // same reference — no copy, no change
    expect(isLegacyTrade(out)).toBe(false);
  });

  it('is a pure read-time shim — the source object is not mutated', () => {
    const src = { ...legacyTrade };
    normalizeTrade(src);
    expect('engine_version' in src).toBe(false);
  });

  it('tolerates null/undefined', () => {
    expect(normalizeTrade(null)).toBeNull();
    expect(normalizeTrade(undefined)).toBeUndefined();
  });
});

describe('migration 0005_engine_snapshot.sql', () => {
  const sql = readFileSync('supabase/migrations/0005_engine_snapshot.sql', 'utf8').toLowerCase();
  const columns = [
    'engine_version', 'engine_settings', 'raw_grade',
    'buy_score', 'sell_score', 'timeframes_snapshot', 'lights_result',
  ];

  it('adds every snapshot column with IF NOT EXISTS (safe to re-run)', () => {
    for (const c of columns) {
      expect(sql, c).toContain(`add column if not exists ${c}`);
    }
  });

  it('is additive only — never alters or drops existing columns/data', () => {
    expect(sql).not.toContain('drop column');
    expect(sql).not.toContain('drop table');
    expect(sql).not.toContain('alter column');
    expect(sql).not.toMatch(/\bdelete\s+from\b/);
    expect(sql).not.toMatch(/\bupdate\s+public\./); // no destructive backfill
  });
});
