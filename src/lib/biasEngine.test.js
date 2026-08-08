import { describe, it, expect } from 'vitest';
import {
  calculateBias,
  calculateMinSafeMove,
  getATRForAsset,
  getDefaultInputs,
  atrUnitForInstrument,
  formatAtrValue,
  formatWithUnit,
  engineOptionsFromSettings,
  createEngineSnapshot,
  ENGINE_VERSION,
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
    expect(only('h1', { macd: 1 }).bias).toBe('Neutral');
    expect(only('month', { rsi: 1 }).bias).toBe('Neutral');
  });

  it('an indicator at or above ±35 sets the direction', () => {
    expect(only('day', { close: 1 }).bias).toBe('BUY');
    expect(only('day', { close: -1 }).bias).toBe('SELL');
  });

  it('picks the dominant side, not the net sum', () => {
    expect(only('h4', { close: 1, boli: -1 }).bias).toBe('SELL');
    expect(only('h4', { close: 1, boli: -1 }).total).toBe(-35);
    expect(only('month', { close: 1, macd: -1 }).bias).toBe('BUY');
    expect(only('month', { close: 1, macd: -1 }).total).toBe(40);
  });
});

describe('calculateBias — Extra Check lights', () => {
  it('adds +5 to the matching direction when H1 and M15 agree', () => {
    const inputs = getDefaultInputs();
    inputs.h4 = { close: 1, macd: 1, rsi: 1, boli: 1 };
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
    expect(r.deepResult).toBe(1);
    expect(r.grade).toBe('C');
    expect(r.warnings.some((w) => w.includes('capped at C'))).toBe(true);
  });
});

describe('Extended/F take their Action from the main bias — NOT gated by the Extra Check', () => {
  const EXTENDED_F = CASES[0].inputs;

  it('with the Extra Check BLANK: shows a directional BUY Action (never PENDING)', () => {
    const r = calculateBias(EXTENDED_F, null);
    expect(r.grade).toBe('F');
    expect(r.status).toBe('Extended');
    expect(r.mainDirection).toBe('BUY');
    expect(r.tradeAction).toBe('BUY');
    expect(r.extraCheckResult).toBe('NOT_CHECKED');
    expect(r.extraCheckConfirmation).toBe('NOT_CHECKED');
  });

  it('keeps a GOOD, directional target for an Extended/F setup (not "NO TRADE")', () => {
    const r = calculateBias(EXTENDED_F, null);
    expect(r.targetNote).toBe('GOOD BUY');
    expect(r.targetNote).not.toMatch(/NO TRADE|EXTENDED|WAIT/);
  });

  it('matches the workbook: Status Extended, Grade F, Direction BUY, Target GOOD, Action BUY', () => {
    const r = calculateBias(EXTENDED_F, { h1: null, m15: null });
    expect(r.status).toBe('Extended');
    expect(r.grade).toBe('F');
    expect(r.mainDirection).toBe('BUY');
    expect(r.targetNote).toBe('GOOD BUY');
    expect(r.tradeAction).toBe('BUY');
  });

  it('grade F never maps to a "No Trade" status or gradeLabel', () => {
    const r = calculateBias(EXTENDED_F, { h1: 1, m15: -1 });
    expect(r.status).not.toBe('No Trade');
    expect(r.gradeLabel).not.toBe('No Trade');
  });

  it('warns with a non-alarming caution (no "high risk"), matching the Extended status', () => {
    const r = calculateBias(EXTENDED_F, null);
    expect(r.status).toBe('Extended');
    expect(r.warnings).toContain('Extended conditions — valid setup, but use extra caution');
    const joined = r.warnings.join(' | ');
    expect(joined).not.toMatch(/high (reversal )?risk|danger|no trade/i);
    expect(joined).not.toContain('approaching extended territory');
  });

  describe('the Extra Check is a separate CONFIRMATION layer (does not change the Action)', () => {
    it('confirming check (both +1) → Action still BUY, Extra Check CONFIRMS', () => {
      const r = calculateBias(EXTENDED_F, { h1: 1, m15: 1 });
      expect(r.tradeAction).toBe('BUY');
      expect(r.extraCheckResult).toBe('BUY');
      expect(r.extraCheckConfirmation).toBe('CONFIRMS');
    });

    it('conflicting check (both -1) → Action stays BUY, Extra Check CONFLICTS', () => {
      const r = calculateBias(EXTENDED_F, { h1: -1, m15: -1 });
      expect(r.mainDirection).toBe('BUY');
      expect(r.tradeAction).toBe('BUY');
      expect(r.extraCheckResult).toBe('SELL');
      expect(r.extraCheckConfirmation).toBe('CONFLICTS');
    });

    it('mixed check (1H +1 / 15M -1) → Action stays BUY, Extra Check CONFLICTS (No Trade)', () => {
      const r = calculateBias(EXTENDED_F, { h1: 1, m15: -1 });
      expect(r.tradeAction).toBe('BUY');
      expect(r.extraCheckResult).toBe('NO_TRADE');
      expect(r.extraCheckConfirmation).toBe('CONFLICTS');
    });

    it('a blank Extra Check never blocks the Extended/F trade', () => {
      for (const ec of [null, { h1: 1, m15: null }, { h1: null, m15: -1 }]) {
        const r = calculateBias(EXTENDED_F, ec);
        expect(r.tradeAction).toBe('BUY');
        expect(r.extraCheckResult).toBe('NOT_CHECKED');
        expect(r.extraCheckConfirmation).toBe('NOT_CHECKED');
      }
    });
  });

  describe('Extra Check result formula', () => {
    it('both -1 → SELL', () => {
      expect(calculateBias(EXTENDED_F, { h1: -1, m15: -1 }).extraCheckResult).toBe('SELL');
    });
    it('both +1 → BUY', () => {
      expect(calculateBias(EXTENDED_F, { h1: 1, m15: 1 }).extraCheckResult).toBe('BUY');
    });
    it('mismatch → NO_TRADE', () => {
      expect(calculateBias(EXTENDED_F, { h1: 1, m15: -1 }).extraCheckResult).toBe('NO_TRADE');
      expect(calculateBias(EXTENDED_F, { h1: -1, m15: 1 }).extraCheckResult).toBe('NO_TRADE');
    });
    it('either check unset → NOT_CHECKED', () => {
      expect(calculateBias(EXTENDED_F, { h1: 1, m15: null }).extraCheckResult).toBe('NOT_CHECKED');
      expect(calculateBias(EXTENDED_F, { h1: null, m15: -1 }).extraCheckResult).toBe('NOT_CHECKED');
      expect(calculateBias(EXTENDED_F, null).extraCheckResult).toBe('NOT_CHECKED');
    });
  });

  it('target quality tracks the grade, not block alignment or the Extra Check', () => {
    const r = calculateBias(CASES[4].inputs, null);
    expect(r.grade).toBe('B');
    expect(r.targetNote).toBe('MED BUY');
  });

  it('a NEAR-extended (80-90) setup keeps the "approaching" warning, not the Extended one', () => {
    const r = calculateBias(CASES[5].inputs, null);
    expect(r.status).not.toBe('Extended');
    expect(r.warnings).toContain('Score 80-90 — approaching extended territory, use caution');
    expect(r.warnings).not.toContain('Extended conditions — valid setup, but use extra caution');
  });
});

describe('A/B/C/D keep the grade+alignment readiness Action (do NOT defer)', () => {
  it('grade B with NOW aligned → Ready / TRADE', () => {
    const r = calculateBias(CASES[4].inputs, null);
    expect(r.grade).toBe('B');
    expect(r.status).toBe('Ready');
    expect(r.tradeAction).toBe('TRADE');
  });

  it('grade C with DEEP misaligned → Wait / WAIT', () => {
    const r = calculateBias(CASES[3].inputs, null);
    expect(r.grade).toBe('C');
    expect(r.status).toBe('Wait');
    expect(r.tradeAction).toBe('WAIT');
  });

  it('grade C fully aligned → Scalp / TRADE', () => {
    const r = calculateBias(CASES[5].inputs, null);
    expect(r.grade).toBe('C');
    expect(r.status).toBe('Scalp');
    expect(r.tradeAction).toBe('TRADE');
  });

  it('a B grade Action ignores the Extra Check (which only confirms/conflicts)', () => {
    const base = calculateBias(CASES[4].inputs, null);
    const sell = calculateBias(CASES[4].inputs, { h1: -1, m15: -1 });
    const buy  = calculateBias(CASES[4].inputs, { h1: 1, m15: 1 });
    expect(base.tradeAction).toBe('TRADE');
    expect(sell.tradeAction).toBe('TRADE');
    expect(buy.tradeAction).toBe('TRADE');
    expect(['TRADE', 'WAIT']).toContain(base.tradeAction);
    expect(base.extraCheckConfirmation).toBe('NOT_CHECKED');
    expect(buy.extraCheckConfirmation).toBe('CONFIRMS');
    expect(sell.extraCheckConfirmation).toBe('CONFLICTS');
  });
});

describe('calculateMinSafeMove & ATR', () => {
  it('computes minimum safe move = (ATR / 9) * grade weight', () => {
    expect(calculateMinSafeMove(90, 'A').value).toBe(12.5);
    expect(calculateMinSafeMove(90, 'B').value).toBe(10);
    expect(calculateMinSafeMove(90, 'C').value).toBe(7.5);
    expect(calculateMinSafeMove(90, 'D').value).toBe(5);
  });

  it('carries the grade and keeps legacy target/targetType aliases', () => {
    expect(calculateMinSafeMove(90, 'A')).toEqual({
      value: 12.5, grade: 'A', target: 12.5, targetType: 'A',
    });
  });

  it('falls back to 0.5 weight for grades without an explicit weight (e.g. F)', () => {
    expect(calculateMinSafeMove(90, 'F').value).toBe(5);
  });

  it('returns null when ATR is missing', () => {
    expect(calculateMinSafeMove(0, 'A')).toBeNull();
    expect(calculateMinSafeMove(null, 'A')).toBeNull();
  });

  it('prefers a user ATR override, else falls back to BASE_ATR', () => {
    expect(getATRForAsset('EUR/USD', [{ asset: 'EUR/USD', atr: '77' }])).toBe(77);
    expect(getATRForAsset('EUR/USD', [])).toBe(BASE_ATR['EUR/USD']);
  });
});

describe('ATR display units', () => {
  it('reports pips for forex pairs (with or without a separator)', () => {
    expect(atrUnitForInstrument('EUR/USD')).toBe('pips');
    expect(atrUnitForInstrument('GBP/JPY')).toBe('pips');
    expect(atrUnitForInstrument('USDJPY')).toBe('pips');
    expect(atrUnitForInstrument('eur/usd')).toBe('pips');
  });

  it('reports points for indices', () => {
    expect(atrUnitForInstrument('US100')).toBe('points');
    expect(atrUnitForInstrument('DE40')).toBe('points');
    expect(atrUnitForInstrument('UK100')).toBe('points');
    expect(atrUnitForInstrument('JP225')).toBe('points');
    expect(atrUnitForInstrument('DAX')).toBe('points');
  });

  it('reports points for metals, commodities and crypto', () => {
    expect(atrUnitForInstrument('XAUUSD')).toBe('points');
    expect(atrUnitForInstrument('XAU/USD')).toBe('points');
    expect(atrUnitForInstrument('GOLD')).toBe('points');
    expect(atrUnitForInstrument('GOLD/USD')).toBe('points');
    expect(atrUnitForInstrument('BITCOIN')).toBe('points');
    expect(atrUnitForInstrument('ETHUSDT')).toBe('points');
  });

  it('defaults to points for an empty/unknown instrument', () => {
    expect(atrUnitForInstrument('')).toBe('points');
    expect(atrUnitForInstrument(null)).toBe('points');
  });

  it('formats values without unnecessary decimals', () => {
    expect(formatAtrValue(128)).toBe('128');
    expect(formatAtrValue(128.000006)).toBe('128');
    expect(formatAtrValue(245)).toBe('245');
    expect(formatAtrValue(128.45)).toBe('128.5');
    expect(formatAtrValue(128.04)).toBe('128');
  });

  it('returns null when there is no value to format', () => {
    expect(formatAtrValue(null)).toBeNull();
    expect(formatAtrValue(undefined)).toBeNull();
    expect(formatAtrValue(NaN)).toBeNull();
  });

  it('formats a value in the instrument trading unit', () => {
    expect(formatWithUnit(128, 'GBP/JPY')).toBe('128 pips');
    expect(formatWithUnit(245, 'US100')).toBe('245 points');
    expect(formatWithUnit(19, 'XAUUSD')).toBe('19 points');
    expect(formatWithUnit(14.22, 'GBP/JPY')).toBe('14.2 pips');
    expect(formatWithUnit(1, 'EUR/USD')).toBe('1 pip');
    expect(formatWithUnit(null, 'EUR/USD')).toBeNull();
  });
});

describe('engineOptionsFromSettings', () => {
  it('never exposes runtime engine overrides', () => {
    expect(engineOptionsFromSettings({
      useM5Override: true,
      downgradeOnNowWeakness: true,
      requireAlignmentForA: true,
      weights: { h1: 99 },
      gradeThresholds: { A: 1 },
    })).toEqual({});
  });

  it('returns an empty object for no settings', () => {
    expect(engineOptionsFromSettings(null)).toEqual({});
  });
});

const STRONG_BUY = {
  month: { close: 1, macd: 1, rsi: 1, boli: 1 },
  week:  { close: 1, macd: 1, rsi: 1, boli: 1 },
  day:   { close: 1, macd: 1, rsi: 1, boli: 1 },
  h4:    { close: 1, macd: 1, rsi: 1, boli: 1 },
  h1:    { close: 1, macd: 1, rsi: 1, boli: 1 },
  m15:   { close: 1, macd: 1, rsi: 1, boli: 1 },
  m5:    { close: 1, macd: 1, rsi: 1, boli: 1 },
};

describe('ENGINE_VERSION', () => {
  it('is the stable locked production ruleset identifier', () => {
    expect(typeof ENGINE_VERSION).toBe('string');
    expect(ENGINE_VERSION).toBe('prime-bias-locked-v1');
    expect(/\d{4}-\d{2}-\d{2}/.test(ENGINE_VERSION)).toBe(false);
    expect(/^\d+$/.test(ENGINE_VERSION)).toBe(false);
  });
});

describe('calculateBias surfaces the full calculation result', () => {
  const res = calculateBias(STRONG_BUY, { h1: 1, m15: 1 });

  it('exposes raw vs effective grade separately', () => {
    expect(res).toHaveProperty('rawGrade');
    expect(res).toHaveProperty('effectiveGrade');
    expect(res.grade).toBe(res.effectiveGrade);
  });

  it('exposes buy/sell tallies, lights and the engine version', () => {
    expect(typeof res.buyScore).toBe('number');
    expect(typeof res.sellScore).toBe('number');
    expect(res.buyScore).toBeGreaterThan(res.sellScore);
    expect(res.lightsActive).toBe(true);
    expect(res.lightsResult).toBe('buy');
    expect(res.engineVersion).toBe(ENGINE_VERSION);
  });

  it('exposes only the canonical resolved options', () => {
    expect(res.resolvedOptions).toEqual({
      scoreWeights: { month: 2, week: 5, day: 10, h4: 30, h1: 33, m15: 10, m5: 5 },
      thresholds: { extended: 92, risky: 80, A: 75, B: 55, C: 45, D: 40 },
      useM5Override: false,
      downgradeOnNowWeakness: false,
      requireAlignmentForA: false,
    });
  });

  it('keeps per-timeframe calculated results on the object', () => {
    for (const k of ['month', 'week', 'day', 'h4', 'h1', 'm15', 'm5']) {
      expect(res.timeframes[k]).toMatchObject({ result: expect.any(Number), bias: expect.any(String) });
    }
  });
});

describe('createEngineSnapshot', () => {
  const context = { extraCheck: { h1: 1, m15: 1 }, timestamp: '2026-08-03T10:00:00.000Z' };
  const snapshotOf = () => {
    const res = calculateBias(STRONG_BUY, context.extraCheck);
    return createEngineSnapshot(res, res.resolvedOptions, context);
  };

  it('captures the full snapshot as concrete, serialisable values', () => {
    const snap = snapshotOf();
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
    expect(snap.engine_version).toBe(ENGINE_VERSION);
    expect(snap.engine_settings.score_weights).toEqual({ month: 2, week: 5, day: 10, h4: 30, h1: 33, m15: 10, m5: 5 });
    expect(snap.engine_settings.grade_thresholds).toEqual({ extended: 92, risky: 80, A: 75, B: 55, C: 45, D: 40 });
    expect(snap.engine_settings).toMatchObject({
      use_m5_override: false,
      downgrade_on_now_weakness: false,
      require_alignment_for_a: false,
    });
    expect(snap.direction).toBe('BUY');
    expect(snap.extra_check).toEqual({ h1: 1, m15: 1 });
    expect(snap.lights_result).toBe('buy');
    expect(snap.analysis_timestamp).toBe(context.timestamp);
  });

  it('stores raw grade and effective grade under separate keys', () => {
    const snap = createEngineSnapshot({
      rawGrade: 'A', effectiveGrade: 'C', grade: 'C',
      buyScore: 80, sellScore: 10, winningScore: 80, mainDirection: 'BUY',
    });
    expect(snap.raw_grade).toBe('A');
    expect(snap.effective_grade).toBe('C');
  });

  it('persists per-timeframe results verbatim (does not recompute them)', () => {
    const res = calculateBias(STRONG_BUY, context.extraCheck);
    const snap = createEngineSnapshot(res, res.resolvedOptions, context);
    for (const k of ['month', 'week', 'day', 'h4', 'h1', 'm15', 'm5']) {
      expect(snap.timeframes[k]).toEqual({
        result: res.timeframes[k].result,
        total: res.timeframes[k].total,
        bias: res.timeframes[k].bias,
        indicators: res.timeframes[k].indicators,
      });
    }
  });

  it('ignores caller-provided fake engine settings and records canonical values', () => {
    const res = calculateBias(STRONG_BUY, context.extraCheck, {
      thresholds: { A: 1 },
      scoreWeights: { h1: 999 },
      useM5Override: true,
    });
    const snap = createEngineSnapshot(res, {
      thresholds: { A: 1 },
      scoreWeights: { h1: 999 },
      useM5Override: true,
    }, context);

    expect(snap.engine_settings.grade_thresholds.A).toBe(75);
    expect(snap.engine_settings.score_weights.h1).toBe(33);
    expect(snap.engine_settings.use_m5_override).toBe(false);
  });
});