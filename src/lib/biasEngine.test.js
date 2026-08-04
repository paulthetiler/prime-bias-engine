import { describe, it, expect } from 'vitest';
import {
  calculateBias,
  calculateTarget,
  getATRForAsset,
  getDefaultInputs,
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

describe('Extended/F defer their Action to the Extra Check (not forced NO_TRADE)', () => {
  // The all-BUY workbook snapshot: score 95, grade F, status Extended, dir BUY.
  const EXTENDED_F = CASES[0].inputs;

  it('Extended / grade-F does NOT force NO_TRADE while the extra check is unset', () => {
    const r = calculateBias(EXTENDED_F, null);
    expect(r.grade).toBe('F');
    expect(r.status).toBe('Extended');
    // The old engine returned NO_TRADE here purely from Extended/F — it must not.
    expect(r.tradeAction).toBe('PENDING');
  });

  it('keeps a GOOD, directional target for an Extended/F setup (not "NO TRADE")', () => {
    const r = calculateBias(EXTENDED_F, null);
    expect(r.targetNote).toBe('GOOD BUY');
    expect(r.targetNote).not.toMatch(/NO TRADE|EXTENDED|WAIT/);
  });

  it('matches the requested UI: Status Extended, Grade F, Direction BUY, Target GOOD, Action PENDING', () => {
    const r = calculateBias(EXTENDED_F, { h1: null, m15: null });
    expect(r.status).toBe('Extended');
    expect(r.grade).toBe('F');
    expect(r.mainDirection).toBe('BUY');
    expect(r.targetNote).toBe('GOOD BUY');
    expect(r.tradeAction).toBe('PENDING');
  });

  it('grade F never maps to a "No Trade" status or gradeLabel', () => {
    const r = calculateBias(EXTENDED_F, { h1: 1, m15: -1 });
    expect(r.status).not.toBe('No Trade');
    expect(r.gradeLabel).not.toBe('No Trade');
  });

  describe('Extra Check formula: IF(1H=-1 & 15M=-1,"SELL", IF(1H=1 & 15M=1,"BUY","No Trade"))', () => {
    it('both -1 → SELL', () => {
      expect(calculateBias(EXTENDED_F, { h1: -1, m15: -1 }).tradeAction).toBe('SELL');
    });
    it('both +1 → BUY', () => {
      expect(calculateBias(EXTENDED_F, { h1: 1, m15: 1 }).tradeAction).toBe('BUY');
    });
    it('mismatch → NO_TRADE', () => {
      expect(calculateBias(EXTENDED_F, { h1: 1, m15: -1 }).tradeAction).toBe('NO_TRADE');
      expect(calculateBias(EXTENDED_F, { h1: -1, m15: 1 }).tradeAction).toBe('NO_TRADE');
    });
    it('either check unset → PENDING (never NO_TRADE)', () => {
      expect(calculateBias(EXTENDED_F, { h1: 1, m15: null }).tradeAction).toBe('PENDING');
      expect(calculateBias(EXTENDED_F, { h1: null, m15: -1 }).tradeAction).toBe('PENDING');
      expect(calculateBias(EXTENDED_F, null).tradeAction).toBe('PENDING');
    });
    it('the permission is independent of the analysis direction (follows the check)', () => {
      // Score direction is BUY, but the manual extra check both-SELL → SELL permission.
      const r = calculateBias(EXTENDED_F, { h1: -1, m15: -1 });
      expect(r.mainDirection).toBe('BUY');
      expect(r.tradeAction).toBe('SELL');
    });
  });

  it('target quality tracks the grade, not block alignment', () => {
    // Grade B setup (score 55) → MED target, regardless of the extra-check gate.
    const r = calculateBias(CASES[4].inputs, null);
    expect(r.grade).toBe('B');
    expect(r.targetNote).toBe('MED BUY');
  });
});

describe('A/B/C/D keep the grade+alignment readiness Action (do NOT defer)', () => {
  it('grade B with NOW aligned → Ready / TRADE', () => {
    // CASES[4]: grade B, NOW BUY matches BUY score.
    const r = calculateBias(CASES[4].inputs, null);
    expect(r.grade).toBe('B');
    expect(r.status).toBe('Ready');
    expect(r.tradeAction).toBe('TRADE');
  });

  it('grade C with DEEP misaligned → Wait / WAIT', () => {
    // CASES[3]: grade C, DEEP BULL but score SELL → not aligned.
    const r = calculateBias(CASES[3].inputs, null);
    expect(r.grade).toBe('C');
    expect(r.status).toBe('Wait');
    expect(r.tradeAction).toBe('WAIT');
  });

  it('grade C fully aligned → Scalp / TRADE', () => {
    // CASES[5]: grade C, DEEP/DD aligned with the BUY score.
    const r = calculateBias(CASES[5].inputs, null);
    expect(r.grade).toBe('C');
    expect(r.status).toBe('Scalp');
    expect(r.tradeAction).toBe('TRADE');
  });

  it('a B grade does NOT defer to the Extra Check — its Action ignores 1H/15M', () => {
    // Setting the extra check must not flip a graded readiness verdict to BUY/SELL.
    const base = calculateBias(CASES[4].inputs, null);
    const sell = calculateBias(CASES[4].inputs, { h1: -1, m15: -1 });
    const buy  = calculateBias(CASES[4].inputs, { h1: 1, m15: 1 });
    expect(base.tradeAction).toBe('TRADE');
    expect(sell.tradeAction).toBe('TRADE'); // still TRADE, not SELL
    expect(buy.tradeAction).toBe('TRADE');
    // A/B/C/D Action is never PENDING/BUY/SELL/NO_TRADE — those are Extended/F only.
    expect(['TRADE', 'WAIT']).toContain(base.tradeAction);
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

// ── Immutable engine snapshot & versioning (issue #14, phase 2) ────────────────

// A strong, unambiguous BUY setup — every timeframe leans buy so the engine
// returns concrete scores/grades to snapshot.
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
  it('is a stable, human-readable identifier (not a build timestamp)', () => {
    expect(typeof ENGINE_VERSION).toBe('string');
    expect(ENGINE_VERSION.length).toBeGreaterThan(0);
    expect(ENGINE_VERSION).toBe('prime-bias-current-v1');
    // A timestamp version would contain digits for a date/epoch — this must not.
    expect(/\d{4}-\d{2}-\d{2}/.test(ENGINE_VERSION)).toBe(false);
    expect(/^\d+$/.test(ENGINE_VERSION)).toBe(false);
  });

  it('does NOT claim Excel verification (engine may still need correcting)', () => {
    expect(ENGINE_VERSION.toLowerCase()).not.toContain('excel');
    expect(ENGINE_VERSION.toLowerCase()).not.toContain('verified');
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
    expect(res.buyScore).toBeGreaterThan(res.sellScore); // strong buy
    expect(res.lightsActive).toBe(true);
    expect(res.lightsResult).toBe('buy');
    expect(res.engineVersion).toBe(ENGINE_VERSION);
  });

  it('exposes the RESOLVED options actually used (concrete values)', () => {
    expect(res.resolvedOptions).toBeTruthy();
    // Every timeframe weight resolved to a concrete number.
    for (const k of ['month', 'week', 'day', 'h4', 'h1', 'm15', 'm5']) {
      expect(typeof res.resolvedOptions.scoreWeights[k]).toBe('number');
    }
    expect(typeof res.resolvedOptions.thresholds.A).toBe('number');
    expect(res.resolvedOptions).toMatchObject({
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
  const snapshotOf = (over = {}) => {
    const res = calculateBias(STRONG_BUY, context.extraCheck, over.options);
    return createEngineSnapshot(res, res.resolvedOptions, context);
  };

  it('captures the full snapshot as concrete, serialisable values', () => {
    const snap = snapshotOf();
    // Round-trips through JSON without loss (no functions/refs).
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);

    expect(snap.engine_version).toBe(ENGINE_VERSION);
    expect(snap.engine_settings.score_weights).toMatchObject({ h1: expect.any(Number) });
    expect(snap.engine_settings.grade_thresholds).toMatchObject({ A: expect.any(Number) });
    expect(snap.engine_settings).toMatchObject({
      use_m5_override: false,
      downgrade_on_now_weakness: false,
      require_alignment_for_a: false,
    });
    expect(snap.direction).toBe('BUY');
    expect(snap).toHaveProperty('raw_grade');
    expect(snap).toHaveProperty('effective_grade');
    expect(typeof snap.buy_score).toBe('number');
    expect(typeof snap.sell_score).toBe('number');
    expect(snap.deep).toMatchObject({ direction: expect.any(String), strength: expect.any(String) });
    expect(snap.dd).toMatchObject({ direction: expect.any(String), strength: expect.any(String) });
    expect(snap.now).toMatchObject({ direction: expect.any(String), strength: expect.any(String) });
    expect(snap.alignment).toBeTruthy();
    expect(snap.extra_check).toEqual({ h1: 1, m15: 1 });
    expect(snap.lights_result).toBe('buy');
    expect(snap.analysis_timestamp).toBe(context.timestamp);
  });

  it('stores raw grade and effective grade under separate keys', () => {
    // Synthetic capped result: raw A but effective forced to C.
    const snap = createEngineSnapshot({
      rawGrade: 'A', effectiveGrade: 'C', grade: 'C',
      buyScore: 80, sellScore: 10, winningScore: 80, mainDirection: 'BUY',
    });
    expect(snap.raw_grade).toBe('A');
    expect(snap.effective_grade).toBe('C');
    expect(snap.raw_grade).not.toBe(snap.effective_grade);
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

  it('freezes the resolved settings — changing them afterwards cannot mutate a past snapshot', () => {
    const resA = calculateBias(STRONG_BUY, context.extraCheck, { thresholds: { A: 70 } });
    const snapA = createEngineSnapshot(resA, resA.resolvedOptions, context);
    const beforeJson = JSON.stringify(snapA);

    // "User changes settings later" — a completely different engine run.
    const resB = calculateBias(STRONG_BUY, context.extraCheck, { thresholds: { A: 99 } });
    createEngineSnapshot(resB, resB.resolvedOptions, context);
    // Mutating the source options object must not reach the earlier snapshot.
    resA.resolvedOptions.thresholds.A = 12345;

    expect(JSON.stringify(snapA)).toBe(beforeJson);
    expect(snapA.engine_settings.grade_thresholds.A).toBe(70);
  });

  it('never reads global settings — resolvedOptions come from the passed result only', () => {
    const snap = createEngineSnapshot(
      { mainDirection: 'SELL', grade: 'B', resolvedOptions: { scoreWeights: { h1: 99 }, thresholds: { A: 60 }, useM5Override: true } },
    );
    expect(snap.engine_settings.score_weights.h1).toBe(99);
    expect(snap.engine_settings.grade_thresholds.A).toBe(60);
    expect(snap.engine_settings.use_m5_override).toBe(true);
    expect(snap.direction).toBe('SELL');
  });
});
