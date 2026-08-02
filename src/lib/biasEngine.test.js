import { describe, it, expect } from 'vitest';
import {
  calculateBias,
  calculateTarget,
  getATRForAsset,
  getDefaultInputs,
  engineOptionsFromSettings,
  BASE_ATR,
} from './biasEngine';

// The six reference cases below are the engine's contract, verified cell-by-cell
// against the original Excel workbook (see the header comment in biasEngine.js and
// the in-app /admin/engine-test page). These tests turn that manual page into an
// automated regression guard so future edits can't silently change the math.
const CASES = [
  {
    name: 'Bias Tool (GBP/USD)',
    inputs: {
      month: { close: -1, macd: -1, rsi: 0, boli: 0 },
      week:  { close: -1, macd:  1, rsi: 0, boli: 0 },
      day:   { close: -1, macd: -1, rsi: 0, boli: 0 },
      h4:    { close: -1, macd: -1, rsi: 1, boli: 0 },
      h1:    { close:  0, macd:  0, rsi: 0, boli: 0 },
      m15:   { close:  0, macd:  1, rsi: 1, boli: 0 },
      m5:    { close:  0, macd:  1, rsi: 1, boli: 0 },
    },
    expect: { deepTrend: 'BEAR', deepStrength: 'MEDIUM', ddBias: 'SELL', ddStrength: 'WEAK', nowBias: 'BUY', nowStrength: 'WEAK', mainDirection: 'SELL', winningScore: 42, grade: 'D' },
  },
  {
    name: 'B1 (all BUY)',
    inputs: {
      month: { close:  1, macd:  1, rsi: 0, boli:  1 },
      week:  { close: -1, macd:  1, rsi: 0, boli:  1 },
      day:   { close:  1, macd: -1, rsi: 0, boli:  1 },
      h4:    { close:  1, macd:  1, rsi: 1, boli:  1 },
      h1:    { close:  0, macd:  1, rsi: 1, boli:  0 },
      m15:   { close:  0, macd:  1, rsi: 1, boli:  1 },
      m5:    { close:  0, macd:  1, rsi:-1, boli:  1 },
    },
    expect: { deepTrend: 'BULL', deepStrength: 'STRONG', ddBias: 'BUY', ddStrength: 'STRONG', nowBias: 'BUY', nowStrength: 'STRONG', mainDirection: 'BUY', winningScore: 95, grade: 'F' },
  },
  {
    name: 'B2 (SELL biased)',
    inputs: {
      month: { close: -1, macd: -1, rsi: -1, boli:  1 },
      week:  { close: -1, macd: -1, rsi:  0, boli:  0 },
      day:   { close:  1, macd: -1, rsi:  0, boli:  0 },
      h4:    { close:  1, macd:  1, rsi: -1, boli:  1 },
      h1:    { close:  0, macd: -1, rsi: -1, boli:  0 },
      m15:   { close:  0, macd: -1, rsi:  1, boli: -1 },
      m5:    { close:  0, macd: -1, rsi:  1, boli:  0 },
    },
    expect: { deepTrend: 'BEAR', deepStrength: 'STRONG', ddBias: 'SELL', ddStrength: 'MEDIUM', nowBias: 'SELL', nowStrength: 'MEDIUM', mainDirection: 'SELL', winningScore: 60, grade: 'B' },
  },
  {
    name: 'B3 (mixed)',
    inputs: {
      month: { close: -1, macd:  1, rsi: 0, boli:  1 },
      week:  { close:  1, macd: -1, rsi: 0, boli: -1 },
      day:   { close: -1, macd: -1, rsi: 0, boli: -1 },
      h4:    { close:  1, macd: -1, rsi: 1, boli:  1 },
      h1:    { close:  0, macd: -1, rsi: 1, boli: -1 },
      m15:   { close:  0, macd:  1, rsi: 1, boli:  0 },
      m5:    { close:  0, macd:  1, rsi:-1, boli:  0 },
    },
    expect: { deepTrend: 'BEAR', deepStrength: 'MEDIUM', ddBias: 'SELL', ddStrength: 'MEDIUM', nowBias: 'SELL', nowStrength: 'MEDIUM', mainDirection: 'SELL', winningScore: 53, grade: 'C' },
  },
  {
    name: 'B4 (strong BUY)',
    inputs: {
      month: { close:  1, macd:  0, rsi: 0, boli:  0 },
      week:  { close: -1, macd:  1, rsi: 1, boli:  1 },
      day:   { close:  1, macd:  1, rsi: 0, boli:  1 },
      h4:    { close:  1, macd:  1, rsi:-1, boli:  1 },
      h1:    { close:  0, macd:  1, rsi:-1, boli:  1 },
      m15:   { close:  0, macd:  1, rsi: 1, boli:  1 },
      m5:    { close:  0, macd: -1, rsi: 1, boli:  0 },
    },
    expect: { deepTrend: 'BULL', deepStrength: 'STRONG', ddBias: 'BUY', ddStrength: 'STRONG', nowBias: 'BUY', nowStrength: 'STRONG', mainDirection: 'BUY', winningScore: 95, grade: 'F' },
  },
  {
    name: 'NOW regression — H1 conflicts → WEAK',
    inputs: {
      month: { close: -1, macd: -1, rsi: 0, boli: 0 },
      week:  { close: -1, macd: -1, rsi: 0, boli: 0 },
      day:   { close: -1, macd: -1, rsi: 0, boli: 0 },
      h4:    { close: -1, macd: -1, rsi: 0, boli: 0 },
      h1:    { close:  0, macd:  1, rsi: 1, boli: 0 },
      m15:   { close:  0, macd: -1, rsi: 0, boli: -1 },
      m5:    { close:  0, macd: -1, rsi: 0, boli: -1 },
    },
    expect: { deepTrend: 'BEAR', deepStrength: 'STRONG', ddBias: 'SELL', ddStrength: 'MEDIUM', nowBias: 'SELL', nowStrength: 'WEAK', mainDirection: 'SELL', winningScore: 62, grade: 'B' },
  },
];

describe('calculateBias — Excel reference cases', () => {
  CASES.forEach((c) => {
    it(c.name, () => {
      const r = calculateBias(c.inputs, null);
      for (const [key, val] of Object.entries(c.expect)) {
        expect(r[key], key).toBe(val);
      }
    });
  });
});

describe('calculateBias — Extra Check lights', () => {
  it('adds +5 to the matching direction when H1 and M15 agree', () => {
    const inputs = getDefaultInputs();
    inputs.h4 = { close: 1, macd: 1, rsi: 1, boli: 1 }; // establish a BUY base
    const base = calculateBias(inputs, null);
    const lit = calculateBias(inputs, { h1: 1, m15: 1 });
    expect(lit.lightsActive).toBe(true);
    expect(lit.buyScore).toBe(base.buyScore + 5);
  });

  it('does not add points when H1 and M15 disagree', () => {
    const inputs = getDefaultInputs();
    inputs.h4 = { close: 1, macd: 1, rsi: 1, boli: 1 };
    const r = calculateBias(inputs, { h1: 1, m15: -1 });
    expect(r.lightsActive).toBe(false);
  });
});

describe('calculateBias — grade cap when Deep conflicts', () => {
  it('caps the grade at C when Deep trend opposes the score direction', () => {
    // Deep = BULL (all broadstroke BUY) but triggers score is SELL-heavy.
    const inputs = {
      month: { close: 1, macd: 1, rsi: 1, boli: 1 },
      week:  { close: 1, macd: 1, rsi: 1, boli: 1 },
      day:   { close: 1, macd: 1, rsi: 1, boli: 1 },
      h4:    { close: -1, macd: -1, rsi: -1, boli: -1 },
      h1:    { close: 0, macd: -1, rsi: -1, boli: -1 },
      m15:   { close: 0, macd: -1, rsi: -1, boli: -1 },
      m5:    { close: 0, macd: -1, rsi: -1, boli: -1 },
    };
    const r = calculateBias(inputs, null);
    expect(r.scoreDirection).toBe('SELL');
    expect(r.deepResult).toBe(1); // BULL
    expect(r.grade).toBe('C');
    expect(r.warnings.some((w) => w.includes('capped at C'))).toBe(true);
  });
});

describe('calculateTarget & ATR', () => {
  it('computes target = (ATR / 9) * grade weight', () => {
    expect(calculateTarget(90, 'A')).toEqual({ target: 12.5, targetType: 'A' }); // 90/9*1.25
    expect(calculateTarget(90, 'B')).toEqual({ target: 10, targetType: 'B' });   // 90/9*1.0
    expect(calculateTarget(90, 'C')).toEqual({ target: 7.5, targetType: 'C' });  // 90/9*0.75
    expect(calculateTarget(90, 'D')).toEqual({ target: 5, targetType: 'D' });    // 90/9*0.5
  });

  it('falls back to 0.5 weight for grades without an explicit weight (e.g. F)', () => {
    expect(calculateTarget(90, 'F')).toEqual({ target: 5, targetType: 'F' });
  });

  it('returns null when ATR is missing', () => {
    expect(calculateTarget(0, 'A')).toBeNull();
    expect(calculateTarget(null, 'A')).toBeNull();
  });

  it('prefers a user ATR override, else falls back to BASE_ATR', () => {
    expect(getATRForAsset('EUR/USD', [{ asset: 'EUR/USD', atr: '77' }])).toBe(77);
    expect(getATRForAsset('EUR/USD', [])).toBe(BASE_ATR['EUR/USD']);
  });
});

describe('engineOptionsFromSettings', () => {
  it('maps advanced flags and passes weights/thresholds through', () => {
    const opts = engineOptionsFromSettings({
      useM5Override: true,
      downgradeOnNowWeakness: true,
      requireAlignmentForA: false,
      weights: { h1: 40 },
      gradeThresholds: { A: 70 },
    });
    expect(opts.useM5Override).toBe(true);
    expect(opts.downgradeOnNowWeakness).toBe(true);
    expect(opts.requireAlignmentForA).toBe(false);
    expect(opts.scoreWeights).toEqual({ h1: 40 });
    expect(opts.thresholds).toEqual({ A: 70 });
  });

  it('returns an empty object for no settings', () => {
    expect(engineOptionsFromSettings(null)).toEqual({});
  });
});
