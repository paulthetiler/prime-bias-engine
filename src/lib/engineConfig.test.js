import { describe, it, expect } from 'vitest';
import {
  CURRENT_ENGINE_VERSION, LEGACY_ENGINE_VERSION,
  engineVersionOf, isCurrentEngineTrade, filterCurrentEngine,
} from './engineConfig';
import { ENGINE_VERSION } from './biasEngine';
import { tradeSummary } from './performance';

const trade = (over = {}) => ({ id: 't', result: 'win', net_pnl: 100, ...over });

describe('engineConfig — single source of truth', () => {
  it('exposes the locked engine version and matches biasEngine.ENGINE_VERSION', () => {
    expect(CURRENT_ENGINE_VERSION).toBe('prime-bias-locked-v1');
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
    expect(isCurrentEngineTrade(trade({ engine_version: undefined }))).toBe(false);
    expect(isCurrentEngineTrade(trade({ engine_version: 'exp-v2' }))).toBe(false);
    expect(isCurrentEngineTrade(trade({ engine_version: 'prime-bias-current-v1' }))).toBe(false);
  });

  it('filterCurrentEngine keeps only current-engine trades', () => {
    const trades = [
      trade({ id: 'cur', engine_version: CURRENT_ENGINE_VERSION }),
      trade({ id: 'leg', engine_version: undefined }),
      trade({ id: 'old', engine_version: 'prime-bias-current-v1' }),
    ];
    const kept = filterCurrentEngine(trades);
    expect(kept.map(t => t.id)).toEqual(['cur']);
  });
});

describe('engineConfig — current/obsolete separation is never mixed in stats', () => {
  const current = [
    trade({ id: 'c1', engine_version: CURRENT_ENGINE_VERSION, result: 'win', net_pnl: 100 }),
    trade({ id: 'c2', engine_version: CURRENT_ENGINE_VERSION, result: 'loss', net_pnl: -40 }),
  ];
  const obsolete = [
    trade({ id: 'l1', engine_version: undefined, result: 'win', net_pnl: 500 }),
    trade({ id: 'old', engine_version: 'prime-bias-current-v1', result: 'win', net_pnl: 999 }),
  ];

  it('a summary over current-filtered trades equals the summary over current alone', () => {
    const mixed = [...current, ...obsolete];
    const fromFilteredMix = tradeSummary(filterCurrentEngine(mixed));
    const fromCurrentOnly = tradeSummary(current);
    expect(fromFilteredMix).toEqual(fromCurrentOnly);
    const fromEverything = tradeSummary(mixed);
    expect(fromEverything.netPnl).not.toBe(fromFilteredMix.netPnl);
    expect(fromFilteredMix.netPnl).toBe(60);
    expect(fromFilteredMix.wins).toBe(1);
    expect(fromEverything.netPnl).toBe(1559);
  });

  it('excludes obsolete records but never mutates or drops them from the source', () => {
    const mixed = [...current, ...obsolete];
    const before = mixed.length;
    filterCurrentEngine(mixed);
    expect(mixed.length).toBe(before);
    expect(mixed.map(t => t.id)).toContain('l1');
    expect(mixed.map(t => t.id)).toContain('old');
  });
});