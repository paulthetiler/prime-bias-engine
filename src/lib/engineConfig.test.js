import { describe, it, expect } from 'vitest';
import {
  CURRENT_ENGINE_VERSION, LEGACY_ENGINE_VERSION,
  engineVersionOf, isCurrentEngineTrade, filterCurrentEngine,
} from './engineConfig';
import { ENGINE_VERSION } from './biasEngine';
import { tradeSummary } from './performance';

const trade = (over = {}) => ({ id: 't', result: 'win', net_pnl: 100, ...over });

describe('engineConfig — single source of truth', () => {
  it('exposes the current engine version and matches biasEngine.ENGINE_VERSION', () => {
    // The value the engine stamps onto trades and the value the stats filter on
    // are the SAME constant — they can never drift apart.
    expect(CURRENT_ENGINE_VERSION).toBe('prime-bias-current-v1');
    expect(ENGINE_VERSION).toBe(CURRENT_ENGINE_VERSION);
    expect(LEGACY_ENGINE_VERSION).toBe('legacy-pre-snapshot');
  });

  it('treats a missing engine_version as legacy', () => {
    expect(engineVersionOf(trade({ engine_version: undefined }))).toBe(LEGACY_ENGINE_VERSION);
    expect(engineVersionOf(trade({ engine_version: null }))).toBe(LEGACY_ENGINE_VERSION);
    expect(engineVersionOf(trade({ engine_version: CURRENT_ENGINE_VERSION }))).toBe(CURRENT_ENGINE_VERSION);
  });

  it('recognises ONLY the current engine as current', () => {
    expect(isCurrentEngineTrade(trade({ engine_version: CURRENT_ENGINE_VERSION }))).toBe(true);
    expect(isCurrentEngineTrade(trade({ engine_version: undefined }))).toBe(false);        // legacy
    expect(isCurrentEngineTrade(trade({ engine_version: 'exp-v2' }))).toBe(false);          // obsolete
    expect(isCurrentEngineTrade(trade({ engine_version: 'prime-bias-current-v0' }))).toBe(false);
  });

  it('filterCurrentEngine keeps only current-engine trades', () => {
    const trades = [
      trade({ id: 'cur', engine_version: CURRENT_ENGINE_VERSION }),
      trade({ id: 'leg', engine_version: undefined }),
      trade({ id: 'obs', engine_version: 'exp-v2' }),
    ];
    const kept = filterCurrentEngine(trades);
    expect(kept.map(t => t.id)).toEqual(['cur']);
  });
});

// ── Regression: current and obsolete records are NEVER mixed in normal stats ────
describe('engineConfig — current/legacy separation is never mixed in stats', () => {
  const current = [
    trade({ id: 'c1', engine_version: CURRENT_ENGINE_VERSION, result: 'win', net_pnl: 100 }),
    trade({ id: 'c2', engine_version: CURRENT_ENGINE_VERSION, result: 'loss', net_pnl: -40 }),
  ];
  const obsolete = [
    trade({ id: 'l1', engine_version: undefined, result: 'win', net_pnl: 500 }),   // legacy
    trade({ id: 'e1', engine_version: 'exp-v2', result: 'win', net_pnl: 999 }),      // obsolete version
  ];

  it('a summary over current-filtered trades equals the summary over current alone', () => {
    // The invariant that guarantees legacy money can never leak into current stats:
    // summarising filterCurrentEngine(mixed) is identical to summarising the pure
    // current set, regardless of how many obsolete records are interleaved.
    const mixed = [...current, ...obsolete];
    const fromFilteredMix = tradeSummary(filterCurrentEngine(mixed));
    const fromCurrentOnly = tradeSummary(current);
    expect(fromFilteredMix).toEqual(fromCurrentOnly);
    // And it is NOT the same as summarising everything (proves the filter matters).
    const fromEverything = tradeSummary(mixed);
    expect(fromEverything.netPnl).not.toBe(fromFilteredMix.netPnl);
    expect(fromFilteredMix.netPnl).toBe(60);       // 100 − 40, no 500 / 999 leak
    expect(fromFilteredMix.wins).toBe(1);          // only the current win
    expect(fromEverything.netPnl).toBe(1559);      // 100 − 40 + 500 + 999 (unfiltered)
  });

  it('excludes obsolete records but never mutates or drops them from the source', () => {
    const mixed = [...current, ...obsolete];
    const before = mixed.length;
    filterCurrentEngine(mixed);
    // Non-destructive: the source array is untouched (records are kept in history).
    expect(mixed.length).toBe(before);
    expect(mixed.map(t => t.id)).toContain('l1');
    expect(mixed.map(t => t.id)).toContain('e1');
  });
});
