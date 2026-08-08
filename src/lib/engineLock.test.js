import { describe, it, expect } from 'vitest';
import {
  calculateBias,
  createEngineSnapshot,
  engineOptionsFromSettings,
  getDefaultInputs,
  ENGINE_VERSION,
} from './biasEngine';

describe('Prime Bias engine lock', () => {
  const buildInputs = () => {
    const inputs = getDefaultInputs();
    inputs.month = { close: 1, macd: 1, rsi: 0, boli: 0 };
    inputs.week = { close: 1, macd: 1, rsi: 0, boli: 0 };
    inputs.day = { close: 1, macd: 0, rsi: 0, boli: 0 };
    inputs.h4 = { close: 1, macd: 0, rsi: 0, boli: 1 };
    inputs.h1 = { close: 0, macd: 0, rsi: 1, boli: 1 };
    inputs.m15 = { close: 0, macd: 0, rsi: 1, boli: 1 };
    inputs.m5 = { close: 0, macd: 0, rsi: 1, boli: 1 };
    return inputs;
  };

  it('ignores hostile runtime score, threshold and advanced-logic overrides', () => {
    const inputs = buildInputs();
    const canonical = calculateBias(inputs, null);
    const hostile = calculateBias(inputs, null, {
      scoreWeights: { month: 99, week: 99, day: 99, h4: 1, h1: 1, m15: 1, m5: 1 },
      thresholds: { extended: 1, risky: 1, A: 1, B: 1, C: 1, D: 1 },
      useM5Override: true,
      downgradeOnNowWeakness: true,
      requireAlignmentForA: true,
    });

    expect(hostile.buyScore).toBe(canonical.buyScore);
    expect(hostile.sellScore).toBe(canonical.sellScore);
    expect(hostile.winningScore).toBe(canonical.winningScore);
    expect(hostile.grade).toBe(canonical.grade);
    expect(hostile.nowBias).toBe(canonical.nowBias);
    expect(hostile.tradeAction).toBe(canonical.tradeAction);
  });

  it('returns no engine options from user settings', () => {
    expect(engineOptionsFromSettings({
      weights: { h1: 99 },
      gradeThresholds: { A: 1 },
      useM5Override: true,
      downgradeOnNowWeakness: true,
      requireAlignmentForA: true,
    })).toEqual({});
  });

  it('stamps snapshots with only the locked canonical settings', () => {
    const results = calculateBias(buildInputs(), null);
    const snapshot = createEngineSnapshot(results, {
      scoreWeights: { h1: 999 },
      thresholds: { A: 1 },
      useM5Override: true,
      downgradeOnNowWeakness: true,
      requireAlignmentForA: true,
    });

    expect(snapshot.engine_version).toBe(ENGINE_VERSION);
    expect(snapshot.engine_version).toBe('prime-bias-locked-v1');
    expect(snapshot.engine_settings.score_weights).toEqual({
      month: 2, week: 5, day: 10, h4: 30, h1: 33, m15: 10, m5: 5,
    });
    expect(snapshot.engine_settings.grade_thresholds).toEqual({
      extended: 92, risky: 80, A: 75, B: 55, C: 45, D: 40,
    });
    expect(snapshot.engine_settings.use_m5_override).toBe(false);
    expect(snapshot.engine_settings.downgrade_on_now_weakness).toBe(false);
    expect(snapshot.engine_settings.require_alignment_for_a).toBe(false);
  });
});