import { describe, it, expect } from 'vitest';
import {
  calculateBias,
  calculateTarget,
  getATRForAsset,
  getDefaultInputs,
  engineOptionsFromSettings,
  BASE_ATR,
} from './biasEngine';

// Each case below is computed directly from the Excel workbook formulas
// (tabs "Bias Tool" + B1–B4). The first case is the all-BUY snapshot saved in
// every workbook tab — its expected values were read straight from the sheet's
// own cached results. The remaining cases were derived from the Excel formulas
// to exercise each rule: the ±35 direction dead-zone, the dominant-side total,
// MODE block direction, anchor-based block strength, the AC35 grade thresholds,
// and the Q10 grade cap (which forces C when the block trend opposes the score).
const CASES = [
  {
    name: 'all-BUY snapshot (verbatim from workbook)',
    inputs: {
      month: { close:  1, macd:  1, rsi: 0, boli: 0 },
      week:  { close: -1, macd:  1, rsi: 0, boli: 0 },
      day:   { close:  1, macd: -1, rsi: 0, boli: 0 },
      h4:    { close: -1, macd:  1, rsi: 1, boli: 0 },
      h1:    { close:  0, macd:  0, rsi: 1, boli: 0 },
      m15:   { close:  0, macd:  1, rsi: 1, boli: 0 },
      m5:    { close:  0, macd:  1, rsi: 1, boli: 1 },
    },
    extraCheck: null,
    expect: { deepTrend: 'BULL', deepStrength: 'STRONG', ddBias: 'BUY', ddStrength: 'STRONG', nowBias: 'BUY', nowStrength: 'STRONG', scoreDirection: 'BUY', mainDirection: 'BUY', winningScore: 95, grade: 'F' },
  },
  {
    name: 'all-SELL (mirror of snapshot)',
    inputs: {
      month: { close: -1, macd: -1, rsi:  0, boli:  0 },
      week:  { close:  1, macd: -1, rsi:  0, boli:  0 },
      day:   { close: -1, macd:  1, rsi:  0, boli:  0 },
      h4:    { close:  1, macd: -1, rsi: -1, boli:  0 },
      h1:    { close:  0, macd:  0, rsi: -1, boli:  0 },
      m15:   { close:  0, macd: -1, rsi: -1, boli:  0 },
      m5:    { close:  0, macd: -1, rsi: -1, boli: -1 },
    },
    extraCheck: null,
    expect: { deepTrend: 'BEAR', deepStrength: 'STRONG', ddBias: 'SELL', ddStrength: 'STRONG', nowBias: 'SELL', nowStrength: 'STRONG', scoreDirection: 'SELL', mainDirection: 'SELL', winningScore: 95, grade: 'F' },
  },
  {
    name: 'dead-zone neutrals (weak single indicators stay Neutral)',
    inputs: {
      month: { close: 0, macd: 0, rsi: 1, boli: 0 },
      week:  { close: 0, macd: 0, rsi: 0, boli: 1 },
      day:   { close: 1, macd: 0, rsi: 0, boli: 0 },
      h4:    { close: 0, macd: 1, rsi: 0, boli: 0 },
      h1:    { close: 0, macd: 1, rsi: 0, boli: 0 },
      m15:   { close: 0, macd: 1, rsi: 0, boli: 0 },
      m5:    { close: 0, macd: 1, rsi: 0, boli: 0 },
    },
    extraCheck: null,
    expect: { deepTrend: 'NEUTRAL', deepStrength: 'WEAK', ddBias: 'NEUTRAL', ddStrength: 'WEAK', nowBias: 'NEUTRAL', nowStrength: 'WEAK', scoreDirection: 'BUY', mainDirection: 'BUY', winningScore: 10, grade: 'C' },
  },
  {
    name: 'DEEP anchor conflict (Day opposes M/W → WEAK; cap forces C)',
    inputs: {
      month: { close:  1, macd: 1, rsi: 0, boli:  0 },
      week:  { close:  1, macd: 1, rsi: 0, boli:  0 },
      day:   { close: -1, macd: 0, rsi: 0, boli: -1 },
      h4:    { close:  0, macd: 0, rsi: 0, boli:  0 },
      h1:    { close:  0, macd: 0, rsi: 0, boli:  0 },
      m15:   { close:  0, macd: 0, rsi: 0, boli:  0 },
      m5:    { close:  0, macd: 0, rsi: 0, boli:  0 },
    },
    extraCheck: null,
    expect: { deepTrend: 'BULL', deepStrength: 'WEAK', ddBias: 'NEUTRAL', ddStrength: 'WEAK', nowBias: 'NEUTRAL', nowStrength: 'WEAK', scoreDirection: 'SELL', mainDirection: 'SELL', winningScore: 10, grade: 'C' },
  },
  {
    name: 'score 55 → grade B',
    inputs: {
      month: { close: 0, macd: 0, rsi: 1, boli: 0 },
      week:  { close: 0, macd: 0, rsi: 1, boli: 0 },
      day:   { close: 1, macd: 0, rsi: 0, boli: 0 },
      h4:    { close: 1, macd: 0, rsi: 0, boli: 1 },
      h1:    { close: 0, macd: 1, rsi: 0, boli: 0 },
      m15:   { close: 0, macd: 0, rsi: 1, boli: 1 },
      m5:    { close: 0, macd: 0, rsi: 1, boli: 1 },
    },
    extraCheck: null,
    expect: { deepTrend: 'NEUTRAL', deepStrength: 'WEAK', ddBias: 'BUY', ddStrength: 'WEAK', nowBias: 'BUY', nowStrength: 'WEAK', scoreDirection: 'BUY', mainDirection: 'BUY', winningScore: 55, grade: 'B' },
  },
  {
    name: 'score 80 → risky grade C',
    inputs: {
      month: { close: 1, macd: 1, rsi: 0, boli: 0 },
      week:  { close: 0, macd: 0, rsi: 0, boli: 0 },
      day:   { close: 1, macd: 0, rsi: 0, boli: 0 },
      h4:    { close: 1, macd: 0, rsi: 0, boli: 1 },
      h1:    { close: 0, macd: 0, rsi: 1, boli: 1 },
      m15:   { close: 0, macd: 0, rsi: 0, boli: 0 },
      m5:    { close: 0, macd: 0, rsi: 1, boli: 1 },
    },
    extraCheck: null,
    expect: { deepTrend: 'BULL', deepStrength: 'MEDIUM', ddBias: 'BUY', ddStrength: 'STRONG', nowBias: 'BUY', nowStrength: 'MEDIUM', scoreDirection: 'BUY', mainDirection: 'BUY', winningScore: 80, grade: 'C' },
  },
  {
    name: 'dominant-side total: H4 close+ vs boli- → SELL',
    inputs: {
      month: { close: 0, macd: 0, rsi: 0, boli:  0 },
      week:  { close: 0, macd: 0, rsi: 0, boli:  0 },
      day:   { close: 1, macd: 1, rsi: 0, boli:  0 },
      h4:    { close: 1, macd: 0, rsi: 0, boli: -1 },
      h1:    { close: 0, macd: 0, rsi: 1, boli:  1 },
      m15:   { close: 0, macd: 0, rsi: 1, boli:  1 },
      m5:    { close: 0, macd: 0, rsi: 0, boli:  0 },
    },
    extraCheck: null,
    expect: { deepTrend: 'NEUTRAL', deepStrength: 'WEAK', ddBias: 'BUY', ddStrength: 'MEDIUM', nowBias: 'BUY', nowStrength: 'MEDIUM', scoreDirection: 'BUY', mainDirection: 'BUY', winningScore: 53, grade: 'C' },
  },
];

describe('calculateBias — Excel reference cases', () => {
  CASES.forEach((c) => {
    it(c.name, () => {
      const r = calculateBias(c.inputs, c.extraCheck);
      for (const [key, val] of Object.entries(c.expect)) {
        expect(r[key], key).toBe(val);
      }
    });
  });
});

describe('calculateBias — per-timeframe direction (±35 dead-zone)', () => {
  const only = (tf, ind) => {
    const inputs = getDefaultInputs();
    inputs[tf] = { close: 0, macd: 0, rsi: 0, boli: 0, ...ind };
    return calculateBias(inputs, null).timeframes[tf];
  };

  it('a single indicator below ±35 stays Neutral', () => {
    // h1 macd weight is 20 → below the 35 threshold → Neutral, not BUY.
    expect(only('h1', { macd: 1 }).bias).toBe('Neutral');
    // month rsi weight is 10 → Neutral.
    expect(only('month', { rsi: 1 }).bias).toBe('Neutral');
  });

  it('an indicator at or above ±35 sets the direction', () => {
    // day close weight is 35 → exactly the threshold → BUY.
    expect(only('day', { close: 1 }).bias).toBe('BUY');
    expect(only('day', { close: -1 }).bias).toBe('SELL');
  });

  it('picks the dominant side, not the net sum', () => {
    // h4: close +25 vs boli -35 → net -10 but dominant side is -35 → SELL.
    expect(only('h4', { close: 1, boli: -1 }).bias).toBe('SELL');
    expect(only('h4', { close: 1, boli: -1 }).total).toBe(-35);
    // month: close +40 vs macd -30 → dominant +40 → BUY.
    expect(only('month', { close: 1, macd: -1 }).bias).toBe('BUY');
    expect(only('month', { close: 1, macd: -1 }).total).toBe(40);
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

describe('calculateBias — grade cap when the block trend conflicts', () => {
  it('forces the grade to C when the block-weighted trend opposes the score', () => {
    // Month & Week are BUY so DEEP reads BULL and the block-weighted trend is
    // BUY, but Day alone carries the score (SELL). Trend BUY vs score SELL → C.
    const inputs = {
      month: { close:  1, macd: 1, rsi: 0, boli:  0 },
      week:  { close:  1, macd: 1, rsi: 0, boli:  0 },
      day:   { close: -1, macd: 0, rsi: 0, boli: -1 },
      h4:    { close:  0, macd: 0, rsi: 0, boli:  0 },
      h1:    { close:  0, macd: 0, rsi: 0, boli:  0 },
      m15:   { close:  0, macd: 0, rsi: 0, boli:  0 },
      m5:    { close:  0, macd: 0, rsi: 0, boli:  0 },
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
