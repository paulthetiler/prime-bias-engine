import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  normalizeTrade,
  isLegacyTrade,
  isWageWithdrawal,
  finiteOrNull,
  isFiniteNumber,
  normalizeSplitCount,
  normalizeReasonTags,
  normalizeTradeDirection,
  LEGACY_ENGINE_VERSION,
  DEFAULT_SPLIT_COUNT,
} from './tradeCompat';

const legacyTrade = {
  id: 'ct-legacy',
  instrument: 'EUR/USD',
  result: 'win',
  grade: 'B',
  score: 55,
  direction: 'BUY', // engine recommendation — NOT the executed side
  net_pnl: 120,
  // no engine_version / ledger columns — saved before migrations 0005/0006.
};

// ── Pure field validators ──────────────────────────────────────────────────────

describe('finiteOrNull / isFiniteNumber', () => {
  it('preserves finite numbers including 0 and negatives', () => {
    expect(finiteOrNull(0)).toBe(0);
    expect(finiteOrNull(-12.5)).toBe(-12.5);
    expect(finiteOrNull('3.5')).toBe(3.5);
  });
  it('rejects null/undefined/empty/NaN/Infinity/garbage as null (never 0)', () => {
    for (const bad of [null, undefined, '', NaN, Infinity, -Infinity, 'abc', {}]) {
      expect(finiteOrNull(bad)).toBeNull();
    }
  });
  it('isFiniteNumber mirrors it', () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber('')).toBe(false);
    expect(isFiniteNumber(NaN)).toBe(false);
  });
});

describe('normalizeSplitCount', () => {
  it('defaults missing/invalid to 1 (a trade is at least one position)', () => {
    for (const bad of [null, undefined, '', NaN, 0, -3, 'x']) {
      expect(normalizeSplitCount(bad)).toBe(DEFAULT_SPLIT_COUNT);
    }
  });
  it('keeps a valid count and floors fractions to a whole position', () => {
    expect(normalizeSplitCount(3)).toBe(3);
    expect(normalizeSplitCount('4')).toBe(4);
    expect(normalizeSplitCount(2.9)).toBe(2);
  });
});

describe('normalizeReasonTags', () => {
  it('returns an array as-is and anything else as an empty list', () => {
    expect(normalizeReasonTags(['a', 'b'])).toEqual(['a', 'b']);
    for (const bad of [null, undefined, '', 'a,b', {}, 5]) {
      expect(normalizeReasonTags(bad)).toEqual([]);
    }
  });
});

describe('normalizeTradeDirection', () => {
  it('maps explicit long/short (and tolerant buy/sell) case-insensitively', () => {
    expect(normalizeTradeDirection('long')).toBe('long');
    expect(normalizeTradeDirection('SHORT')).toBe('short');
    expect(normalizeTradeDirection(' Buy ')).toBe('long');
    expect(normalizeTradeDirection('sell')).toBe('short');
  });
  it('returns null for anything unrecognised or non-string', () => {
    for (const bad of [null, undefined, '', 'sideways', 1, {}]) {
      expect(normalizeTradeDirection(bad)).toBeNull();
    }
  });
});

// ── Trade normalisation ─────────────────────────────────────────────────────────

describe('normalizeTrade — legacy read-time defaults', () => {
  const out = normalizeTrade(legacyTrade);

  it('stamps a legacy version and exposes safe ledger defaults', () => {
    expect(out.engine_version).toBe(LEGACY_ENGINE_VERSION);
    expect(out.position_size).toBeNull();
    expect(out.points_pips).toBeNull();
    expect(out.split_count).toBe(1);
    expect(out.mood).toBeNull();
    expect(out.reason_tags).toEqual([]);
    // executed side is unknown for legacy rows — never derived from `direction`.
    expect(out.trade_direction).toBeNull();
    expect(out.direction).toBe('BUY'); // engine recommendation left untouched
  });

  it('preserves every stored calculation output verbatim (no re-grading)', () => {
    expect(out.grade).toBe('B');
    expect(out.score).toBe(55);
    expect(out.result).toBe('win');
    expect(out.net_pnl).toBe(120);
    expect(isLegacyTrade(out)).toBe(true);
  });

  it('never re-grades a legacy trade even with inputs absent', () => {
    expect(normalizeTrade({ ...legacyTrade, grade: 'F' }).grade).toBe('F');
  });
});

describe('normalizeTrade — modern rows', () => {
  it('preserves present ledger values instead of overriding them', () => {
    const modern = {
      id: 'ct-new',
      grade: 'A',
      engine_version: 'prime-bias-current-v1',
      position_size: 0.5,
      points_pips: -12,
      split_count: 3,
      mood: 'calm',
      reason_tags: ['breakout', 'trend'],
      trade_direction: 'short',
    };
    const out = normalizeTrade(modern);
    expect(out.engine_version).toBe('prime-bias-current-v1');
    expect(out.position_size).toBe(0.5);
    expect(out.points_pips).toBe(-12); // negative movement preserved
    expect(out.split_count).toBe(3);
    expect(out.mood).toBe('calm');
    expect(out.reason_tags).toEqual(['breakout', 'trend']);
    expect(out.trade_direction).toBe('short');
    expect(isLegacyTrade(out)).toBe(false);
  });

  it('handles an invalid split count safely without touching money fields', () => {
    const out = normalizeTrade({ ...legacyTrade, split_count: 0, net_pnl: 120 });
    expect(out.split_count).toBe(1);
    expect(out.net_pnl).toBe(120);
  });

  it('is a pure read-time shim — the source object is never mutated', () => {
    const src = { ...legacyTrade };
    normalizeTrade(src);
    expect('engine_version' in src).toBe(false);
    expect('split_count' in src).toBe(false);
    expect('reason_tags' in src).toBe(false);
  });

  it('tolerates null/undefined', () => {
    expect(normalizeTrade(null)).toBeNull();
    expect(normalizeTrade(undefined)).toBeUndefined();
  });
});

// ── Transaction compatibility ────────────────────────────────────────────────────

describe('isWageWithdrawal', () => {
  it('identifies only the explicit new type', () => {
    expect(isWageWithdrawal({ type: 'wage_withdrawal', amount: 500 })).toBe(true);
  });
  it('never classifies an ordinary withdrawal (or anything else) as a wage', () => {
    expect(isWageWithdrawal({ type: 'withdrawal', amount: 500 })).toBe(false);
    expect(isWageWithdrawal({ type: 'deposit', amount: 500 })).toBe(false);
    expect(isWageWithdrawal({ type: 'adjustment', amount: 500 })).toBe(false);
    expect(isWageWithdrawal(null)).toBe(false);
  });
});

// ── Migration safety ─────────────────────────────────────────────────────────────

const readSql = (f) => readFileSync(`supabase/migrations/${f}`, 'utf8').toLowerCase();

describe('migration 0006_trade_ledger_fields.sql', () => {
  const sql = readSql('0006_trade_ledger_fields.sql');
  const columns = ['position_size', 'points_pips', 'split_count', 'mood', 'reason_tags', 'trade_direction'];

  it('adds every ledger column with IF NOT EXISTS (safe to re-run)', () => {
    for (const c of columns) expect(sql, c).toContain(`add column if not exists ${c}`);
  });

  it('guards its CHECK constraints so it re-runs cleanly', () => {
    expect(sql).toContain('if not exists (');
    expect(sql).toContain('from pg_constraint');
    expect(sql).toContain('completed_trade_position_size_check');
    expect(sql).toContain('completed_trade_split_count_check');
    expect(sql).toContain('completed_trade_trade_direction_check');
  });

  it('constrains the new fields sensibly', () => {
    expect(sql).toContain('position_size is null or position_size >= 0');
    expect(sql).toContain('split_count is null or split_count >= 1');
    expect(sql).toContain("trade_direction in ('long', 'short')");
  });

  it('is additive only — never drops or repurposes existing columns/data', () => {
    expect(sql).not.toContain('drop column');
    expect(sql).not.toContain('drop table');
    expect(sql).not.toMatch(/rename\s+(column|to)\b/); // no RENAME statement (prose may say "renamed")
    expect(sql).not.toMatch(/alter column .* type/);
    expect(sql).not.toMatch(/\bdelete\s+from\b/);
    expect(sql).not.toMatch(/\bupdate\s+public\./); // no destructive backfill
  });
});

describe('migration 0007_wage_transaction_type.sql', () => {
  const sql = readSql('0007_wage_transaction_type.sql');

  it('allows the new wage_withdrawal type', () => {
    expect(sql).toContain('wage_withdrawal');
  });

  it('preserves all existing transaction types', () => {
    for (const t of ['deposit', 'withdrawal', 'adjustment']) expect(sql, t).toContain(`'${t}'`);
  });

  it('discovers and drops the existing constraint by inspection, not a hard-coded name', () => {
    expect(sql).toContain('pg_constraint');
    expect(sql).toContain('pg_get_constraintdef');
    expect(sql).toContain('drop constraint');
    // Recreates one canonical, explicitly-named constraint (drop-then-add = re-runnable).
    expect(sql).toContain('account_transaction_type_check');
  });

  it('requires no backfill and never reclassifies old rows', () => {
    expect(sql).not.toMatch(/\bupdate\s+public\./);
    expect(sql).not.toMatch(/\bdelete\s+from\b/);
    expect(sql).not.toContain('drop column');
    expect(sql).not.toContain('drop table');
  });
});
